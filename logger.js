const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, 'logs');
fs.mkdirSync(logsDir, { recursive: true });

function getLogPath() {
  return path.join(logsDir, new Date().toISOString().substring(0, 10) + '.log');
}

function write(level, message) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
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
