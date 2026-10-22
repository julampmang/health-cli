/**
 * CLI argument parsing, command dispatch and the interactive reminder loop.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { box, createTheme, padEnd, supportsColor } from './ansi.js';
import {
  CONFIG_KEYS,
  describeConfig,
  loadConfig,
  removeConfig,
  saveConfig,
} from './config.js';
import { pickMessage, resolveLang, TYPE_LABELS } from './messages.js';
import { notify } from './notify.js';
import { configDir } from './paths.js';
import { Scheduler } from './scheduler.js';
import { readStats, record, summarize } from './stats.js';
import {
  formatDuration,
  isQuietTime,
  parseDuration,
  parseQuietRange,
} from './time.js';
import { VERSION } from './version.js';

const REMINDER_TYPES = ['water', 'sit', 'eyes'];

export class UsageError extends Error {}

/**
 * @returns {{
 *   stdin: NodeJS.ReadStream,
 *   stdout: NodeJS.WriteStream,
 *   stderr: NodeJS.WriteStream,
 *   env: NodeJS.ProcessEnv,
 *   platform: string,
 *   home: string,
 *   now: () => number,
 * }}
 */
function defaultIO() {
  return {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
    platform: process.platform,
    home: os.homedir(),
    now: Date.now,
  };
}

/**
 * @param {object} io
 * @returns {string}
 */
function helpText(io) {
  return `health-cli ${VERSION} — 终端里的健康助手（久坐 / 喝水 / 护眼）

用法:
  health-cli start [选项]                       同时启动三类提醒
  health-cli water|sit|eyes [选项]              只启动一类提醒
  health-cli demo [--type <类型>]               立即预览提醒样式
  health-cli stats [--today|--days N] [--json]  查看本地统计
  health-cli config [list|get <键>|set <键> <值>|reset]
  health-cli doctor                             环境自检
  health-cli --version | --help

start 选项:
  --water <时长>                 喝水间隔（默认 30m）
  --sit <时长>                   久坐间隔（默认 45m）
  --eyes <时长>                  护眼间隔（默认 20m）
  --no-water|--no-sit|--no-eyes  关闭某一类提醒
  --snooze <时长>                稍后提醒间隔（默认 5m）
  --quiet <HH:MM-HH:MM>          静默时段，例如 12:00-13:30
  --lang <zh|en>                 提示语言
  --no-emoji / --no-color        纯文本输出

单类提醒选项:
  -i, --interval <时长>          提醒间隔
  --once                         立即提醒一次后退出
  --force                        忽略静默时段

运行中快捷键（TTY）:
  p 暂停 · r 恢复 · s 稍后提醒 · q 退出

时长写法: 90s / 30m / 2h，纯数字按分钟。
数据目录: ${configDir(io)}（可用 HEALTH_CLI_HOME 覆盖）

示例:
  health-cli start --water 30m --sit 45m --eyes 20m
  health-cli start --quiet 12:00-13:30
  health-cli water --once
  health-cli stats --days 7`;
}

function fail(io, message) {
  io.stderr.write(`错误：${message}\n\n运行 health-cli --help 查看用法。\n`);
  return 2;
}

function nextValue(rest, index, flag) {
  const value = rest[index + 1];
  if (value === undefined) throw new UsageError(`${flag} 需要一个值`);
  return value;
}

function parseStart(rest) {
  const options = {
    command: 'start',
    water: undefined,
    sit: undefined,
    eyes: undefined,
    snooze: undefined,
    quiet: undefined,
    lang: undefined,
    emoji: true,
    color: true,
  };

  let index = 0;
  while (index < rest.length) {
    const arg = rest[index];

    if (arg === '--help' || arg === '-h') return { command: 'help' };

    if (['--water', '--sit', '--eyes', '--snooze', '--quiet', '--lang'].includes(arg)) {
      const value = nextValue(rest, index, arg);
      const key = arg.slice(2);
      if (key === 'quiet') options.quiet = value;
      else if (key === 'lang') options.lang = value;
      else options[key] = value;
      index += 2;
      continue;
    }

    if (arg === '--no-water') options.water = null;
    else if (arg === '--no-sit') options.sit = null;
    else if (arg === '--no-eyes') options.eyes = null;
    else if (arg === '--no-emoji') options.emoji = false;
    else if (arg === '--no-color') options.color = false;
    else throw new UsageError(`未知参数：${arg}`);

    index += 1;
  }

  return options;
}

