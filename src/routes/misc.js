'use strict';

const express = require('express');
const db = require('../db');
const M = require('../lib/models');
const { requireAuth } = require('../lib/auth');
const theme = require('../lib/theme');
const { backTo } = require('../lib/security');

const router = express.Router();

/** Поиск по подстроке без учёта регистра — вместо LIKE. */
const matches = (text, needle) =>
  String(text || '').toLowerCase().includes(String(needle || '').toLowerCase());
const PER_PAGE = 20;

router.get('/feed', requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const posts = M.feedPosts(req.user.id, PER_PAGE + 1, (page - 1) * PER_PAGE);
  const hasMore = posts.length > PER_PAGE;

  res.render('feed', {
    posts: posts.slice(0, PER_PAGE),
    page,
    pages: hasMore ? page + 1 : page,
    uploadError: req.query.err ? String(req.query.err).slice(0, 300) : null,
  });
});

/** Поиск: люди, записи и группы — как три вкладки на одной странице. */
router.get('/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  const tab = ['people', 'posts', 'groups'].includes(req.query.tab) ? req.query.tab : 'people';

  const people = tab === 'people'
    ? M.searchUsers(q, 100).filter((p) => p.id !== req.user.id && !M.blockedEither(req.user.id, p.id))
    : [];
  const statuses = {};
  for (const p of people) statuses[p.id] = M.friendStatus(req.user.id, p.id);

  const groups = tab === 'groups'
    ? db.groups
      .filter((g) => matches(g.name, q) || matches(g.description, q))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'))
      .slice(0, 100)
      .map((g) => Object.assign({}, g, { members: M.groupMembersCount(g.id) }))
    : [];

  res.render('search', {
    q,
    tab,
    users: people,
    statuses,
    posts: tab === 'posts' && q ? M.searchPosts(req.user.id, q, 50) : [],
    groups,
    total: db.users.count(),
  });
});

router.get('/help', (req, res) => res.render('help', {}));

/** Кнопка в шапке: светлая → тёмная → неоновая и снова по кругу. */
router.post('/theme', (req, res) => {
  const current = (req.user && req.user.theme) || (req.session && req.session.theme) || 'vo';
  const next = theme.isTheme(req.body.theme) ? req.body.theme : theme.nextTheme(current);

  req.session.theme = next;
  if (req.user) db.users.update(req.user.id, { theme: next });

  res.redirect(backTo(req, '/'));
});

/**
 * Короткое имя страницы: /ivan ведёт на профиль, как в ВК.
 * Стоит последним — сюда доходит только то, что не совпало с обычными адресами.
 */
router.get(/^\/([a-zA-Z0-9_.]{3,20})$/, requireAuth, (req, res, next) => {
  const user = M.userByLogin(req.params[0]);
  if (!user) return next();
  res.redirect('/id' + user.id);
});

module.exports = router;
