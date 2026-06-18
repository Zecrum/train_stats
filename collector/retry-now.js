require('dotenv').config();
const { initDb } = require('./db');
const { retryFailedTrains } = require('./retry');
const { yesterdayParis } = require('./utils');
const logger = require('./logger');

async function run() {
  const date = process.argv[2] || yesterdayParis();

  if (process.argv[2] && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Format de date invalide. Utilisation : node retry-now.js [YYYY-MM-DD]');
    process.exit(1);
  }

  await initDb();
  logger.info(`RETRY-NOW | Retry manuel déclenché pour le ${date}`);
  await retryFailedTrains(date);
  process.exit(0);
}

run().catch(err => {
  logger.error(`FATAL | ${err.message}`);
  process.exit(1);
});
