'use strict';

const express = require('express');
const M = require('../lib/models');
const { requireAuth } = require('../lib/auth');
const { fullName } = require('../lib/util');
const ws = require('../ws');

const router = express.Router();

function renderFriends(req, res, owner, tab) {
  res.render('friends', {
    owner,
    tab,
    friends: M.friendList(owner.id),
    incoming: M.friendsQ.incoming.all(req.user.id),
    outgoing: M.friendsQ.outgoing.all(req.user.id),
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

router.get(/^\/friends\/add\/(\d+)$/, requireAuth, (req, res, next) => {
  const other = M.getUser(Number(req.params[0]));
  if (!other || other.id === req.user.id) return next();
  const result = M.addFriend(req.user.id, other.id);
  if (result === 'out') {
    ws.send(other.id, { kind: 'friend_request', author: fullName(req.user), from_id: req.user.id });
  }
  res.redirect(req.get('referer') || '/id' + other.id);
});

router.get(/^\/friends\/remove\/(\d+)$/, requireAuth, (req, res, next) => {
  const other = M.getUser(Number(req.params[0]));
  if (!other) return next();
  M.removeFriend(req.user.id, other.id);
  res.redirect(req.get('referer') || '/id' + other.id);
});

module.exports = router;
