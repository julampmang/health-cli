import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDuration,
  isQuietTime,
  localDateKey,
  parseClock,
  parseDuration,
  parseQuietRange,
} from '../src/time.js';

test('parseDuration supports units and bare minutes', () => {
  assert.equal(parseDuration('90s'), 90_000);
  assert.equal(parseDuration('30m'), 1_800_000);
  assert.equal(parseDuration('2h'), 7_200_000);
  assert.equal(parseDuration('15'), 900_000);
  assert.equal(parseDuration('1.5h'), 5_400_000);
  assert.equal(parseDuration(120_000), 120_000);
});

test('parseDuration rejects invalid values', () => {
  for (const value of ['', 'abc', '10x', '-5m', 0, -1, null]) {
    assert.throws(() => parseDuration(value), `expected ${String(value)} to throw`);
  }
});

test('formatDuration renders compact units', () => {
  assert.equal(formatDuration(30 * 60_000), '30m');
  assert.equal(formatDuration(90 * 60_000), '1h 30m');
  assert.equal(formatDuration(90_000), '1m 30s');
  assert.equal(formatDuration(0), '0s');
});

test('parseClock validates ranges', () => {
  assert.equal(parseClock('00:00'), 0);
  assert.equal(parseClock('9:05'), 545);
  assert.equal(parseClock('23:59'), 1439);
  assert.throws(() => parseClock('24:00'));
  assert.throws(() => parseClock('12:60'));
  assert.throws(() => parseClock('noon'));
});

test('parseQuietRange normalizes and accepts cross-midnight ranges', () => {
  assert.deepEqual(parseQuietRange('12:00-13:30'), { start: '12:00', end: '13:30' });
  assert.deepEqual(parseQuietRange('9:05-10:00'), { start: '09:05', end: '10:00' });
  assert.deepEqual(parseQuietRange('23:00-07:00'), { start: '23:00', end: '07:00' });
  assert.equal(parseQuietRange(''), null);
  assert.equal(parseQuietRange('off'), null);
  assert.equal(parseQuietRange('10:00-10:00'), null);
  assert.throws(() => parseQuietRange('10:00'));
});

test('isQuietTime handles same-day and cross-midnight ranges', () => {
  const at = (hour, minute) => new Date(2026, 0, 1, hour, minute);
  const lunch = { start: '12:00', end: '13:30' };

  assert.equal(isQuietTime(at(11, 59), lunch), false);
  assert.equal(isQuietTime(at(12, 0), lunch), true);
  assert.equal(isQuietTime(at(13, 29), lunch), true);
  assert.equal(isQuietTime(at(13, 30), lunch), false);

  const night = { start: '23:00', end: '07:00' };
  assert.equal(isQuietTime(at(23, 30), night), true);
  assert.equal(isQuietTime(at(6, 59), night), true);
  assert.equal(isQuietTime(at(7, 0), night), false);
  assert.equal(isQuietTime(at(12, 0), night), false);
  assert.equal(isQuietTime(at(12, 0), null), false);
});

test('localDateKey uses local calendar dates', () => {
  assert.equal(localDateKey(new Date(2026, 9, 22, 23, 59)), '2026-10-22');
  assert.equal(localDateKey(new Date(2026, 0, 3, 0, 0)), '2026-01-03');
});
