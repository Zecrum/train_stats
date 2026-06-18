const config = require('./config');
const { getDatesWithUnknownStatus, getUnknownEquipmentTrains, getUnknownDetailTrains, saveEquipment, saveDetail } = require('./db');
const { fetchEquipment, fetchTrainDetail } = require('./collector');
const logger = require('./logger');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function retryEquipment(date) {
  const trains = await getUnknownEquipmentTrains(date);
  if (trains.length === 0) return 0;

  logger.info(`RETRY EQUIP     | ${trains.length} train(s) à retenter pour le ${date}`);
  let fixed = 0;

  for (const train of trains) {
    try {
      const sets = await fetchEquipment(train.trainNumber, train.date);
      if (sets && sets.length > 0) {
        await saveEquipment(train.trainNumber, train.date, sets);
        fixed++;
        logger.ok(`RETRY EQUIP OK  | ${train.trainNumber} | ${train.date}`);
      } else {
        logger.warn(`RETRY EQUIP VIDE | ${train.trainNumber} | ${train.date} | toujours sans réponse`);
      }
    } catch (err) {
      logger.error(`RETRY EQUIP ERR | ${train.trainNumber} | ${train.date} | ${err.message}`);
    }
    await sleep(config.scheduler.equipmentCallSpacing);
  }

  return fixed;
}

async function retryDetail(date) {
  const trains = await getUnknownDetailTrains(date);
  if (trains.length === 0) return 0;

  logger.info(`RETRY DETAIL    | ${trains.length} train(s) à retenter pour le ${date}`);
  let fixed = 0;

  for (const train of trains) {
    try {
      const detail = await fetchTrainDetail(train.trainNumber, train.date);
      await saveDetail(train.trainNumber, train.date, detail);
      fixed++;
      logger.ok(`RETRY DETAIL OK | ${train.trainNumber} | ${train.date}`);
    } catch (err) {
      logger.error(`RETRY DETAIL ERR | ${train.trainNumber} | ${train.date} | ${err.message}`);
    }
    await sleep(config.scheduler.detailCallSpacing);
  }

  return fixed;
}

// Dernière chance pour les trains marqués 'unknown' (échec définitif pendant la journée).
// Appelé une fois pour une date déjà entièrement passée — pas de vérif "train arrivé".
async function retryFailedTrains(date) {
  const equipFixed  = await retryEquipment(date);
  const detailFixed = await retryDetail(date);
  logger.info(`RETRY DONE      | ${date} | équipement : ${equipFixed} résolu(s) | détail : ${detailFixed} résolu(s)`);
}

// Variante de rattrapage : parcourt tout l'historique et retente chaque date
// qui a encore des trains 'unknown' (pas seulement la veille).
async function retryAllFailedDates() {
  const dates = await getDatesWithUnknownStatus();
  if (dates.length === 0) {
    logger.info('RETRY ALL       | aucune date avec des échecs en attente');
    return;
  }

  logger.info(`RETRY ALL       | ${dates.length} date(s) à retenter : ${dates.join(', ')}`);
  for (const date of dates) {
    await retryFailedTrains(date);
  }
}

module.exports = { retryFailedTrains, retryAllFailedDates };
