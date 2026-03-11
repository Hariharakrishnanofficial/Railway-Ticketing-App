import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ' https://railway-ticketing-system-50039510865.development.catalystappsail.in/api/';

// ─── Role helpers ─────────────────────────────────────────────────────────────

/** Read the logged-in user from session storage. */
export function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem('rail_user')); }
  catch { return null; }
}

/**
 * Returns true if the current session user is an admin.
 * admin@admin.com is ALWAYS admin regardless of Role field.
 */
export function isAdmin(user) {
  if (!user) user = getCurrentUser();
  if (!user) return false;
  if (user.Email === 'admin@admin.com') return true;
  return (user.Role || '').toLowerCase() === 'admin';
}

/** Build auth headers for admin-protected API calls. */
function adminHeaders() {
  const user = getCurrentUser();
  if (!user) return {};
  return {
    'X-User-Email': user.Email || '',
    'X-User-Role':  user.Role  || '',
  };
}

// ─── Axios client ─────────────────────────────────────────────────────────────

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.response.use(
  (res) => res.data,
  (err) => {
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
    const e   = new Error(msg);
    e.status  = err.response?.status;
    e.body    = errBody;
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
  if (Array.isArray(apiResponse?.data))       return apiResponse.data;
  if (Array.isArray(apiResponse))             return apiResponse;
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

const MONTHS_NUM = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
const MONTHS_STR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
    return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}T${hh.padStart(2,'0')}:${mi.padStart(2,'0')}`;
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
    return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  } catch { return ''; }
}

/** "DD-MMM-YYYY HH:MM:SS" → "DD-MMM-YYYY"  (human display, date only) */
export function displayZohoDate(dateStr) {
  if (!dateStr) return '—';
  const str = String(dateStr);
  if (/^\d{2}-[A-Za-z]{3}-\d{4}/.test(str)) return str.split(' ')[0];
  try {
    const [yyyy, mm, dd] = str.slice(0, 10).split('-');
    return `${String(dd).padStart(2,'0')}-${MONTHS_STR[parseInt(mm,10)-1]}-${yyyy}`;
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
    return `${String(dd).padStart(2,'0')}-${monthName}-${yyyy} ${hh.padStart(2,'0')}:${mi.padStart(2,'0')}:00`;
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
    return `${String(dd).padStart(2,'0')}-${MONTHS_STR[parseInt(mm,10)-1]}-${yyyy}${timePart ? ' ' + timePart : ''}`;
  } catch { return '—'; }
}

// ─── API services ─────────────────────────────────────────────────────────────
// Paths are relative to BASE_URL (already ends in /api)

// Stations — admin protected writes
export const stationsApi = {
  getAll:  (params)   => client.get('/stations', { params }),
  getById: (id)       => client.get(`/stations/${id}`),
  create:  (data)     => client.post('/stations', data, { headers: adminHeaders() }),
  update:  (id, data) => client.put(`/stations/${id}`, data, { headers: adminHeaders() }),
  delete:  (id)       => client.delete(`/stations/${id}`, { headers: adminHeaders() }),
};

// Trains — admin protected writes
export const trainsApi = {
  getAll:          (params)     => client.get('/trains', { params }),
  getById:         (id)         => client.get(`/trains/${id}`),
  create:          (data)       => client.post('/trains', data, { headers: adminHeaders() }),
  update:          (id, data)   => client.put(`/trains/${id}`, data, { headers: adminHeaders() }),
  delete:          (id)         => client.delete(`/trains/${id}`, { headers: adminHeaders() }),
  searchByStation: (code, date) => client.get('/trains/search-by-station', { params: { station_code: code, journey_date: date } }),
};

// Users — admin protected writes
export const usersApi = {
  getAll:  (params)   => client.get('/users', { params, headers: adminHeaders() }),
  getById: (id)       => client.get(`/users/${id}`),
  create:  (data)     => client.post('/users', data, { headers: adminHeaders() }),
  update:  (id, data) => client.put(`/users/${id}`, data, { headers: adminHeaders() }),
  delete:  (id)       => client.delete(`/users/${id}`, { headers: adminHeaders() }),
};

// Bookings — mixed: passengers create/cancel own; admin sees all
export const bookingsApi = {
  getAll:   (params)        => client.get('/bookings', { params, headers: adminHeaders() }),
  getById:  (id)            => client.get(`/bookings/${id}`),
  create:   (data)          => client.post('/bookings', data),
  update:   (id, data)      => client.put(`/bookings/${id}`, data),
  delete:   (id)            => client.delete(`/bookings/${id}`, { headers: adminHeaders() }),
  confirm:  (id)            => client.post(`/bookings/${id}/confirm`, {}, { headers: adminHeaders() }),
  markPaid: (id)            => client.post(`/bookings/${id}/paid`, {}, { headers: adminHeaders() }),
  cancel:   (id, data = {}) => client.post(`/bookings/${id}/cancel`, data),
};

// Settings — admin only
export const settingsApi = {
  getAll:  (params)   => client.get('/settings', { params }),
  getById: (id)       => client.get(`/settings/${id}`),
  create:  (data)     => client.post('/settings', data, { headers: adminHeaders() }),
  update:  (id, data) => client.put(`/settings/${id}`, data, { headers: adminHeaders() }),
  delete:  (id)       => client.delete(`/settings/${id}`, { headers: adminHeaders() }),
};

// Auth — public
export const authApi = {
  login:       (data) => client.post('/auth/login', data),
  register:    (data) => client.post('/auth/register', data),
  setupAdmin:  (data) => client.post('/auth/setup-admin', data),
};

// Fares — admin protected writes
export const faresApi = {
  getAll:    (params)   => client.get('/fares', { params }),
  getById:   (id)       => client.get(`/fares/${id}`),
  create:    (data)     => client.post('/fares', data, { headers: adminHeaders() }),
  update:    (id, data) => client.put(`/fares/${id}`, data, { headers: adminHeaders() }),
  delete:    (id)       => client.delete(`/fares/${id}`, { headers: adminHeaders() }),
  calculate: (data)     => client.post('/fares/calculate', data),
};

// User-centric booking endpoints — passenger use
export const userBookingsApi = {
  getByUser:   (userId, params) => client.get(`/users/${userId}/bookings`, { params }),
  getUpcoming: (userId)         => client.get(`/users/${userId}/bookings`, { params: { upcoming: true } }),
};

// Train info extras — public
export const trainInfoApi = {
  schedule: (id)       => client.get(`/trains/${id}/schedule`),
  vacancy:  (id, date) => client.get(`/trains/${id}/vacancy`, { params: { date } }),
};

// Overview stats — admin only
export const overviewApi = {
  stats: () => client.get('/overview/stats', { headers: adminHeaders() }),
};

export const systemApi = {
  health:    () => client.get('/health'),
  debug:     () => client.get('/debug/config'),
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
  getAll:       (params)        => client.get('/train-routes', { params }),
  getByTrain:   (trainId)       => client.get('/train-routes', { params: { train_id: trainId } }),
  getById:      (id)            => client.get(`/train-routes/${id}`),
  create:       (data)          => client.post('/train-routes', data, { headers: adminHeaders() }),
  update:       (id, data)      => client.put(`/train-routes/${id}`, data, { headers: adminHeaders() }),
  delete:       (id)            => client.delete(`/train-routes/${id}`, { headers: adminHeaders() }),

  // Subform stop CRUD (scoped to a route record)
  getStops:     (routeId)              => {
    if (!routeId || routeId === 'null' || routeId === 'undefined')
      return Promise.reject(new Error('Invalid route ID - cannot fetch stops'));
    return client.get(`/train-routes/${routeId}/stops`);
  },
  addStop:      (routeId, data)        => {
    if (!routeId || routeId === 'null' || routeId === 'undefined')
      return Promise.reject(new Error('Invalid route ID - route record may not exist or not be fully loaded'));
    return client.post(`/train-routes/${routeId}/stops`, data, { headers: adminHeaders() });
  },
  updateStop:   (routeId, stopId, data)=> {
    if (!routeId || routeId === 'null' || routeId === 'undefined')
      return Promise.reject(new Error('Invalid route ID'));
    if (!stopId || stopId === 'null' || stopId === 'undefined')
      return Promise.reject(new Error('Invalid stop ID'));
    return client.put(`/train-routes/${routeId}/stops/${stopId}`, data, { headers: adminHeaders() });
  },
  deleteStop:   (routeId, stopId)      => {
    if (!routeId || routeId === 'null' || routeId === 'undefined')
      return Promise.reject(new Error('Invalid route ID'));
    if (!stopId || stopId === 'null' || stopId === 'undefined')  
      return Promise.reject(new Error('Invalid stop ID'));
    return client.delete(`/train-routes/${routeId}/stops/${stopId}`, { headers: adminHeaders() });
  },

  // Connection queries
  connections:    (stationCode) => client.get('/train-routes/connections', { params: { station_code: stationCode } }),
  allConnections: ()            => client.get('/train-routes/connections/all'),
};

export default client;