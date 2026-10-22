/**
 * Localized reminder copy.
 */

export const TYPE_LABELS = {
  zh: {
    water: '喝水提醒',
    sit: '久坐提醒',
    eyes: '护眼提醒',
  },
  en: {
    water: 'Hydration reminder',
    sit: 'Stand-up reminder',
    eyes: 'Eye-break reminder',
  },
};

export const MESSAGES = {
  zh: {
    water: [
      '该喝水啦，给身体补点「冷却液」～',
      '喝杯水吧，你的身体会感谢你的。',
      '别等口渴才喝，现在就去倒一杯。',
      '起来走走，顺便把水杯加满。',
      '代码要 commit，身体也要补水。',
    ],
    sit: [
      '坐了很久了，站起来活动 2 分钟吧。',
      '离开椅子，接杯水或走两圈。',
      '久坐是慢性伤害，起来伸个懒腰。',
      '站起来，做 10 个深蹲再回来。',
      '换个姿势：肩膀后展，下巴微收。',
    ],
    eyes: [
      '看看 6 米外的远处，放松 20 秒。',
      '眨眼 20 次，让眼睛重新湿润。',
      '闭眼休息一会儿，别再死盯屏幕了。',
      '看向窗外，让睫状肌松一松。',
      '揉揉太阳穴，远眺 20 秒。',
    ],
  },
  en: {
    water: [
      'Time to drink some water — refill your body coolant.',
      'Have a glass of water; future you will thank you.',
      'Do not wait until you are thirsty. Grab a drink now.',
      'Stand up, stretch, and refill your bottle.',
      'Commit your code, hydrate your body.',
    ],
    sit: [
      'You have been sitting a while — stand up for 2 minutes.',
      'Leave the chair, grab water, walk a lap.',
      'Stand up and stretch before your back files a bug.',
      'Do 10 squats and come back sharper.',
      'Reset your posture: shoulders back, chin tucked.',
    ],
    eyes: [
      'Look 20 feet away for 20 seconds.',
      'Blink 20 times and let your eyes rehydrate.',
      'Close your eyes for a moment — screens can wait.',
      'Look out the window and relax your focus.',
      'Eye break: 20 seconds of distance vision.',
    ],
  },
};

/**
 * Resolve `auto` to a concrete language using environment hints.
 * @param {string} lang
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'zh'|'en'}
 */
export function resolveLang(lang, env = process.env) {
  if (lang === 'zh' || lang === 'en') return lang;

  const hint = env.HEALTH_CLI_LANG || env.LC_ALL || env.LC_MESSAGES || env.LANG || '';
  return String(hint).toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/**
 * Pick a random message for a reminder type.
 * @param {'zh'|'en'} lang
 * @param {'water'|'sit'|'eyes'} type
 * @param {() => number} [random]
 * @returns {string}
 */
export function pickMessage(lang, type, random = Math.random) {
  const pool = MESSAGES[lang]?.[type] ?? MESSAGES.en.water;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[Math.max(0, index)];
}
