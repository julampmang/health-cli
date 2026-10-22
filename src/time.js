/**
 * Time helpers: duration parsing/formatting, clock parsing, quiet hours.
 */

const UNIT_MS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
};

const DURATION_RE = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i;
const CLOCK_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/**
 * Parse a human duration such as `90s`, `30m`, `2h`, or a bare number (minutes).
 * @param {string|number} value
 * @param {{allowZero?: boolean}} [options]
 * @returns {number} milliseconds
 */
export function parseDuration(value, { allowZero = false } = {}) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`时长必须是非负数：${value}`);
    }
    if (value === 0 && !allowZero) {
      throw new Error('时长必须大于 0');
    }
    return Math.round(value);
  }

  if (typeof value !== 'string') {
    throw new Error(`无法识别的时长：${String(value)}`);
  }

  const raw = value.trim();
  const match = DURATION_RE.exec(raw);
  if (!match) {
    throw new Error(`无法识别的时长：${value}（示例：90s、30m、2h，裸数字按分钟）`);
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? 'm').toLowerCase();
  const ms = Math.round(amount * UNIT_MS[unit]);

  if (ms === 0 && !allowZero) {
    throw new Error('时长必须大于 0');
  }
  return ms;
}

/**
 * Format milliseconds into a compact human string, e.g. `1h 30m`.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';

  const hours = Math.floor(ms / UNIT_MS.h);
  const minutes = Math.floor((ms % UNIT_MS.h) / UNIT_MS.m);
  const seconds = Math.round((ms % UNIT_MS.m) / UNIT_MS.s);
  const parts = [];

  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds) parts.push(`${seconds}s`);

  return parts.join(' ') || '0s';
}

/**
 * Parse `HH:MM` into minutes since midnight.
 * @param {string} value
 * @returns {number}
 */
export function parseClock(value) {
  const match = CLOCK_RE.exec(String(value).trim());
  if (!match) {
    throw new Error(`无法识别的时间：${value}（应为 HH:MM，例如 12:30）`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Parse `HH:MM-HH:MM` into `{ start, end }`, normalized to `HH:MM`.
 * Cross-midnight ranges (e.g. `23:00-07:00`) are allowed; empty/off become null.
 * @param {string|null|undefined} value
 * @returns {{start: string, end: string}|null}
 */
export function parseQuietRange(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  if (text === '' || text.toLowerCase() === 'off' || text.toLowerCase() === 'none') {
    return null;
  }

  const parts = text.split('-');
  if (parts.length !== 2) {
    throw new Error(`无法识别的静默时段：${value}（应为 HH:MM-HH:MM）`);
  }

  const startMinutes = parseClock(parts[0]);
  const endMinutes = parseClock(parts[1]);
  if (startMinutes === endMinutes) return null;

  return {
    start: toClock(startMinutes),
    end: toClock(endMinutes),
  };
}

/**
 * @param {number} minutesSinceMidnight
 * @returns {string}
 */
export function toClock(minutesSinceMidnight) {
  const hours = Math.floor(minutesSinceMidnight / 60) % 24;
  const minutes = minutesSinceMidnight % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Whether the given date falls inside the quiet hours range (end-exclusive).
 * @param {Date} date
 * @param {{start: string, end: string}|null} quietHours
 * @returns {boolean}
 */
export function isQuietTime(date, quietHours) {
  if (!quietHours) return false;

  const start = parseClock(quietHours.start);
  const end = parseClock(quietHours.end);
  const now = date.getHours() * 60 + date.getMinutes();

  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/**
 * Local calendar date key (`YYYY-MM-DD`).
 * @param {Date} [date]
 * @returns {string}
 */
export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
