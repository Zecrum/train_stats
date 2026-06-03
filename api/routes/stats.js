"use strict";
const express = require("express");
const pool = require("../db");

const router = express.Router();

// Source unique pour les branches — BRANCH_CASE, KNOWN_MISSIONS, BRANCH_MISSIONS et BRANCHES en sont dérivés.
const BRANCH_DEF = [
  { key: "Chelles",  label: "Chelles–Gournay",    missions: ["NOCY","CONY"] },
  { key: "Tournan",  label: "Tournan",            missions: ["NATU","NUTU","TANU","TINU"] },
  { key: "Villiers", label: "Villiers-sur-Marne", missions: ["NOVY","VONY"] },
  { key: "Central",  label: "Tronçon central",    missions: ["NOMY","MONY"] },
];
function mIn(ms) { return `mission IN (${ms.map(m => `'${m}'`).join(",")})`; }
const BRANCHES       = Object.fromEntries(BRANCH_DEF.map(b => [b.key, { label: b.label, missions: b.missions.join(" · ") }]));
const BRANCH_CASE    = `CASE ${BRANCH_DEF.map(b => `WHEN ${mIn(b.missions)} THEN '${b.key}'`).join(" ")} END`;
const KNOWN_MISSIONS = mIn(BRANCH_DEF.flatMap(b => b.missions));
const BRANCH_MISSIONS = Object.fromEntries(BRANCH_DEF.map(b => [b.key, mIn(b.missions)]));

const MAT_KEY = { "RER NG": "RERNG", "NAT": "NAT", "MI2N": "MI2N", "Francilien": "NAT" };

const MAT_EXPR  = `JSON_UNQUOTE(JSON_EXTRACT(composition, '$[0].commercialName'))`;
const COUP_EXPR = `IF(JSON_LENGTH(composition) > 1, 'um', 'us')`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseDate(d) { return DATE_RE.test(d) ? d : today(); }

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
    const date = parseDate(req.query.date);

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

    // Une seule requête branche — GROUP BY 1 (positionnel) évite les ambiguïtés
    // d'alias dans GROUP BY selon la version MySQL/MariaDB.
    const [brRows] = await pool.query(
      `SELECT ${BRANCH_CASE} AS branche,
              COUNT(*) AS total,
              SUM(${MAT_EXPR} = 'RER NG')             AS n_rerng,
              SUM(${MAT_EXPR} IN ('NAT','Francilien')) AS n_nat,
              SUM(${MAT_EXPR} = 'MI2N')               AS n_mi2n,
              SUM(JSON_LENGTH(composition) > 1)        AS n_um
         FROM trains
        WHERE date = ? AND status = 'ok' AND ${KNOWN_MISSIONS}
        GROUP BY 1`,
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
    brRows.forEach((r) => {
      const b = branches[r.branche];
      if (!b) return;
      const total = Number(r.total);
      const um    = Number(r.n_um) || 0;
      b.total              = total;
      b.material.RERNG     = Number(r.n_rerng) || 0;
      b.material.NAT       = Number(r.n_nat)   || 0;
      b.material.MI2N      = Number(r.n_mi2n)  || 0;
      b.coupling.um        = um;
      b.coupling.us        = total - um;
    });

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
    const date = parseDate(req.query.date);
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
/* GET /api/stats/evolution?days=30&end=YYYY-MM-DD                             */
/* -------------------------------------------------------------------------- */
router.get("/evolution", async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const end  = parseDate(req.query.end);
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
