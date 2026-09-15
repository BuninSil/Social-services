'use strict';

const express = require('express');
const db = require('../db');
const M = require('../lib/models');
const { requireAuth } = require('../lib/auth');
const { now, trim } = require('../lib/util');

const router = express.Router();

/** «Мне нравится» дёргается из вкладки, отвечаем json. */
router.post('/like', requireAuth, express.json(), (req, res) => {
  const type = req.body.type === 'photo' ? 'photo' : 'post';
  const id = parseInt(req.body.id, 10);
  const exists = type === 'post'
    ? db.prepare('SELECT 1 x FROM posts WHERE id = ?').get(id)
    : db.prepare('SELECT 1 x FROM photos WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'not found' });
  res.json(M.toggleLike(type, id, req.user.id));
});

router.post('/comment', requireAuth, (req, res) => {
  const type = req.query.type === 'photo' ? 'photo' : 'post';
  const id = parseInt(req.query.id, 10);
  const text = trim(req.body.text, 2000);
  const back = String(req.body.back || '');
  const fallback = type === 'post' ? '/feed' : '/photos';

  const target = type === 'post'
    ? db.prepare('SELECT * FROM posts WHERE id = ?').get(id)
    : db.prepare('SELECT * FROM photos WHERE id = ?').get(id);

  if (target && text) {
    M.commentsQ.insert.run(type, id, req.user.id, text, now());
  }
  res.redirect(back.startsWith('/') && !back.startsWith('//') ? back : fallback);
});

router.get(/^\/comment\/(\d+)\/delete$/, requireAuth, (req, res) => {
  const comment = M.commentsQ.byId.get(Number(req.params[0]));
  if (comment) {
    let allowed = comment.author_id === req.user.id;
    if (!allowed && comment.target_type === 'post') {
      const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(comment.target_id);
      allowed = !!post && post.owner_type === 'user' && post.owner_id === req.user.id;
    }
    if (!allowed && comment.target_type === 'photo') {
      const photo = M.photosQ.byId.get(comment.target_id);
      allowed = !!photo && photo.owner_id === req.user.id;
    }
    if (allowed) M.commentsQ.del.run(comment.id);
  }
  res.redirect(req.get('referer') || '/feed');
});

router.get(/^\/post\/(\d+)\/delete$/, requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params[0]));
  if (post) {
    let allowed = post.author_id === req.user.id ||
      (post.owner_type === 'user' && post.owner_id === req.user.id);
    if (!allowed && post.owner_type === 'group') {
      const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
        .get(post.owner_id, req.user.id);
      allowed = !!member && member.role === 'admin';
    }
    if (allowed) {
      db.prepare("DELETE FROM comments WHERE target_type = 'post' AND target_id = ?").run(post.id);
      db.prepare("DELETE FROM likes WHERE target_type = 'post' AND target_id = ?").run(post.id);
      db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
    }
  }
  res.redirect(req.get('referer') || '/feed');
});

module.exports = router;
