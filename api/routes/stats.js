"use strict";
const express = require("express");
const pool = require("../db");

const router = express.Router();

const BRANCHES = {
  Chelles:  { label: "Chelles–Gournay",    missions: "NOCY · CONY" },
  Tournan:  { label: "Tournan",            missions: "NATU · NUTU · TANU · TINU" },
  Villiers: { label: "Villiers-sur-Marne", missions: "NOVY · VONY" },
  Central:  { label: "Tronçon central",    missions: "NOMY · MONY" },
};

const MAT_KEY = { "RER NG": "RERNG", "NAT": "NAT", "MI2N": "MI2N", "Francilien": "NAT" };

// Expressions SQL réutilisables
const MAT_EXPR  = `JSON_UNQUOTE(JSON_EXTRACT(composition, '$[0].commercialName'))`;
const COUP_EXPR = `IF(JSON_LENGTH(composition) > 1, 'um', 'us')`;
const BRANCH_CASE = `
  CASE
    WHEN mission IN ('NOCY','CONY')              THEN 'Chelles'
    WHEN mission IN ('NATU','NUTU','TANU','TINU') THEN 'Tournan'
    WHEN mission IN ('NOVY','VONY')              THEN 'Villiers'
    WHEN mission IN ('NOMY','MONY')              THEN 'Central'
  END`;
const KNOWN_MISSIONS = `mission IN ('NOCY','CONY','NATU','NUTU','TANU','TINU','NOVY','VONY','NOMY','MONY')`;

const BRANCH_MISSIONS = {
  Chelles:  `mission IN ('NOCY','CONY')`,
  Tournan:  `mission IN ('NATU','NUTU','TANU','TINU')`,
  Villiers: `mission IN ('NOVY','VONY')`,
  Central:  `mission IN ('NOMY','MONY')`,
};

function today() {
  return new Date().toLocaleDateString("en-CA");
}
function emptyMat()  { return { RERNG: 0, NAT: 0, MI2N: 0 }; }
function emptyCoup() { return { um: 0, us: 0 }; }

