const cron = require('node-cron');
const config = require('./config');
const {
  getPendingEquipmentTrains, getPendingDetailTrains,
  saveEquipment, saveDetail,
  scheduleEquipmentRetry, markEquipmentUnknown,
  scheduleDetailRetry, markDetailUnknown,
} = require('./db');
const { fetchEquipment, fetchTrainDetail } = require('./collector');
const logger = require('./logger');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let isRunning = false;
let lastDetailAt = 0;
const DETAIL_COOLDOWN = 2 * 60 * 1000;

function hasTrainArrived(stops) {
  if (stops.length === 0) return true;

  const activeStops = stops.filter(s =>
    s.segmentType !== 'STOP_DISRUPTION_DELETED' &&
    s.segmentType !== 'STOP_ACTIVE_DISRUPTION_DELETED'
  );

  if (activeStops.length === 0) return true;

  const terminus = activeStops.find(s => s.segmentType === 'END_ACTIVE_SEGMENT')
    ?? activeStops[activeStops.length - 1];

  return !!terminus.realTime;
}

// ── Equipment ─────────────────────────────────────────────────────────────────

async function handleEquipmentRetry(train) {
  const retries = train.equipmentRetries + 1;
  const delayMinutes = config.scheduler.retryDelays[train.equipmentRetries];
  if (delayMinutes !== undefined) {
    await scheduleEquipmentRetry(train.trainNumber, train.date, retries, delayMinutes);
    logger.warn(`EQUIP RETRY ${retries}  | ${train.trainNumber} | ${train.date} | dans ${delayMinutes} min`);
  } else {
    await markEquipmentUnknown(train.trainNumber, train.date, retries);
    logger.warn(`EQUIP UNKNOWN   | ${train.trainNumber} | ${train.date}`);
  }
}

async function handleEquipmentError(train, err) {
  const status = err.response?.status;
  const id = `${train.trainNumber} | ${train.date}`;
  if (status === 429) {
    await scheduleEquipmentRetry(train.trainNumber, train.date, train.equipmentRetries, 60);
    logger.warn(`EQUIP RL        | ${id} | retry dans 60 min`);
  } else if ([500, 502, 503, 504].includes(status)) {
    await scheduleEquipmentRetry(train.trainNumber, train.date, train.equipmentRetries, 60);
    logger.warn(`EQUIP DOWN      | ${id} | HTTP ${status} — retry dans 60 min`);
  } else if (status === 401) {
    await scheduleEquipmentRetry(train.trainNumber, train.date, train.equipmentRetries, 120);
    logger.error(`EQUIP AUTH      | ${id} | HTTP 401`);
  } else if (status === 404) {
    await markEquipmentUnknown(train.trainNumber, train.date, train.equipmentRetries + 1);
    logger.warn(`EQUIP 404       | ${id} | marqué unknown`);
  } else {
    logger.error(`EQUIP ERR       | ${id} | ${err.message}`);
    await handleEquipmentRetry(train);
  }
}

async function processEquipmentQueue() {
  const trains = await getPendingEquipmentTrains();
  if (trains.length === 0) return;

  logger.info(`EQUIPMENT | ${trains.length} train(s) à traiter`);

  for (const train of trains) {
    logger.info(`EQUIP API       | ${train.trainNumber} | ${train.date} | ${train.mission}`);
    try {
      const sets = await fetchEquipment(train.trainNumber, train.date);
      if (sets && sets.length > 0) {
        await saveEquipment(train.trainNumber, train.date, sets);
        const desc = sets.map(s => `${s.commercialName} (${s.coaches}C)`).join(' + ');
        logger.ok(`EQUIP OK        | ${train.trainNumber} | ${train.date} | ${desc}`);
      } else {
        logger.warn(`EQUIP VIDE      | ${train.trainNumber} | ${train.date}`);
        await handleEquipmentRetry(train);
      }
    } catch (err) {
      await handleEquipmentError(train, err);
    }
    await sleep(config.scheduler.equipmentCallSpacing);
  }
}

