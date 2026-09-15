'use strict';

const { escapeHtml, pluralCount } = require('./util');
const media = require('./media');

/** Путь к уменьшенной копии: photos/abc.jpg -> photos/thumb_abc.jpg */
function thumbOf(file) {
  return file.replace(/([^/]+)$/, 'thumb_$1');
}

/** size: 'full' | 'thumb'. Без своей фотографии отдаём серый силуэт, как раньше. */
function avatar(user, size) {
  if (!user || !user.avatar) return '/img/camera_200.svg';
  return '/uploads/' + (size === 'full' ? user.avatar : thumbOf(user.avatar));
}

function gavatar(group) {
  if (!group || !group.avatar) return '/img/group_200.svg';
  return '/uploads/' + group.avatar;
}

/** Картинка беседы: у группового чата своя, у личного — собеседника. */
function convAvatar(conv) {
  if (conv.kind === 'dm') return avatar(conv.peer, 'thumb');
  if (conv.avatar) return '/uploads/' + conv.avatar;
  return '/img/chat_200.svg';
}

/**
 * Действие, меняющее состояние, — это всегда форма с токеном, а не ссылка:
 * по ссылке его мог бы выполнить чужой сайт от имени вошедшего человека.
 * Выглядит при этом как обычная ссылка, вёрстка не страдает.
 */
function act(csrf, url, label, opts) {
  const options = opts || {};
  const confirm = options.confirm
    ? ' data-confirm="' + escapeHtml(options.confirm) + '"'
    : '';
  const back = options.back
    ? '<input type="hidden" name="back" value="' + escapeHtml(options.back) + '">'
    : '';
  const cls = options.cls ? ' ' + escapeHtml(options.cls) : '';
  const title = options.title ? ' title="' + escapeHtml(options.title) + '"' : '';
  return '<form class="act" method="post" action="' + escapeHtml(url) + '">' +
    '<input type="hidden" name="_csrf" value="' + escapeHtml(csrf) + '">' + back +
    '<button type="submit" class="link_btn' + cls + '"' + confirm + title + '>' +
    escapeHtml(label) + '</button></form>';
}

/** Подпись под вложением: «3:41», «1.2 МБ». */
const duration = (seconds) => media.humanDuration(seconds);
const size = (bytes) => media.humanSize(bytes);

/** «5 записей» и прочие счётчики — часто нужны в шаблонах. */
const count = pluralCount;

module.exports = { thumbOf, avatar, gavatar, convAvatar, act, duration, size, count };
