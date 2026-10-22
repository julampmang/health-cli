import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readStats, record, prune, summarize } from '../src/stats.js';
import { statsFile } from '../src/paths.js';

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'health-cli-stats-'));
}

function optionsFor(dir) {
  return { env: { HEALTH_CLI_HOME: dir }, platform: 'linux', home: dir };
}

test('record increments per-day counters', () => {
  const dir = tempHome();
  const options = optionsFor(dir);

  record('water', { options, date: new Date(2026, 0, 1, 9, 0) });
  record('water', { options, date: new Date(2026, 0, 1, 10, 0) });
  record('eyes', { options, date: new Date(2026, 0, 2, 11, 0) });

  const stats = readStats(options);
  assert.equal(stats['2026-01-01'].water, 2);
  assert.equal(stats['2026-01-02'].eyes, 1);
  assert.equal(fs.existsSync(statsFile(options)), true);
});

test('readStats tolerates corrupt and unknown entries', () => {
  const dir = tempHome();
  const options = optionsFor(dir);

  fs.writeFileSync(statsFile(options), 'not json', 'utf8');
  assert.deepEqual(readStats(options), {});

  fs.writeFileSync(
    statsFile(options),
    JSON.stringify({ '2026-01-01': { water: 3, bogus: 9 }, bad: { water: 1 } }),
    'utf8',
  );
  assert.deepEqual(readStats(options), { '2026-01-01': { water: 3 } });
});

test('summarize aggregates a window including today', () => {
  const stats = {
    '2026-01-01': { water: 1, sit: 0, eyes: 1 },
    '2026-01-02': { water: 2, sit: 1 },
    '2026-01-03': { eyes: 2 },
    '2025-12-30': { water: 9 },
  };

  const summary = summarize(stats, { days: 3, date: new Date(2026, 0, 3, 12, 0) });

  assert.deepEqual(summary.range, { from: '2026-01-01', to: '2026-01-03', days: 3 });
  assert.equal(summary.totals.water, 3);
  assert.equal(summary.totals.sit, 1);
  assert.equal(summary.totals.eyes, 3);
  assert.equal(summary.days.length, 3);
  assert.equal(summary.days[2].date, '2026-01-03');
});

test('prune keeps only the retention window', () => {
  const stats = {
    '2026-01-01': { water: 1 },
    '2026-01-04': { water: 2 },
    '2026-01-05': { water: 3 },
  };

  prune(stats, { retentionDays: 2, date: new Date(2026, 0, 5) });
  assert.deepEqual(Object.keys(stats), ['2026-01-04', '2026-01-05']);
});

test('record applies retention when writing', () => {
  const dir = tempHome();
  const options = optionsFor(dir);

  record('water', { options, date: new Date(2026, 0, 1), retentionDays: 1 });
  record('sit', { options, date: new Date(2026, 0, 5), retentionDays: 1 });

  const stats = readStats(options);
  assert.deepEqual(Object.keys(stats), ['2026-01-05']);
  assert.equal(stats['2026-01-05'].sit, 1);
});

test('record rejects unknown types', () => {
  const dir = tempHome();
  assert.throws(() => record('coffee', { options: optionsFor(dir) }));
});
