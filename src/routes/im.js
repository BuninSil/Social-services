'use strict';

const express = require('express');
const M = require('../lib/models');
const media = require('../lib/media');
const attach = require('../lib/attach');
const notify = require('../lib/notify');
const ws = require('../ws');
const { requireAuth } = require('../lib/auth');
const { now, trim, text2html, fullName } = require('../lib/util');
const { avatar } = require('../lib/view');
const { uploadThen, rateLimit, backTo } = require('../lib/security');

const router = express.Router();
const PER_PAGE = 60;
const MSG_ALBUM = 'Фотографии из сообщений';
const sendLimit = rateLimit('message', 60000, 60, 'Слишком много сообщений подряд. Подождите минуту.');

/** Беседа, в которой состоит текущий пользователь, либо null. */
function myConversation(req, convId) {
  const conv = M.convQ.byId.get(convId);
  if (!conv || !M.isConvMember(conv.id, req.user.id)) return null;
  return conv;
}

/** Собеседники, которым нужно разослать событие. */
const otherMembers = (convId, meId) =>
  M.convQ.memberIds.all(convId).map((r) => r.user_id).filter((id) => id !== meId);

function renderChat(req, res, conv) {
  const view = M.convView(conv, req.user.id);
  const messages = M.history(conv.id, PER_PAGE, 0);
  const lastId = messages.length ? messages[messages.length - 1].id : 0;
  if (lastId) M.convQ.setRead.run(lastId, conv.id, req.user.id);

  res.render('im_chat', {
    conv: view,
    messages,
    members: conv.kind === 'chat' ? M.convQ.members.all(conv.id) : [],
    invitable: conv.kind === 'chat'
      ? M.friendList(req.user.id).filter((f) => !M.isConvMember(conv.id, f.id))
      : [],
    peer: view.peer,
    canWrite: conv.kind !== 'dm' || (view.peer && M.canMessage(req.user.id, M.getUser(view.peer.id))),
    isAdmin: (M.convQ.member.get(conv.id, req.user.id) || {}).role === 'admin',
    error: req.query.err ? String(req.query.err).slice(0, 300) : null,
  });
}

/* ------------------------------------------------------------ список бесед */

router.get('/im', requireAuth, (req, res) => {
  res.render('im_list', { dialogs: M.conversationsOf(req.user.id) });
});

/** Поиск по своим перепискам. */
router.get('/im/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q ? M.convQ.searchMessages.all(req.user.id, '%' + q + '%', 60) : [];
  res.render('im_search', {
    q,
    results: rows.map((m) => ({
      message: M.decorateMessage(m),
      conv: M.convView(M.convQ.byId.get(m.conv_id), req.user.id),
    })),
  });
});

/* --------------------------------------------------------- создание беседы */

router.get('/im/new', requireAuth, (req, res) => {
  res.render('chat_new', { friends: M.friendList(req.user.id), error: null });
});

router.post('/im/new', requireAuth, (req, res) => {
  const title = trim(req.body.title, 80);
  const raw = Array.isArray(req.body.members) ? req.body.members : [req.body.members];
  const ids = raw.map((v) => parseInt(v, 10)).filter(Boolean)
    .filter((id) => id !== req.user.id && M.areFriends(req.user.id, id) && !M.blockedEither(req.user.id, id));

  if (!title || ids.length < 1) {
    return res.render('chat_new', {
      friends: M.friendList(req.user.id),
      error: 'Укажите название беседы и отметьте хотя бы одного друга.',
    });
  }

  const conv = M.createChat(req.user.id, title, ids.slice(0, 50));
  for (const id of ids) {
    notify.push({
      userId: id, kind: 'chat_invite', actorId: req.user.id,
      targetType: 'conv', targetId: conv.id, url: '/im/c' + conv.id, preview: title,
    });
  }
  res.redirect('/im/c' + conv.id);
});

/* ------------------------------------------------------------ сама беседа */

