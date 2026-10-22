import test from 'node:test';
import assert from 'node:assert/strict';

import { Scheduler } from '../src/scheduler.js';

test('fires each reminder exactly when due', () => {
  let now = 0;
  const due = [];
  const scheduler = new Scheduler({
    intervals: { water: 1_000 },
    now: () => now,
    onDue: (type) => due.push(type),
  });

  assert.deepEqual(scheduler.tick(999), []);
  now = 1_000;
  assert.deepEqual(scheduler.tick(now), ['water']);
  assert.deepEqual(scheduler.tick(1_500), []);

  now = 2_000;
  assert.deepEqual(scheduler.tick(now), ['water']);
  assert.deepEqual(due, ['water', 'water']);
  assert.equal(scheduler.remaining('water', now), 1_000);
});

test('snooze postpones the next fire', () => {
  let now = 0;
  const due = [];
  const scheduler = new Scheduler({
    intervals: { water: 1_000 },
    snoozeMs: 500,
    now: () => now,
    onDue: (type) => due.push(type),
  });

  now = 1_000;
  scheduler.tick(now);
  now = 1_100;
  scheduler.snooze('water', 400);

  assert.deepEqual(scheduler.tick(1_499), []);
  assert.deepEqual(scheduler.tick(1_500), ['water']);
});

test('pause stops ticks and resume reschedules', () => {
  let now = 0;
  const due = [];
  const scheduler = new Scheduler({
    intervals: { water: 1_000 },
    now: () => now,
    onDue: (type) => due.push(type),
  });

  scheduler.pause();
  assert.deepEqual(scheduler.tick(5_000), []);

  scheduler.resume(5_000);
  assert.deepEqual(scheduler.tick(5_500), []);
  assert.deepEqual(scheduler.tick(6_000), ['water']);
});

test('quiet hours skip notifications but keep the schedule', () => {
  const start = new Date(2026, 0, 1, 12, 0, 0);
  let now = start.getTime();
  const due = [];
  const skipped = [];

  const scheduler = new Scheduler({
    intervals: { water: 60_000 },
    quietHours: { start: '12:00', end: '13:00' },
    now: () => now,
    onDue: (type) => due.push(type),
    onSkip: (type, info) => skipped.push({ type, info }),
  });

  now += 60_000;
  assert.deepEqual(scheduler.tick(now), []);
  assert.equal(skipped.length, 1);
  assert.deepEqual(skipped[0], { type: 'water', info: { quiet: true } });

  now = new Date(2026, 0, 1, 13, 0, 0).getTime();
  scheduler.tick(now);
  assert.deepEqual(due, ['water']);
});

test('start uses the injected timer and stop clears it', () => {
  let tick = null;
  let cleared = null;

  const scheduler = new Scheduler({
    intervals: { water: 1_000 },
    now: () => 0,
    setIntervalFn: (fn) => {
      tick = fn;
      return 'timer-1';
    },
    clearIntervalFn: (id) => {
      cleared = id;
    },
  });

  scheduler.start();
  assert.equal(typeof tick, 'function');
  scheduler.stop();
  assert.equal(cleared, 'timer-1');
});
