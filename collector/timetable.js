const config = require('./config');
const { insertTrain } = require('./db');
const { fetchTimetable } = require('./collector');
const { todayParis } = require('./utils');
const logger = require('./logger');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function tryFetchEntry(entry, date) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const trains = await fetchTimetable(entry, date);
      let inserted = 0;
      for (const train of trains) inserted += await insertTrain(train);
      return inserted;
    } catch (err) {
      const status = err.response?.status;
      if (attempt < 2) {
        const delay = status === 429 ? 30 : 5;
        logger.warn(`TIMETABLE | ${entry.label} : HTTP ${status || 'ERR'} — retry dans ${delay} min`);
        await sleep(delay * 60 * 1000);
      } else {
        logger.error(`TIMETABLE | ${entry.label} : ${err.message} (échec)`);
        return null;
      }
    }
  }
}

async function collectTimetable(date = todayParis()) {
  logger.info(`TIMETABLE | Collecte du ${date}`);

  const failed = [];
  let total = 0;

  for (let i = 0; i < config.timetable.length; i++) {
    const entry = config.timetable[i];
    logger.info(`TIMETABLE | Appel ${i + 1}/${config.timetable.length} : ${entry.label}`);

    const count = await tryFetchEntry(entry, date);
    if (count !== null) {
      total += count;
      logger.info(`TIMETABLE | ${count} trains insérés — ${entry.label}`);
    } else {
      failed.push(entry);
    }

    if (i < config.timetable.length - 1) {
      await sleep(config.scheduler.timetableCallSpacing);
    }
  }

  if (failed.length > 0) {
    logger.warn(`TIMETABLE | ${failed.length} appel(s) échoué(s) — retry dans 2h`);
    await sleep(2 * 60 * 60 * 1000);

    logger.info(`TIMETABLE | Retry des ${failed.length} appel(s) échoué(s)`);
    for (let i = 0; i < failed.length; i++) {
      const entry = failed[i];
      logger.info(`TIMETABLE | RETRY : ${entry.label}`);
      const count = await tryFetchEntry(entry, date);
      if (count !== null) {
        total += count;
        logger.info(`TIMETABLE | RETRY OK | ${count} trains — ${entry.label}`);
      }
      if (i < failed.length - 1) {
        await sleep(config.scheduler.timetableCallSpacing);
      }
    }
  }

  logger.info(`TIMETABLE | Terminé — ${total} trains au total`);
}

module.exports = { collectTimetable };
