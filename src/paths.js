/**
 * Platform-aware paths and atomic file helpers.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Resolve the application data directory.
 * Override with `HEALTH_CLI_HOME` (used by tests and portable installs).
 * @param {{env?: NodeJS.ProcessEnv, platform?: string, home?: string}} [options]
 * @returns {string}
 */
export function configDir({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (env.HEALTH_CLI_HOME) {
    return path.resolve(env.HEALTH_CLI_HOME);
  }
  if (platform === 'win32') {
    const appData = env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'health-cli');
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'health-cli');
  }
  const xdg = env.XDG_CONFIG_HOME;
  return xdg
    ? path.join(path.resolve(xdg), 'health-cli')
    : path.join(home, '.config', 'health-cli');
}

/**
 * @param {object} [options]
 * @returns {string}
 */
export function configFile(options = {}) {
  return path.join(configDir(options), 'config.json');
}

/**
 * @param {object} [options]
 * @returns {string}
 */
export function statsFile(options = {}) {
  return path.join(configDir(options), 'stats.json');
}

/**
 * Write a file atomically (temp file + rename).
 * @param {string} file
 * @param {string} data
 */
export function writeFileAtomic(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });

  const temp = path.join(
    dir,
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
  );

  fs.writeFileSync(temp, data, 'utf8');
  try {
    fs.renameSync(temp, file);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}
