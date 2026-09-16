'use strict';

/** Темы, которые переключает кнопка в шапке — по кругу. */
const CYCLE = ['vo', 'dark', 'neon'];

/** Все доступные оформления. Первые три — в кнопке, остальные выбираются в настройках. */
const THEMES = {
  vo: { title: 'Светлая', hint: 'оригинальный старый ВК' },
  dark: { title: 'Тёмная', hint: 'тот же вид в тёмных тонах' },
  neon: { title: 'Неоновая', hint: 'тёмная со свечением и своими цветами' },
  fresh: { title: 'Обновлённая', hint: 'светлая с современной подачей' },
  modern: { title: 'Современная', hint: 'карточки и колонка пошире' },
};

const NEON_DEFAULTS = { c1: '#2fe0ff', c2: '#ff4ecd', bg: '#070b16' };

/** Пресеты неона — чтобы не подбирать цвета вручную. */
const NEON_PRESETS = [
  { id: 'cyber', title: 'Киберпанк', c1: '#2fe0ff', c2: '#ff4ecd', bg: '#070b16' },
  { id: 'acid', title: 'Кислота', c1: '#7cff4e', c2: '#e6ff3d', bg: '#08120a' },
  { id: 'sunset', title: 'Закат', c1: '#ff9d3d', c2: '#ff3d6e', bg: '#160a0c' },
  { id: 'ice', title: 'Лёд', c1: '#8ecbff', c2: '#c48bff', bg: '#0a0f1c' },
  { id: 'matrix', title: 'Матрица', c1: '#39ff88', c2: '#19c26a', bg: '#040d08' },
];

const HEX = /^#[0-9a-f]{6}$/i;

const isTheme = (name) => Object.prototype.hasOwnProperty.call(THEMES, name);

/** Цвет из формы принимаем только строго шестизначным hex. */
function color(value, fallback) {
  const raw = String(value || '').trim().toLowerCase();
  return HEX.test(raw) ? raw : fallback;
}

/** Файл стилей для темы. */
const stylesheet = (name) => (name === 'vo' ? '/css/vo.css' : '/css/vo-' + name + '.css');

/** Следующая тема по кругу: светлая → тёмная → неоновая → светлая. */
function nextTheme(current) {
  const index = CYCLE.indexOf(current);
  return index === -1 ? CYCLE[0] : CYCLE[(index + 1) % CYCLE.length];
}

/** Значок для кнопки переключения. */
const ICONS = { vo: '☀', dark: '☾', neon: '✦', fresh: '☀', modern: '☀' };

function neonColors(user) {
  if (!user) return Object.assign({}, NEON_DEFAULTS);
  return {
    c1: color(user.neon_c1, NEON_DEFAULTS.c1),
    c2: color(user.neon_c2, NEON_DEFAULTS.c2),
    bg: color(user.neon_bg, NEON_DEFAULTS.bg),
  };
}

module.exports = {
  CYCLE, THEMES, ICONS, NEON_DEFAULTS, NEON_PRESETS,
  isTheme, color, stylesheet, nextTheme, neonColors,
};