// ── Detail ────────────────────────────────────────────────────────────────────

async function handleDetailRetry(train) {
  const retries = train.detailRetries + 1;
  const delayMinutes = config.scheduler.retryDelays[train.detailRetries];
  if (delayMinutes !== undefined) {
    await scheduleDetailRetry(train.trainNumber, train.date, retries, delayMinutes);
    logger.warn(`DETAIL RETRY ${retries} | ${train.trainNumber} | ${train.date} | dans ${delayMinutes} min`);
  } else {
    await markDetailUnknown(train.trainNumber, train.date, retries);
    logger.warn(`DETAIL UNKNOWN  | ${train.trainNumber} | ${train.date}`);
  }
}

async function handleDetailError(train, err) {
  const status = err.response?.status;
  const id = `${train.trainNumber} | ${train.date}`;
  if (status === 429) {
    await scheduleDetailRetry(train.trainNumber, train.date, train.detailRetries, 60);
    logger.warn(`DETAIL RL       | ${id} | retry dans 60 min`);
  } else if ([500, 502, 503, 504].includes(status)) {
    await scheduleDetailRetry(train.trainNumber, train.date, train.detailRetries, 60);
    logger.warn(`DETAIL DOWN     | ${id} | HTTP ${status} — retry dans 60 min`);
  } else if (status === 401) {
    await scheduleDetailRetry(train.trainNumber, train.date, train.detailRetries, 120);
    logger.error(`DETAIL AUTH     | ${id} | HTTP 401`);
  } else if (status === 404) {
    await markDetailUnknown(train.trainNumber, train.date, train.detailRetries + 1);
    logger.warn(`DETAIL 404      | ${id} | marqué unknown`);
  } else {
    logger.error(`DETAIL ERR      | ${id} | ${err.message}`);
    await handleDetailRetry(train);
  }
}

async function processDetailQueue() {
  if (Date.now() - lastDetailAt < DETAIL_COOLDOWN) return;

  const trains = await getPendingDetailTrains();
  if (trains.length === 0) return;

  const batch = trains.slice(0, config.scheduler.detailPerCycle);
  logger.info(`DETAIL    | ${batch.length}/${trains.length} train(s) traités ce cycle`);

  for (const train of batch) {
    logger.info(`DETAIL API      | ${train.trainNumber} | ${train.date}`);
    try {
      const detail = await fetchTrainDetail(train.trainNumber, train.date);
      lastDetailAt = Date.now();
      const stops = detail.stops || [];

      if (!hasTrainArrived(stops)) {
        await scheduleDetailRetry(train.trainNumber, train.date, train.detailRetries, 60);
        logger.warn(`DETAIL EN ROUTE | ${train.trainNumber} | ${train.date} | pas encore arrivé — retry dans 60 min`);
      } else {
        await saveDetail(train.trainNumber, train.date, detail);
        const flags = [];
        if (detail.disruptions?.length) flags.push(`${detail.disruptions.length} perturbation(s)`);
        if (stops.some(s => s.isDelayed)) flags.push('retard');
        if (stops.some(s => s.segmentType === 'STOP_DISRUPTION_DELETED')) flags.push('arrêt(s) supprimé(s)');
        logger.ok(`DETAIL OK       | ${train.trainNumber} | ${train.date}${flags.length ? ' | ' + flags.join(', ') : ''}`);
      }
    } catch (err) {
      lastDetailAt = Date.now();
      await handleDetailError(train, err);
    }
    await sleep(config.scheduler.detailCallSpacing);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function processQueues() {
  if (isRunning) return;
  isRunning = true;
  try {
    await processEquipmentQueue();
    await processDetailQueue();
  } catch (err) {
    logger.error(`SCHEDULER | Erreur inattendue : ${err.message}`);
  } finally {
    isRunning = false;
  }
}

function startScheduler() {
  cron.schedule('* * * * *', processQueues, { timezone: 'Europe/Paris' });
  logger.info('SCHEDULER | Démarré');
}

module.exports = { startScheduler };
