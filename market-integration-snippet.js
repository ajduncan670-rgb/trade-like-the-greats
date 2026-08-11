// ═══════════════════════════════════════════════════════════════════
// PASTE THIS INTO app.html — replaces the stub refreshPositionPrices
// and adds fetchMarketContext() for picks/engine AI enrichment.
//
// All calls go to /api/market (your Vercel function).
// Nothing calls Polygon directly from the browser.
// ═══════════════════════════════════════════════════════════════════

// ── Client-side price cache (session-only) ───────────────────────────
const priceCache   = {};  // ticker → { price, changePct, change, updated }
const PRICE_TTL_MS = 5 * 60 * 1000; // 5 min — match server cache

function getPriceCached(ticker) {
  const e = priceCache[ticker];
  if (!e) return null;
  if (Date.now() - e.ts > PRICE_TTL_MS) { delete priceCache[ticker]; return null; }
  return e;
}
function setPriceCached(ticker, data) {
  priceCache[ticker] = { ...data, ts: Date.now() };
}

// ── Core fetch wrapper ───────────────────────────────────────────────
async function fetchMarket(params) {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`/api/market?${qs}`);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Market API ${resp.status}`);
  }
  return resp.json();
}

// ── Snapshot: prices for multiple tickers at once ────────────────────
// Returns Map<ticker, { price, changePct, change, open, high, low, volume }>
async function fetchPrices(tickers) {
  if (!tickers || !tickers.length) return new Map();

  // Filter out anything already freshly cached
  const needed = tickers.filter(t => !getPriceCached(t));

  if (needed.length) {
    // Batch in chunks of 16 to stay well within limits
    const chunks = [];
    for (let i = 0; i < needed.length; i += 16) chunks.push(needed.slice(i, i + 16));

    for (const chunk of chunks) {
      try {
        const data = await fetchMarket({ action: 'snapshot', tickers: chunk.join(',') });
        (data.results || []).forEach(r => {
          setPriceCached(r.ticker, r);
        });
      } catch (e) {
        console.warn('[fetchPrices] chunk failed:', e.message);
      }
    }
  }

  const map = new Map();
  tickers.forEach(t => {
    const cached = getPriceCached(t);
    if (cached) map.set(t, cached);
  });
  return map;
}

// ── News for a single ticker ─────────────────────────────────────────
// Returns array of { title, description, url, source, publishedAt }
async function fetchTickerNews(ticker, limit = 5) {
  try {
    const data = await fetchMarket({ action: 'news', ticker, limit });
    return data.results || [];
  } catch (e) {
    console.warn('[fetchTickerNews]', ticker, e.message);
    return [];
  }
}

// ── Earnings/company info for a single ticker ────────────────────────
async function fetchEarnings(ticker) {
  try {
    const data = await fetchMarket({ action: 'earnings', ticker });
    return data;
  } catch (e) {
    console.warn('[fetchEarnings]', ticker, e.message);
    return null;
  }
}

// ── Market context builder — used to enrich AI prompts ──────────────
// Call this before any AI analysis to inject real data into the prompt.
// Returns a formatted string you append to the trader's system prompt.
async function buildMarketContext(ticker) {
  const [prices, news] = await Promise.all([
    fetchPrices([ticker]),
    fetchTickerNews(ticker, 5),
  ]);

  const p = prices.get(ticker);
  let context = `\n\n=== LIVE MARKET DATA FOR ${ticker} ===\n`;

  if (p) {
    const dir = p.changePct >= 0 ? '▲' : '▼';
    context += `Price: $${p.price?.toFixed(2) ?? '--'} ${dir} ${Math.abs(p.changePct ?? 0).toFixed(2)}% today\n`;
    context += `Open: $${p.open?.toFixed(2) ?? '--'} | High: $${p.high?.toFixed(2) ?? '--'} | Low: $${p.low?.toFixed(2) ?? '--'}\n`;
    if (p.volume) context += `Volume: ${(p.volume / 1e6).toFixed(2)}M shares\n`;
    if (p.vwap)   context += `VWAP: $${p.vwap.toFixed(2)}\n`;
  } else {
    context += `(Live price data unavailable for this session)\n`;
  }

  if (news.length) {
    context += `\nLatest news (${news.length} articles):\n`;
    news.forEach((a, i) => {
      const age = timeSince(a.publishedAt);
      context += `${i + 1}. [${a.source} · ${age}] ${a.title}\n`;
      if (a.description) context += `   ${a.description.slice(0, 120)}...\n`;
    });
  } else {
    context += `\n(No recent news articles found for ${ticker})\n`;
  }

  context += `\nData as of: ${new Date().toLocaleTimeString()}\n`;
  context += `=== END MARKET DATA ===\n`;
  context += `\nUse this data to inform your analysis. Reference specific prices and news when relevant to your methodology.\n`;

  return context;
}

// ── Replace the stub refreshPositionPrices ───────────────────────────
async function refreshPositionPrices() {
  const positions = buildPositions();
  if (!positions.length) { showToast('No open positions to refresh', 'info'); return; }

  const btn = document.getElementById('refresh-prices-btn');
  if (btn) { btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; }

  try {
    const tickers = positions.map(p => p.ticker);
    const prices  = await fetchPrices(tickers);

    // Copy into the portfolioPrices object the portfolio renderer reads
    prices.forEach((data, ticker) => { portfolioPrices[ticker] = data; });

    renderOpenPositions();
    showToast(`Prices updated for ${prices.size} position${prices.size !== 1 ? 's' : ''}`, 'success');
  } catch (e) {
    showToast('Price refresh failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = ''; }
  }
}

// ── Update sendMessage to inject market context before AI call ────────
// REPLACE your existing sendMessage() with this version.
// It fetches live data first, then passes it into the AI prompt.
async function sendMessage() {
  if (isStreaming || !selectedTrader) return;
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';

  // Build display message (no market context — that's for the AI only)
  const displayQuery = text;
  const fullQuery    = currentTicker ? `[Analyzing ticker: ${currentTicker}] ${text}` : text;
  chatHistory.push({ role: 'user', content: fullQuery });
  appendMsg('user', displayQuery);

  const typingEl = appendTyping();
  isStreaming = true;
  document.getElementById('chat-send-btn').disabled = true;

  try {
    // Fetch live market data for the current ticker (parallel, non-blocking)
    let marketCtx = '';
    if (currentTicker) {
      try { marketCtx = await buildMarketContext(currentTicker); }
      catch (e) { console.warn('Market context fetch failed:', e.message); }
    }

    const systemPrompt = `${selectedTrader.persona}\n\nKey methodology rules:\n`
      + selectedTrader.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')
      + marketCtx;  // ← live data injected here

    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: chatHistory,
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const aiText = data.content?.[0]?.text || 'No response received.';
    typingEl.remove();
    chatHistory.push({ role: 'assistant', content: aiText });
    appendMsg('ai', aiText);
    queryCount++;
    document.getElementById('stat-queries').textContent = queryCount;
    if (sb && currentUser) sb.from('query_log').insert({ user_id: currentUser.id, trader_id: selectedTrader.id, ticker: currentTicker || null });
  } catch (err) {
    typingEl.remove();
    appendMsg('ai', `Analysis unavailable — ${err.message}`);
    showToast('Could not reach AI engine', 'error');
  } finally {
    isStreaming = false;
    document.getElementById('chat-send-btn').disabled = false;
  }
}

// ── Also enrich Daily Picks scans with market context ────────────────
// In scanTraderPicks, before calling /api/claude, build a market
// context string for all tickers in the trader's universe.
// Add this inside scanTraderPicks(), before the fetch('/api/claude') call:
//
//   const tickers = TRADER_UNIVERSES[trader.id] || [];
//   const prices  = await fetchPrices(tickers);
//   let priceContext = '\n\n=== CURRENT PRICES ===\n';
//   prices.forEach((p, t) => {
//     const dir = p.changePct >= 0 ? '▲' : '▼';
//     priceContext += `${t}: $${p.price?.toFixed(2)} ${dir}${Math.abs(p.changePct||0).toFixed(2)}%\n`;
//   });
//   // Then append priceContext to the system prompt in the fetch body.

// ── Utility ──────────────────────────────────────────────────────────
function timeSince(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  return `${days}d ago`;
}
