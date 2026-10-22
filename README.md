# health-cli

[![CI](https://github.com/julampmang/health-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/julampmang/health-cli/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-success)](package.json)

A zero-dependency terminal health assistant for developers: **sit breaks**, **hydration reminders** and **eye exercises** — all in one small Node.js CLI.

[中文说明](README.zh-CN.md) · [Why](#why) · [Install](#install) · [Usage](#usage) · [Configuration](#configuration)

## Why

Long coding sessions quietly damage your back, eyes and metabolism. GUI reminder apps are heavy and easy to ignore; calendar alerts fire at the wrong time. `health-cli` stays in the terminal where you already work, uses a single Node process, and writes nothing but local counters.

- **Zero dependencies** — nothing to audit, nothing to install beyond Node.js.
- **Three reminders, one loop** — water, stand-up and 20-20-20 eye breaks.
- **Quiet hours** — silence notifications during lunch or meetings.
- **Local stats only** — no network calls, no telemetry, no account.
- **Cross-platform** — Linux, macOS and Windows, including Windows Terminal.

## Install

Requires Node.js **20 or newer**.

```bash
git clone https://github.com/julampmang/health-cli.git
cd health-cli
npm install -g .
```

Then:

```bash
health-cli start
```

Prefer not to install globally? Run it directly:

```bash
node bin/health-cli.js start
```

## Usage

| Command | What it does |
| --- | --- |
| `health-cli start` | Run water, sit and eye reminders together |
| `health-cli water` | Run only the hydration reminder |
| `health-cli sit` | Run only the stand-up reminder |
| `health-cli eyes` | Run only the eye-break reminder |
| `health-cli demo` | Print one sample notification per type |
| `health-cli stats` | Show local counters for the last 7 days |
| `health-cli config` | Read or change settings |
| `health-cli doctor` | Check Node version, config directory and terminal |

### Start all reminders

```bash
health-cli start --water 30m --sit 45m --eyes 20m --quiet 12:00-13:30
```

While running (interactive terminal):

| Key | Action |
| --- | --- |
| `p` | Pause |
| `r` | Resume |
| `s` | Snooze all reminders |
| `q` | Quit (restores the terminal) |

Press `Ctrl+C` at any time to stop cleanly.

### Single reminder, once

```bash
health-cli water --once          # useful in cron / CI / scripts
health-cli eyes --interval 20m
```

### Statistics

```bash
health-cli stats              # last 7 days
health-cli stats --today
health-cli stats --days 30 --json
```

Example output:

```text
最近 7 天（2026-10-16 ~ 2026-10-22）

  喝水       12 次
  久坐       8 次
  护眼       14 次
  稍后提醒   2 次
  静默跳过   1 次
```

## Configuration

Settings live in a single JSON file:

| Platform | Path |
| --- | --- |
| Windows | `%APPDATA%\health-cli\config.json` |
| macOS | `~/Library/Application Support/health-cli/config.json` |
| Linux | `$XDG_CONFIG_HOME/health-cli/config.json` (default `~/.config/...`) |

Override the directory with `HEALTH_CLI_HOME` (handy for portable use and tests).

```json
{
  "water": "30m",
  "sit": "45m",
  "eyes": "20m",
  "snooze": "5m",
  "quietHours": { "start": "12:00", "end": "13:30" },
  "lang": "auto",
  "emoji": true,
  "statsRetentionDays": 90
}
```

Edit it with the CLI so values are validated:

```bash
health-cli config list
health-cli config get water
health-cli config set water 25m
health-cli config set quietHours 22:00-08:00
health-cli config reset
```

Durations accept `90s`, `30m`, `2h` or a bare number of minutes. Quiet hours may cross midnight (`22:00-08:00`). The statistics file keeps the last 90 days by default.

## Development

```bash
npm test        # node:test, no dependencies, no install step
npm run demo
```

Layout:

```text
bin/health-cli.js   entry point
src/cli.js          argument parsing and command dispatch
src/scheduler.js    injectable-clock reminder scheduler
src/config.js       defaults, validation, persistence
src/stats.js        local daily counters
src/notify.js       terminal notification rendering
src/time.js         duration / quiet-hours parsing
tests/              unit and CLI tests (node:test)
```

All modules are ESM and use only Node.js built-ins.

## Privacy

`health-cli` makes no network requests. It stores only per-day reminder counters and your settings, both in the config directory above.

## License

[MIT](LICENSE) © 2026 julampmang

---

Related: [dev-health](https://github.com/julampmang/dev-health) — the lightweight Python version of the hydration reminder.
