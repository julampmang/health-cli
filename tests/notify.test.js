import test from 'node:test';
import assert from 'node:assert/strict';

import { createTheme, displayWidth, padEnd } from '../src/ansi.js';
import { notify, renderNotification } from '../src/notify.js';

test('displayWidth ignores ANSI codes and counts CJK as two cells', () => {
  const theme = createTheme({ color: true, emoji: true });
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth('喝水'), 4);
  assert.equal(displayWidth('💧'), 2);
  assert.equal(displayWidth(theme.bold('喝水')), 4);
  assert.equal(displayWidth('e\u0301'), 1);
});

test('padEnd pads to visible width', () => {
  assert.equal(padEnd('水', 4), '水  ');
  assert.equal(displayWidth(padEnd('水', 4)), 4);
});

test('renderNotification includes label, message and clock', () => {
  const text = renderNotification({
    type: 'water',
    message: '该喝水啦',
    lang: 'zh',
    theme: createTheme({ color: false, emoji: false }),
    time: new Date(2026, 0, 1, 9, 5),
  });

  assert.match(text, /喝水提醒/);
  assert.match(text, /该喝水啦/);
  assert.match(text, /09:05/);
  assert.equal(text.includes('\u001b['), false);
});

test('notify writes the banner and an optional bell', () => {
  const chunks = [];
  const stream = { write: (chunk) => chunks.push(chunk) };

  notify({
    type: 'eyes',
    message: 'look away',
    lang: 'en',
    color: false,
    emoji: false,
    bell: true,
    stream,
  });

  const output = chunks.join('');
  assert.match(output, /Eye-break reminder/);
  assert.match(output, /look away/);
  assert.equal(output.endsWith('\u0007'), true);
});

test('notify supports disabling the bell', () => {
  const chunks = [];
  notify({
    type: 'sit',
    message: 'stand up',
    lang: 'en',
    color: false,
    bell: false,
    stream: { write: (chunk) => chunks.push(chunk) },
  });

  assert.equal(chunks.join('').endsWith('\u0007'), false);
});