/** Личный диалог с пользователем: заводим при первом открытии. */
router.get(/^\/im\/(\d+)$/, requireAuth, (req, res, next) => {
  const peer = M.getUser(Number(req.params[0]));
  if (!peer || peer.id === req.user.id) return next();
  if (M.blockedEither(req.user.id, peer.id)) {
    return res.status(403).render('error', { code: 403, message: 'Переписка с этим пользователем недоступна.' });
  }
  if (!M.canMessage(req.user.id, peer)) {
    return res.status(403).render('error', {
      code: 403, message: 'Этот пользователь принимает сообщения только от друзей.',
    });
  }
  res.redirect('/im/c' + M.dmWith(req.user.id, peer.id).id);
});

router.get(/^\/im\/c(\d+)$/, requireAuth, (req, res, next) => {
  const conv = myConversation(req, Number(req.params[0]));
  if (!conv) return next();
  renderChat(req, res, conv);
});

/** Отправка сообщения: текст и любые файлы. */
router.post(/^\/im\/c(\d+)$/, requireAuth, sendLimit,
  uploadThen(media.uploadAny.array('files', 10)), async (req, res, next) => {
    const conv = myConversation(req, Number(req.params[0]));
    if (!conv) return next();

    const view = M.convView(conv, req.user.id);
    if (conv.kind === 'dm') {
      if (!view.peer) return res.redirect('/im');
      if (M.blockedEither(req.user.id, view.peer.id)) {
        return res.status(403).render('error', { code: 403, message: 'Переписка недоступна.' });
      }
      if (!M.canMessage(req.user.id, M.getUser(view.peer.id))) {
        return res.status(403).render('error', {
          code: 403, message: 'Этот пользователь принимает сообщения только от друзей.',
        });
      }
    }

    const text = trim(req.body.text, 4000);
    const { items, errors } = await attach.fromFiles(req.user.id, req.files, MSG_ALBUM);
    if (!text && !items.length) {
      return res.redirect('/im/c' + conv.id + (errors.length ? '?err=' + encodeURIComponent(errors.join(' ')) : ''));
    }

    const messageId = M.convQ.send.run(conv.id, req.user.id, text, now()).lastInsertRowid;
    M.saveAttachments('message', messageId, items);
    M.convQ.setRead.run(messageId, conv.id, req.user.id);

    broadcastMessage(conv, messageId, req.user);

    res.redirect('/im/c' + conv.id + (errors.length ? '?err=' + encodeURIComponent(errors.join(' ')) : ''));
  });

/** Голосовое сообщение: запись с микрофона приходит одним файлом. */
router.post(/^\/im\/c(\d+)\/voice$/, requireAuth, sendLimit,
  uploadThen(media.uploadAny.single('voice')), (req, res) => {
    const conv = myConversation(req, Number(req.params[0]));
    if (!conv) return res.status(404).json({ error: 'not found' });
    if (!req.file) return res.status(400).json({ error: 'no file' });

    const type = media.detect(req.file.buffer, req.file.mimetype);
    if (!type || (type.kind !== 'audio' && type.kind !== 'video')) {
      return res.status(400).json({ error: 'bad format' });
    }
    if (req.file.buffer.length > media.LIMITS.voice) {
      return res.status(413).json({ error: 'too big' });
    }

    const saved = media.saveVoice(req.file.buffer, { ext: type.ext });
    const duration = saved.duration || Math.min(600, Math.max(0, parseInt(req.body.duration, 10) || 0));

    const messageId = M.convQ.send.run(conv.id, req.user.id, '', now()).lastInsertRowid;
    M.saveAttachments('message', messageId, [{ kind: 'voice', file: saved.file, meta: { duration } }]);
    M.convQ.setRead.run(messageId, conv.id, req.user.id);

    broadcastMessage(conv, messageId, req.user);
    res.json({ ok: true, id: messageId });
  });

/** Разослать новое сообщение остальным участникам беседы. */
function broadcastMessage(conv, messageId, author) {
  const message = M.decorateMessage(M.convQ.message.get(messageId));
  const recipients = otherMembers(conv.id, author.id);
  const title = conv.kind === 'chat' ? conv.title : fullName(author);

  for (const userId of recipients) {
    if (conv.kind === 'dm' && M.blockedEither(userId, author.id)) continue;
    ws.send(userId, {
      kind: 'message',
      conv_id: conv.id,
      conv_kind: conv.kind,
      conv_title: title,
      id: message.id,
      from_id: author.id,
      author: fullName(author),
      avatar: avatar(author, 'thumb'),
      text: message.text,
      html: text2html(message.text),
      attachments: message.attachments.length,
      unread: M.unreadDialogs(userId),
    });
  }
}

