'use strict';

const express = require('express');
const M = require('../lib/models');
const notify = require('../lib/notify');
const { requireAuth } = require('../lib/auth');
const { backTo } = require('../lib/security');

const router = express.Router();
const PER_PAGE = 40;

/** «Ответы» — всё, что случилось с Вашими записями, фотографиями и заявками. */
router.get('/notifications', requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const rows = M.listNotifications(req.user.id, PER_PAGE + 1, (page - 1) * PER_PAGE);
  const hasMore = rows.length > PER_PAGE;

  res.render('notifications', {
    items: rows.slice(0, PER_PAGE).map((row) => Object.assign({}, row, {
      actor: row.actor_id ? { id: row.actor_id, first_name: row.first_name, last_name: row.last_name,
        avatar: row.avatar, sex: row.sex, login: row.login } : null,
      phrase: notify.phrase(row.kind, { sex: row.sex }),
    })),
    page,
    pages: hasMore ? page + 1 : page,
  });

  // Открыли страницу — значит, прочитали.
  M.markNotificationsRead(req.user.id);
});

router.post('/notifications/read', requireAuth, (req, res) => {
  M.markNotificationsRead(req.user.id);
  res.redirect(backTo(req, '/notifications'));
});

module.exports = router;
