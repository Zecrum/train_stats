"use strict";
const express = require("express");
const pool = require("../db");

const router = express.Router();

// Source unique pour les branches — BRANCH_CASE, KNOWN_MISSIONS, BRANCH_MISSIONS et BRANCHES en sont dérivés.
// outbound = missions partant de Paris (Haussmann) vers le terminus de branche.
// TAPA/TOPU/PAVU, COPI/CIPI/POCI, VOPE/POVE = trains détournés via Paris Est pendant
// les travaux (ne desservent pas Nanterre/Magenta) — rattachés à leur branche habituelle.
const BRANCH_DEF = [
  { key: "Chelles",  label: "Chelles–Gournay",    short: "Chelles",  outbound: ["NOCY","COPI","CIPI"],        missions: ["NOCY","CONY","COPI","CIPI","POCI"]               },
  { key: "Tournan",  label: "Tournan",             short: "Tournan",  outbound: ["NATU","NUTU","TAPA","TOPU"], missions: ["NATU","NUTU","TANU","TINU","TAPA","TOPU","PAVU"]  },
  { key: "Villiers", label: "Villiers-sur-Marne",  short: "Villiers", outbound: ["NOVY","VOPE"],                missions: ["NOVY","VONY","VOPE","POVE"]                       },
  { key: "Central",  label: "Tronçon central",     short: "Central",  outbound: ["NOMY"],               missions: ["NOMY","MONY"]                             },
];
// Table mission → { direction: 'outbound'|'inbound', branchShort }
const MISSION_DIR = {};
for (const b of BRANCH_DEF) {
  const out = new Set(b.outbound);
  for (const m of b.missions) {
    MISSION_DIR[m] = { direction: out.has(m) ? "outbound" : "inbound", branchShort: b.short };
  }
}
function mIn(ms) { return `mission IN (${ms.map(m => `'${m}'`).join(",")})`; }
const BRANCHES        = Object.fromEntries(BRANCH_DEF.map(b => [b.key, { label: b.label, missions: b.missions.join(" · ") }]));
const BRANCH_CASE     = `CASE ${BRANCH_DEF.map(b => `WHEN ${mIn(b.missions)} THEN '${b.key}'`).join(" ")} END`;
const KNOWN_MISSIONS  = mIn(BRANCH_DEF.flatMap(b => b.missions));
const BRANCH_MISSIONS = Object.fromEntries(BRANCH_DEF.map(b => [b.key, mIn(b.missions)]));

