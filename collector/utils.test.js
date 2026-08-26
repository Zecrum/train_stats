"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { todayParis, yesterdayParis } = require("./utils");

test("todayParis renvoie une date au format YYYY-MM-DD", () => {
  assert.match(todayParis(), /^\d{4}-\d{2}-\d{2}$/);
});

test("yesterdayParis renvoie exactement un jour avant todayParis", () => {
  const today = new Date(`${todayParis()}T12:00:00`);
  const yesterday = new Date(`${yesterdayParis()}T12:00:00`);
  const diffDays = (today - yesterday) / 86_400_000;
  assert.equal(diffDays, 1);
});
