require('dotenv').config();
const config = require('./config');
const { initDb, insertTrain } = require('./db');
const { fetchTimetable } = require('./collector');
const logger = require('./logger');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  await initDb();

  const date = new Date().toISOString().substring(0, 10);
  logger.info(`COLLECT-NOW | Collecte manuelle pour le ${date}`);
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

  logger.info(`COLLECT-NOW | Terminé — ${total} trains au total`);
  process.exit(0);
}

run().catch(err => {
  logger.error(`FATAL | ${err.message}`);
  process.exit(1);
});
