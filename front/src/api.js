// Client HTTP — fetch natif vers l'API REST. Base configurable via VITE_API_BASE.
const BASE = import.meta.env.VITE_API_BASE || "/api";

export const ADMIN_TOKEN_KEY = "rere_admin_token";

function getAdminToken() {
  try { return localStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; }
}

async function get(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  ).toString();
  const res = await fetch(`${BASE}${path}${qs ? "?" + qs : ""}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path}`);
  return res.json();
}

async function getAuth(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  ).toString();
  const token = getAdminToken();
  const res = await fetch(`${BASE}${path}${qs ? "?" + qs : ""}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path}`);
  return res.json();
}

async function del(path, { auth = false } = {}) {
  const headers = {};
  if (auth) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path}`);
  return res.json();
}

async function post(path, body, { auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path}`);
  return res.json();
}

export const api = {
  daily:             (date)         => get("/stats/daily",              { date }),
  hourly:            (date, branch) => get("/stats/hourly",             { date, branch }),
  evolution:         (days, end)    => get("/stats/evolution",          { days, end }),
  disruptions:       (days, end)    => get("/stats/disruptions",        { days, end }),
  hourlyDisruptions: (date)         => get("/stats/hourly-disruptions", { date }),
  trainsDay:         (date)         => get("/stats/trains-day",         { date }),
  trainDetail:       (trainNumber, date) => get("/stats/train-detail",  { trainNumber, date }),

  admin: {
    login:          (password)          => post("/admin/login", { password }),
    unresolved:     (date)              => getAuth("/admin/unresolved", { date }),
    retryEquipment:   (trainNumber, date) => post("/admin/retry-equipment", { trainNumber, date }, { auth: true }),
    retryDetail:      (trainNumber, date) => post("/admin/retry-detail", { trainNumber, date }, { auth: true }),
    setEquipment:     (payload)           => post("/admin/equipment", payload, { auth: true }),
    unknownMissions:  ()                  => getAuth("/admin/unknown-missions"),
    dismissMission:   (mission)           => del(`/admin/unknown-missions/${mission}`, { auth: true }),
  },
};
