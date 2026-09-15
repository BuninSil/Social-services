'use strict';

const express = require('express');
const M = require('../lib/models');
const notify = require('../lib/notify');
const { requireAuth } = require('../lib/auth');
const { backTo } = require('../lib/security');

const router = express.Router();

function renderFriends(req, res, owner, tab) {
  const isMe = owner.id === req.user.id;
  if (!isMe && !M.canSee(req.user.id, owner, 'friends')) {
    return res.status(403).render('error', { code: 403, message: 'Список друзей доступен только друзьям.' });
  }
  res.render('friends', {
    owner,
    tab,
    friends: M.friendList(owner.id),
    incoming: isMe ? M.friendsQ.incoming.all(req.user.id) : [],
    outgoing: isMe ? M.friendsQ.outgoing.all(req.user.id) : [],
  });
}

router.get('/friends', requireAuth, (req, res) => renderFriends(req, res, req.user, 'all'));
router.get('/friends/requests', requireAuth, (req, res) => renderFriends(req, res, req.user, 'requests'));
router.get('/friends/out', requireAuth, (req, res) => renderFriends(req, res, req.user, 'out'));

router.get(/^\/friends\/(\d+)$/, requireAuth, (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  if (!owner) return next();
  renderFriends(req, res, owner, 'all');
});

router.post(/^\/friends\/add\/(\d+)$/, requireAuth, (req, res, next) => {
  const other = M.getUser(Number(req.params[0]));
  if (!other || other.id === req.user.id) return next();
  const back = backTo(req, '/id' + other.id);

  if (M.blockedEither(req.user.id, other.id)) {
    return res.status(403).render('error', { code: 403, message: 'Это невозможно: один из вас в чёрном списке.' });
  }

  const result = M.addFriend(req.user.id, other.id);
  if (result === 'out') {
    notify.push({
      userId: other.id, kind: 'friend_request', actorId: req.user.id,
      targetType: 'user', targetId: req.user.id, url: '/friends/requests', unique: true,
    });
  } else {
    M.dropNotification(req.user.id, 'friend_request', other.id, 'user', other.id);
    notify.push({
      userId: other.id, kind: 'friend_accept', actorId: req.user.id,
      targetType: 'user', targetId: req.user.id, url: '/id' + req.user.id, unique: true,
    });
  }
  res.redirect(back);
});

router.post(/^\/friends\/remove\/(\d+)$/, requireAuth, (req, res, next) => {
  const other = M.getUser(Number(req.params[0]));
  if (!other) return next();
  M.removeFriend(req.user.id, other.id);
  M.dropNotification(req.user.id, 'friend_request', other.id, 'user', other.id);
  M.dropNotification(other.id, 'friend_request', req.user.id, 'user', req.user.id);
  res.redirect(backTo(req, '/id' + other.id));
});

/* -------------------------------------------------------------- чёрный список */

router.post(/^\/block\/(\d+)$/, requireAuth, (req, res, next) => {
  const other = M.getUser(Number(req.params[0]));
  if (!other || other.id === req.user.id) return next();
  M.blockUser(req.user.id, other.id);
  res.redirect(backTo(req, '/id' + other.id));
});

router.post(/^\/unblock\/(\d+)$/, requireAuth, (req, res, next) => {
  const other = M.getUser(Number(req.params[0]));
  if (!other) return next();
  M.unblockUser(req.user.id, other.id);
  res.redirect(backTo(req, '/settings/blacklist'));
});

router.get('/settings/blacklist', requireAuth, (req, res) => {
  res.render('blacklist', { blocked: M.blocksQ.list.all(req.user.id) });
});

module.exports = router;
