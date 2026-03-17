import axios from 'axios';

// ─── Base URL resolution ───────────────────────────────────────────────────────
//
// LOCAL DEV  (npm run dev):
//   VITE_API_BASE_URL is intentionally LEFT BLANK in .env so axios uses the
//   relative path '/api/' and the Vite proxy (vite.config.js) forwards it to
//   the real backend. This avoids CORS issues and port-mismatch problems.
//
// PRODUCTION / CATALYST DEPLOY:
//   Set VITE_API_BASE_URL to the full backend URL in your build environment.
//   e.g. https://railway-ticketing-system-50039510865.development.catalystappsail.in/api/
//
// DO NOT use window.location.origin as a fallback — in local dev that resolves
// to http://localhost:<vite-port>/api/ which is the frontend, not the backend.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/';

// ─── Role helpers ─────────────────────────────────────────────────────────────

/** Read the logged-in user from session storage. */
export function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem('rail_user')); }
  catch { return null; }
}

/** Read the Catalyst custom token stored after login. */
export function getCatalystToken() {
  return sessionStorage.getItem('catalyst_token') || null;
}

/** Save Catalyst token returned by the login endpoint. */
export function setCatalystToken(token) {
  if (token) sessionStorage.setItem('catalyst_token', token);
  else sessionStorage.removeItem('catalyst_token');
}

// ─── JWT token storage (v2.0) ─────────────────────────────────────────────────
const TOKEN_KEY = 'rail_access_token';
const REFRESH_KEY = 'rail_refresh_token';

export function getAccessToken() { return sessionStorage.getItem(TOKEN_KEY) || null; }
export function getRefreshToken() { return localStorage.getItem(REFRESH_KEY) || null; }

export function setTokens({ access_token, refresh_token } = {}) {
  if (access_token) sessionStorage.setItem(TOKEN_KEY, access_token);
  if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
}

export function clearTokens() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem('rail_user');
}

export function setCurrentUser(user) {
  if (user) sessionStorage.setItem('rail_user', JSON.stringify(user));
}

/**
 * Returns true if the current session user is an admin.
 * admin@admin.com is ALWAYS admin regardless of Role field.
 */
export function isAdmin(user) {
  if (!user) user = getCurrentUser();
  if (!user) return false;
  const email = (user.Email || '').toLowerCase();
  if (email === 'admin@admin.com' || email.endsWith('@admin.com')) return true;
  return (user.Role || '').toLowerCase() === 'admin';
}

/** Build auth headers for admin-protected API calls. */
function adminHeaders() {
  const user = getCurrentUser();
  if (!user) return {};
  return {
    'X-User-Email': user.Email || '',
    'X-User-Role': user.Role || '',
  };
}

// ─── Axios client ─────────────────────────────────────────────────────────────

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Refresh token queue (handle concurrent 401s) ─────────────────────────────
let _refreshing = false;
let _refreshQueue = [];

function processRefreshQueue(error, token) {
  _refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  _refreshQueue = [];
}

// ─── Request interceptor: inject JWT + legacy headers ─────────────────────────
client.interceptors.request.use((config) => {
  // JWT takes priority, falls back to legacy Catalyst token
  const token = getAccessToken() || getCatalystToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  // Legacy headers for backward compat with admin endpoints
  const user = getCurrentUser();
  if (user) {
    config.headers['X-User-Email'] = user.Email || '';
    config.headers['X-User-Role'] = user.Role || '';
    config.headers['X-User-ID'] = user.ID || '';
  }
  return config;
});