/* -------------------------------------------------------------------------- */
/* GET /api/stats/daily?date=YYYY-MM-DD                                        */
/* -------------------------------------------------------------------------- */
router.get("/daily", async (req, res, next) => {
  try {
    const date = req.query.date || today();

    const [[totals]] = await pool.query(
      `SELECT COUNT(*)                AS total,
              SUM(status = 'ok')      AS resolved,
              SUM(status = 'unknown') AS unknown,
              SUM(status = 'pending') AS pending
         FROM trains
        WHERE date = ?`,
      [date]
    );

    const [matRows] = await pool.query(
      `SELECT ${MAT_EXPR} AS materiel, COUNT(*) AS n
         FROM trains
        WHERE date = ? AND status = 'ok'
        GROUP BY materiel`,
      [date]
    );

    const [coupRows] = await pool.query(
      `SELECT ${COUP_EXPR} AS couplage, COUNT(*) AS n
         FROM trains
        WHERE date = ? AND status = 'ok'
        GROUP BY couplage`,
      [date]
    );

    const [brTotal] = await pool.query(
      `SELECT ${BRANCH_CASE} AS branche, COUNT(*) AS total
         FROM trains
        WHERE date = ? AND status = 'ok' AND ${KNOWN_MISSIONS}
        GROUP BY branche`,
      [date]
    );

    const [brMat] = await pool.query(
      `SELECT ${BRANCH_CASE} AS branche, ${MAT_EXPR} AS materiel, COUNT(*) AS n
         FROM trains
        WHERE date = ? AND status = 'ok' AND ${KNOWN_MISSIONS}
        GROUP BY branche, materiel`,
      [date]
    );

    const [brCoup] = await pool.query(
      `SELECT ${BRANCH_CASE} AS branche, ${COUP_EXPR} AS couplage, COUNT(*) AS n
         FROM trains
        WHERE date = ? AND status = 'ok' AND ${KNOWN_MISSIONS}
        GROUP BY branche, couplage`,
      [date]
    );

    const material = emptyMat();
    matRows.forEach((r) => { if (MAT_KEY[r.materiel]) material[MAT_KEY[r.materiel]] += Number(r.n); });

    const coupling = emptyCoup();
    coupRows.forEach((r) => { coupling[r.couplage] = Number(r.n); });

    const branches = {};
    for (const key of Object.keys(BRANCHES)) {
      branches[key] = { label: BRANCHES[key].label, missions: BRANCHES[key].missions, total: 0, material: emptyMat(), coupling: emptyCoup() };
    }
    brTotal.forEach((r) => { if (branches[r.branche]) branches[r.branche].total = Number(r.total); });
    brMat.forEach((r)   => { if (branches[r.branche] && MAT_KEY[r.materiel]) branches[r.branche].material[MAT_KEY[r.materiel]] += Number(r.n); });
    brCoup.forEach((r)  => { if (branches[r.branche]) branches[r.branche].coupling[r.couplage] = Number(r.n); });

    const resolved  = Number(totals.resolved) || 0;
    const unknown   = Number(totals.unknown)  || 0;
    const pending   = Number(totals.pending)  || 0;
    const collected = resolved + unknown;

    res.set("Cache-Control", cacheFor(date));
    res.json({
      date,
      total: Number(totals.total) || 0,  // toutes statuts confondus
      collected,                          // ok + unknown (tentatives effectuées)
      resolved,
      unknown,
      pending,
      material,
      coupling,
      branches,
    });
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/* GET /api/stats/hourly?date=YYYY-MM-DD                                       */
/* -------------------------------------------------------------------------- */
router.get("/hourly", async (req, res, next) => {
  try {
    const date = req.query.date || today();
    const branchFilter = BRANCH_MISSIONS[req.query.branch] ? `AND ${BRANCH_MISSIONS[req.query.branch]}` : "";
    const [rows] = await pool.query(
      `SELECT HOUR(departureTime) AS heure, ${MAT_EXPR} AS materiel, COUNT(*) AS total
         FROM trains
        WHERE date = ? AND status = 'ok' ${branchFilter}
        GROUP BY heure, materiel
        ORDER BY heure`,
      [date]
    );
    res.set("Cache-Control", cacheFor(date));
    res.json(rows.map((r) => ({ heure: Number(r.heure), materiel: r.materiel, total: Number(r.total) })));
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/* GET /api/stats/hourly-branches?date=YYYY-MM-DD                              */
/* -------------------------------------------------------------------------- */
router.get("/hourly-branches", async (req, res, next) => {
  try {
    const date = req.query.date || today();
    const [rows] = await pool.query(
      `SELECT HOUR(departureTime) AS heure,
              ${BRANCH_CASE} AS branche,
              COUNT(*) AS total
         FROM trains
        WHERE date = ? AND status = 'ok' AND ${KNOWN_MISSIONS}
        GROUP BY heure, branche
        ORDER BY heure`,
      [date]
    );
    res.set("Cache-Control", cacheFor(date));
    res.json(rows.map((r) => ({ heure: Number(r.heure), branche: r.branche, total: Number(r.total) })));
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/* GET /api/stats/evolution?days=30&end=YYYY-MM-DD                             */
/* -------------------------------------------------------------------------- */
router.get("/evolution", async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const end  = req.query.end || today();
    const [rows] = await pool.query(
      `SELECT date,
              ROUND(100 * SUM(${MAT_EXPR} IN ('RER NG'))                    / COUNT(*)) AS pctRERNG,
              ROUND(100 * SUM(${MAT_EXPR} IN ('NAT','Francilien'))           / COUNT(*)) AS pctNAT,
              ROUND(100 * SUM(${MAT_EXPR} IN ('MI2N'))                      / COUNT(*)) AS pctMI2N,
              ROUND(100 * SUM(JSON_LENGTH(composition) > 1) / COUNT(*)) AS pctCoupled,
              COUNT(*) AS total
         FROM trains
        WHERE date BETWEEN (? - INTERVAL ? DAY) AND ?
          AND status = 'ok'
        GROUP BY date
        ORDER BY date`,
      [end, days - 1, end]
    );
    res.json(rows.map((r) => ({
      date:       r.date,
      pctRERNG:   Number(r.pctRERNG),
      pctNAT:     Number(r.pctNAT),
      pctMI2N:    Number(r.pctMI2N),
      pctCoupled: Number(r.pctCoupled),
      total:      Number(r.total),
    })));
  } catch (e) { next(e); }
});

function cacheFor(date) {
  return date < today() ? "public, max-age=86400" : "public, max-age=60";
}

module.exports = router;
