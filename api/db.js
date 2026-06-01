"use strict";
const mysql = require("mysql2/promise");

/**
 * Pool MySQL partagé avec le collecteur — utilisé en LECTURE SEULE.
 * Crée idéalement un utilisateur MySQL dédié avec uniquement le droit SELECT :
 *   CREATE USER 'rer_e_readonly'@'localhost' IDENTIFIED BY '...';
 *   GRANT SELECT ON rer_e_stats.* TO 'rer_e_readonly'@'localhost';
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