/** Отметка о прочтении — из открытой вкладки. */
router.post(/^\/im\/c(\d+)\/read$/, requireAuth, express.json(), (req, res) => {
  const conv = myConversation(req, Number(req.params[0]));
  if (!conv) return res.status(404).json({ error: 'not found' });

  const last = M.convQ.lastMessage.get(conv.id);
  if (last) M.convQ.setRead.run(last.id, conv.id, req.user.id);
  ws.sendMany(otherMembers(conv.id, req.user.id),
    { kind: 'read', conv_id: conv.id, user_id: req.user.id, up_to: last ? last.id : 0 });

  res.json({ ok: true, unread: M.unreadDialogs(req.user.id) });
});

/* ----------------------------------------------- управление групповой беседой */

router.post(/^\/im\/c(\d+)\/invite$/, requireAuth, (req, res, next) => {
  const conv = myConversation(req, Number(req.params[0]));
  if (!conv || conv.kind !== 'chat') return next();

  const id = parseInt(req.body.user_id, 10);
  if (id && M.areFriends(req.user.id, id) && !M.blockedEither(req.user.id, id)) {
    M.convQ.addMember.run(conv.id, id, 'member', now());
    notify.push({
      userId: id, kind: 'chat_invite', actorId: req.user.id,
      targetType: 'conv', targetId: conv.id, url: '/im/c' + conv.id, preview: conv.title,
    });
  }
  res.redirect('/im/c' + conv.id);
});

router.post(/^\/im\/c(\d+)\/leave$/, requireAuth, (req, res, next) => {
  const conv = myConversation(req, Number(req.params[0]));
  if (!conv || conv.kind !== 'chat') return next();
  M.convQ.dropMember.run(conv.id, req.user.id);
  res.redirect('/im');
});

router.post(/^\/im\/c(\d+)\/title$/, requireAuth, (req, res, next) => {
  const conv = myConversation(req, Number(req.params[0]));
  if (!conv || conv.kind !== 'chat') return next();
  const member = M.convQ.member.get(conv.id, req.user.id);
  const title = trim(req.body.title, 80);
  if (member && member.role === 'admin' && title) {
    M.db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, conv.id);
  }
  res.redirect('/im/c' + conv.id);
});

/* ------------------------------------------------- правка и удаление сообщений */

router.post(/^\/message\/(\d+)\/edit$/, requireAuth, (req, res) => {
  const message = M.convQ.message.get(Number(req.params[0]));
  const back = backTo(req, '/im');
  if (message && message.from_id === req.user.id && !message.deleted_at) {
    const text = trim(req.body.text, 4000);
    if (text) {
      M.convQ.editMessage.run(text, now(), message.id);
      ws.sendMany(otherMembers(message.conv_id, req.user.id),
        { kind: 'message_edited', conv_id: message.conv_id, id: message.id, html: text2html(text) });
    }
  }
  res.redirect(back);
});

router.post(/^\/message\/(\d+)\/delete$/, requireAuth, (req, res) => {
  const message = M.convQ.message.get(Number(req.params[0]));
  const back = backTo(req, '/im');
  if (message && message.from_id === req.user.id) {
    M.convQ.deleteMessage.run(now(), message.id);
    ws.sendMany(otherMembers(message.conv_id, req.user.id),
      { kind: 'message_deleted', conv_id: message.conv_id, id: message.id });
  }
  res.redirect(back);
});

/* ------------------------------------------------------------ «печатает...» */

ws.on('typing', (userId, data) => {
  const convId = parseInt(data.conv_id, 10);
  if (!convId || !M.isConvMember(convId, userId)) return;
  const user = M.users.brief.get(userId);
  if (!user) return;
  ws.sendMany(otherMembers(convId, userId),
    { kind: 'typing', conv_id: convId, user_id: userId, name: user.first_name });
});

module.exports = router;
