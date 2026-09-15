'use strict';

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа',
  'сентября', 'октября', 'ноября', 'декабря'];

const now = () => Math.floor(Date.now() / 1000);

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

/** Склонение: plural(5, 'друг', 'друга', 'друзей') -> 'друзей' */
function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function pluralCount(n, one, few, many) {
  return n + ' ' + plural(n, one, few, many);
}

/** Дата в стиле старого ВКонтакте: «сегодня в 14:03», «12 мар в 9:15». */
function vkDate(ts) {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const time = d.getHours() + ':' + pad(d.getMinutes());

  if (sameDay(d, today)) return 'сегодня в ' + time;
  if (sameDay(d, yesterday)) return 'вчера в ' + time;
  if (d.getFullYear() === today.getFullYear()) {
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' в ' + time;
  }
  return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear() + ' в ' + time;
}

/** Короткая дата для списка сообщений: «14:03», «12 мар». */
function shortDate(ts) {
  const d = new Date(ts * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.getHours() + ':' + pad(d.getMinutes());
  if (d.getFullYear() === today.getFullYear()) return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
}

/** Был в сети: «сейчас на сайте», «был 12 мар в 9:15». */
function lastSeen(user) {
  if (!user.last_seen) return '';
  if (now() - user.last_seen < 300) return 'сейчас на сайте';
  return (user.sex === 'f' ? 'была ' : 'был ') + vkDate(user.last_seen);
}

/** bday хранится как «ДД.ММ.ГГГГ» или «ДД.ММ». Возвращает «12 марта 1990 (34 года)». */
function formatBday(bday) {
  if (!bday) return '';
  const parts = bday.split('.');
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (!day || !month || month < 1 || month > 12) return bday;
  let out = day + ' ' + MONTHS_FULL[month - 1];
  const year = parts[2] ? parseInt(parts[2], 10) : null;
  if (year) {
    out += ' ' + year;
    const t = new Date();
    let age = t.getFullYear() - year;
    if (t.getMonth() + 1 < month || (t.getMonth() + 1 === month && t.getDate() < day)) age--;
    if (age >= 0 && age < 130) out += ' (' + pluralCount(age, 'год', 'года', 'лет') + ')';
  }
  return out;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Логины упоминаний: @ivan. Возвращает список без повторов. */
function extractMentions(str) {
  const found = new Set();
  const re = /@([a-zA-Z0-9_.]{3,20})/g;
  let match;
  while ((match = re.exec(String(str || '')))) found.add(match[1].toLowerCase());
  return [...found];
}

/** Экранирует текст, разворачивает ссылки, упоминания, хештеги и переводы строк. */
function text2html(str) {
  let html = escapeHtml(str);

  html = html.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    const short = url.length > 60 ? url.slice(0, 57) + '...' : url;
    return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + short + '</a>';
  });

  html = html.replace(/(^|[\s(])@([a-zA-Z0-9_.]{3,20})/g,
    (all, before, login) => before + '<a href="/' + login + '">@' + login + '</a>');

  html = html.replace(/(^|[\s(])#([\wА-Яа-яЁё]{2,40})/g,
    (all, before, tag) => before + '<a href="/search?q=%23' + encodeURIComponent(tag) + '">#' + tag + '</a>');

  return html.replace(/\r?\n/g, '<br>');
}

function fullName(u) {
  return u ? u.first_name + ' ' + u.last_name : 'Удалённая страница';
}

function trim(str, max) {
  str = String(str == null ? '' : str).trim();
  return str.length > max ? str.slice(0, max) : str;
}

module.exports = {
  MONTHS_SHORT, MONTHS_FULL, now, pad, plural, pluralCount,
  vkDate, shortDate, lastSeen, formatBday, escapeHtml, text2html, extractMentions, fullName, trim,
};
