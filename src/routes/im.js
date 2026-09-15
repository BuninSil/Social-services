'use strict';

const express = require('express');
const db = require('../db');
const M = require('../lib/models');
const { requireAuth } = require('../lib/auth');
const { now, trim, text2html, fullName } = require('../lib/util');
const { avatar } = require('../lib/view');
const ws = require('../ws');

const router = express.Router();

const q = {
  dialogs: db.prepare(`
    SELECT m.* FROM messages m
    JOIN (
      SELECT CASE WHEN from_id = @me THEN to_id ELSE from_id END AS peer, MAX(id) AS mid
      FROM messages WHERE from_id = @me OR to_id = @me
      GROUP BY peer
    ) t ON t.mid = m.id
    ORDER BY m.id DESC
  `),
  unreadFrom: db.prepare('SELECT COUNT(*) n FROM messages WHERE to_id = ? AND from_id = ? AND is_read = 0'),
  history: db.prepare(`
    SELECT * FROM messages
    WHERE (from_id = @me AND to_id = @peer) OR (from_id = @peer AND to_id = @me)
    ORDER BY id DESC LIMIT 100
  `),
  markRead: db.prepare('UPDATE messages SET is_read = 1 WHERE to_id = ? AND from_id = ? AND is_read = 0'),
  insert: db.prepare('INSERT INTO messages (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)'),
};

router.get('/im', requireAuth, (req, res) => {
  const dialogs = q.dialogs.all({ me: req.user.id }).map((m) => {
    const peerId = m.from_id === req.user.id ? m.to_id : m.from_id;
    return {
      peer: M.users.brief.get(peerId) || { id: peerId, first_name: 'Удалённая', last_name: 'страница' },
      preview: trim(m.text.replace(/\s+/g, ' '), 90) || '(пусто)',
      outgoing: m.from_id === req.user.id,
      created_at: m.created_at,
      unread: q.unreadFrom.get(req.user.id, peerId).n,
    };
  });
  res.render('im_list', { dialogs });
});

router.get(/^\/im\/(\d+)$/, requireAuth, (req, res, next) => {
  const peer = M.getUser(Number(req.params[0]));
  if (!peer || peer.id === req.user.id) return next();
  q.markRead.run(req.user.id, peer.id);
  const messages = q.history.all({ me: req.user.id, peer: peer.id }).reverse();
  res.render('im_chat', { peer, messages });
});

router.post(/^\/im\/(\d+)$/, requireAuth, (req, res, next) => {
  const peer = M.getUser(Number(req.params[0]));
  if (!peer || peer.id === req.user.id) return next();
  const text = trim(req.body.text, 4000);
  if (text) {
    q.insert.run(req.user.id, peer.id, text, now());
    ws.send(peer.id, {
      kind: 'message',
      from_id: req.user.id,
      author: fullName(req.user),
      avatar: avatar(req.user, 'thumb'),
      text,
      html: text2html(text),
    });
  }
  res.redirect('/im/' + peer.id);
});

/** Собеседник дочитал переписку в открытой вкладке. */
router.post(/^\/im\/(\d+)\/read$/, requireAuth, express.json(), (req, res) => {
  q.markRead.run(req.user.id, Number(req.params[0]));
  res.json({ ok: true });
});

module.exports = router;
