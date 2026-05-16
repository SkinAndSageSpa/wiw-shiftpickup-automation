/**
 * wiwClient.js
 * When I Work API client — matches the official OpenAPI spec at
 * https://apidocs.wheniwork.com/external/index.html
 */

const API = 'https://api.wheniwork.com/2';
const LOGIN_URL = 'https://api.login.wheniwork.com/login';

// === Account-specific IDs (skinandsagespa.com WIW account, May 2026) ===
const POSITION_ESTI = 11742907;
const POSITION_LMT  = 11742908;
const PROVIDER_POSITION_IDS = [POSITION_ESTI, POSITION_LMT];
const PROVIDER_LOCATION_ID  = 5837840;

// How far back to look for recent pickups (minutes). Run interval is 60 min;
// 30-min buffer ensures no pickups are missed if the cron fires slightly late.
const LOOKBACK_MINUTES = 90;

let _session = null;

function getDevKey() {
  const k = process.env.WIW_API_KEY || process.env.WIW_API_TOKEN;
  if (!k) throw new Error('WIW_API_KEY env var not set');
  return k;
}

async function login() {
  if (_session) return _session;
  const email    = process.env.WIW_EMAIL;
  const password = process.env.WIW_PASSWORD;
  if (!email || !password) throw new Error('WIW_EMAIL and WIW_PASSWORD env vars required');

  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'W-Key': getDevKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`WIW login failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const token  = data.token || data.session_token || data?.user?.token;
  if (!token) throw new Error('WIW login OK but no token in response');
  const userId = data?.user?.id || data?.users?.[0]?.id;
  _session = { token, userId };
  return _session;
}

function authHeaders() {
  const h = { 'W-Token': _session.token, 'Content-Type': 'application/json' };
  if (_session.userId) h['W-UserId'] = String(_session.userId);
  return h;
}

async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

function cutoffTime() {
  return new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000);
}

function isRecent(timestamp) {
  return timestamp && new Date(timestamp) >= cutoffTime();
}

async function getUser(userId) {
  const data = await apiGet(`/users/${userId}`);
  return data.user;
}

async function getShift(shiftId) {
  const data = await apiGet(`/shifts/${shiftId}`);
  return data.shift;
}

// Returns approved swaps that were updated within the lookback window.
// Fetches swaps for shifts starting today through the next 60 days.
async function getRecentApprovedSwaps() {
  const start = new Date().toISOString().split('T')[0];
  const end   = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0];
  const data  = await apiGet(`/swaps?status=2&start=${start}&end=${end}`);
  const swaps = data.swaps || [];
  return swaps.filter(s => isRecent(s.updated_at || s.created_at));
}

// Returns provider-location shifts that were updated within the lookback window
// and are assigned to someone (user_id != 0). Used to detect open shift pickups.
async function getRecentlyAssignedShifts() {
  const start = new Date().toISOString().split('T')[0];
  const end   = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0];
  const data  = await apiGet(`/shifts?start=${start}&end=${end}&location_id=${PROVIDER_LOCATION_ID}`);
  const shifts = data.shifts || [];
  return shifts.filter(s => s.user_id && s.user_id !== 0 && isRecent(s.updated_at));
}

// Returns all assigned shifts for a user on a given YYYY-MM-DD date.
async function getUserShiftsOnDate(userId, date) {
  const data = await apiGet(`/shifts?start=${date}&end=${date}&user_id=${userId}&location_id=${PROVIDER_LOCATION_ID}`);
  return (data.shifts || []).filter(s => s.user_id === Number(userId));
}

function isProvider(user) {
  const positions = user.positions || (user.position_id ? [user.position_id] : []);
  return positions.some(pid => PROVIDER_POSITION_IDS.includes(pid));
}

function positionLabel(user) {
  const positions = user.positions || (user.position_id ? [user.position_id] : []);
  if (positions.includes(POSITION_ESTI)) return 'Esthetician';
  if (positions.includes(POSITION_LMT))  return 'Massage Therapist';
  return 'Provider';
}

function formatShiftTime(shift) {
  const fmt = d => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fmt(shift.start_time)} – ${fmt(shift.end_time)}`;
}

function shiftHours(shift) {
  const ms = new Date(shift.end_time) - new Date(shift.start_time);
  return Math.round((ms / 3600000) * 100) / 100;
}

module.exports = {
  login, getUser, getShift, getUserShiftsOnDate,
  getRecentApprovedSwaps, getRecentlyAssignedShifts,
  isProvider, positionLabel, formatShiftTime, shiftHours,
  POSITION_ESTI, POSITION_LMT, PROVIDER_POSITION_IDS, PROVIDER_LOCATION_ID,
};
