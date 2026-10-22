# health-cli

[![CI](https://github.com/julampmang/health-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/julampmang/health-cli/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-success)](package.json)

终端里的程序员健康助手：**久坐提醒**、**喝水提醒**、**护眼提醒**，一个零依赖的 Node.js CLI 全搞定。

[English](README.md) · [安装](#安装) · [使用](#使用) · [配置](#配置)

## 为什么

长时间写代码，腰、眼睛和代谢都在悄悄受损。GUI 提醒工具太重、容易被忽略；日历提醒又总在错误的时间弹出。`health-cli` 就待在你已经在用的终端里：单进程、零依赖、只写本地计数，不联网。

- **零依赖**：除了 Node.js 什么都不用装，也没有供应链风险。
- **三类提醒，一个循环**：喝水、起身、20-20-20 护眼。
- **静默时段**：午休、开会时自动闭嘴。
- **只存本地统计**：无网络请求、无遥测、无需账号。
- **跨平台**：Linux / macOS / Windows（含 Windows Terminal）。

## 安装

需要 Node.js **20 或更高版本**。

```bash
git clone https://github.com/julampmang/health-cli.git
cd health-cli
npm install -g .
```

然后直接运行：

```bash
health-cli start
```

不想全局安装也可以：

```bash
node bin/health-cli.js start
```

## 使用

| 命令 | 作用 |
| --- | --- |
| `health-cli start` | 同时启动喝水、久坐、护眼三类提醒 |
| `health-cli water` | 只启动喝水提醒 |
| `health-cli sit` | 只启动久坐提醒 |
| `health-cli eyes` | 只启动护眼提醒 |
| `health-cli demo` | 立即预览每种提醒的样式 |
| `health-cli stats` | 查看最近 7 天的本地统计 |
| `health-cli config` | 读取或修改配置 |
| `health-cli doctor` | 检查 Node 版本、配置目录和终端环境 |

### 启动全部提醒

```bash
health-cli start --water 30m --sit 45m --eyes 20m --quiet 12:00-13:30
```

运行中（交互终端）：

| 按键 | 作用 |
| --- | --- |
| `p` | 暂停 |
| `r` | 恢复 |
| `s` | 全部稍后提醒 |
| `q` | 退出并恢复终端 |

`Ctrl+C` 随时干净退出。

### 单类提醒 / 只提醒一次

```bash
health-cli water --once          # 适合 cron、CI 或脚本调用
health-cli eyes --interval 20m
```

### 统计

```bash
health-cli stats              # 最近 7 天
health-cli stats --today
health-cli stats --days 30 --json
```

输出示例：

```text
最近 7 天（2026-10-16 ~ 2026-10-22）

  喝水       12 次
  久坐       8 次
  护眼       14 次
  稍后提醒   2 次
  静默跳过   1 次
```

## 配置

配置只有一个 JSON 文件：

| 平台 | 路径 |
| --- | --- |
| Windows | `%APPDATA%\health-cli\config.json` |
| macOS | `~/Library/Application Support/health-cli/config.json` |
| Linux | `$XDG_CONFIG_HOME/health-cli/config.json`（默认在 `~/.config/` 下） |

可用 `HEALTH_CLI_HOME` 覆盖目录（便携使用和测试都方便）。

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

建议用命令行修改，会自动做校验：

```bash
health-cli config list
health-cli config get water
health-cli config set water 25m
health-cli config set quietHours 22:00-08:00
health-cli config reset
```

时长支持 `90s`、`30m`、`2h`，纯数字按分钟。静默时段可以跨午夜（`22:00-08:00`）。统计默认保留 90 天。

## 开发

```bash
npm test        # node:test，零依赖，无需 npm install
npm run demo
```

目录结构：

```text
bin/health-cli.js   入口
src/cli.js          参数解析与命令分发
src/scheduler.js    可注入时钟的提醒调度器
src/config.js       默认值、校验与持久化
src/stats.js        本地按日计数
src/notify.js       终端通知渲染
src/time.js         时长 / 静默时段解析
tests/              单元测试与 CLI 测试（node:test）
```

全部使用 ESM 和 Node.js 内置模块。

## 隐私

`health-cli` 不发起任何网络请求，只在上面的配置目录里保存设置和按日提醒次数。

## 许可

[MIT](LICENSE) © 2026 julampmang

---

相关项目：[dev-health](https://github.com/julampmang/dev-health) —— 更轻量的 Python 版喝水提醒。