// train_sets.rollingStock = ENUM('RERNG','MI2N','NAT') — valeurs déjà normalisées.
const MAT_KEY = { RERNG: "RERNG", NAT: "NAT", MI2N: "MI2N" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseDate(d) { return DATE_RE.test(d) ? d : today(); }

function today() { return new Date().toLocaleDateString("en-CA"); }
function emptyMat()  { return { RERNG: 0, NAT: 0, MI2N: 0 }; }
function emptyCoup() { return { um: 0, us: 0 }; }

/* -------------------------------------------------------------------------- */
/* GET /api/stats/daily?date=YYYY-MM-DD                                        */
/* -------------------------------------------------------------------------- */
router.get("/daily", async (req, res, next) => {
  try {
    const date = parseDate(req.query.date);

    // "unknownCanceled" : équipement non récupéré mais train supprimé — rien d'anormal,
    // il n'y a simplement pas de composition à aller chercher pour un train qui n'a pas circulé.
    const [[totals]] = await pool.query(
      `SELECT COUNT(*)                                                          AS total,
              SUM(t.equipmentStatus = 'ok')                                    AS resolved,
              SUM(t.equipmentStatus = 'unknown')                               AS unknown,
              SUM(t.equipmentStatus = 'unknown' AND IFNULL(td.canceled,0) = 1) AS unknownCanceled,
              SUM(t.equipmentStatus = 'pending')                               AS pending,
              SUM(t.detailStatus = 'ok')                                       AS detailResolved,
              SUM(t.detailStatus = 'unknown')                                  AS detailUnknown,
              SUM(t.detailStatus = 'pending')                                  AS detailPending
         FROM trains t
         LEFT JOIN train_details td ON td.trainNumber = t.trainNumber AND td.date = t.date
        WHERE t.date = ?`,
      [date]
    );

    // Matériel : on joint train_sets (position = 1 = rame de tête) pour obtenir rollingStock.
    // Exclut les trains supprimés (td.canceled) — un train annulé n'a pas réellement circulé.
    const [matRows] = await pool.query(
      `SELECT ts.rollingStock AS materiel, COUNT(*) AS n
         FROM trains t
         JOIN train_sets ts USING (trainNumber, date)
         LEFT JOIN train_details td ON td.trainNumber = t.trainNumber AND td.date = t.date
        WHERE t.date = ? AND t.equipmentStatus = 'ok' AND ts.position = 1
          AND IFNULL(td.canceled, 0) = 0
        GROUP BY materiel`,
      [date]
    );

    // Couplage : la colonne formation (US/UM) est sur la table trains.
    const [coupRows] = await pool.query(
      `SELECT LOWER(t.formation) AS couplage, COUNT(*) AS n
         FROM trains t
         LEFT JOIN train_details td ON td.trainNumber = t.trainNumber AND td.date = t.date
        WHERE t.date = ? AND t.equipmentStatus = 'ok'
          AND IFNULL(td.canceled, 0) = 0
        GROUP BY couplage`,
      [date]
    );

    // Une seule requête branche — GROUP BY 1 (positionnel) évite les ambiguïtés
    // d'alias dans GROUP BY selon la version MySQL/MariaDB.
    const [brRows] = await pool.query(
      `SELECT ${BRANCH_CASE}            AS branche,
              COUNT(*)                  AS total,
              SUM(ts.rollingStock = 'RERNG') AS n_rerng,
              SUM(ts.rollingStock = 'NAT')   AS n_nat,
              SUM(ts.rollingStock = 'MI2N')  AS n_mi2n,
              SUM(t.formation = 'UM')        AS n_um
         FROM trains t
         JOIN train_sets ts USING (trainNumber, date)
         LEFT JOIN train_details td ON td.trainNumber = t.trainNumber AND td.date = t.date
        WHERE t.date = ? AND t.equipmentStatus = 'ok' AND ts.position = 1 AND ${KNOWN_MISSIONS}
          AND IFNULL(td.canceled, 0) = 0
        GROUP BY 1`,
      [date]
    );

    // Perturbations — source SNCF Connect (detailStatus = 'ok').
    // "n_delayed" évite le mot réservé DELAYED en MariaDB.
    const [[disruptRow]] = await pool.query(
      `SELECT COUNT(*)                                                 AS detail_total,
              SUM(td.canceled)                                        AS canceled,
              SUM(td.isDelayed = 1 AND td.canceled = 0
                  AND COALESCE(NULLIF(GREATEST(td.delayMinutes, 0), 0), sd.max_delay) > 2) AS n_delayed,
              SUM(td.courseModified = 1 AND td.canceled = 0)         AS n_modified,
              ROUND(AVG(CASE WHEN td.isDelayed = 1 AND td.canceled = 0
                             AND COALESCE(NULLIF(GREATEST(td.delayMinutes, 0), 0), sd.max_delay) > 2
                             THEN COALESCE(NULLIF(GREATEST(td.delayMinutes, 0), 0), sd.max_delay)
                        END))                                        AS avg_delay
         FROM trains t
         JOIN train_details td USING (trainNumber, date)
         LEFT JOIN (
           SELECT trainNumber, date,
                  MAX(CASE WHEN TIME_TO_SEC(realTime) > TIME_TO_SEC(scheduledTime)
                           THEN ROUND((TIME_TO_SEC(realTime) - TIME_TO_SEC(scheduledTime)) / 60)
                           ELSE NULL END) AS max_delay
             FROM train_stops
            WHERE realTime IS NOT NULL AND isDelayed = 1
            GROUP BY trainNumber, date
         ) sd ON sd.trainNumber = t.trainNumber AND sd.date = t.date
        WHERE t.date = ? AND t.detailStatus = 'ok'`,
      [date]
    );

    // Mêmes perturbations, ventilées par branche.
    const [brDisruptRows] = await pool.query(
      `SELECT ${BRANCH_CASE}                                            AS branche,
              SUM(td.canceled)                                        AS canceled,
              SUM(td.isDelayed = 1 AND td.canceled = 0
                  AND COALESCE(NULLIF(GREATEST(td.delayMinutes, 0), 0), sd.max_delay) > 2) AS n_delayed,
              SUM(td.courseModified = 1 AND td.canceled = 0)         AS n_modified
         FROM trains t
         JOIN train_details td USING (trainNumber, date)
         LEFT JOIN (
           SELECT trainNumber, date,
                  MAX(CASE WHEN TIME_TO_SEC(realTime) > TIME_TO_SEC(scheduledTime)
                           THEN ROUND((TIME_TO_SEC(realTime) - TIME_TO_SEC(scheduledTime)) / 60)
                           ELSE NULL END) AS max_delay
             FROM train_stops
            WHERE realTime IS NOT NULL AND isDelayed = 1
            GROUP BY trainNumber, date
         ) sd ON sd.trainNumber = t.trainNumber AND sd.date = t.date
        WHERE t.date = ? AND t.detailStatus = 'ok' AND ${KNOWN_MISSIONS}
        GROUP BY 1`,
      [date]
    );

    const material = emptyMat();
    matRows.forEach((r) => { if (MAT_KEY[r.materiel]) material[MAT_KEY[r.materiel]] += Number(r.n); });

    const coupling = emptyCoup();
    coupRows.forEach((r) => { coupling[r.couplage] = Number(r.n); });

    const branches = {};
    for (const key of Object.keys(BRANCHES)) {
      branches[key] = {
        label: BRANCHES[key].label, missions: BRANCHES[key].missions, total: 0,
        material: emptyMat(), coupling: emptyCoup(),
        canceled: 0, delayed: 0, modified: 0,
      };
    }
    brRows.forEach((r) => {
      const b = branches[r.branche];
      if (!b) return;
      const total = Number(r.total);
      const um    = Number(r.n_um) || 0;
      b.total          = total;
      b.material.RERNG = Number(r.n_rerng) || 0;
      b.material.NAT   = Number(r.n_nat)   || 0;
      b.material.MI2N  = Number(r.n_mi2n)  || 0;
      b.coupling.um    = um;
      b.coupling.us    = total - um;
    });
    brDisruptRows.forEach((r) => {
      const b = branches[r.branche];
      if (!b) return;
      b.canceled = Number(r.canceled)   || 0;
      b.delayed  = Number(r.n_delayed)  || 0;
      b.modified = Number(r.n_modified) || 0;
    });

    const resolved  = Number(totals.resolved) || 0;
    const unknown   = Number(totals.unknown)  || 0;
    const pending   = Number(totals.pending)  || 0;
    const collected = resolved + unknown;

    res.set("Cache-Control", cacheFor(date));
    res.json({
      date,
      total: Number(totals.total) || 0,
      collected,
      resolved,
      unknown,
      pending,
      material,
      coupling,
      branches,
      disruptions: {
        detail_total:    Number(disruptRow.detail_total) || 0,
        canceled:        Number(disruptRow.canceled)     || 0,
        delayed:         Number(disruptRow.n_delayed)    || 0,
        modified:        Number(disruptRow.n_modified)   || 0,
        avg_delay:       disruptRow.avg_delay != null ? Number(disruptRow.avg_delay) : null,
        detail_resolved:    Number(totals.detailResolved) || 0,
        detail_unknown:     Number(totals.detailUnknown)  || 0,
        detail_pending:     Number(totals.detailPending)  || 0,
        equipment_unknown:          unknown,
        equipment_unknown_canceled: Number(totals.unknownCanceled) || 0,
        equipment_pending:          pending,
      },
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
    // 96 tranches de 15 min (slot 0 = 0h00, slot 95 = 23h45).
    // Un train est compté dans le slot S s'il est EN CIRCULATION à ce moment.
    // Cas passant minuit : arrivalTime < departureTime → en service jusqu'au slot 95.
    const [rows] = await pool.query(
      `SELECT s.slot, ts.rollingStock AS materiel, COUNT(*) AS total
         FROM (
           SELECT a.n * 16 + b.n AS slot
           FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2
                 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) AS a
           CROSS JOIN (
             SELECT 0 AS n UNION ALL SELECT 1  UNION ALL SELECT 2  UNION ALL SELECT 3
             UNION ALL SELECT 4  UNION ALL SELECT 5  UNION ALL SELECT 6  UNION ALL SELECT 7
             UNION ALL SELECT 8  UNION ALL SELECT 9  UNION ALL SELECT 10 UNION ALL SELECT 11
             UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15
           ) AS b
         ) AS s
         JOIN trains t ON (
           (TIME(t.arrivalTime) >= TIME(t.departureTime)
            AND FLOOR((HOUR(t.departureTime) * 60 + MINUTE(t.departureTime)) / 15) <= s.slot
            AND FLOOR((HOUR(t.arrivalTime)   * 60 + MINUTE(t.arrivalTime))   / 15) >= s.slot)
           OR
           (TIME(t.arrivalTime) < TIME(t.departureTime)
            AND FLOOR((HOUR(t.departureTime) * 60 + MINUTE(t.departureTime)) / 15) <= s.slot)
         )
         JOIN train_sets ts ON ts.trainNumber = t.trainNumber AND ts.date = t.date AND ts.position = 1
        WHERE t.date = ? AND t.equipmentStatus = 'ok' ${branchFilter}
        GROUP BY s.slot, materiel
        ORDER BY s.slot`,
      [date]
    );
    res.set("Cache-Control", cacheFor(date));
    res.json(rows.map((r) => ({ slot: Number(r.slot), materiel: r.materiel, total: Number(r.total) })));
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/* GET /api/stats/hourly-disruptions?date=YYYY-MM-DD                          */
/* -------------------------------------------------------------------------- */
router.get("/hourly-disruptions", async (req, res, next) => {
  try {
    const date = parseDate(req.query.date);
    const [rows] = await pool.query(
      `SELECT FLOOR((HOUR(t.departureTime) * 60 + MINUTE(t.departureTime)) / 15) AS slot,
              SUM(td.canceled)                                                    AS n_canceled,
              SUM(td.isDelayed = 1 AND td.canceled = 0 AND td.delayMinutes > 2)  AS n_delayed,
              SUM(CASE WHEN td.isDelayed = 1 AND td.canceled = 0
                       THEN NULLIF(COALESCE(NULLIF(GREATEST(td.delayMinutes, 0), 0), sd.max_delay), 0)
                       ELSE 0 END)                                               AS total_delay
         FROM trains t
         JOIN train_details td USING (trainNumber, date)
         LEFT JOIN (
           SELECT trainNumber, date,
                  MAX(CASE WHEN TIME_TO_SEC(realTime) > TIME_TO_SEC(scheduledTime)
                           THEN ROUND((TIME_TO_SEC(realTime) - TIME_TO_SEC(scheduledTime)) / 60)
                           ELSE NULL END) AS max_delay
             FROM train_stops
            WHERE realTime IS NOT NULL AND isDelayed = 1
            GROUP BY trainNumber, date
         ) sd ON sd.trainNumber = t.trainNumber AND sd.date = t.date
        WHERE t.date = ? AND t.detailStatus = 'ok'
        GROUP BY slot
        ORDER BY slot`,
      [date]
    );
    res.set("Cache-Control", cacheFor(date));
    res.json(rows.map((r) => ({
      slot:        Number(r.slot),
      n_canceled:  Number(r.n_canceled)  || 0,
      n_delayed:   Number(r.n_delayed)   || 0,
      total_delay: Number(r.total_delay) || 0,
    })));
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
      `SELECT t.date,
              ROUND(100 * SUM(ts.rollingStock = 'RERNG') / COUNT(*)) AS pctRERNG,
              ROUND(100 * SUM(ts.rollingStock = 'NAT')   / COUNT(*)) AS pctNAT,
              ROUND(100 * SUM(ts.rollingStock = 'MI2N')  / COUNT(*)) AS pctMI2N,
              ROUND(100 * SUM(t.formation = 'UM')        / COUNT(*)) AS pctCoupled,
              COUNT(*) AS total
         FROM trains t
         JOIN train_sets ts ON ts.trainNumber = t.trainNumber AND ts.date = t.date AND ts.position = 1
         LEFT JOIN train_details td ON td.trainNumber = t.trainNumber AND td.date = t.date
        WHERE t.date BETWEEN (? - INTERVAL ? DAY) AND ?
          AND t.equipmentStatus = 'ok'
          AND IFNULL(td.canceled, 0) = 0
        GROUP BY t.date
        ORDER BY t.date`,
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

/* -------------------------------------------------------------------------- */
/* GET /api/stats/disruptions?days=30&end=YYYY-MM-DD                          */
/* -------------------------------------------------------------------------- */
router.get("/disruptions", async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const end  = parseDate(req.query.end);

    const [evoRows] = await pool.query(
      `SELECT t.date,
              COUNT(*)                                                 AS total,
              SUM(td.canceled)                                        AS canceled,
              SUM(td.isDelayed = 1 AND td.canceled = 0
                  AND COALESCE(NULLIF(GREATEST(td.delayMinutes, 0), 0), sd.max_delay) > 2) AS n_delayed,
              SUM(td.courseModified = 1 AND td.canceled = 0)         AS n_modified,
              ROUND(AVG(CASE WHEN td.isDelayed = 1 AND td.canceled = 0
                             AND COALESCE(NULLIF(GREATEST(td.delayMinutes, 0), 0), sd.max_delay) > 2
                             THEN COALESCE(NULLIF(GREATEST(td.delayMinutes, 0), 0), sd.max_delay)
                        END))                                        AS avg_delay
         FROM trains t
         JOIN train_details td USING (trainNumber, date)
         LEFT JOIN (
           SELECT trainNumber, date,
                  MAX(CASE WHEN TIME_TO_SEC(realTime) > TIME_TO_SEC(scheduledTime)
                           THEN ROUND((TIME_TO_SEC(realTime) - TIME_TO_SEC(scheduledTime)) / 60)
                           ELSE NULL END) AS max_delay
             FROM train_stops
            WHERE realTime IS NOT NULL AND isDelayed = 1
            GROUP BY trainNumber, date
         ) sd ON sd.trainNumber = t.trainNumber AND sd.date = t.date
        WHERE t.date BETWEEN (? - INTERVAL ? DAY) AND ?
          AND t.detailStatus = 'ok'
        GROUP BY t.date
        ORDER BY t.date`,
      [end, days - 1, end]
    );

    const [[distrib]] = await pool.query(
      `SELECT SUM(eff_delay BETWEEN 3  AND 5)  AS d3_5,
              SUM(eff_delay BETWEEN 6  AND 10) AS d6_10,
              SUM(eff_delay BETWEEN 11 AND 20) AS d11_20,
              SUM(eff_delay > 20)              AS d20plus
         FROM (
           SELECT COALESCE(NULLIF(GREATEST(td.delayMinutes, 0), 0), sd.max_delay) AS eff_delay
             FROM trains t
             JOIN train_details td USING (trainNumber, date)
             LEFT JOIN (
               SELECT trainNumber, date,
                      MAX(CASE WHEN TIME_TO_SEC(realTime) > TIME_TO_SEC(scheduledTime)
                               THEN ROUND((TIME_TO_SEC(realTime) - TIME_TO_SEC(scheduledTime)) / 60)
                               ELSE NULL END) AS max_delay
                 FROM train_stops
                WHERE realTime IS NOT NULL AND isDelayed = 1
                GROUP BY trainNumber, date
             ) sd ON sd.trainNumber = t.trainNumber AND sd.date = t.date
            WHERE t.date BETWEEN (? - INTERVAL ? DAY) AND ?
              AND t.detailStatus = 'ok'
              AND td.isDelayed = 1 AND td.canceled = 0
         ) sub
         WHERE eff_delay IS NOT NULL AND eff_delay > 0`,
      [end, days - 1, end]
    );

    const [stationRows] = await pool.query(
      `SELECT stops.station, COUNT(*) AS delayed_stops
         FROM trains t
         JOIN train_details td   USING (trainNumber, date)
         JOIN train_stops   stops USING (trainNumber, date)
        WHERE t.date BETWEEN (? - INTERVAL ? DAY) AND ?
          AND t.detailStatus = 'ok'
          AND td.canceled = 0
          AND stops.isDelayed = 1
          AND stops.isDeleted = 0
        GROUP BY stops.station
        ORDER BY delayed_stops DESC
        LIMIT 8`,
      [end, days - 1, end]
    );

    const [[dowRows], [branchDisruptRows]] = await Promise.all([
      pool.query(
        `SELECT DAYOFWEEK(t.date) AS dow,
                COUNT(*) AS total,
                SUM(td.canceled) AS canceled,
                SUM(td.isDelayed = 1 AND td.canceled = 0 AND td.delayMinutes > 2) AS n_delayed
           FROM trains t
           JOIN train_details td USING (trainNumber, date)
          WHERE t.date BETWEEN (? - INTERVAL ? DAY) AND ?
            AND t.detailStatus = 'ok'
          GROUP BY dow ORDER BY dow`,
        [end, days - 1, end]
      ),
      pool.query(
        `SELECT ${BRANCH_CASE} AS branche,
                COUNT(*) AS total,
                SUM(td.canceled) AS canceled,
                SUM(td.isDelayed = 1 AND td.canceled = 0 AND td.delayMinutes > 2) AS n_delayed
           FROM trains t
           JOIN train_details td USING (trainNumber, date)
          WHERE t.date BETWEEN (? - INTERVAL ? DAY) AND ?
            AND t.detailStatus = 'ok' AND ${KNOWN_MISSIONS}
          GROUP BY branche`,
        [end, days - 1, end]
      ),
    ]);

    res.set("Cache-Control", cacheFor(end));
    res.json({
      evolution: evoRows.map((r) => ({
        date:      r.date,
        total:     Number(r.total)      || 0,
        canceled:  Number(r.canceled)   || 0,
        delayed:   Number(r.n_delayed)  || 0,
        modified:  Number(r.n_modified) || 0,
        avg_delay: r.avg_delay != null ? Number(r.avg_delay) : null,
      })),
      distribution: {
        d3_5:    Number(distrib.d3_5)    || 0,
        d6_10:   Number(distrib.d6_10)   || 0,
        d11_20:  Number(distrib.d11_20)  || 0,
        d20plus: Number(distrib.d20plus) || 0,
      },
      stations: stationRows.map((r) => ({
        station:       r.station,
        delayed_stops: Number(r.delayed_stops),
      })),
      byWeekday: dowRows.map((r) => ({
        dow:     r.dow,
        total:   Number(r.total)     || 0,
        canceled: Number(r.canceled) || 0,
        delayed: Number(r.n_delayed) || 0,
      })),
      byBranch: branchDisruptRows.map((r) => ({
        branch:  r.branche,
        label:   BRANCHES[r.branche]?.label || r.branche,
        total:   Number(r.total)     || 0,
        canceled: Number(r.canceled) || 0,
        delayed: Number(r.n_delayed) || 0,
      })),
    });
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/* GET /api/stats/trains-day?date=YYYY-MM-DD                                  */
/* -------------------------------------------------------------------------- */
router.get("/trains-day", async (req, res, next) => {
  try {
    const date = parseDate(req.query.date);
    const [rows] = await pool.query(
      `SELECT t.trainNumber,
              t.mission,
              ${BRANCH_CASE}                        AS branche,
              TIME_FORMAT(t.departureTime, '%H:%i') AS departureTime,
              TIME_FORMAT(t.arrivalTime,   '%H:%i') AS arrivalTime,
              LOWER(t.formation)                    AS formation,
              ts.rollingStock                       AS material,
              IFNULL(td.canceled, 0)                AS canceled,
              IFNULL(td.courseModified, 0)          AS modified,
              CASE WHEN td.isDelayed = 1 AND IFNULL(td.canceled, 0) = 0
                   THEN NULLIF(COALESCE(NULLIF(GREATEST(td.delayMinutes, 0), 0), sd.max_delay), 0)
                   ELSE NULL END                    AS delayMinutes
         FROM trains t
         LEFT JOIN train_sets ts ON ts.trainNumber = t.trainNumber AND ts.date = t.date AND ts.position = 1
         LEFT JOIN train_details td ON td.trainNumber = t.trainNumber AND td.date = t.date
         LEFT JOIN (
           SELECT trainNumber, date,
                  MAX(CASE WHEN TIME_TO_SEC(realTime) > TIME_TO_SEC(scheduledTime)
                           THEN ROUND((TIME_TO_SEC(realTime) - TIME_TO_SEC(scheduledTime)) / 60)
                           ELSE NULL END) AS max_delay
             FROM train_stops
            WHERE realTime IS NOT NULL AND isDelayed = 1
            GROUP BY trainNumber, date
         ) sd ON sd.trainNumber = t.trainNumber AND sd.date = t.date
        WHERE t.date = ? AND ${KNOWN_MISSIONS}
        ORDER BY t.departureTime`,
      [date]
    );
    res.set("Cache-Control", cacheFor(date));
    res.json(rows.map((r) => {
      const mdir = MISSION_DIR[r.mission] || {};
      return {
        trainNumber:   r.trainNumber,
        mission:       r.mission,
        branch:        r.branche,
        direction:     mdir.direction   || null,
        branchShort:   mdir.branchShort || null,
        departureTime: r.departureTime,
        arrivalTime:   r.arrivalTime,
        formation:     r.formation || null,
        material:      r.material,
        canceled:      !!r.canceled,
        modified:      !!r.modified,
        delayMinutes:  r.delayMinutes != null ? Number(r.delayMinutes) : null,
      };
    }));
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/* GET /api/stats/train-detail?trainNumber=&date=YYYY-MM-DD                   */
/* -------------------------------------------------------------------------- */
router.get("/train-detail", async (req, res, next) => {
  try {
    const date        = parseDate(req.query.date);
    const trainNumber = (req.query.trainNumber || "").trim();
    if (!trainNumber) return res.status(400).json({ error: "trainNumber requis" });

    const [[metaRows], [stops]] = await Promise.all([
      pool.query(
        `SELECT t.trainNumber, t.mission, LOWER(t.formation) AS formation,
                ts.rollingStock AS material,
                IFNULL(td.canceled, 0)       AS canceled,
                IFNULL(td.courseModified, 0) AS modified,
                td.isDelayed,
                COALESCE(NULLIF(GREATEST(IFNULL(td.delayMinutes, 0), 0), 0), sd.max_delay) AS delayMinutes
           FROM trains t
           LEFT JOIN train_sets ts ON ts.trainNumber = t.trainNumber AND ts.date = t.date AND ts.position = 1
           LEFT JOIN train_details td ON td.trainNumber = t.trainNumber AND td.date = t.date
           LEFT JOIN (
             SELECT trainNumber, date,
                    MAX(CASE WHEN TIME_TO_SEC(realTime) > TIME_TO_SEC(scheduledTime)
                             THEN ROUND((TIME_TO_SEC(realTime) - TIME_TO_SEC(scheduledTime)) / 60)
                             ELSE NULL END) AS max_delay
               FROM train_stops WHERE isDelayed = 1 GROUP BY trainNumber, date
           ) sd ON sd.trainNumber = t.trainNumber AND sd.date = t.date
          WHERE t.trainNumber = ? AND t.date = ?`,
        [trainNumber, date]
      ),
      pool.query(
        `SELECT position, station,
                TIME_FORMAT(scheduledTime, '%H:%i') AS scheduledTime,
                TIME_FORMAT(realTime,      '%H:%i') AS realTime,
                isDelayed, isDeleted
           FROM train_stops
          WHERE trainNumber = ? AND date = ?
          ORDER BY position`,
        [trainNumber, date]
      ),
    ]);

    const meta = metaRows[0];
    if (!meta) return res.status(404).json({ error: "Train introuvable" });

    const mdir = MISSION_DIR[meta.mission] || {};
    res.set("Cache-Control", cacheFor(date));
    res.json({
      trainNumber: meta.trainNumber,
      mission:     meta.mission,
      formation:   meta.formation || null,
      material:    meta.material,
      direction:   mdir.direction   || null,
      branchShort: mdir.branchShort || null,
      canceled:    !!meta.canceled,
      modified:    !!meta.modified,
      delayMinutes: meta.isDelayed && !meta.canceled && meta.delayMinutes
        ? Number(meta.delayMinutes) : null,
      stops: stops.map((s) => ({
        position:      Number(s.position),
        station:       s.station,
        scheduledTime: s.scheduledTime,
        realTime:      s.realTime || null,
        isDelayed:     !!s.isDelayed,
        isDeleted:     !!s.isDeleted,
      })),
    });
  } catch (e) { next(e); }
});

function cacheFor(date) {
  const ageDays = (Date.now() - new Date(date + "T12:00:00").getTime()) / 86_400_000;
  if (ageDays < 1)  return "public, max-age=60";       // aujourd'hui : 1 min
  if (ageDays < 3)  return "public, max-age=300";      // 48h : 5 min (collecte en cours)
  if (ageDays < 8)  return "public, max-age=3600";     // semaine : 1h
  return "public, max-age=86400";                      // plus ancien : 24h
}

module.exports = router;
