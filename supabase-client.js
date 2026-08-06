// ================================================================
// TRADER ATLAS — Supabase Client + Auth Helper
// Include this script on every protected page (app.html etc.)
// ================================================================

// ── CONFIG — replace with your project values ──────────────────
// Supabase Dashboard > Project Settings > API
const SUPABASE_URL = 'https://jjwwixhnfoxybkfhhznk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqd3dpeGhuZm94eWJrZmhoem5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NjY3NTEsImV4cCI6MjEwMTU0Mjc1MX0.VGh1am1t26aCZzwzJpAsWUxMiU8GUFygIJZrWiFfHS4';

// Demo mode: everyone gets Elite access, no Stripe check
// Flip to false when Stripe goes live
const DEMO_MODE = true;

// ── INIT ───────────────────────────────────────────────────────
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── SESSION GUARD ──────────────────────────────────────────────
// Call on every protected page to redirect unauthenticated users
async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

// ── GET CURRENT USER + PROFILE ─────────────────────────────────
async function getCurrentUser() {
  const session = await requireAuth();
  if (!session) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error('Profile fetch error:', error);
    return { ...session.user, tier: 'elite', display_name: session.user.email };
  }

  return {
    ...profile,
    email: session.user.email,
    // Demo mode overrides: everyone gets Elite
    tier: DEMO_MODE ? 'elite' : profile.tier,
  };
}

// ── TIER CHECKS ────────────────────────────────────────────────
// Use these throughout the app to gate features

function canAccessTrader(user, traderId, allTraderIds) {
  if (DEMO_MODE) return true;
  if (user.tier === 'pro' || user.tier === 'elite') return true;
  // Starter: first 5 traders only
  const STARTER_TRADERS = allTraderIds.slice(0, 5);
  return STARTER_TRADERS.includes(traderId);
}

function canAccessLiveData(user) {
  if (DEMO_MODE) return true;
  return user.tier === 'pro' || user.tier === 'elite';
}

function canAccessWatchlist(user) {
  if (DEMO_MODE) return true;
  return user.tier === 'pro' || user.tier === 'elite';
}

function canAccessDailyPicks(user) {
  if (DEMO_MODE) return true;
  return user.tier === 'elite';
}

function canAccessComparison(user) {
  if (DEMO_MODE) return true;
  return user.tier === 'elite';
}

// ── SIGN OUT ───────────────────────────────────────────────────
async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

// ── WATCHLIST HELPERS ──────────────────────────────────────────
async function getWatchlist(userId) {
  const { data, error } = await supabase
    .from('watchlists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return error ? [] : data;
}

async function addToWatchlist(userId, ticker, traderId, traderName, notes = '') {
  const { data, error } = await supabase
    .from('watchlists')
    .insert({ user_id: userId, ticker, trader_id: traderId, trader_name: traderName, notes })
    .select()
    .single();
  return { data, error };
}

async function removeFromWatchlist(id) {
  const { error } = await supabase
    .from('watchlists')
    .delete()
    .eq('id', id);
  return { error };
}

// ── DAILY PICKS HELPER ─────────────────────────────────────────
async function getDailyPicks(date = null) {
  let query = supabase
    .from('daily_picks')
    .select('*')
    .order('pick_date', { ascending: false })
    .order('signal', { ascending: true });

  if (date) query = query.eq('pick_date', date);
  else query = query.eq('pick_date', new Date().toISOString().split('T')[0]);

  const { data, error } = await query;
  return error ? [] : data;
}

// ── QUERY LOGGER ───────────────────────────────────────────────
async function logQuery(userId, traderId, ticker = null) {
  await supabase
    .from('query_log')
    .insert({ user_id: userId, trader_id: traderId, ticker });
}
