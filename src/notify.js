/**
 * Terminal notification rendering and delivery.
 */

import { box, createTheme, supportsColor } from './ansi.js';
import { TYPE_LABELS } from './messages.js';
import { toClock } from './time.js';

/**
 * @param {{
 *   type: string,
 *   message: string,
 *   lang?: 'zh'|'en',
 *   theme?: ReturnType<typeof createTheme>,
 *   time?: Date,
 * }} options
 * @returns {string}
 */
export function renderNotification({
  type,
  message,
  lang = 'zh',
  theme = createTheme(),
  time = new Date(),
}) {
  const label = TYPE_LABELS[lang]?.[type] ?? type;
  const clock = toClock(time.getHours() * 60 + time.getMinutes());
  const title = `${theme.symbol(type)} ${theme.bold(label)}  ${theme.gray(clock)}`;

  return box([title, message], { theme, padding: 1 });
}

/**
 * Print a notification to the given stream.
 * @param {{
 *   type: string,
 *   message: string,
 *   lang?: 'zh'|'en',
 *   emoji?: boolean,
 *   color?: boolean,
 *   bell?: boolean,
 *   stream?: NodeJS.WriteStream,
 *   time?: Date,
 * }} options
 * @returns {boolean}
 */
export function notify({
  type,
  message,
  lang = 'zh',
  emoji = true,
  color,
  bell = true,
  stream = process.stdout,
  time = new Date(),
}) {
  const theme = createTheme({
    color: color ?? supportsColor(stream),
    emoji,
  });

  stream.write(`${renderNotification({ type, message, lang, theme, time })}\n`);
  if (bell) stream.write('\u0007');
  return true;
}