function parseReminder(command, rest) {
  const options = {
    command,
    interval: undefined,
    once: false,
    force: false,
    quiet: undefined,
    lang: undefined,
    emoji: true,
    color: true,
  };

  let index = 0;
  while (index < rest.length) {
    const arg = rest[index];

    if (arg === '--help' || arg === '-h') return { command: 'help' };

    if (arg === '--interval' || arg === '-i') {
      options.interval = nextValue(rest, index, arg);
      index += 2;
      continue;
    }
    if (arg === '--quiet' || arg === '--lang') {
      options[arg.slice(2)] = nextValue(rest, index, arg);
      index += 2;
      continue;
    }

    if (arg === '--once') options.once = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--no-emoji') options.emoji = false;
    else if (arg === '--no-color') options.color = false;
    else throw new UsageError(`未知参数：${arg}`);

    index += 1;
  }

  return options;
}

function parseDemo(rest) {
  const options = { command: 'demo', type: 'all', lang: undefined, emoji: true, color: true };

  let index = 0;
  while (index < rest.length) {
    const arg = rest[index];

    if (arg === '--help' || arg === '-h') return { command: 'help' };
    if (arg === '--type') {
      options.type = nextValue(rest, index, arg);
      index += 2;
      continue;
    }
    if (arg === '--lang') {
      options.lang = nextValue(rest, index, arg);
      index += 2;
      continue;
    }
    if (arg === '--no-emoji') options.emoji = false;
    else if (arg === '--no-color') options.color = false;
    else throw new UsageError(`未知参数：${arg}`);

    index += 1;
  }

  return options;
}

function parseStats(rest) {
  const options = { command: 'stats', today: false, days: undefined, json: false, color: true };

  let index = 0;
  while (index < rest.length) {
    const arg = rest[index];

    if (arg === '--help' || arg === '-h') return { command: 'help' };
    if (arg === '--days') {
      options.days = nextValue(rest, index, arg);
      index += 2;
      continue;
    }
    if (arg === '--today') options.today = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--no-color') options.color = false;
    else throw new UsageError(`未知参数：${arg}`);

    index += 1;
  }

  return options;
}

function parseConfig(rest) {
  const options = { command: 'config', action: 'list', key: undefined, value: undefined, json: false };
  const positional = [];

  let index = 0;
  while (index < rest.length) {
    const arg = rest[index];

    if (arg === '--help' || arg === '-h') return { command: 'help' };
    if (arg === '--json') {
      options.json = true;
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) throw new UsageError(`未知参数：${arg}`);

    positional.push(arg);
    index += 1;
  }

  if (positional.length === 0) return options;

  const [action, ...values] = positional;
  if (!['list', 'get', 'set', 'reset'].includes(action)) {
    throw new UsageError(`未知的 config 子命令：${action}`);
  }
  options.action = action;

  if (action === 'get') {
    if (values.length !== 1) throw new UsageError('用法：health-cli config get <键>');
    [options.key] = values;
  }
  if (action === 'set') {
    if (values.length !== 2) throw new UsageError('用法：health-cli config set <键> <值>');
    [options.key, options.value] = values;
  }
  return options;
}

function parseDoctor(rest) {
  const options = { command: 'doctor', color: true, emoji: true };
  for (const arg of rest) {
    if (arg === '--help' || arg === '-h') return { command: 'help' };
    if (arg === '--no-color') options.color = false;
    else if (arg === '--no-emoji') options.emoji = false;
    else throw new UsageError(`未知参数：${arg}`);
  }
  return options;
}

/**
 * Parse CLI arguments into a command object.
 * @param {string[]} argv
 */
