import axios from 'axios';

// baseURL already includes /api — so all paths below must NOT repeat /api
// Final URL = baseURL + path  →  http://127.0.0.1:4600/api/stations  ✓
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://railway-ticketing-system-50039510865.development.catalystappsail.in/api';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Network error';
    const e = new Error(msg);
    e.status = err.response?.status;
    e.body   = err.response?.data;
    return Promise.reject(e);
  }
);

// ─── Response helpers ────────────────────────────────────────────────────────

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
  if (/^\d{2}:\d{2}/.test(str)) return str.slice(0, 5);         // already "HH:MM"
  if (str.includes('T')) return str.split('T')[1]?.slice(0, 5) || '--:--'; // ISO
  const space = str.indexOf(' ');
  if (space !== -1) return str.slice(space + 1, space + 6);     // "DD-MMM-YYYY HH:MM:SS"
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
// All paths are relative to baseURL (which already ends in /api)
// e.g. client.get('/stations') → GET http://127.0.0.1:4600/api/stations  ✓

export const stationsApi = {
  getAll:  (params)   => client.get('/stations', { params }),
  getById: (id)       => client.get(`/stations/${id}`),
  create:  (data)     => client.post('/stations', data),
  update:  (id, data) => client.put(`/stations/${id}`, data),
  delete:  (id)       => client.delete(`/stations/${id}`),
};

export const trainsApi = {
  getAll:          (params)      => client.get('/trains', { params }),
  getById:         (id)          => client.get(`/trains/${id}`),
  create:          (data)        => client.post('/trains', data),
  update:          (id, data)    => client.put(`/trains/${id}`, data),
  delete:          (id)          => client.delete(`/trains/${id}`),
  searchByStation: (code, date)  => client.get('/trains/search-by-station', { params: { station_code: code, journey_date: date } }),
};

export const usersApi = {
  getAll:  (params)   => client.get('/users', { params }),
  getById: (id)       => client.get(`/users/${id}`),
  create:  (data)     => client.post('/users', data),
  update:  (id, data) => client.put(`/users/${id}`, data),
  delete:  (id)       => client.delete(`/users/${id}`),
};

export const bookingsApi = {
  getAll:   (params)        => client.get('/bookings', { params }),
  getById:  (id)            => client.get(`/bookings/${id}`),
  create:   (data)          => client.post('/bookings', data),
  update:   (id, data)      => client.put(`/bookings/${id}`, data),
  delete:   (id)            => client.delete(`/bookings/${id}`),
  confirm:  (id)            => client.post(`/bookings/${id}/confirm`),
  markPaid: (id)            => client.post(`/bookings/${id}/paid`),
  cancel:   (id, data = {}) => client.post(`/bookings/${id}/cancel`, data),
};

export const settingsApi = {
  getAll:   (params)   => client.get('/settings', { params }),
  getById:  (id)       => client.get(`/settings/${id}`),
  create:   (data)     => client.post('/settings', data),
  update:   (id, data) => client.put(`/settings/${id}`, data),
  delete:   (id)       => client.delete(`/settings/${id}`),
};

export const authApi = {
  login:    (data) => client.post('/auth/login', data),
  register: (data) => client.post('/auth/register', data),
};

export const faresApi = {
  getAll:    (params)   => client.get('/fares', { params }),
  getById:   (id)       => client.get(`/fares/${id}`),
  create:    (data)     => client.post('/fares', data),
  update:    (id, data) => client.put(`/fares/${id}`, data),
  delete:    (id)       => client.delete(`/fares/${id}`),
  calculate: (data)     => client.post('/fares/calculate', data),
};

// ── User-centric booking endpoints
export const userBookingsApi = {
  getByUser:   (userId, params) => client.get(`/users/${userId}/bookings`, { params }),
  getUpcoming: (userId)         => client.get(`/users/${userId}/bookings`, { params: { upcoming: true } }),
};

// ── Train info extras
export const trainInfoApi = {
  schedule: (id)       => client.get(`/trains/${id}/schedule`),
  vacancy:  (id, date) => client.get(`/trains/${id}/vacancy`, { params: { date } }),
};

// ── Overview stats
export const overviewApi = {
  stats: () => client.get('/overview/stats'),
};

export const systemApi = {
  health:    () => client.get('/health'),
  debug:     () => client.get('/debug/config'),
  testToken: () => client.get('/test/token'),
};

// ── Connecting trains search
export const connectingTrainsApi = {
  search: (from, to, date) =>
    client.get("/trains/connecting", { params: { from, to, date } }),
};

// ── Train Routes (intermediate stops)
export const trainRoutesApi = {
  getAll:       (params)        => client.get("/train-routes", { params }),
  getByTrain:   (trainId)       => client.get("/train-routes", { params: { train_id: trainId } }),
  getById:      (id)            => client.get(`/train-routes/${id}`),
  create:       (data)          => client.post("/train-routes", data),
  update:       (id, data)      => client.put(`/train-routes/${id}`, data),
  delete:       (id)            => client.delete(`/train-routes/${id}`),
};

export default client;