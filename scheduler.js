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
        logger.error(`ERR API  | ${train.trainNumber} | ${train.date} | ${err.message}`);
        await handleRetry(train);
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
