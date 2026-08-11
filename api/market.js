// ═══════════════════════════════════════════════════════════════════
// /api/market.js  —  Trader Atlas market data proxy
// Deploy this file to /api/market.js in your Vercel repo root
//
// Handles three actions via ?action= query param:
//   snapshot  — prices + day stats for one or many tickers (batched)
//   news      — latest headlines for a ticker (cached 1 hour)
//   earnings  — upcoming earnings dates for a ticker (cached 6 hours)
//
// All Polygon calls are server-side. POLYGON_KEY never touches browser.
// Server-side cache reduces calls dramatically for multi-user traffic.
// ═══════════════════════════════════════════════════════════════════

const POLYGON_BASE = 'https://api.polygon.io';

// ── In-memory server-side cache ──────────────────────────────────────
// Vercel serverless functions share memory within a warm instance.
// TTLs keep data fresh without burning rate limit on repeat requests.
const cache = {};
const TTL = {
  snapshot: 5   * 60 * 1000,  //  5 minutes  — prices update frequently
  news:     60  * 60 * 1000,  //  1 hour     — headlines don't change by the minute
  earnings: 6   * 60 * 60 * 1000, // 6 hours — earnings dates are stable
};

function getCached(key) {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) { delete cache[key]; return null; }
  return entry.data;
}
function setCache(key, data, ttl) {
  cache[key] = { data, ts: Date.now(), ttl };
}

