"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app, VERSION } = require("./app");

test("GET /api/health répond ok avec la version courante", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, version: VERSION });
});

test("GET /api/admin/unresolved sans token répond 401", async () => {
  const res = await request(app).get("/api/admin/unresolved");
  assert.equal(res.status, 401);
});
