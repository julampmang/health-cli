/**
 * Reminder scheduler with an injectable clock, so it is testable without timers.
 */

import { isQuietTime } from './time.js';

export const REMINDER_TYPES = Object.freeze(['water', 'sit', 'eyes']);

export class Scheduler {
  /**
   * @param {{
   *   intervals: Record<string, number>,
   *   quietHours?: {start: string, end: string}|null,
   *   snoozeMs?: number,
   *   now?: () => number,
   *   onDue?: (type: string) => void,
   *   onSkip?: (type: string, info: {quiet: boolean}) => void,
   *   onError?: (error: Error) => void,
   *   setIntervalFn?: typeof setInterval,
   *   clearIntervalFn?: typeof clearInterval,
   * }} options
   */
  constructor({
    intervals,
    quietHours = null,
    snoozeMs = 5 * 60_000,
    now = Date.now,
    onDue,
    onSkip,
    onError,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  }) {
    this.intervals = new Map();
    for (const [type, ms] of Object.entries(intervals)) {
      if (!REMINDER_TYPES.includes(type)) throw new Error(`未知的提醒类型：${type}`);
      if (!Number.isFinite(ms) || ms <= 0) throw new Error(`非法间隔：${type}=${ms}`);
      this.intervals.set(type, ms);
    }

    this.quietHours = quietHours;
    this.snoozeMs = snoozeMs;
    this.now = now;
    this.onDue = onDue;
    this.onSkip = onSkip;
    this.onError = onError;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;

    this.paused = false;
    this.nextDueAt = new Map();
    this.timer = null;

    const start = this.now();
    for (const [type, ms] of this.intervals) {
      this.nextDueAt.set(type, start + ms);
    }
  }

  /**
   * Start the 1s tick loop.
   * @param {number} [tickMs]
   */
  start(tickMs = 1_000) {
    if (this.timer) return;
    this.timer = this.setIntervalFn(() => {
      try {
        this.tick();
      } catch (error) {
        this.onError?.(error);
      }
    }, tickMs);
  }

  /**
   * Evaluate all due reminders at `nowMs`.
   * @param {number} [nowMs]
   * @returns {string[]} types fired in this tick
   */
  tick(nowMs = this.now()) {
    if (this.paused) return [];

    const fired = [];

    for (const [type, interval] of this.intervals) {
      const dueAt = this.nextDueAt.get(type) ?? nowMs;
      if (nowMs < dueAt) continue;

      if (isQuietTime(new Date(nowMs), this.quietHours)) {
        this.nextDueAt.set(type, nowMs + interval);
        this.onSkip?.(type, { quiet: true });
        continue;
      }

      this.nextDueAt.set(type, nowMs + interval);
      this.onDue?.(type);
      fired.push(type);
    }

    return fired;
  }

  /**
   * @param {string} type
   * @param {number} [ms]
   */
  snooze(type, ms = this.snoozeMs) {
    this.nextDueAt.set(type, this.now() + ms);
  }

  pause() {
    this.paused = true;
  }

  /**
   * @param {number} [nowMs]
   */
  resume(nowMs = this.now()) {
    if (!this.paused) return;
    this.paused = false;
    const start = nowMs;
    for (const [type, ms] of this.intervals) {
      this.nextDueAt.set(type, start + ms);
    }
  }

  /**
   * @param {string} type
   * @param {number} [nowMs]
   * @returns {number} milliseconds until next fire
   */
  remaining(type, nowMs = this.now()) {
    const dueAt = this.nextDueAt.get(type);
    if (dueAt === undefined) return 0;
    return Math.max(0, dueAt - nowMs);
  }

  stop() {
    if (this.timer) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
  }
}
