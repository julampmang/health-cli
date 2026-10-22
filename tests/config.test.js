import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_CONFIG,
  loadConfig,
  normalizeConfig,
  removeConfig,
  saveConfig,
} from '../src/config.js';
import { configDir, configFile } from '../src/paths.js';

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'health-cli-config-'));
}

test('configDir resolves per platform and honors HEALTH_CLI_HOME', () => {
  assert.equal(
    configDir({ env: { HEALTH_CLI_HOME: '/tmp/portable' }, platform: 'linux', home: '/home/dev' }),
    path.resolve('/tmp/portable'),
  );

  assert.equal(
    configDir({ env: { APPDATA: 'C:\\Users\\dev\\AppData\\Roaming' }, platform: 'win32', home: 'C:\\Users\\dev' }),
    path.join('C:\\Users\\dev\\AppData\\Roaming', 'health-cli'),
  );

  assert.equal(
    configDir({ env: {}, platform: 'darwin', home: '/Users/dev' }),
    path.join('/Users/dev', 'Library', 'Application Support', 'health-cli'),
  );

  assert.equal(
    configDir({ env: { XDG_CONFIG_HOME: '/home/dev/.config-xdg' }, platform: 'linux', home: '/home/dev' }),
    path.join(path.resolve('/home/dev/.config-xdg'), 'health-cli'),
  );

  assert.equal(
    configDir({ env: {}, platform: 'linux', home: '/home/dev' }),
    path.join('/home/dev/.config', 'health-cli'),
  );
});

test('normalizeConfig fills defaults', () => {
  const { config, warnings } = normalizeConfig({});
  assert.deepEqual(warnings, []);
  assert.equal(config.water, DEFAULT_CONFIG.water);
  assert.equal(config.quietHours, null);
  assert.equal(config.emoji, true);
});

test('normalizeConfig reports invalid values and keeps defaults', () => {
  const { config, warnings } = normalizeConfig({
    water: 'nope',
    lang: 'fr',
    emoji: 'yes',
    statsRetentionDays: 1,
    quietHours: '25:00-26:00',
    unknownKey: 'ignored',
  });

  assert.equal(config.water, DEFAULT_CONFIG.water);
  assert.equal(config.lang, DEFAULT_CONFIG.lang);
  assert.equal(config.emoji, true);
  assert.equal(config.statsRetentionDays, DEFAULT_CONFIG.statsRetentionDays);
  assert.equal(config.quietHours, null);
  assert.equal(warnings.length, 5);
});

test('normalizeConfig accepts a quiet range and language', () => {
  const { config, warnings } = normalizeConfig({ lang: 'zh', quietHours: '12:00-13:00' });
  assert.deepEqual(warnings, []);
  assert.equal(config.lang, 'zh');
  assert.deepEqual(config.quietHours, { start: '12:00', end: '13:00' });
});

test('loadConfig returns defaults when the file is missing', () => {
  const dir = tempHome();
  const options = { env: { HEALTH_CLI_HOME: dir }, platform: 'linux', home: dir };
  const loaded = loadConfig(options);

  assert.deepEqual(loaded.warnings, []);
  assert.equal(loaded.config.water, DEFAULT_CONFIG.water);
  assert.equal(loaded.path, configFile(options));
});

test('saveConfig and loadConfig round-trip', () => {
  const dir = tempHome();
  const options = { env: { HEALTH_CLI_HOME: dir }, platform: 'linux', home: dir };

  saveConfig({ ...DEFAULT_CONFIG, water: '45m', lang: 'zh', quietHours: { start: '22:00', end: '08:00' } }, options);
  const loaded = loadConfig(options);

  assert.equal(loaded.config.water, '45m');
  assert.equal(loaded.config.lang, 'zh');
  assert.deepEqual(loaded.config.quietHours, { start: '22:00', end: '08:00' });
  assert.equal(fs.readdirSync(dir).some((name) => name.endsWith('.tmp')), false);
});

test('loadConfig recovers from corrupt JSON', () => {
  const dir = tempHome();
  const options = { env: { HEALTH_CLI_HOME: dir }, platform: 'linux', home: dir };
  fs.writeFileSync(configFile(options), '{ not json', 'utf8');

  const loaded = loadConfig(options);
  assert.equal(loaded.config.water, DEFAULT_CONFIG.water);
  assert.equal(loaded.warnings.length, 1);
  assert.match(loaded.warnings[0], /JSON/);
});

test('removeConfig deletes the file', () => {
  const dir = tempHome();
  const options = { env: { HEALTH_CLI_HOME: dir }, platform: 'linux', home: dir };
  saveConfig(DEFAULT_CONFIG, options);
  assert.equal(fs.existsSync(configFile(options)), true);

  removeConfig(options);
  assert.equal(fs.existsSync(configFile(options)), false);
});
