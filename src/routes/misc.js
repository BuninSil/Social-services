'use strict';

const express = require('express');
const db = require('../db');
const M = require('../lib/models');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
const PER_PAGE = 20;

router.get('/feed', requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const posts = M.feedPosts(req.user.id, PER_PAGE + 1, (page - 1) * PER_PAGE);
  const hasMore = posts.length > PER_PAGE;
  res.render('feed', {
    posts: posts.slice(0, PER_PAGE),
    page,
    pages: hasMore ? page + 1 : page,
  });
});

router.get('/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  const users = M.searchUsers(q, 100).filter((p) => p.id !== req.user.id);
  const statuses = {};
  for (const p of users) statuses[p.id] = M.friendStatus(req.user.id, p.id);
  res.render('search', {
    q, users, statuses,
    total: db.prepare('SELECT COUNT(*) n FROM users').get().n,
  });
});

router.get('/help', (req, res) => res.render('help', {}));

module.exports = router;
