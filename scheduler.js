const cron = require('node-cron');
const config = require('./config');
const { getPendingTrains, updateTrainOk, scheduleRetry, markUnknown } = require('./db');
const { fetchEquipment } = require('./collector');
const logger = require('./logger');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let isRunning = false;

async function handleRetry(train) {
  const retries = train.retries + 1;
  const delayMinutes = config.scheduler.retryDelays[train.retries];

  if (delayMinutes !== undefined) {
    await scheduleRetry(train.trainNumber, train.date, retries, delayMinutes);
    logger.warn(`RETRY ${retries} | ${train.trainNumber} | ${train.date} | prochain dans ${delayMinutes} min`);
  } else {
    await markUnknown(train.trainNumber, train.date, retries);
    logger.warn(`UNKNOWN  | ${train.trainNumber} | ${train.date} | composition non trouvée après 3 tentatives`);
  }
}

async function handleApiError(train, err) {
  const status = err.response?.status;
  const id = `${train.trainNumber} | ${train.date}`;

  if (status === 429) {
    await scheduleRetry(train.trainNumber, train.date, train.retries, 60);
    logger.warn(`RATE LIMIT | ${id} | retry dans 60 min (tentative conservée)`);
    return;
  }

  if ([500, 502, 503, 504].includes(status)) {
    await scheduleRetry(train.trainNumber, train.date, train.retries, 60);
    logger.warn(`API DOWN   | ${id} | HTTP ${status} — retry dans 60 min (tentative conservée)`);
    return;
  }

  if (status === 401) {
    await scheduleRetry(train.trainNumber, train.date, train.retries, 120);
    logger.error(`AUTH ERROR | ${id} | HTTP 401 — vérifier la clé API (retry dans 2h)`);
    return;
  }

  if (status === 404) {
    await markUnknown(train.trainNumber, train.date, train.retries + 1);
    logger.warn(`NOT FOUND  | ${id} | HTTP 404 — marqué unknown`);
    return;
  }

  logger.error(`ERR API    | ${id} | ${err.message}`);
  await handleRetry(train);
}

async function processEquipmentQueue() {
  if (isRunning) return;
  isRunning = true;

  try {
    const trains = await getPendingTrains();
    if (trains.length === 0) return;

    logger.info(`SCHEDULER | ${trains.length} train(s) à traiter`);

    for (const train of trains) {
      logger.info(`APPEL API | ${train.trainNumber} | ${train.date} | mission ${train.mission} | départ ${train.departureTime}`);

      try {
        const sets = await fetchEquipment(train.trainNumber, train.date);

        if (sets && sets.length > 0) {
          await updateTrainOk(train.trainNumber, train.date, sets);
          const desc = sets.map(s => `${s.commercialName} (${s.coaches}C)`).join(' + ');
          logger.ok(`OK       | ${train.trainNumber} | ${train.date} | ${desc}`);
        } else {
          logger.warn(`SETS VIDE | ${train.trainNumber} | ${train.date}`);
          await handleRetry(train);
        }
      } catch (err) {
        await handleApiError(train, err);
      }

      await sleep(config.scheduler.equipmentCallSpacing);
    }
  } finally {
    isRunning = false;
  }
}

function startScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      await processEquipmentQueue();
    } catch (err) {
      logger.error(`SCHEDULER | Erreur inattendue : ${err.message}`);
      isRunning = false;
    }
  });

  logger.info('SCHEDULER | Démarré — collecte équipement toutes les minutes');
}

module.exports = { startScheduler };
