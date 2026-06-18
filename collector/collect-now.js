require('dotenv').config();
const { initDb } = require('./db');
const { collectTimetable } = require('./timetable');
const { todayParis } = require('./utils');
const logger = require('./logger');

async function run() {
  const date = process.argv[2] || todayParis();

  if (process.argv[2] && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Format de date invalide. Utilisation : node collect-now.js [YYYY-MM-DD]');
    process.exit(1);
  }

  await initDb();
  logger.info(`COLLECT-NOW | Collecte manuelle déclenchée pour le ${date}`);
  await collectTimetable(date);
  process.exit(0);
}

run().catch(err => {
  logger.error(`FATAL | ${err.message}`);
  process.exit(1);
});
