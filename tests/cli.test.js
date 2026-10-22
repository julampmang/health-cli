import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main, parseArgs, UsageError } from '../src/cli.js';
import { configFile, statsFile } from '../src/paths.js';
import { readStats } from '../src/stats.js';

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'health-cli-cli-'));
}

function makeIO(dir) {
  const out = [];
  const err = [];
  return {
    io: {
      stdin: { isTTY: false },
      stdout: { isTTY: false, write: (chunk) => out.push(chunk) },
      stderr: { isTTY: false, write: (chunk) => err.push(chunk) },
      env: { HEALTH_CLI_HOME: dir, LANG: 'zh_CN.UTF-8' },
      platform: 'linux',
      home: dir,
      now: () => Date.now(),
    },
    out,
    err,
    stdout: () => out.join(''),
    stderr: () => err.join(''),
  };
}

test('parseArgs handles start flags', () => {
  assert.deepEqual(parseArgs(['start', '--water', '15m', '--no-sit', '--quiet', '12:00-13:30']), {
    command: 'start',
    water: '15m',
    sit: null,
    eyes: undefined,
    snooze: undefined,
    quiet: '12:00-13:30',
    lang: undefined,
    emoji: true,
    color: true,
  });
});

test('parseArgs handles single-reminder and config commands', () => {
  const water = parseArgs(['water', '-i', '90s', '--once', '--force', '--no-emoji']);
  assert.equal(water.command, 'water');
  assert.equal(water.interval, '90s');
  assert.equal(water.once, true);
  assert.equal(water.force, true);
  assert.equal(water.emoji, false);

  const config = parseArgs(['config', 'set', 'water', '20m', '--json']);
  assert.equal(config.action, 'set');
  assert.equal(config.key, 'water');
  assert.equal(config.value, '20m');
  assert.equal(config.json, true);
});

test('parseArgs rejects unknown commands and flags', () => {
  assert.throws(() => parseArgs(['nope']), UsageError);
  assert.throws(() => parseArgs(['start', '--bogus']), UsageError);
  assert.throws(() => parseArgs(['start', '--water']), UsageError);
});

test('main prints help and version', async () => {
  const dir = tempHome();
  const help = makeIO(dir);
  assert.equal(await main(['--help'], help.io), 0);
  assert.match(help.stdout(), /用法/);
  assert.match(help.stdout(), /health-cli start/);

  const version = makeIO(dir);
  assert.equal(await main(['--version'], version.io), 0);
  assert.match(version.stdout(), /^health-cli \d+\.\d+\.\d+/);
});

test('main returns usage errors with exit code 2', async () => {
  const dir = tempHome();
  const unknown = makeIO(dir);
  assert.equal(await main(['bogus'], unknown.io), 2);
  assert.match(unknown.stderr(), /未知命令/);

  const empty = makeIO(dir);
  assert.equal(await main(['start', '--no-water', '--no-sit', '--no-eyes'], empty.io), 2);
});

test('config set persists, get reads and reset removes', async () => {
  const dir = tempHome();

  const set = makeIO(dir);
  assert.equal(await main(['config', 'set', 'water', '20m'], set.io), 0);
  const saved = JSON.parse(fs.readFileSync(configFile(set.io), 'utf8'));
  assert.equal(saved.water, '20m');

  const get = makeIO(dir);
  assert.equal(await main(['config', 'get', 'water'], get.io), 0);
  assert.equal(get.stdout().trim(), '20m');

  const list = makeIO(dir);
  assert.equal(await main(['config', 'list', '--json'], list.io), 0);
  assert.equal(JSON.parse(list.stdout()).water, '20m');

  const reset = makeIO(dir);
  assert.equal(await main(['config', 'reset'], reset.io), 0);
  assert.equal(fs.existsSync(configFile(reset.io)), false);
});

test('water --once records a counter and respects quiet hours', async () => {
  const dir = tempHome();

  const once = makeIO(dir);
  assert.equal(await main(['water', '--once', '--lang', 'zh', '--no-color', '--no-emoji'], once.io), 0);
  assert.match(once.stdout(), /喝水提醒/);

  const stats = readStats(once.io);
  const key = Object.keys(stats)[0];
  assert.equal(stats[key].water, 1);

  const quiet = makeIO(dir);
  const now = new Date(2026, 0, 1, 12, 30).getTime();
  quiet.io.now = () => now;
  assert.equal(
    await main(['water', '--once', '--quiet', '12:00-13:30', '--no-color'], quiet.io),
    0,
  );
  assert.match(quiet.stdout(), /静默时段/);
});

test('demo renders all reminder types without recording stats', async () => {
  const dir = tempHome();
  const demo = makeIO(dir);

  assert.equal(await main(['demo', '--lang', 'zh', '--no-color', '--no-emoji'], demo.io), 0);
  assert.match(demo.stdout(), /喝水提醒/);
  assert.match(demo.stdout(), /久坐提醒/);
  assert.match(demo.stdout(), /护眼提醒/);
  assert.equal(fs.existsSync(statsFile(demo.io)), false);
});

test('stats --json returns a valid summary', async () => {
  const dir = tempHome();
  const io = makeIO(dir);

  await main(['water', '--once', '--no-color'], io.io);
  const stats = makeIO(dir);
  assert.equal(await main(['stats', '--json'], stats.io), 0);

  const summary = JSON.parse(stats.stdout());
  assert.equal(summary.range.days, 7);
  assert.equal(summary.totals.water, 1);
});

test('doctor reports environment details', async () => {
  const dir = tempHome();
  const io = makeIO(dir);

  assert.equal(await main(['doctor'], io.io), 0);
  assert.match(io.stdout(), /health-cli doctor/);
  assert.match(io.stdout(), /Node/);
  assert.match(io.stdout(), /配置目录/);
});
