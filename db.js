const mysql = require('mysql2/promise');
const config = require('./config');
const logger = require('./logger');
const { nowParis } = require('./utils');

const pool = mysql.createPool(config.db);

async function initDb() {
  const { database, ...connConfig } = config.db;
  const tmp = await mysql.createConnection(connConfig);
  await tmp.execute(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await tmp.end();
  logger.info(`Base de données "${database}" prête`);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS trains (
      trainNumber    VARCHAR(20)  NOT NULL,
      date           DATE         NOT NULL,
      mission        VARCHAR(10),
      departureStation VARCHAR(100),
      departureTime  DATETIME,
      arrivalStation VARCHAR(100),
      arrivalTime    DATETIME,
      composition    JSON,
      fetchedAt      DATETIME,
      retries        INT          NOT NULL DEFAULT 0,
      nextRetryAt    DATETIME,
      status         ENUM('pending', 'ok', 'unknown') NOT NULL DEFAULT 'pending',
      PRIMARY KEY (trainNumber, date)
    )
  `);
  logger.info('Table "trains" prête');
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

async function getPendingTrains() {
  const now = nowParis();
  const [rows] = await pool.execute(`
    SELECT * FROM trains
    WHERE status = 'pending'
      AND departureTime <= ? - INTERVAL 5 MINUTE
      AND (nextRetryAt IS NULL OR nextRetryAt <= NOW())
    ORDER BY departureTime ASC
  `, [now]);
  return rows;
}

async function updateTrainOk(trainNumber, date, composition) {
  await pool.execute(
    `UPDATE trains
     SET status = 'ok', composition = ?, fetchedAt = NOW()
     WHERE trainNumber = ? AND date = ?`,
    [JSON.stringify(composition), trainNumber, date]
  );
}

async function scheduleRetry(trainNumber, date, retries, delayMinutes) {
  await pool.execute(
    `UPDATE trains
     SET retries = ?, nextRetryAt = DATE_ADD(NOW(), INTERVAL ? MINUTE)
     WHERE trainNumber = ? AND date = ?`,
    [retries, delayMinutes, trainNumber, date]
  );
}

async function markUnknown(trainNumber, date, retries) {
  await pool.execute(
    `UPDATE trains
     SET status = 'unknown', retries = ?, fetchedAt = NOW()
     WHERE trainNumber = ? AND date = ?`,
    [retries, trainNumber, date]
  );
}

module.exports = { initDb, insertTrain, getPendingTrains, updateTrainOk, scheduleRetry, markUnknown };
