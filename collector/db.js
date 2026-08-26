const mysql = require('mysql2/promise');
const config = require('./config');
const logger = require('./logger');
const { nowParis } = require('./utils');

const pool = mysql.createPool(config.db);

const ROLLING_STOCK_MAP = {
  'RER NG':    'RERNG',
  'MI2N':      'MI2N',
  'NAT':       'NAT',
  'Francilien':'NAT',
};


// Extrait HH:MM:SS depuis un timestamp ISO ou laisse HH:MM tel quel
function extractTime(dt) {
  if (!dt) return null;
  if (dt.length <= 8) return dt;
  return new Date(dt).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Paris' });
}

async function initDb() {
  const { database, ...connConfig } = config.db;
  const tmp = await mysql.createConnection(connConfig);
  await tmp.execute(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await tmp.end();
  logger.info(`Base de données "${database}" prête`);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS trains (
      trainNumber        VARCHAR(20)  NOT NULL,
      date               DATE         NOT NULL,
      mission            VARCHAR(10),
      departureStation   VARCHAR(100),
      departureTime      DATETIME,
      arrivalStation     VARCHAR(100),
      arrivalTime        DATETIME,
      formation          ENUM('US', 'UM'),
      equipmentStatus    ENUM('pending', 'ok', 'unknown') NOT NULL DEFAULT 'pending',
      equipmentRetries   TINYINT      NOT NULL DEFAULT 0,
      equipmentRetryAt   DATETIME,
      equipmentFetchedAt DATETIME,
      detailStatus       ENUM('pending', 'ok', 'unknown') NOT NULL DEFAULT 'pending',
      detailRetries      TINYINT      NOT NULL DEFAULT 0,
      detailRetryAt      DATETIME,
      PRIMARY KEY (trainNumber, date)
    )
  `);

  const alterColumns = [
    `ADD COLUMN IF NOT EXISTS formation          ENUM('US', 'UM')`,
    `ADD COLUMN IF NOT EXISTS equipmentStatus    ENUM('pending','ok','unknown') NOT NULL DEFAULT 'pending'`,
    `ADD COLUMN IF NOT EXISTS equipmentRetries   TINYINT NOT NULL DEFAULT 0`,
    `ADD COLUMN IF NOT EXISTS equipmentRetryAt   DATETIME`,
    `ADD COLUMN IF NOT EXISTS equipmentFetchedAt DATETIME`,
    `ADD COLUMN IF NOT EXISTS detailStatus       ENUM('pending','ok','unknown') NOT NULL DEFAULT 'pending'`,
    `ADD COLUMN IF NOT EXISTS detailRetries      TINYINT NOT NULL DEFAULT 0`,
    `ADD COLUMN IF NOT EXISTS detailRetryAt      DATETIME`,
  ];
  for (const col of alterColumns) {
    await pool.execute(`ALTER TABLE trains ${col}`).catch(() => {});
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS train_sets (
      trainNumber  VARCHAR(20) NOT NULL,
      date         DATE        NOT NULL,
      position     TINYINT     NOT NULL,
      rollingStock ENUM('RERNG', 'MI2N', 'NAT') NOT NULL,
      coaches      TINYINT,
      PRIMARY KEY (trainNumber, date, position)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS train_details (
      trainNumber    VARCHAR(20) NOT NULL,
      date           DATE        NOT NULL,
      canceled       TINYINT(1),
      isDelayed      TINYINT(1),
      delayMinutes   SMALLINT,
      courseModified TINYINT(1),
      source         VARCHAR(20),
      fetchedAt      DATETIME,
      PRIMARY KEY (trainNumber, date)
    )
  `);
  await pool.execute(`ALTER TABLE train_details ADD COLUMN IF NOT EXISTS courseModified TINYINT(1)`).catch(() => {});
  await pool.execute(`ALTER TABLE train_details ADD COLUMN IF NOT EXISTS source VARCHAR(20)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS train_stops (
      trainNumber   VARCHAR(20) NOT NULL,
      date          DATE        NOT NULL,
      position      TINYINT     NOT NULL,
      station       VARCHAR(100),
      scheduledTime TIME,
      realTime      TIME,
      platform      VARCHAR(20),
      isDelayed     TINYINT(1),
      segmentType   VARCHAR(60),
      isDeleted     TINYINT(1),
      PRIMARY KEY (trainNumber, date, position)
    )
  `);
  await pool.execute(`ALTER TABLE train_stops ADD COLUMN IF NOT EXISTS isDeleted TINYINT(1)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS train_disruptions (
      id          INT         NOT NULL AUTO_INCREMENT,
      trainNumber VARCHAR(20),
      date        DATE,
      disruptionType VARCHAR(60),
      title       VARCHAR(200),
      message     TEXT,
      PRIMARY KEY (id),
      INDEX idx_train (trainNumber, date)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS unknown_missions (
      mission    VARCHAR(10)  NOT NULL,
      entryLabel VARCHAR(100),
      seenCount  INT          NOT NULL DEFAULT 1,
      firstSeen  DATE         NOT NULL,
      lastSeen   DATE         NOT NULL,
      PRIMARY KEY (mission)
    )
  `);

  logger.info('Tables prêtes');
}

