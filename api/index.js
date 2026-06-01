"use strict";
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const statsRouter = require("./routes/stats");

const app = express();
const PORT = process.env.PORT || 3051;

const origins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
  : [];
app.use(cors({ origin: origins.length ? origins : false }));

app.use("/api/stats", statsRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error", message: err.message });
});

app.listen(PORT, () => {
  console.log(`API RER E Stats à l'écoute sur http://localhost:${PORT}`);
});