client.interceptors.response.use(
  (res) => res.data,
  async (err) => {
    const original = err.config;

    // 401 handler — try to refresh JWT once
    if (err.response?.status === 401 && !original._retry) {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        if (_refreshing) {
          return new Promise((resolve, reject) => {
            _refreshQueue.push({ resolve, reject });
          }).then(token => {
            original.headers['Authorization'] = `Bearer ${token}`;
            return client(original);
          });
        }
        original._retry = true;
        _refreshing = true;
        try {
          const res = await axios.post(`${BASE_URL}auth/refresh`,
            { refresh_token: refreshToken }, { timeout: 10000 });
          const newToken = res.data?.access_token;
          if (newToken) {
            setTokens({ access_token: newToken });
            processRefreshQueue(null, newToken);
            original.headers['Authorization'] = `Bearer ${newToken}`;
            return client(original);
          }
        } catch (refreshErr) {
          processRefreshQueue(refreshErr, null);
          clearTokens();
          window.dispatchEvent(new CustomEvent('auth:expired'));
          return Promise.reject(refreshErr);
        } finally {
          _refreshing = false;
        }
      }
    }

    // 403 handler — stale/wrong JWT may override valid header-based admin auth.
    // Strip JWT and retry once with X-User-Email/Role headers only.
    if (err.response?.status === 403 && !original._retry403) {
      original._retry403 = true;
      delete original.headers['Authorization'];
      // Only clear JWT tokens, keep user session data for header-based auth
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      return client(original);
    }

    // Auth routes: return the error JSON body as a resolved value so callers
    // can read res.success / res.error without a try/catch throw.
    const url = err.config?.url || '';
    if (url.includes('/auth/') && err.response?.data) {
      return Promise.resolve(err.response.data);
    }

    // BUG FIX: Zoho sometimes wraps error messages inside nested objects.
    // Previously only checked .error and .message at the top level, so Zoho
    // errors like { message: { message: "..." } } produced the unhelpful
    // fallback "Request failed with status code 400".
    const errBody = err.response?.data;
    const msg =
      errBody?.error ||
      (typeof errBody?.message === 'string' ? errBody.message : null) ||
      errBody?.message?.message ||
      err.message ||
      'Network error';
    const e = new Error(msg);
    e.status = err.response?.status;
    e.body = errBody;
    return Promise.reject(e);
  }
);

// ─── Response helpers ─────────────────────────────────────────────────────────

/**
 * Zoho response shape: { success: true, data: { code: 3000, data: [...] }, status_code: 200 }
 * Handles all 3 nesting patterns Zoho can return.
 */
export function extractRecords(apiResponse) {
  if (!apiResponse) return [];
  if (Array.isArray(apiResponse?.data?.data)) return apiResponse.data.data;
  if (Array.isArray(apiResponse?.data)) return apiResponse.data;
  if (Array.isArray(apiResponse)) return apiResponse;
  return [];
}

/** Zoho record ID is always uppercase "ID" */
export function getRecordId(row) {
  return row?.ID ?? row?.id ?? null;
}

