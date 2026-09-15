'use strict';

const express = require('express');
const M = require('../lib/models');
const notify = require('../lib/notify');
const publish = require('../lib/publish');
const { requireAuth } = require('../lib/auth');
const { now, trim } = require('../lib/util');
const { backTo, rateLimit } = require('../lib/security');

const router = express.Router();

const COMMENT_TARGETS = ['post', 'photo', 'video'];
const LIKE_KIND = { post: 'like_post', photo: 'like_photo', video: 'like_video' };
const COMMENT_KIND = { post: 'comment_post', photo: 'comment_photo', video: 'comment_video' };

const postLimit = rateLimit('post', 60000, 20, 'Слишком много записей подряд. Подождите минуту.');
const commentLimit = rateLimit('comment', 60000, 30, 'Слишком много комментариев подряд. Подождите минуту.');

/** Владелец объекта, на который вешают лайк или комментарий. */
function targetOwner(type, id) {
  if (type === 'post') {
    const post = M.postsQ.byId.get(id);
    return post ? { ownerId: post.author_id, post } : null;
  }
  if (type === 'video') {
    const video = M.videosQ.byId.get(id);
    return video ? { ownerId: video.owner_id, video } : null;
  }
  const photo = M.photosQ.byId.get(id);
  return photo ? { ownerId: photo.owner_id, photo } : null;
}

/** Ссылка на объект — для уведомлений. */
function targetUrl(type, id) {
  if (type === 'photo') {
    const photo = M.photosQ.byId.get(id);
    return photo ? '/photo' + photo.owner_id + '_' + photo.id : '/';
  }
  if (type === 'video') {
    const video = M.videosQ.byId.get(id);
    return video ? '/video' + video.owner_id + '_' + video.id : '/';
  }
  const post = M.postsQ.byId.get(id);
  if (!post) return '/';
  return (post.owner_type === 'group' ? '/club' : '/id') + post.owner_id + '#post' + post.id;
}

/* -------------------------------------------------------------- «нравится» */

router.post('/like', requireAuth, express.json(), (req, res) => {
  const type = COMMENT_TARGETS.includes(req.body.type) ? req.body.type : 'post';
  const id = parseInt(req.body.id, 10);
  const target = targetOwner(type, id);
  if (!target) return res.status(404).json({ error: 'not found' });
  if (M.blockedEither(req.user.id, target.ownerId)) return res.status(403).json({ error: 'blocked' });

  const result = M.toggleLike(type, id, req.user.id);
  if (result.added) {
    notify.push({
      userId: target.ownerId,
      kind: LIKE_KIND[type],
      actorId: req.user.id,
      targetType: type,
      targetId: id,
      url: targetUrl(type, id),
      preview: target.post ? target.post.text : '',
      unique: true,
    });
  } else {
    M.dropNotification(target.ownerId, LIKE_KIND[type], req.user.id, type, id);
  }
  res.json(result);
});

/** Кто отметил «Мне нравится». */
router.get(/^\/likes\/(post|photo|video)\/(\d+)$/, requireAuth, (req, res) => {
  const type = req.params[0];
  const id = Number(req.params[1]);
  res.render('likes', {
    users: M.likesQ.users.all(type, id),
    back: backTo(req, '/feed'),
  });
});

/* ------------------------------------------------------------ комментарии */

router.post('/comment', requireAuth, commentLimit, (req, res) => {
  const type = COMMENT_TARGETS.includes(req.query.type) ? req.query.type : 'post';
  const id = parseInt(req.query.id, 10);
  const text = trim(req.body.text, 2000);
  const fallback = type === 'post' ? '/feed' : '/' + type + 's';
  const back = backTo(req, fallback);

  const target = targetOwner(type, id);
  if (!target || !text) return res.redirect(back);
  if (M.blockedEither(req.user.id, target.ownerId)) {
    return res.status(403).render('error', { code: 403, message: 'Комментировать эту запись нельзя.' });
  }

  const replyTo = parseInt(req.body.reply_to, 10) || null;
  const parent = replyTo ? M.commentsQ.byId.get(replyTo) : null;
  const commentId = M.commentsQ.insert.run(type, id, req.user.id, text,
    parent && parent.target_id === id ? parent.id : null, now()).lastInsertRowid;

  const url = targetUrl(type, id);
  notify.push({
    userId: target.ownerId,
    kind: COMMENT_KIND[type],
    actorId: req.user.id,
    targetType: type,
    targetId: id,
    url,
    preview: text,
  });
  if (parent && parent.author_id !== target.ownerId) {
    notify.push({
      userId: parent.author_id,
      kind: 'reply_comment',
      actorId: req.user.id,
      targetType: 'comment',
      targetId: commentId,
      url,
      preview: text,
    });
  }
  notify.pushMentions(text, req.user.id, url, text);

  res.redirect(back);
});