export function parseArgs(argv = []) {
  const args = [...argv];
  if (args.length === 0) return { command: 'help' };

  const first = args.shift();
  if (first === 'help' || first === '-h' || first === '--help') return { command: 'help' };
  if (first === 'version' || first === '-v' || first === '--version') return { command: 'version' };

  switch (first) {
    case 'start':
      return parseStart(args);
    case 'water':
    case 'sit':
    case 'eyes':
      return parseReminder(first, args);
    case 'demo':
      return parseDemo(args);
    case 'stats':
      return parseStats(args);
    case 'config':
      return parseConfig(args);
    case 'doctor':
      return parseDoctor(args);
    default:
      throw new UsageError(`未知命令：${first}`);
  }
}

function warn(io, warnings) {
  for (const message of warnings) io.stderr.write(`注意：${message}\n`);
}

function checkLang(value) {
  if (value !== undefined && !['auto', 'zh', 'en'].includes(value)) {
    throw new UsageError('--lang 仅支持 zh / en / auto');
  }
  return value;
}

function parseDurationArg(value, flag) {
  try {
    return parseDuration(value);
  } catch (error) {
    throw new UsageError(`${flag}: ${error.message}`);
  }
}

function parseQuietArg(value, flag) {
  try {
    return parseQuietRange(value);
  } catch (error) {
    throw new UsageError(`${flag}: ${error.message}`);
  }
}

function buildTheme(flags, config, io) {
  return createTheme({
    color: flags.color && supportsColor(io.stdout),
    emoji: flags.emoji && config.emoji,
  });
}

function announceStart({ io, theme, intervals, quietHours, snoozeMs, configPath, lang }) {
  const quiet = quietHours ? `${quietHours.start}-${quietHours.end}` : lang === 'zh' ? '关闭' : 'off';
  const controls = lang === 'zh'
    ? 'p 暂停 · r 恢复 · s 稍后 · q 退出'
    : 'p pause · r resume · s snooze · q quit';

  const lines = [
    `${theme.green('●')} ${theme.bold(lang === 'zh' ? '已启动' : 'Running')}  ${theme.dim(controls)}`,
    '',
    ...Object.entries(intervals).map(
      ([type, ms]) => `${theme.symbol(type)} ${padEnd(TYPE_LABELS[lang][type], 14)} ${formatDuration(ms)}`,
    ),
    '',
    `${theme.dim(lang === 'zh' ? '静默时段' : 'Quiet hours')}  ${quiet}    ${theme.dim(lang === 'zh' ? '稍后' : 'Snooze')}  ${formatDuration(snoozeMs)}`,
    theme.dim(configPath),
  ];

  io.stdout.write(`${box(lines, { theme })}\n`);
}

function quitMessage(io, theme, lang) {
  io.stdout.write(`\n${theme.green(lang === 'zh' ? '已停止' : 'Stopped')} — ${lang === 'zh' ? '记得站起来活动一下。' : 'remember to move around.'}\n`);
}

function waitForQuit({ io, scheduler, theme, lang }) {
  return new Promise((resolve) => {
    let finished = false;

    const onSignal = () => finish(0);

    const onData = (chunk) => {
      for (const char of String(chunk)) {
        if (char === 'q' || char === '\u0003') {
          finish(0);
          return;
        }
        if (char === 'p') {
          scheduler.pause();
          io.stdout.write(`${theme.yellow(lang === 'zh' ? '已暂停' : 'Paused')} (${lang === 'zh' ? '按 r 恢复' : 'press r'})\n`);
        } else if (char === 'r') {
          scheduler.resume();
          io.stdout.write(`${theme.green(lang === 'zh' ? '已恢复' : 'Resumed')}\n`);
        } else if (char === 's') {
          for (const type of scheduler.intervals.keys()) scheduler.snooze(type);
          io.stdout.write(`${theme.yellow(lang === 'zh' ? '已稍后提醒' : 'Snoozed')} ${formatDuration(scheduler.snoozeMs)}\n`);
        } else if (char === '?') {
          io.stdout.write('p pause · r resume · s snooze · q quit\n');
        }
      }
    };

    const cleanup = () => {
      scheduler.stop();
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      if (io.stdin.isTTY) {
        try {
          io.stdin.setRawMode?.(false);
        } catch {
          // ignore terminal restore failures
        }
        io.stdin.removeListener('data', onData);
        io.stdin.pause();
      }
      quitMessage(io, theme, lang);
    };

    const finish = (code) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(code);
    };

    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    if (io.stdin.isTTY) {
      try {
        io.stdin.setRawMode?.(true);
      } catch {
        // ignore terminals without raw mode
      }
      io.stdin.setEncoding('utf8');
      io.stdin.resume();
      io.stdin.on('data', onData);
    } else {
      io.stdout.write(`${theme.dim('非交互终端：按 Ctrl+C 停止')}\n`);
    }
  });
}

