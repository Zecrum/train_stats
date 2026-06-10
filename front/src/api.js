// Client HTTP — fetch natif vers l'API REST. Base configurable via VITE_API_BASE.
const BASE = import.meta.env.VITE_API_BASE || "/api";

async function get(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  ).toString();
  const res = await fetch(`${BASE}${path}${qs ? "?" + qs : ""}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path}`);
  return res.json();
}

export const api = {
  daily:       (date)         => get("/stats/daily",       { date }),
  hourly:      (date, branch) => get("/stats/hourly",      { date, branch }),
  evolution:   (days, end)    => get("/stats/evolution",   { days, end }),
  disruptions:         (days, end)    => get("/stats/disruptions",          { days, end }),
  hourlyDisruptions:   (date)         => get("/stats/hourly-disruptions",   { date }),
};
