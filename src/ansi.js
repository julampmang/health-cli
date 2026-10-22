/**
 * Minimal ANSI helpers with CJK/emoji width awareness.
 */

const ANSI_RE = /\u001b\[[0-9;]*m/g;

const CODES = {
  reset: 0,
  bold: 1,
  dim: 2,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  gray: 90,
};

const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0xfe0e, 0xfe0f]);

const WIDE_RANGES = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff],
];

/**
 * @param {number} codePoint
 * @returns {number} visual width in terminal cells
 */
function codePointWidth(codePoint) {
  if (codePoint === 0) return 0;
  if (ZERO_WIDTH.has(codePoint)) return 0;
  if (codePoint >= 0x0300 && codePoint <= 0x036f) return 0;
  if (codePoint < 0x20) return 0;

  for (const [start, end] of WIDE_RANGES) {
    if (codePoint >= start && codePoint <= end) return 2;
  }
  return 1;
}

/**
 * Visible width of a string, ignoring ANSI SGR sequences.
 * @param {string} text
 * @returns {number}
 */
export function displayWidth(text) {
  const plain = String(text).replace(ANSI_RE, '');
  let width = 0;
  for (const char of plain) {
    width += codePointWidth(char.codePointAt(0));
  }
  return width;
}

/**
 * Pad a string to a visible width.
 * @param {string} text
 * @param {number} width
 * @returns {string}
 */
export function padEnd(text, width) {
  const missing = Math.max(0, width - displayWidth(text));
  return text + ' '.repeat(missing);
}

/**
 * @param {NodeJS.WriteStream} [stream]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function supportsColor(stream = process.stdout, env = process.env) {
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') return true;
  return Boolean(stream && stream.isTTY);
}

const SYMBOLS = {
  water: { emoji: '💧', ascii: '[W]' },
  sit: { emoji: '🧘', ascii: '[S]' },
  eyes: { emoji: '👁️', ascii: '[E]' },
};

/**
 * @param {{color?: boolean, emoji?: boolean}} [options]
 */
export function createTheme({ color = false, emoji = true } = {}) {
  /**
   * @param {string} text
   * @param {...keyof typeof CODES} names
   */
  const paint = (text, ...names) => {
    if (!color || names.length === 0) return text;
    const prefix = names.map((name) => `\u001b[${CODES[name]}m`).join('');
    return `${prefix}${text}\u001b[${CODES.reset}m`;
  };

  return {
    color,
    emoji,
    paint,
    bold: (text) => paint(text, 'bold'),
    dim: (text) => paint(text, 'dim'),
    gray: (text) => paint(text, 'gray'),
    cyan: (text) => paint(text, 'cyan'),
    green: (text) => paint(text, 'green'),
    yellow: (text) => paint(text, 'yellow'),
    red: (text) => paint(text, 'red'),
    /** @param {string} type */
    symbol: (type) => (emoji ? SYMBOLS[type]?.emoji ?? '•' : SYMBOLS[type]?.ascii ?? '•'),
  };
}

/**
 * Render a rounded box around one or more lines.
 * @param {string[]} lines
 * @param {{theme: ReturnType<typeof createTheme>, padding?: number}} options
 * @returns {string}
 */
export function box(lines, { theme, padding = 1 } = {}) {
  const width = Math.max(0, ...lines.map((line) => displayWidth(line)));
  const inner = width + padding * 2;
  const horizontal = '─'.repeat(inner);

  const top = `╭${horizontal}╮`;
  const bottom = `╰${horizontal}╯`;
  const body = lines.map(
    (line) => `│${' '.repeat(padding)}${padEnd(line, width)}${' '.repeat(padding)}│`,
  );

  const rendered = [top, ...body, bottom];
  return theme ? theme.cyan(rendered.join('\n')) : rendered.join('\n');
}