async function insertTrain(train) {
  const [result] = await pool.execute(
    `INSERT IGNORE INTO trains
       (trainNumber, date, mission, departureStation, departureTime, arrivalStation, arrivalTime)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [train.trainNumber, train.date, train.mission,
     train.departureStation, train.departureTime,
     train.arrivalStation, train.arrivalTime]
  );
  return result.affectedRows;
}

async function getPendingEquipmentTrains() {
  const now = nowParis();
  const [rows] = await pool.execute(`
    SELECT * FROM trains
    WHERE equipmentStatus = 'pending'
      AND departureTime <= ? - INTERVAL 5 MINUTE
      AND (equipmentRetryAt IS NULL OR equipmentRetryAt <= NOW())
    ORDER BY departureTime ASC
  `, [now]);
  return rows;
}

async function getPendingDetailTrains() {
  const now = nowParis();
  const [rows] = await pool.execute(`
    SELECT * FROM trains
    WHERE detailStatus = 'pending'
      AND arrivalTime <= ? - INTERVAL 1 HOUR
      AND (detailRetryAt IS NULL OR detailRetryAt <= NOW())
    ORDER BY arrivalTime ASC
  `, [now]);
  return rows;
}

async function getDatesWithUnknownStatus() {
  const [rows] = await pool.execute(`
    SELECT DISTINCT date FROM trains
    WHERE equipmentStatus = 'unknown' OR detailStatus = 'unknown'
    ORDER BY date ASC
  `);
  return rows.map(r => r.date);
}

async function getUnknownEquipmentTrains(date) {
  const [rows] = await pool.execute(`
    SELECT * FROM trains
    WHERE date = ? AND equipmentStatus = 'unknown'
    ORDER BY departureTime ASC
  `, [date]);
  return rows;
}

async function getUnknownDetailTrains(date) {
  const [rows] = await pool.execute(`
    SELECT * FROM trains
    WHERE date = ? AND detailStatus = 'unknown'
    ORDER BY departureTime ASC
  `, [date]);
  return rows;
}

async function saveEquipment(trainNumber, date, sets) {
  const formation = sets.length >= 2 ? 'UM' : 'US';

  await pool.execute('DELETE FROM train_sets WHERE trainNumber = ? AND date = ?', [trainNumber, date]);

  for (let i = 0; i < sets.length; i++) {
    const rs = ROLLING_STOCK_MAP[sets[i].commercialName];
    if (!rs) {
      logger.warn(`EQUIPMENT | matériel inconnu : ${sets[i].commercialName}`);
      continue;
    }
    await pool.execute(
      `INSERT INTO train_sets (trainNumber, date, position, rollingStock, coaches) VALUES (?, ?, ?, ?, ?)`,
      [trainNumber, date, i + 1, rs, sets[i].coaches]
    );
  }

  await pool.execute(
    `UPDATE trains SET formation = ?, equipmentStatus = 'ok', equipmentFetchedAt = NOW()
     WHERE trainNumber = ? AND date = ?`,
    [formation, trainNumber, date]
  );
}

async function saveDetail(trainNumber, date, detail) {
  const stops       = detail.stops || [];
  const globalEvents = Array.isArray(detail.globalEvents) ? detail.globalEvents : [];

  const canceled       = detail.deleted        ? 1 : 0;
  const courseModified = detail.courseModified  ? 1 : 0;
  const source         = detail.source          || null;

  // isDelayed = au moins un arrêt avec un retard strictement positif
  const delayed = stops.some(s => !s.isDeleted && ((s.departureDelayMin ?? 0) > 0 || (s.arrivalDelayMin ?? 0) > 0)) ? 1 : 0;

  // delayMinutes = retard à l'arrivée au terminus (dernière gare active)
  // Négatif (avance) → ramené à 0
  let delayMinutes = 0;
  const activeStops = stops.filter(s => !s.isDeleted);
  const terminus = activeStops[activeStops.length - 1];
  if (terminus) {
    const terminalDelay = terminus.arrivalDelayMin ?? terminus.departureDelayMin ?? 0;
    delayMinutes = Math.max(0, terminalDelay);
  }

  await pool.execute(
    `INSERT INTO train_details (trainNumber, date, canceled, isDelayed, delayMinutes, courseModified, source, fetchedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       canceled = VALUES(canceled), isDelayed = VALUES(isDelayed),
       delayMinutes = VALUES(delayMinutes), courseModified = VALUES(courseModified),
       source = VALUES(source), fetchedAt = NOW()`,
    [trainNumber, date, canceled, delayed, delayMinutes, courseModified, source]
  );

  await pool.execute('DELETE FROM train_stops WHERE trainNumber = ? AND date = ?', [trainNumber, date]);
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const isDelayed   = (s.departureDelayMin != null || s.arrivalDelayMin != null) ? 1 : 0;
    const schedTime   = extractTime(s.scheduledDeparture ?? s.scheduledArrival);
    const realTime    = extractTime(s.realDeparture ?? s.realArrival);
    await pool.execute(
      `INSERT INTO train_stops (trainNumber, date, position, station, scheduledTime, realTime, platform, isDelayed, segmentType, isDeleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [trainNumber, date, i + 1, s.location || null, schedTime, realTime,
       null, isDelayed, null, s.isDeleted ? 1 : 0]
    );
  }

  await pool.execute('DELETE FROM train_disruptions WHERE trainNumber = ? AND date = ?', [trainNumber, date]);
  for (const e of globalEvents) {
    await pool.execute(
      `INSERT INTO train_disruptions (trainNumber, date, disruptionType, title, message) VALUES (?, ?, ?, ?, ?)`,
      [trainNumber, date, e.category || null, e.title || null, e.text || null]
    );
  }

  await pool.execute(
    `UPDATE trains SET detailStatus = 'ok' WHERE trainNumber = ? AND date = ?`,
    [trainNumber, date]
  );
}

async function scheduleEquipmentRetry(trainNumber, date, retries, delayMinutes) {
  await pool.execute(
    `UPDATE trains SET equipmentRetries = ?, equipmentRetryAt = DATE_ADD(NOW(), INTERVAL ? MINUTE)
     WHERE trainNumber = ? AND date = ?`,
    [retries, delayMinutes, trainNumber, date]
  );
}

async function markEquipmentUnknown(trainNumber, date, retries) {
  await pool.execute(
    `UPDATE trains SET equipmentStatus = 'unknown', equipmentRetries = ?, equipmentFetchedAt = NOW()
     WHERE trainNumber = ? AND date = ?`,
    [retries, trainNumber, date]
  );
}

async function scheduleDetailRetry(trainNumber, date, retries, delayMinutes) {
  await pool.execute(
    `UPDATE trains SET detailRetries = ?, detailRetryAt = DATE_ADD(NOW(), INTERVAL ? MINUTE)
     WHERE trainNumber = ? AND date = ?`,
    [retries, delayMinutes, trainNumber, date]
  );
}

async function markDetailUnknown(trainNumber, date, retries) {
  await pool.execute(
    `UPDATE trains SET detailStatus = 'unknown', detailRetries = ?
     WHERE trainNumber = ? AND date = ?`,
    [retries, trainNumber, date]
  );
}

async function saveUnknownMission(mission, entryLabel, date) {
  await pool.execute(
    `INSERT INTO unknown_missions (mission, entryLabel, seenCount, firstSeen, lastSeen)
     VALUES (?, ?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE
       seenCount  = seenCount + 1,
       entryLabel = VALUES(entryLabel),
       lastSeen   = VALUES(lastSeen)`,
    [mission, entryLabel, date, date]
  );
}

module.exports = {
  initDb, insertTrain,
  getPendingEquipmentTrains, getPendingDetailTrains,
  getDatesWithUnknownStatus, getUnknownEquipmentTrains, getUnknownDetailTrains,
  saveEquipment, saveDetail,
  scheduleEquipmentRetry, markEquipmentUnknown,
  scheduleDetailRetry, markDetailUnknown,
  saveUnknownMission,
};
