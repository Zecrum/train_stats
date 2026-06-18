const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, 'logs');
fs.mkdirSync(logsDir, { recursive: true });

function nowParis() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });
}

function getLogPath() {
  return path.join(logsDir, nowParis().substring(0, 10) + '.log');
}

function write(level, message) {
  const ts = nowParis();
  const line = `[${ts}] [${level}] ${message}`;
  console.log(line);
  fs.appendFileSync(getLogPath(), line + '\n');
}

module.exports = {
  info:  msg => write('INFO ', msg),
  ok:    msg => write('OK   ', msg),
  warn:  msg => write('WARN ', msg),
  error: msg => write('ERROR', msg),
};
