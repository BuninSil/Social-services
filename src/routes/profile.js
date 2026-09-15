'use strict';

const express = require('express');
const db = require('../db');
const M = require('../lib/models');
const publish = require('../lib/publish');
const media = require('../lib/media');
const { requireAuth } = require('../lib/auth');
const { uploadThen, rateLimit, backTo } = require('../lib/security');

const router = express.Router();
const PER_PAGE = 20;
const postLimit = rateLimit('post', 60000, 20, 'Слишком много записей подряд. Подождите минуту.');

const counts = {
  photos: db.prepare('SELECT COUNT(*) n FROM photos WHERE owner_id = ?'),
  videos: db.prepare('SELECT COUNT(*) n FROM videos WHERE owner_id = ?'),
  audios: db.prepare('SELECT COUNT(*) n FROM audios WHERE owner_id = ?'),
  docs: db.prepare('SELECT COUNT(*) n FROM docs WHERE owner_id = ?'),
  groups: db.prepare('SELECT COUNT(*) n FROM group_members WHERE user_id = ?'),
};

router.get(/^\/id(\d+)$/, requireAuth, (req, res, next) => {
  const user = M.getUser(Number(req.params[0]));
  if (!user) return next();

  const me = req.user;
  const blockedByThem = M.hasBlocked(user.id, me.id);
  const iBlockedThem = M.hasBlocked(me.id, user.id);

  if (blockedByThem) {
    return res.status(403).render('closed', {
      user,
      reason: 'Этот пользователь ограничил Вам доступ к своей странице.',
      iBlockedThem: false,
    });
  }
  if (!M.canSee(me.id, user, 'profile')) {
    return res.status(403).render('closed', {
      user,
      reason: 'Страница доступна только друзьям.',
      iBlockedThem,
    });
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const total = M.wallCount('user', user.id);
  const showFriends = M.canSee(me.id, user, 'friends');
  const showPhotos = M.canSee(me.id, user, 'photos');
  const friends = showFriends ? M.friendList(user.id) : [];

  res.render('profile', {
    user,
    status: M.friendStatus(me.id, user.id),
    iBlockedThem,
    friends,
    friendsCount: showFriends ? friends.length : 0,
    showFriends,
    showPhotos,
    mutual: user.id === me.id ? [] : M.mutualFriends(me.id, user.id),
    photos: showPhotos
      ? db.prepare('SELECT * FROM photos WHERE owner_id = ? ORDER BY id DESC LIMIT 6').all(user.id)
      : [],
    photosCount: showPhotos ? counts.photos.get(user.id).n : 0,
    videosCount: counts.videos.get(user.id).n,
    audioCount: M.canSee(me.id, user, 'audio') ? counts.audios.get(user.id).n : 0,
    docsCount: user.id === me.id ? counts.docs.get(user.id).n : 0,
    groupsCount: counts.groups.get(user.id).n,
    posts: M.wallPosts('user', user.id, me.id, PER_PAGE, (page - 1) * PER_PAGE),
    wallCount: total,
    canPost: M.canPostOnWall(user, me.id),
    canWrite: M.canMessage(me.id, user),
    page,
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
    uploadError: req.query.err ? String(req.query.err).slice(0, 300) : null,
  });
});

router.post(/^\/id(\d+)\/wall$/, requireAuth, postLimit,
  uploadThen(media.uploadAny.array('files', 10)), async (req, res, next) => {
    const owner = M.getUser(Number(req.params[0]));
    if (!owner) return next();
    if (!M.canPostOnWall(owner, req.user.id)) {
      return res.status(403).render('error', { code: 403, message: 'Писать на эту стену нельзя.' });
    }

    const { errors } = await publish.createPost({
      ownerType: 'user',
      ownerId: owner.id,
      authorId: req.user.id,
      text: req.body.text,
      files: req.files,
    });

    const back = backTo(req, '/id' + owner.id);
    res.redirect(errors.length ? back + '?err=' + encodeURIComponent(errors.join(' ')) : back);
  });

module.exports = router;