function fireReminder({ io, config, lang, emoji, color, type, recordStats = true }) {
  const message = pickMessage(lang, type);
  notify({
    type,
    message,
    lang,
    emoji,
    color,
    stream: io.stdout,
    time: new Date(io.now()),
  });
  if (recordStats) {
    record(type, { options: io, date: new Date(io.now()), retentionDays: config.statsRetentionDays });
  }
}

async function runStart(flags, io) {
  const loaded = loadConfig(io);
  warn(io, loaded.warnings);

  const { config } = loaded;

  const lang = resolveLang(checkLang(flags.lang) ?? config.lang, io.env);
  const theme = buildTheme(flags, config, io);
  const emoji = theme.emoji;

  const intervals = {};
  for (const type of REMINDER_TYPES) {
    if (flags[type] === null) continue;
    intervals[type] = parseDurationArg(flags[type] ?? config[type], `--${type}`);
  }
  if (Object.keys(intervals).length === 0) {
    throw new UsageError('至少需要启用一种提醒（water / sit / eyes）');
  }

  const quietHours = flags.quiet !== undefined
    ? parseQuietArg(flags.quiet, '--quiet')
    : config.quietHours;
  const snoozeMs = parseDurationArg(flags.snooze ?? config.snooze, '--snooze');

  announceStart({ io, theme, intervals, quietHours, snoozeMs, configPath: loaded.path, lang });

  const scheduler = new Scheduler({
    intervals,
    quietHours,
    snoozeMs,
    now: io.now,
    onDue: (type) => fireReminder({ io, config, lang, emoji, color: theme.color, type }),
    onSkip: () => record('skipped', { options: io, date: new Date(io.now()), retentionDays: config.statsRetentionDays }),
    onError: (error) => io.stderr.write(`提醒出错：${error.message}\n`),
  });

  scheduler.start();
  return waitForQuit({ io, scheduler, theme, lang });
}

async function runReminder(flags, io) {
  const type = flags.command;
  const loaded = loadConfig(io);
  warn(io, loaded.warnings);

  const { config } = loaded;
  const lang = resolveLang(checkLang(flags.lang) ?? config.lang, io.env);
  const theme = buildTheme(flags, config, io);
  const intervalMs = parseDurationArg(flags.interval ?? config[type], '--interval');
  const quietHours = flags.quiet !== undefined
    ? parseQuietArg(flags.quiet, '--quiet')
    : config.quietHours;

  if (!flags.force && isQuietTime(new Date(io.now()), quietHours)) {
    io.stdout.write(`当前处于静默时段 ${quietHours.start}-${quietHours.end}，已跳过提醒（--force 可强制）。\n`);
    return 0;
  }

  if (flags.once) {
    fireReminder({ io, config, lang, emoji: theme.emoji, color: theme.color, type });
    return 0;
  }

  announceStart({
    io,
    theme,
    intervals: { [type]: intervalMs },
    quietHours,
    snoozeMs: parseDuration(config.snooze),
    configPath: loaded.path,
    lang,
  });

  const scheduler = new Scheduler({
    intervals: { [type]: intervalMs },
    quietHours,
    snoozeMs: parseDuration(config.snooze),
    now: io.now,
    onDue: () => fireReminder({ io, config, lang, emoji: theme.emoji, color: theme.color, type }),
    onSkip: () => record('skipped', { options: io, date: new Date(io.now()), retentionDays: config.statsRetentionDays }),
    onError: (error) => io.stderr.write(`提醒出错：${error.message}\n`),
  });

  scheduler.start();
  return waitForQuit({ io, scheduler, theme, lang });
}

