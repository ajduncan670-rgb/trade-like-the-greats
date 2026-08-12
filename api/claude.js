// /api/claude.js — Anthropic proxy
// Passes all fields through including tools, system, messages
// Adds required headers including web-search beta header

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':            'application/json',
        'x-api-key':               key,
        'anthropic-version':       '2023-06-01',
        'anthropic-beta':          'web-search-2025-03-05', // required for web_search tool
      },
      body: JSON.stringify(req.body), // pass through everything — tools, system, messages, max_tokens
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[claude.js] Anthropic error:', response.status, JSON.stringify(data).slice(0, 200));
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('[claude.js] fetch error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
