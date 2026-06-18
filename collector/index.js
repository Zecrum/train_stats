const cron = require('node-cron');
const { initDb } = require('./db');
const { collectTimetable } = require('./timetable');
const { startScheduler } = require('./scheduler');
const logger = require('./logger');

async function main() {
  await initDb();

  startScheduler();

  cron.schedule('30 3 * * *', async () => {
    try {
      await collectTimetable();
    } catch (err) {
      logger.error(`CRON TIMETABLE | ${err.message}`);
    }
  }, { timezone: 'Europe/Paris' });

  logger.info('APP | Démarrée — cron timetable à 3h30, scheduler toutes les minutes');
}

main().catch(err => {
  logger.error(`FATAL | ${err.message}`);
  process.exit(1);
});