function runDemo(flags, io) {
  const loaded = loadConfig(io);
  warn(io, loaded.warnings);

  const { config } = loaded;
  const lang = resolveLang(checkLang(flags.lang) ?? config.lang, io.env);
  const theme = buildTheme(flags, config, io);
  const types = flags.type === 'all' ? REMINDER_TYPES : [flags.type];

  if (!types.every((type) => REMINDER_TYPES.includes(type))) {
    throw new UsageError('--type 仅支持 water / sit / eyes / all');
  }

  for (const type of types) {
    fireReminder({
      io,
      config,
      lang,
      emoji: theme.emoji,
      color: theme.color,
      type,
      recordStats: false,
    });
  }
  return 0;
}

function runStats(flags, io) {
  const days = flags.today ? 1 : flags.days === undefined ? 7 : Number(flags.days);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new UsageError('--days 需为 1–90 的整数');
  }

  const summary = summarize(readStats(io), { days, date: new Date(io.now()) });

  if (flags.json) {
    io.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  }

  const theme = createTheme({
    color: flags.color && supportsColor(io.stdout),
    emoji: false,
  });
  io.stdout.write(`${theme.bold(`最近 ${summary.range.days} 天`)}（${summary.range.from} ~ ${summary.range.to}）\n\n`);

  const labels = {
    water: '喝水',
    sit: '久坐',
    eyes: '护眼',
    snoozed: '稍后提醒',
    skipped: '静默跳过',
  };

  for (const [key, label] of Object.entries(labels)) {
    io.stdout.write(`  ${padEnd(label, 10)} ${summary.totals[key]} 次\n`);
  }

  const activeDays = summary.days.filter((day) =>
    ['water', 'sit', 'eyes', 'snoozed', 'skipped'].some((key) => day[key] > 0),
  );

  io.stdout.write(`\n${theme.dim('按日明细')}\n`);
  if (activeDays.length === 0) {
    io.stdout.write('  暂无记录，运行 health-cli start 开始使用。\n');
    return 0;
  }

  for (const day of activeDays) {
    io.stdout.write(
      `  ${day.date}  water=${day.water} sit=${day.sit} eyes=${day.eyes} snoozed=${day.snoozed} skipped=${day.skipped}\n`,
    );
  }
  return 0;
}

function coerceConfigValue(key, raw) {
  switch (key) {
    case 'water':
    case 'sit':
    case 'eyes':
    case 'snooze':
      try {
        parseDuration(raw);
      } catch (error) {
        throw new UsageError(error.message);
      }
      return raw.trim();
    case 'quietHours':
      try {
        return parseQuietRange(raw);
      } catch (error) {
        throw new UsageError(error.message);
      }
    case 'lang':
      if (!['auto', 'zh', 'en'].includes(raw)) throw new UsageError('lang 仅支持 auto / zh / en');
      return raw;
    case 'emoji':
      if (['true', '1', 'on', 'yes'].includes(String(raw).toLowerCase())) return true;
      if (['false', '0', 'off', 'no'].includes(String(raw).toLowerCase())) return false;
      throw new UsageError('emoji 仅支持 true / false');
    case 'statsRetentionDays': {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 7 || value > 365) {
        throw new UsageError('statsRetentionDays 需为 7–365 的整数');
      }
      return value;
    }
    default:
      throw new UsageError(`未知配置项：${key}（可用：${CONFIG_KEYS.join(', ')}）`);
  }
}

