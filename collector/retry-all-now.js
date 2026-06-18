require('dotenv').config();
const { initDb } = require('./db');
const { retryAllFailedDates } = require('./retry');
const logger = require('./logger');

async function run() {
  await initDb();
  logger.info('RETRY-ALL-NOW | Rattrapage manuel déclenché sur tout l\'historique');
  await retryAllFailedDates();
  process.exit(0);
}

run().catch(err => {
  logger.error(`FATAL | ${err.message}`);
  process.exit(1);
});
