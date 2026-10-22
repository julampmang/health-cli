/**
 * Config loading, validation and persistence.
 */

import fs from 'node:fs';
import path from 'node:path';

import { configFile, writeFileAtomic } from './paths.js';
import { parseDuration, parseQuietRange } from './time.js';

export const DEFAULT_CONFIG = Object.freeze({
  water: '30m',
  sit: '45m',
  eyes: '20m',
  snooze: '5m',
  quietHours: null,
  lang: 'auto',
  emoji: true,
  statsRetentionDays: 90,
});

export const CONFIG_KEYS = Object.freeze(Object.keys(DEFAULT_CONFIG));

const DURATION_KEYS = new Set(['water', 'sit', 'eyes', 'snooze']);
const LANGUAGES = new Set(['auto', 'zh', 'en']);

/**
 * Validate and normalize a config object, collecting human-readable warnings.
 * @param {unknown} input
 * @returns {{config: typeof DEFAULT_CONFIG, warnings: string[]}}
 */
export function normalizeConfig(input = {}) {
  const warnings = [];
  const config = { ...DEFAULT_CONFIG, quietHours: null };

  if (input === null || input === undefined) {
    return { config, warnings };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    warnings.push('配置文件内容不是对象，已使用默认配置');
    return { config, warnings };
  }

  for (const key of CONFIG_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];

    try {
      if (DURATION_KEYS.has(key)) {
        if (value === null) continue;
        parseDuration(value);
        config[key] = String(value).trim();
        continue;
      }

      switch (key) {
        case 'quietHours': {
          const range = value && typeof value === 'object'
            ? parseQuietRange(`${value.start}-${value.end}`)
            : parseQuietRange(value);
          config.quietHours = range ? { ...range } : null;
          break;
        }
        case 'lang': {
          if (typeof value !== 'string' || !LANGUAGES.has(value)) {
            throw new Error('仅支持 auto / zh / en');
          }
          config.lang = value;
          break;
        }
        case 'emoji': {
          if (typeof value !== 'boolean') throw new Error('必须是 true 或 false');
          config.emoji = value;
          break;
        }
        case 'statsRetentionDays': {
          const days = Number(value);
          if (!Number.isInteger(days) || days < 7 || days > 365) {
            throw new Error('必须是 7–365 之间的整数');
          }
          config.statsRetentionDays = days;
          break;
        }
        default:
          break;
      }
    } catch (error) {
      warnings.push(`${key}: ${error.message}（已忽略该值）`);
    }
  }

  return { config, warnings };
}

/**
 * @typedef {{config: typeof DEFAULT_CONFIG, warnings: string[], path: string}} LoadedConfig
 */

/**
 * Load config from disk, falling back to defaults.
 * @param {object} [options]
 * @returns {LoadedConfig}
 */
export function loadConfig(options = {}) {
  const file = configFile(options);
  let raw;

  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { config: { ...DEFAULT_CONFIG, quietHours: null }, warnings: [], path: file };
    }
    return {
      config: { ...DEFAULT_CONFIG, quietHours: null },
      warnings: [`读取配置失败：${error.message}，已使用默认配置`],
      path: file,
    };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    return {
      config: { ...DEFAULT_CONFIG, quietHours: null },
      warnings: [`配置文件 JSON 解析失败：${error.message}，已使用默认配置`],
      path: file,
    };
  }

  const { config, warnings } = normalizeConfig(data);
  return { config, warnings, path: file };
}

/**
 * Persist config atomically.
 * @param {typeof DEFAULT_CONFIG} config
 * @param {object} [options]
 * @returns {string} path written
 */
export function saveConfig(config, options = {}) {
  const file = configFile(options);
  const { config: normalized } = normalizeConfig(config);
  writeFileAtomic(
    file,
    `${JSON.stringify(normalized, null, 2)}\n`,
  );
  return file;
}

/**
 * Remove the config file if it exists.
 * @param {object} [options]
 * @returns {string} path removed
 */
export function removeConfig(options = {}) {
  const file = configFile(options);
  fs.rmSync(file, { force: true });
  return file;
}

/**
 * Human-readable config summary.
 * @param {typeof DEFAULT_CONFIG} config
 * @returns {string}
 */
export function describeConfig(config) {
  const quiet = config.quietHours
    ? `${config.quietHours.start}-${config.quietHours.end}`
    : '关闭';
  return [
    `喝水间隔      ${config.water}`,
    `久坐间隔      ${config.sit}`,
    `护眼间隔      ${config.eyes}`,
    `稍后提醒      ${config.snooze}`,
    `静默时段      ${quiet}`,
    `语言          ${config.lang}`,
    `Emoji         ${config.emoji ? '开启' : '关闭'}`,
    `统计保留      ${config.statsRetentionDays} 天`,
  ].join('\n');
}

/**
 * Resolve the config file path (kept for CLI output).
 * @param {object} [options]
 */
export function getConfigPath(options = {}) {
  return path.resolve(configFile(options));
}
