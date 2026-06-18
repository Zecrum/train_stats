const cron = require('node-cron');
const { initDb } = require('./db');
const { collectTimetable } = require('./timetable');
const { startScheduler } = require('./scheduler');
const { retryFailedTrains } = require('./retry');
const { yesterdayParis } = require('./utils');
const logger = require('./logger');

async function main() {
  await initDb();

  startScheduler();

  cron.schedule('30 2 * * *', async () => {
    try {
      await retryFailedTrains(yesterdayParis());
    } catch (err) {
      logger.error(`CRON RETRY | ${err.message}`);
    }
  }, { timezone: 'Europe/Paris' });

  cron.schedule('30 3 * * *', async () => {
    try {
      await collectTimetable();
    } catch (err) {
      logger.error(`CRON TIMETABLE | ${err.message}`);
    }
  }, { timezone: 'Europe/Paris' });

  logger.info('APP | Démarrée — cron retry échecs à 2h30, timetable à 3h30, scheduler toutes les minutes');
}

main().catch(err => {
  logger.error(`FATAL | ${err.message}`);
  process.exit(1);
});
