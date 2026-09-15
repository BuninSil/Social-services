'use strict';

const M = require('./models');
const ws = require('../ws');
const { fullName } = require('./util');

const TEXTS = {
  like_post: 'оценил(а) Вашу запись',
  like_photo: 'оценил(а) Вашу фотографию',
  like_video: 'оценил(а) Вашу видеозапись',
  comment_post: 'прокомментировал(а) Вашу запись',
  comment_photo: 'прокомментировал(а) Вашу фотографию',
  comment_video: 'прокомментировал(а) Вашу видеозапись',
  reply_comment: 'ответил(а) на Ваш комментарий',
  wall_post: 'написал(а) на Вашей стене',
  mention: 'упомянул(а) Вас',
  repost: 'поделился(ась) Вашей записью',
  friend_request: 'хочет добавить Вас в друзья',
  friend_accept: 'принял(а) Вашу заявку в друзья',
  chat_invite: 'добавил(а) Вас в беседу',
};

/** Текст уведомления с учётом пола: «оценил» / «оценила». */
function phrase(kind, actor) {
  const base = TEXTS[kind] || 'сделал(а) что-то';
  if (!actor) return base.replace(/\(а\)|\(ась\)/g, '');
  return actor.sex === 'f'
    ? base.replace(/\(а\)/g, 'а').replace(/\(ась\)/g, 'ась')
    : base.replace(/\(а\)/g, '').replace(/\(ась\)/g, 'ся');
}

/**
 * Записывает уведомление и тут же толкает его в открытые вкладки.
 * Себе и заблокированным ничего не уходит — это решает модель.
 */
function push(opts) {
  const saved = M.notify(opts);
  if (!saved) return null;

  const actor = opts.actorId ? M.users.brief.get(opts.actorId) : null;
  ws.send(opts.userId, {
    kind: 'notification',
    id: saved.id,
    url: opts.url || '',
    text: (actor ? fullName(actor) + ' ' : '') + phrase(opts.kind, actor),
    count: M.notifQ.unread.get(opts.userId).n,
  });
  return saved;
}

/** Упоминания @login в тексте: уведомляем тех, кого позвали. */
function pushMentions(text, actorId, url, preview) {
  const logins = require('./util').extractMentions(text);
  for (const login of logins.slice(0, 10)) {
    const user = M.users.byLogin.get(login);
    if (user && user.id !== actorId) {
      push({
        userId: user.id,
        kind: 'mention',
        actorId,
        url,
        preview,
        unique: false,
      });
    }
  }
}

module.exports = { push, pushMentions, phrase, TEXTS };
