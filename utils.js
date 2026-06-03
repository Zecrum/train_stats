function nowParis() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });
}

function todayParis() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

module.exports = { nowParis, todayParis };