function runConfig(flags, io) {
  const loaded = loadConfig(io);
  warn(io, loaded.warnings);

  if (flags.action === 'list') {
    if (flags.json) {
      io.stdout.write(`${JSON.stringify(loaded.config, null, 2)}\n`);
    } else {
      io.stdout.write(`${describeConfig(loaded.config)}\n\n${loaded.path}\n`);
    }
    return 0;
  }

  if (flags.action === 'get') {
    if (!CONFIG_KEYS.includes(flags.key)) {
      throw new UsageError(`未知配置项：${flags.key}（可用：${CONFIG_KEYS.join(', ')}）`);
    }
    const value = loaded.config[flags.key];
    io.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value)}\n`);
    return 0;
  }

  if (flags.action === 'set') {
    if (!CONFIG_KEYS.includes(flags.key)) {
      throw new UsageError(`未知配置项：${flags.key}（可用：${CONFIG_KEYS.join(', ')}）`);
    }
    const next = { ...loaded.config, [flags.key]: coerceConfigValue(flags.key, flags.value) };
    const file = saveConfig(next, io);
    io.stdout.write(`已更新 ${flags.key} = ${JSON.stringify(next[flags.key])}\n${file}\n`);
    return 0;
  }

  if (flags.action === 'reset') {
    const file = removeConfig(io);
    io.stdout.write(`已删除配置文件（恢复默认）：${file}\n`);
    return 0;
  }

  throw new UsageError(`未知的 config 子命令：${flags.action}`);
}

function runDoctor(flags, io) {
  const loaded = loadConfig(io);
  const directory = configDir(io);
  const stats = readStats(io);
  const theme = createTheme({
    color: flags.color && supportsColor(io.stdout),
    emoji: false,
  });

  let writable = true;
  let writeError = '';
  try {
    fs.mkdirSync(directory, { recursive: true });
    const probe = path.join(directory, '.doctor-probe');
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.rmSync(probe, { force: true });
  } catch (error) {
    writable = false;
    writeError = error.message;
  }

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const tty = Boolean(io.stdin.isTTY && io.stdout.isTTY);
  const color = supportsColor(io.stdout);

  const lines = [
    `${theme.bold('health-cli doctor')}`,
    '',
    `Node          ${process.version}${nodeMajor >= 20 ? theme.green(' ✓') : theme.red(' 需要 >= 20')}`,
    `平台          ${io.platform} ${process.arch}`,
    `配置目录      ${directory}`,
    `目录可写      ${writable ? theme.green('✓') : theme.red(`✗ ${writeError}`)}`,
    `配置文件      ${loaded.path}`,
    `配置状态      ${loaded.warnings.length === 0 ? theme.green('✓ 正常') : theme.yellow(`注意：${loaded.warnings.join('；')}`)}`,
    `统计记录      ${Object.keys(stats).length} 天`,
    `交互终端      ${tty ? theme.green('✓') : theme.yellow('否（仅定时提醒）')}`,
    `颜色输出      ${color ? theme.green('✓') : theme.yellow('否（纯文本）')}`,
    `提示语言      ${resolveLang(loaded.config.lang, io.env)}`,
  ];

  io.stdout.write(`${box(lines, { theme })}\n`);
  return 0;
}

/**
 * Run the CLI.
 * @param {string[]} argv
 * @param {ReturnType<typeof defaultIO>} [io]
 * @returns {Promise<number>} exit code
 */
export async function main(argv = process.argv.slice(2), io = defaultIO()) {
  let parsed;

  try {
    parsed = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) return fail(io, error.message);
    throw error;
  }

  try {
    switch (parsed.command) {
      case 'help':
        io.stdout.write(`${helpText(io)}\n`);
        return 0;
      case 'version':
        io.stdout.write(`health-cli ${VERSION}\n`);
        return 0;
      case 'start':
        return await runStart(parsed, io);
      case 'water':
      case 'sit':
      case 'eyes':
        return await runReminder(parsed, io);
      case 'demo':
        return runDemo(parsed, io);
      case 'stats':
        return runStats(parsed, io);
      case 'config':
        return runConfig(parsed, io);
      case 'doctor':
        return runDoctor(parsed, io);
      default:
        throw new UsageError(`未知命令：${parsed.command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) return fail(io, error.message);
    io.stderr.write(`错误：${error.message}\n`);
    return 1;
  }
}
