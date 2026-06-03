require('dotenv').config();
const { initDb } = require('./db');
const { collectTimetable } = require('./timetable');
const logger = require('./logger');

async function run() {
  await initDb();
  logger.info('COLLECT-NOW | Collecte manuelle déclenchée');
  await collectTimetable();
  process.exit(0);
}

run().catch(err => {
  logger.error(`FATAL | ${err.message}`);
  process.exit(1);
});
