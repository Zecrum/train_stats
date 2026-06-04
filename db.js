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

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
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
      trainNumber  VARCHAR(20) NOT NULL,
      date         DATE        NOT NULL,
      canceled     TINYINT(1),
      isDelayed    TINYINT(1),
      delayMinutes SMALLINT,
      fetchedAt    DATETIME,
      PRIMARY KEY (trainNumber, date)
    )
  `);

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
      PRIMARY KEY (trainNumber, date, position)
    )
  `);

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

  logger.info('Tables prêtes');
}

async function insertTrain(train) {
  await pool.execute(
    `INSERT IGNORE INTO trains
       (trainNumber, date, mission, departureStation, departureTime, arrivalStation, arrivalTime)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [train.trainNumber, train.date, train.mission,
     train.departureStation, train.departureTime,
     train.arrivalStation, train.arrivalTime]
  );
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
  const stops       = detail.stops        || [];
  const disruptions = detail.disruptions  || [];

  const delayed = stops.some(s => s.isDelayed) ? 1 : 0;
  const DELETED_SEGMENT_TYPES = new Set([
    'START_DISRUPTION_DELETED',
    'STOP_DISRUPTION_DELETED',
    'END_DISRUPTION_DELETED',
    'STOP_ACTIVE_DISRUPTION_DELETED',
  ]);
  const canceled = disruptions.some(d => d.type === 'DISRUPTION_DELETED') ||
    (stops.length > 0 && stops.every(s => DELETED_SEGMENT_TYPES.has(s.segmentType))) ? 1 : 0;

  let delayMinutes = 0;
  const firstDelayed = stops.find(s => s.isDelayed && s.realTime && s.scheduledTime);
  if (firstDelayed) {
    delayMinutes = timeToMinutes(firstDelayed.realTime) - timeToMinutes(firstDelayed.scheduledTime);
  }

  await pool.execute(
    `INSERT INTO train_details (trainNumber, date, canceled, isDelayed, delayMinutes, fetchedAt)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       canceled = VALUES(canceled), isDelayed = VALUES(isDelayed),
       delayMinutes = VALUES(delayMinutes), fetchedAt = NOW()`,
    [trainNumber, date, canceled, delayed, delayMinutes]
  );

  await pool.execute('DELETE FROM train_stops WHERE trainNumber = ? AND date = ?', [trainNumber, date]);
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    await pool.execute(
      `INSERT INTO train_stops (trainNumber, date, position, station, scheduledTime, realTime, platform, isDelayed, segmentType)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [trainNumber, date, i + 1, s.station, s.scheduledTime || null, s.realTime || null,
       s.platform || null, s.isDelayed ? 1 : 0, s.segmentType || null]
    );
  }

  await pool.execute('DELETE FROM train_disruptions WHERE trainNumber = ? AND date = ?', [trainNumber, date]);
  for (const d of disruptions) {
    await pool.execute(
      `INSERT INTO train_disruptions (trainNumber, date, disruptionType, title, message) VALUES (?, ?, ?, ?, ?)`,
      [trainNumber, date, d.type || null, d.title || null, d.message || null]
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

module.exports = {
  initDb, insertTrain,
  getPendingEquipmentTrains, getPendingDetailTrains,
  saveEquipment, saveDetail,
  scheduleEquipmentRetry, markEquipmentUnknown,
  scheduleDetailRetry, markDetailUnknown,
};