/** Zoho lookup fields are { ID, display_value } — extract label for display */
export function getLookupLabel(field) {
  if (!field) return '—';
  if (typeof field === 'object') return field.display_value ?? field.ID ?? '—';
  return String(field);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MONTHS_NUM = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const MONTHS_STR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "DD-MMM-YYYY HH:MM:SS" → "YYYY-MM-DDTHH:MM"  (for datetime-local inputs) */
export function parseZohoDate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 16);
  try {
    const [datePart, timePart = '00:00:00'] = String(dateStr).split(' ');
    const [dd, mmm, yyyy] = datePart.split('-');
    const mm = MONTHS_NUM[mmm];
    if (!mm) return '';
    const [hh, mi] = timePart.split(':');
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T${hh.padStart(2, '0')}:${mi.padStart(2, '0')}`;
  } catch { return ''; }
}

/** "DD-MMM-YYYY HH:MM:SS" → "YYYY-MM-DD"  (for date-only inputs) */
export function parseZohoDateOnly(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
  try {
    const [datePart] = String(dateStr).split(' ');
    const [dd, mmm, yyyy] = datePart.split('-');
    const mm = MONTHS_NUM[mmm];
    if (!mm) return '';
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  } catch { return ''; }
}

/** "DD-MMM-YYYY HH:MM:SS" → "DD-MMM-YYYY"  (human display, date only) */
export function displayZohoDate(dateStr) {
  if (!dateStr) return '—';
  const str = String(dateStr);
  if (/^\d{2}-[A-Za-z]{3}-\d{4}/.test(str)) return str.split(' ')[0];
  try {
    const [yyyy, mm, dd] = str.slice(0, 10).split('-');
    return `${String(dd).padStart(2, '0')}-${MONTHS_STR[parseInt(mm, 10) - 1]}-${yyyy}`;
  } catch { return '—'; }
}

export function extractTime(dateStr) {
  if (!dateStr) return '--:--';
  const str = String(dateStr).trim();
  if (/^\d{2}:\d{2}/.test(str)) return str.slice(0, 5);
  if (str.includes('T')) return str.split('T')[1]?.slice(0, 5) || '--:--';
  const space = str.indexOf(' ');
  if (space !== -1) return str.slice(space + 1, space + 6);
  return '--:--';
}

/** "YYYY-MM-DDTHH:MM" → "DD-MMM-YYYY HH:MM:SS"  (to send to Zoho API) */
export function toZohoDateTime(isoStr) {
  if (!isoStr) return null;
  try {
    const [datePart, timePart = '00:00'] = isoStr.split('T');
    const [yyyy, mm, dd] = datePart.split('-');
    const monthName = MONTHS_STR[parseInt(mm, 10) - 1];
    if (!monthName) return null;
    const [hh, mi] = timePart.split(':');
    return `${String(dd).padStart(2, '0')}-${monthName}-${yyyy} ${hh.padStart(2, '0')}:${mi.padStart(2, '0')}:00`;
  } catch { return null; }
}

/** "DD-MMM-YYYY HH:MM:SS" → "DD-MMM-YYYY HH:MM"  (human display with time) */
export function displayZohoDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const str = String(dateStr);
    if (/^\d{2}-[A-Za-z]{3}-\d{4}/.test(str)) {
      return str.slice(0, 17).replace(/:?\d{2}$/, '').trimEnd().replace(/:$/, '');
    }
    const isoVal = parseZohoDate(str);
    if (!isoVal) return '—';
    const [datePart, timePart = ''] = isoVal.split('T');
    const [yyyy, mm, dd] = datePart.split('-');
    return `${String(dd).padStart(2, '0')}-${MONTHS_STR[parseInt(mm, 10) - 1]}-${yyyy}${timePart ? ' ' + timePart : ''}`;
  } catch { return '—'; }
}

// ─── API services ─────────────────────────────────────────────────────────────
// Paths are relative to BASE_URL (already ends in /api)

// Stations — admin protected writes
export const stationsApi = {
  getAll: (params) => client.get('/stations', { params }),
  getById: (id) => client.get(`/stations/${id}`),
  create: (data) => client.post('/stations', data, { headers: adminHeaders() }),
  update: (id, data) => client.put(`/stations/${id}`, data, { headers: adminHeaders() }),
  delete: (id) => client.delete(`/stations/${id}`, { headers: adminHeaders() }),
  bulkCreate: (stations) => client.post('/stations/bulk', { stations }, { headers: adminHeaders() }),
  manifest: (id, date) => client.get(`/stations/${id}/manifest`, { params: { date }, headers: adminHeaders() }),
};

// Trains — admin protected writes
export const trainsApi = {
  getAll: (params) => client.get('/trains', { params }),
  getById: (id) => client.get(`/trains/${id}`),
  create: (data) => client.post('/trains', data, { headers: adminHeaders() }),
  update: (id, data) => client.put(`/trains/${id}`, data, { headers: adminHeaders() }),
  delete: (id) => client.delete(`/trains/${id}`, { headers: adminHeaders() }),
  searchByStation: (code, date) => client.get('/trains/search-by-station', { params: { station_code: code, journey_date: date } }),
  getRunningStatus: (id) => client.get(`/trains/${id}/running-status`),
  updateRunningStatus: (id, data) => client.put(`/trains/${id}/running-status`, data, { headers: adminHeaders() }),
  cancelOnDate: (id, data) => client.post(`/trains/${id}/cancel-on-date`, data, { headers: adminHeaders() }),
  bulkCreate: (trains) => client.post('/trains/bulk', { trains }, { headers: adminHeaders() }),
};

// Users — admin protected writes
export const usersApi = {
  getAll: (params) => client.get('/users', { params, headers: adminHeaders() }),
  getById: (id) => client.get(`/users/${id}`),
  create: (data) => client.post('/users', data, { headers: adminHeaders() }),
  update: (id, data) => client.put(`/users/${id}`, data, { headers: adminHeaders() }),
  delete: (id) => client.delete(`/users/${id}`, { headers: adminHeaders() }),
  updateProfile: (id, data) => client.put(`/users/${id}/profile`, data),
  updateStatus: (id, data) => client.put(`/users/${id}/status`, data, { headers: adminHeaders() }),
  insights: (id) => client.get(`/users/${id}/insights`),
};

// Bookings — mixed: passengers create/cancel own; admin sees all
export const bookingsApi = {
  getAll: (params) => client.get('/bookings', { params, headers: adminHeaders() }),
  getById: (id) => client.get(`/bookings/${id}`),
  create: (data) => client.post('/bookings', data),
  update: (id, data) => client.put(`/bookings/${id}`, data),
  delete: (id) => client.delete(`/bookings/${id}`, { headers: adminHeaders() }),
  confirm: (id) => client.post(`/bookings/${id}/confirm`, {}, { headers: adminHeaders() }),
  markPaid: (id) => client.post(`/bookings/${id}/paid`, {}, { headers: adminHeaders() }),
  cancel: (id, data = {}) => client.post(`/bookings/${id}/cancel`, data),
  getByPNR: (pnr) => client.get(`/bookings/pnr/${pnr}`),
  getTicket: (id) => client.get(`/bookings/${id}/ticket`),
  partialCancel: (id, passengerIndices) => client.post(`/bookings/${id}/partial-cancel`, { passenger_indices: passengerIndices }),
  chart: (params) => client.get('/bookings/chart', { params, headers: adminHeaders() }),
};

// Settings — admin only
export const settingsApi = {
  getAll: (params) => client.get('/settings', { params }),
  getById: (id) => client.get(`/settings/${id}`),
  create: (data) => client.post('/settings', data, { headers: adminHeaders() }),
  update: (id, data) => client.put(`/settings/${id}`, data, { headers: adminHeaders() }),
  delete: (id) => client.delete(`/settings/${id}`, { headers: adminHeaders() }),
};

// Auth — public + new JWT refresh/logout
export const authApi = {
  login: (data) => client.post('/auth/login', data),
  register: (data) => client.post('/auth/register', data),
  logout: () => client.post('/auth/logout', {}),
  refresh: (token) => client.post('/auth/refresh', { refresh_token: token }),
  setupAdmin: (data) => client.post('/auth/setup-admin', data),
  changePassword: (data) => client.post('/auth/change-password', data),
  forgotPassword: (data) => client.post('/auth/forgot-password', data),
  resetPassword: (data) => client.post('/auth/reset-password', data),
};

// Fares — admin protected writes
export const faresApi = {
  getAll: (params) => client.get('/fares', { params }),
  getById: (id) => client.get(`/fares/${id}`),
  create: (data) => client.post('/fares', data, { headers: adminHeaders() }),
  update: (id, data) => client.put(`/fares/${id}`, data, { headers: adminHeaders() }),
  delete: (id) => client.delete(`/fares/${id}`, { headers: adminHeaders() }),
  calculate: (data) => client.post('/fares/calculate', data),
};

// User-centric booking endpoints — passenger use
export const userBookingsApi = {
  getByUser: (userId, params) => client.get(`/users/${userId}/bookings`, { params }),
  getUpcoming: (userId) => client.get(`/users/${userId}/bookings`, { params: { upcoming: true } }),
};

// Train info extras — public
export const trainInfoApi = {
  schedule: (id) => client.get(`/trains/${id}/schedule`),
  vacancy: (id, date) => client.get(`/trains/${id}/vacancy`, { params: { date } }),
};

// Overview stats — admin only
export const overviewApi = {
  stats: () => client.get('/overview/stats', { headers: adminHeaders() }),
};

export const systemApi = {
  health: () => client.get('/health'),
  debug: () => client.get('/debug/config'),
  testToken: () => client.get('/test/token'),
};

// Connecting trains search — public
export const connectingTrainsApi = {
  search: (from, to, date) =>
    client.get('/trains/connecting', { params: { from, to, date } }),
};

// ── Train Routes — subform-based architecture ──────────────────────────────────
//
// DATABASE DESIGN (Zoho Creator):
//   Form: Train_Routes         — one record per TRAIN (parent)
//     Field: Train             — Lookup → Trains form
//     Field: Notes             — Text
//     Subform: Route_Stops     — list of intermediate stops
//       Field: Sequence        — Number (stop order; 1=origin, last=destination)
//       Field: Station_Name    — Text
//       Field: Station_Code    — Text (IRCTC code e.g. MAS, NDLS, SBC)
//       Field: Stations        — Lookup → Stations form (optional)
//       Field: Arrival_Time    — Time
//       Field: Departure_Time  — Time
//       Field: Halt_Minutes    — Number
//       Field: Distance_KM     — Decimal
//       Field: Day_Count       — Number (1 for same-day, 2 for next day, etc.)
//   Report: All_Train_Routes   — report over Train_Routes form
//
// API ENDPOINTS:
//   GET    /api/train-routes               → all route records (summary)
//   GET    /api/train-routes?train_id=X    → route record + stops for train X
//   POST   /api/train-routes               → create route record (with optional stops[])
//   GET    /api/train-routes/:id           → single route + stops
//   PUT    /api/train-routes/:id           → update route-level fields
//   DELETE /api/train-routes/:id           → delete entire route
//
//   GET    /api/train-routes/:id/stops          → list stops
//   POST   /api/train-routes/:id/stops          → add a stop (subform insert)
//   PUT    /api/train-routes/:id/stops/:stopId  → update a stop (subform update)
//   DELETE /api/train-routes/:id/stops/:stopId  → delete a stop (subform delete)
//
//   GET    /api/train-routes/connections?station_code=MAS → trains at station
//   GET    /api/train-routes/connections/all               → full connection map
//
export const trainRoutesApi = {
  // Route record (parent) CRUD
  getAll: (params) => client.get('/train-routes', { params }),
  getByTrain: (trainId) => client.get('/train-routes', { params: { train_id: trainId } }),
  getById: (id) => client.get(`/train-routes/${id}`),
  create: (data) => client.post('/train-routes', data, { headers: adminHeaders() }),
  update: (id, data) => client.put(`/train-routes/${id}`, data, { headers: adminHeaders() }),
  delete: (id) => client.delete(`/train-routes/${id}`, { headers: adminHeaders() }),

  // Subform stop CRUD (scoped to a route record)
  getStops: (routeId) => {
    if (!routeId || routeId === 'null' || routeId === 'undefined')
      return Promise.reject(new Error('Invalid route ID - cannot fetch stops'));
    return client.get(`/train-routes/${routeId}/stops`);
  },
  addStop: (routeId, data) => {
    if (!routeId || routeId === 'null' || routeId === 'undefined')
      return Promise.reject(new Error('Invalid route ID - route record may not exist or not be fully loaded'));
    return client.post(`/train-routes/${routeId}/stops`, data, { headers: adminHeaders() });
  },
  updateStop: (routeId, stopId, data) => {
    if (!routeId || routeId === 'null' || routeId === 'undefined')
      return Promise.reject(new Error('Invalid route ID'));
    if (!stopId || stopId === 'null' || stopId === 'undefined')
      return Promise.reject(new Error('Invalid stop ID'));
    return client.put(`/train-routes/${routeId}/stops/${stopId}`, data, { headers: adminHeaders() });
  },
  deleteStop: (routeId, stopId) => {
    if (!routeId || routeId === 'null' || routeId === 'undefined')
      return Promise.reject(new Error('Invalid route ID'));
    if (!stopId || stopId === 'null' || stopId === 'undefined')
      return Promise.reject(new Error('Invalid stop ID'));
    return client.delete(`/train-routes/${routeId}/stops/${stopId}`, { headers: adminHeaders() });
  },

  // Connection queries
  connections: (stationCode) => client.get('/train-routes/connections', { params: { station_code: stationCode } }),
  allConnections: () => client.get('/train-routes/connections/all'),
};

// ── IRCTC Replica Extensions ──────────────────────────────────────────────────

// Quotas — public read, admin writes
export const quotasApi = {
  getAll: (params) => client.get('/quotas', { params }),
  getById: (id) => client.get(`/quotas/${id}`),
  create: (data) => client.post('/quotas', data, { headers: adminHeaders() }),
  update: (id, data) => client.put(`/quotas/${id}`, data, { headers: adminHeaders() }),
  delete: (id) => client.delete(`/quotas/${id}`, { headers: adminHeaders() }),
};

// Coach Layouts — public read, admin protected writes
export const coachApi = {
  getAll: (params) => client.get('/coach-layouts', { params }),
  getById: (id) => client.get(`/coach-layouts/${id}`),
  create: (data) => client.post('/coach-layouts', data, { headers: adminHeaders() }),
  update: (id, data) => client.put(`/coach-layouts/${id}`, data, { headers: adminHeaders() }),
  delete: (id) => client.delete(`/coach-layouts/${id}`, { headers: adminHeaders() }),
};

// Train Inventory (Daily Ledger) — admin protected writes
export const inventoryApi = {
  getAll: (params) => client.get('/inventory', { params, headers: adminHeaders() }),
  getById: (id) => client.get(`/inventory/${id}`, { headers: adminHeaders() }),
  create: (data) => client.post('/inventory', data, { headers: adminHeaders() }),
  update: (id, data) => client.put(`/inventory/${id}`, data, { headers: adminHeaders() }),
  delete: (id) => client.delete(`/inventory/${id}`, { headers: adminHeaders() }),
};

// Announcements — public read, admin writes
export const announcementsApi = {
  getAll: (params) => client.get('/announcements', { params }),
  getActive: () => client.get('/announcements/active'),
  getById: (id) => client.get(`/announcements/${id}`),
  create: (data) => client.post('/announcements', data, { headers: adminHeaders() }),
  update: (id, data) => client.put(`/announcements/${id}`, data, { headers: adminHeaders() }),
  delete: (id) => client.delete(`/announcements/${id}`, { headers: adminHeaders() }),
};

// Admin Reports — admin only
export const reportsApi = {
  revenue: (params) => client.get('/reports/revenue', { params, headers: adminHeaders() }),
  occupancy: (params) => client.get('/reports/occupancy', { params, headers: adminHeaders() }),
};

// Admin Logs — admin only
export const adminLogsApi = {
  getAll: (params) => client.get('/admin/logs', { params, headers: adminHeaders() }),
  create: (data) => client.post('/admin/logs', data, { headers: adminHeaders() }),
};

// MCP / System Exploration — admin only
export const mcpApi = {
  health: () => client.get('/health'),
  debugConfig: () => client.get('/debug/config', { headers: adminHeaders() }),
  systemInfo: () => client.get('/debug/system', { headers: adminHeaders() }),
  testToken: () => client.get('/test/token', { headers: adminHeaders() }),
  aiTranslate: (query) => client.post('/debug/ai-search', { query }, { headers: adminHeaders() }),
  fetchRawReport: (alias, params) => client.get('/debug/raw', {
    params: { ...params, report: alias },
    headers: adminHeaders(),
  }),
  systemLogs: (limit = 50) => client.get('/admin/logs', { params: { limit }, headers: adminHeaders() }),
};

// ─── AI API (v2.0) ────────────────────────────────────────────────────────────

export const aiApi = {
  // Natural language → Zoho search results
  search: (query) =>
    client.post('/ai/search', { query }),
  agent: (message, history = [], userRole = 'User') =>
    client.post('/ai/agent', { message, history, user_role: userRole }),
  // Multi-turn booking assistant conversation
  chat: (message, history = []) =>
    client.post('/ai/chat', { message, history }),

  // Personalised train recommendations for a user
  recommendations: (userId, source = '', destination = '') =>
    client.get('/ai/recommendations', { params: { user_id: userId, source, destination } }),

  // Admin: Gemini-powered analytics insight
  analyze: (type = 'overview', question = '', days = 30) =>
    client.post('/ai/analyze', { type, question, days }),

  // Seat availability prediction for a train+date+class
  predictAvailability: (trainId, date, cls = 'SL') =>
    client.get('/ai/predict-availability', { params: { train_id: trainId, date, class: cls } }),

  // Cache management (admin)
  cacheStats: () => client.get('/ai/cache-stats'),
  invalidateCache: (prefix = '') => client.post('/ai/cache/invalidate', { prefix }),
};

// ─── Analytics API (v2.0) ─────────────────────────────────────────────────────

export const analyticsApi = {
  overview: () => client.get('/analytics/overview'),
  trends: (days) => client.get('/analytics/trends', { params: { days } }),
  topTrains: (n = 10) => client.get('/analytics/top-trains', { params: { n } }),
  routes: () => client.get('/analytics/routes'),
  revenue: () => client.get('/analytics/revenue'),
};

// Add a default export for the Axios client
export default axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});