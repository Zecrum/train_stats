function nowParis() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });
}

function todayParis() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

function yesterdayParis() {
  const [y, m, d] = todayParis().split('-').map(Number);
  const dt = new Date(y, m - 1, d - 1);
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

module.exports = { nowParis, todayParis, yesterdayParis };