// ── Polygon fetch helper ─────────────────────────────────────────────
async function polyFetch(path, params = {}) {
  const url = new URL(POLYGON_BASE + path);
  url.searchParams.set('apiKey', process.env.POLYGON_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Polygon ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

// ── Action handlers ──────────────────────────────────────────────────

/**
 * SNAPSHOT
 * Fetches current price, day change, volume for one or many tickers.
 * Polygon endpoint: GET /v2/snapshot/locale/us/markets/stocks/tickers
 * Single ticker:    GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
 *
 * Query params:
 *   ?action=snapshot&tickers=SOFI,PLTR,NVDA   (comma-separated, max 16)
 *   ?action=snapshot&tickers=SOFI             (single)
 *
 * Returns array of normalised ticker objects:
 *   { ticker, price, open, high, low, close, volume, change, changePct, prevClose }
 */
async function handleSnapshot(tickers) {
  if (!tickers) throw new Error('tickers param required');
  const tickerList = tickers.toUpperCase().split(',').map(t => t.trim()).filter(Boolean);
  if (tickerList.length === 0) throw new Error('no valid tickers');
  if (tickerList.length > 20) throw new Error('max 20 tickers per call');

  const cacheKey = 'snap:' + tickerList.sort().join(',');
  const cached = getCached(cacheKey);
  if (cached) return { source: 'cache', results: cached };

  // Polygon accepts comma-separated tickers on the batch endpoint
  const data = await polyFetch('/v2/snapshot/locale/us/markets/stocks/tickers', {
    tickers: tickerList.join(','),
  });

  const results = (data.tickers || []).map(t => {
    const day  = t.day  || {};
    const prev = t.prevDay || {};
    const price = day.c || t.lastTrade?.p || null;
    const prevClose = prev.c || null;
    const change = (price && prevClose) ? parseFloat((price - prevClose).toFixed(2)) : null;
    const changePct = (price && prevClose) ? parseFloat(((price - prevClose) / prevClose * 100).toFixed(2)) : null;
    return {
      ticker:    t.ticker,
      price:     price,
      open:      day.o  || null,
      high:      day.h  || null,
      low:       day.l  || null,
      close:     day.c  || null,
      volume:    day.v  || null,
      vwap:      day.vw || null,
      prevClose: prevClose,
      change,
      changePct,
      updated:   new Date().toISOString(),
    };
  });

  setCache(cacheKey, results, TTL.snapshot);
  return { source: 'live', results };
}

/**
 * NEWS
 * Fetches latest news headlines for a ticker, with description + URL.
 * Polygon endpoint: GET /v2/reference/news
 *
 * Query params:
 *   ?action=news&ticker=SOFI
 *   ?action=news&ticker=SOFI&limit=5   (default 5, max 10)
 *
 * Returns array of article objects:
 *   { id, title, description, url, source, publishedAt, tickers, imageUrl }
 */
async function handleNews(ticker, limit = 5) {
  if (!ticker) throw new Error('ticker param required');
  ticker = ticker.toUpperCase().trim();
  const lim = Math.min(parseInt(limit) || 5, 10);

  const cacheKey = `news:${ticker}:${lim}`;
  const cached = getCached(cacheKey);
  if (cached) return { source: 'cache', ticker, results: cached };

  const data = await polyFetch('/v2/reference/news', {
    ticker,
    limit: lim,
    sort:  'published_utc',
    order: 'desc',
  });

  const results = (data.results || []).map(a => ({
    id:          a.id,
    title:       a.title,
    description: a.description || '',
    url:         a.article_url,
    ampUrl:      a.amp_url || null,
    imageUrl:    a.image_url || null,
    source:      a.publisher?.name || '',
    author:      a.author || '',
    publishedAt: a.published_utc,
    tickers:     a.tickers || [],
    keywords:    a.keywords || [],
  }));

  setCache(cacheKey, results, TTL.news);
  return { source: 'live', ticker, results };
}

/**
 * EARNINGS
 * Fetches the next earnings date for a ticker.
 * Polygon endpoint: GET /vX/reference/financials (most recent filings)
 * Note: Polygon free tier returns earnings dates via the ticker details
 * endpoint which includes next_earnings_date in some responses.
 * We use the ticker details V3 endpoint as the most reliable free-tier source.
 *
 * Query params:
 *   ?action=earnings&ticker=SOFI
 *
 * Returns:
 *   { ticker, nextEarningsDate, lastReportedDate, marketCap, description }
 */
async function handleEarnings(ticker) {
  if (!ticker) throw new Error('ticker param required');
  ticker = ticker.toUpperCase().trim();

  const cacheKey = `earnings:${ticker}`;
  const cached = getCached(cacheKey);
  if (cached) return { source: 'cache', ticker, ...cached };

  const data = await polyFetch(`/v3/reference/tickers/${ticker}`);
  const r = data.results || {};

  const result = {
    ticker,
    companyName:       r.name || ticker,
    description:       r.description || '',
    marketCap:         r.market_cap || null,
    employees:         r.total_employees || null,
    homepageUrl:       r.homepage_url || null,
    listDate:          r.list_date || null,
    // Polygon free tier does not reliably return next_earnings_date.
    // This field appears on paid tiers. Included here for forward compat.
    nextEarningsDate:  r.next_earnings_date || null,
    lastUpdated:       r.last_updated_utc || null,
  };

  setCache(cacheKey, result, TTL.earnings);
  return { source: 'live', ...result };
}

// ── Main handler ─────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — allow requests from your Vercel domain and localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.POLYGON_KEY;
  if (!key) return res.status(500).json({ error: 'POLYGON_KEY not configured in Vercel environment variables' });

  const { action, tickers, ticker, limit } = req.query;

  if (!action) {
    return res.status(400).json({
      error: 'action param required',
      actions: {
        snapshot: '/api/market?action=snapshot&tickers=SOFI,PLTR,NVDA',
        news:     '/api/market?action=news&ticker=SOFI&limit=5',
        earnings: '/api/market?action=earnings&ticker=SOFI',
      },
    });
  }

  try {
    let result;
    switch (action) {
      case 'snapshot': result = await handleSnapshot(tickers); break;
      case 'news':     result = await handleNews(ticker, limit); break;
      case 'earnings': result = await handleEarnings(ticker); break;
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[market.js]', action, err.message);
    // Return a structured error — don't leak stack traces
    return res.status(500).json({
      error: err.message,
      action,
      tip: err.message.includes('403') || err.message.includes('401')
        ? 'Check your POLYGON_KEY in Vercel environment variables'
        : err.message.includes('429')
        ? 'Polygon rate limit hit (5/min on free tier) — requests are cached to minimise this'
        : 'Check Polygon API status at polygon.io/system',
    });
  }
}
