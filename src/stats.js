/**
 * Local-only usage counters: one file, keyed by local date.
 */

import fs from 'node:fs';

import { statsFile, writeFileAtomic } from './paths.js';
import { localDateKey } from './time.js';

export const STAT_TYPES = Object.freeze(['water', 'sit', 'eyes', 'snoozed', 'skipped']);
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read counters, returning `{}` when missing or corrupt.
 * @param {object} [options]
 * @returns {Record<string, Record<string, number>>}
 */
export function readStats(options = {}) {
  let raw;
  try {
    raw = fs.readFileSync(statsFile(options), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    return {};
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

  const clean = {};
  for (const [key, entry] of Object.entries(data)) {
    if (!DATE_KEY_RE.test(key) || !entry || typeof entry !== 'object') continue;
    const day = {};
    for (const type of STAT_TYPES) {
      const value = Number(entry[type]);
      if (Number.isFinite(value) && value > 0) {
        day[type] = Math.floor(value);
      }
    }
    clean[key] = day;
  }
  return clean;
}

/**
 * Increment a counter for the given date.
 * @param {string} type
 * @param {{options?: object, date?: Date, retentionDays?: number}} [context]
 * @returns {string} path written
 */
export function record(type, { options = {}, date = new Date(), retentionDays = 90 } = {}) {
  if (!STAT_TYPES.includes(type)) {
    throw new Error(`未知的统计类型：${type}`);
  }

  const stats = readStats(options);
  const key = localDateKey(date);
  const day = stats[key] ?? {};
  day[type] = (day[type] ?? 0) + 1;
  stats[key] = day;

  prune(stats, { retentionDays, date });

  const file = statsFile(options);
  writeFileAtomic(file, `${JSON.stringify(stats, null, 2)}\n`);
  return file;
}

/**
 * Drop days older than the retention window (mutates and returns the object).
 * @param {Record<string, Record<string, number>>} stats
 * @param {{retentionDays?: number, date?: Date}} [options]
 */
export function prune(stats, { retentionDays = 90, date = new Date() } = {}) {
  const cutoff = new Date(date);
  cutoff.setDate(cutoff.getDate() - (retentionDays - 1));
  const minKey = localDateKey(cutoff);

  for (const key of Object.keys(stats)) {
    if (key < minKey) delete stats[key];
  }
  return stats;
}

/**
 * Aggregate the last `days` calendar days (including today).
 * @param {Record<string, Record<string, number>>} stats
 * @param {{days?: number, date?: Date}} [options]
 */
export function summarize(stats, { days = 7, date = new Date() } = {}) {
  const totals = { water: 0, sit: 0, eyes: 0, snoozed: 0, skipped: 0 };
  const rows = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const current = new Date(date);
    current.setDate(current.getDate() - offset);
    const key = localDateKey(current);
    const entry = stats[key] ?? {};
    const row = { date: key, ...Object.fromEntries(STAT_TYPES.map((type) => [type, entry[type] ?? 0])) };

    for (const type of STAT_TYPES) totals[type] += row[type];
    rows.push(row);
  }

  return {
    range: {
      from: rows[0]?.date ?? localDateKey(date),
      to: rows.at(-1)?.date ?? localDateKey(date),
      days,
    },
    totals,
    days: rows,
  };
}
