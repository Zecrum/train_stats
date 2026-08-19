"use strict";
const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const pool = require("../db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

const ROLLING_STOCK_VALUES = ["RERNG", "NAT", "MI2N"];

function sha256(s) { return crypto.createHash("sha256").update(String(s)).digest(); }

function timingSafeEqualStr(a, b) {
  const ha = sha256(a), hb = sha256(b);
  return crypto.timingSafeEqual(ha, hb);
}

// 5 tentatives / 15 min par IP — limite le bruteforce sur le mot de passe admin.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_attempts" },
});

/* -------------------------------------------------------------------------- */
/* POST /api/admin/login                                                      */
/* -------------------------------------------------------------------------- */
router.post("/login", loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!password || !timingSafeEqualStr(password, process.env.ADMIN_PASSWORD || "")) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  const token = jwt.sign({ role: "admin" }, process.env.ADMIN_JWT_SECRET, { expiresIn: "30d" });
  res.json({ token });
});

router.use(requireAdmin);

/* -------------------------------------------------------------------------- */
/* GET /api/admin/unresolved?date=YYYY-MM-DD                                  */
/* -------------------------------------------------------------------------- */
router.get("/unresolved", async (req, res, next) => {
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? req.query.date : null;

    const dateFilter = date ? "t.date = ?" : "t.date >= (CURDATE() - INTERVAL 14 DAY)";
    const params = date ? [date] : [];

    // Un train supprimé n'a logiquement pas d'équipement à récupérer — equipmentStatus
    // = 'unknown' (ou 'pending' oublié) sur un train annulé n'est pas une anomalie.
    const [rows] = await pool.query(
      `SELECT t.trainNumber, t.date, t.mission, t.departureTime, t.arrivalTime,
              t.equipmentStatus, t.equipmentRetries,
              t.detailStatus, t.detailRetries,
              t.formation, ts.rollingStock AS material, IFNULL(td.canceled, 0) AS canceled
         FROM trains t
         LEFT JOIN train_sets ts ON ts.trainNumber = t.trainNumber AND ts.date = t.date AND ts.position = 1
         LEFT JOIN train_details td ON td.trainNumber = t.trainNumber AND td.date = t.date
        WHERE ${dateFilter}
          AND (
            (t.equipmentStatus = 'unknown' AND IFNULL(td.canceled, 0) = 0)
            OR t.detailStatus = 'unknown'
            OR (t.equipmentStatus = 'pending' AND IFNULL(td.canceled, 0) = 0 AND t.departureTime <= NOW() - INTERVAL 30 MINUTE)
            OR (t.detailStatus = 'pending' AND t.arrivalTime <= NOW() - INTERVAL 2 HOUR)
          )
        ORDER BY t.date DESC, t.departureTime DESC`,
      params
    );

    res.json(rows.map((r) => ({
      trainNumber:      r.trainNumber,
      date:              r.date,
      mission:           r.mission,
      departureTime:     r.departureTime,
      arrivalTime:       r.arrivalTime,
      equipmentStatus:   r.equipmentStatus,
      equipmentRetries:  r.equipmentRetries,
      detailStatus:      r.detailStatus,
      detailRetries:     r.detailRetries,
      formation:         r.formation,
      material:          r.material,
      canceled:          !!r.canceled,
    })));
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/* POST /api/admin/retry-equipment  { trainNumber, date }                     */
/* -------------------------------------------------------------------------- */
router.post("/retry-equipment", async (req, res, next) => {
  try {
    const { trainNumber, date } = req.body || {};
    if (!trainNumber || !date) return res.status(400).json({ error: "trainNumber et date requis" });

    await pool.query(
      `UPDATE trains SET equipmentStatus = 'pending', equipmentRetries = 0, equipmentRetryAt = NULL
        WHERE trainNumber = ? AND date = ?`,
      [trainNumber, date]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/* POST /api/admin/retry-detail  { trainNumber, date }                        */
/* -------------------------------------------------------------------------- */
router.post("/retry-detail", async (req, res, next) => {
  try {
    const { trainNumber, date } = req.body || {};
    if (!trainNumber || !date) return res.status(400).json({ error: "trainNumber et date requis" });

    await pool.query(
      `UPDATE trains SET detailStatus = 'pending', detailRetries = 0, detailRetryAt = NULL
        WHERE trainNumber = ? AND date = ?`,
      [trainNumber, date]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/* POST /api/admin/equipment  { trainNumber, date, formation, units }         */
/* units: [{ rollingStock, coaches }, ...] — 1 élément (US) ou 2 (UM)         */
/* -------------------------------------------------------------------------- */
router.post("/equipment", async (req, res, next) => {
  try {
    const { trainNumber, date, formation, units } = req.body || {};

    if (!trainNumber || !date) return res.status(400).json({ error: "trainNumber et date requis" });
    if (!["US", "UM"].includes(formation)) return res.status(400).json({ error: "formation invalide (US/UM)" });
    if (!Array.isArray(units) || units.length === 0 || units.length > 2) {
      return res.status(400).json({ error: "units doit contenir 1 ou 2 éléments" });
    }
    if (formation === "UM" && units.length !== 2) return res.status(400).json({ error: "UM nécessite 2 unités" });
    if (formation === "US" && units.length !== 1) return res.status(400).json({ error: "US nécessite 1 unité" });
    for (const u of units) {
      if (!ROLLING_STOCK_VALUES.includes(u.rollingStock)) {
        return res.status(400).json({ error: `rollingStock invalide : ${u.rollingStock}` });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("DELETE FROM train_sets WHERE trainNumber = ? AND date = ?", [trainNumber, date]);
      for (let i = 0; i < units.length; i++) {
        await conn.query(
          `INSERT INTO train_sets (trainNumber, date, position, rollingStock, coaches) VALUES (?, ?, ?, ?, ?)`,
          [trainNumber, date, i + 1, units[i].rollingStock, units[i].coaches || null]
        );
      }
      await conn.query(
        `UPDATE trains SET formation = ?, equipmentStatus = 'ok', equipmentFetchedAt = NOW()
          WHERE trainNumber = ? AND date = ?`,
        [formation, trainNumber, date]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/* GET /api/admin/unknown-missions                                             */
/* -------------------------------------------------------------------------- */
router.get("/unknown-missions", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT mission, entryLabel, seenCount, firstSeen, lastSeen
       FROM unknown_missions
       ORDER BY lastSeen DESC, seenCount DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/* DELETE /api/admin/unknown-missions/:mission                                 */
/* -------------------------------------------------------------------------- */
router.delete("/unknown-missions/:mission", async (req, res, next) => {
  try {
    await pool.execute(`DELETE FROM unknown_missions WHERE mission = ?`, [req.params.mission]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