router.post(/^\/comment\/(\d+)\/edit$/, requireAuth, (req, res) => {
  const comment = M.commentsQ.byId.get(Number(req.params[0]));
  const back = backTo(req, '/feed');
  if (comment && comment.author_id === req.user.id) {
    const text = trim(req.body.text, 2000);
    if (text) M.commentsQ.update.run(text, now(), comment.id);
  }
  res.redirect(back);
});

router.post(/^\/comment\/(\d+)\/delete$/, requireAuth, (req, res) => {
  const comment = M.commentsQ.byId.get(Number(req.params[0]));
  const back = backTo(req, '/feed');
  if (!comment) return res.redirect(back);

  let allowed = comment.author_id === req.user.id;
  if (!allowed && comment.target_type === 'post') {
    const post = M.postsQ.byId.get(comment.target_id);
    allowed = !!post && publish.canEditPost(post, req.user);
  }
  if (!allowed && comment.target_type === 'photo') {
    const photo = M.photosQ.byId.get(comment.target_id);
    allowed = !!photo && photo.owner_id === req.user.id;
  }
  if (allowed) M.commentsQ.del.run(comment.id);
  res.redirect(back);
});

/* ---------------------------------------------------------------- записи */

router.get(/^\/post\/(\d+)$/, requireAuth, (req, res, next) => {
  const post = M.postsQ.byId.get(Number(req.params[0]));
  if (!post) return next();
  if (post.owner_type === 'user' && !M.canSee(req.user.id, M.getUser(post.owner_id), 'profile')) {
    return res.status(403).render('error', { code: 403, message: 'Эта запись недоступна.' });
  }
  res.render('post', {
    post: M.decoratePost(post, req.user.id),
    canDelete: publish.canEditPost(post, req.user),
  });
});

router.get(/^\/post\/(\d+)\/edit$/, requireAuth, (req, res, next) => {
  const post = M.postsQ.byId.get(Number(req.params[0]));
  if (!post) return next();
  if (post.author_id !== req.user.id) {
    return res.status(403).render('error', { code: 403, message: 'Править можно только свои записи.' });
  }
  res.render('post_edit', { post: M.decoratePost(post, req.user.id), back: backTo(req, '/feed') });
});

router.post(/^\/post\/(\d+)\/edit$/, requireAuth, (req, res, next) => {
  const post = M.postsQ.byId.get(Number(req.params[0]));
  if (!post) return next();
  if (post.author_id !== req.user.id) {
    return res.status(403).render('error', { code: 403, message: 'Править можно только свои записи.' });
  }
  const text = trim(req.body.text, publish.MAX_TEXT);
  const hasAttachments = M.loadAttachments('post', post.id).length > 0;
  if (text || hasAttachments || post.repost_of) M.postsQ.update.run(text, now(), post.id);
  res.redirect(backTo(req, '/post/' + post.id));
});

router.post(/^\/post\/(\d+)\/delete$/, requireAuth, (req, res) => {
  const post = M.postsQ.byId.get(Number(req.params[0]));
  const fallback = post
    ? (post.owner_type === 'group' ? '/club' : '/id') + post.owner_id
    : '/feed';
  if (post && publish.canEditPost(post, req.user)) publish.deletePost(post.id);
  res.redirect(backTo(req, fallback));
});

/** Закрепить запись наверху стены (как в современном ВК). */
router.post(/^\/post\/(\d+)\/pin$/, requireAuth, (req, res) => {
  const post = M.postsQ.byId.get(Number(req.params[0]));
  const back = backTo(req, '/feed');
  if (!post || !publish.canEditPost(post, req.user)) return res.redirect(back);

  const wasPinned = post.pinned;
  M.postsQ.unpinAll.run(post.owner_type, post.owner_id);
  if (!wasPinned) M.postsQ.pin.run(post.id);
  res.redirect(back);
});

/** Репост на свою стену. */
router.post(/^\/post\/(\d+)\/repost$/, requireAuth, postLimit, async (req, res) => {
  const post = M.postsQ.byId.get(Number(req.params[0]));
  const back = backTo(req, '/feed');
  if (!post) return res.redirect(back);
  if (post.owner_type === 'user' && !M.canSee(req.user.id, M.getUser(post.owner_id), 'profile')) {
    return res.status(403).render('error', { code: 403, message: 'Эта запись недоступна.' });
  }

  // Репост репоста ведёт на исходную запись, чтобы не плодить матрёшку.
  const sourceId = post.repost_of || post.id;
  await publish.createPost({
    ownerType: 'user',
    ownerId: req.user.id,
    authorId: req.user.id,
    text: trim(req.body.text, publish.MAX_TEXT),
    files: [],
    repostOf: sourceId,
  });
  res.redirect(req.body.stay ? back : '/id' + req.user.id);
});

module.exports = router;
