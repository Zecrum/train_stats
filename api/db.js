"use strict";
const mysql = require("mysql2/promise");

/**
 * Pool MySQL partagé avec le collecteur. Les routes /api/stats sont en lecture
 * seule, mais /api/admin (protégé par JWT) écrit via ce même pool — voir
 * .env.example pour les droits MySQL nécessaires (SELECT + INSERT/UPDATE/DELETE
 * sur trains/train_sets).
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 8,
  queueLimit: 0,
  dateStrings: true, // renvoie les DATE en 'YYYY-MM-DD' (pas d'objet Date / fuseau)
});

module.exports = pool;
