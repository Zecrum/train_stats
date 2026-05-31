const cron = require('node-cron');
const config = require('./config');
const { initDb, insertTrain } = require('./db');
const { fetchTimetable } = require('./collector');
const { startScheduler } = require('./scheduler');
const logger = require('./logger');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function todayDate() {
  return new Date().toISOString().substring(0, 10);
}

async function collectTimetable() {
  const date = todayDate();
  logger.info(`TIMETABLE | Début de la collecte pour le ${date}`);
  let total = 0;

  for (let i = 0; i < config.timetable.length; i++) {
    const entry = config.timetable[i];
    logger.info(`TIMETABLE | Appel ${i + 1}/${config.timetable.length} : ${entry.label}`);

    try {
      const trains = await fetchTimetable(entry, date);
      for (const train of trains) {
        await insertTrain(train);
      }
      total += trains.length;
      logger.info(`TIMETABLE | ${trains.length} trains insérés — ${entry.label}`);
    } catch (err) {
      logger.error(`TIMETABLE | ${entry.label} : ${err.message}`);
    }

    if (i < config.timetable.length - 1) {
      await sleep(config.scheduler.timetableCallSpacing);
    }
  }

  logger.info(`TIMETABLE | Terminé — ${total} trains au total`);
}

async function main() {
  await initDb();

  startScheduler();

  cron.schedule('30 4 * * *', async () => {
    try {
      await collectTimetable();
    } catch (err) {
      logger.error(`CRON TIMETABLE | ${err.message}`);
    }
  });

  logger.info('APP | Démarrée — cron timetable à 4h30, scheduler toutes les minutes');
}

main().catch(err => {
  logger.error(`FATAL | ${err.message}`);
  process.exit(1);
});
