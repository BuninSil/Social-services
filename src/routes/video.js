'use strict';

const express = require('express');
const db = require('../db');
const M = require('../lib/models');
const media = require('../lib/media');
const { requireAuth } = require('../lib/auth');
const { now, trim } = require('../lib/util');
const { uploadThen, rateLimit, backTo } = require('../lib/security');

const router = express.Router();
const uploadLimit = rateLimit('upload', 3600000, 200, 'Слишком много загрузок за час. Подождите.');

const listOf = (ownerId) => db.videos.filter({ owner_id: ownerId }).sort((a, b) => b.id - a.id);

function renderList(req, res, owner, error) {
  res.render('video', {
    owner,
    videos: listOf(owner.id),
    error: error || null,
    ffmpeg: media.ffmpegAvailable(),
  });
}

router.get('/video', requireAuth, (req, res) => renderList(req, res, req.user));

router.get(/^\/video\/(\d+)$/, requireAuth, (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  if (!owner) return next();
  if (!M.canSee(req.user.id, owner, 'profile')) {
    return res.status(403).render('error', { code: 403, message: 'Раздел доступен только друзьям.' });
  }
  renderList(req, res, owner);
});

router.post('/video/upload', requireAuth, uploadLimit,
  uploadThen(media.uploadAny.single('video')), async (req, res) => {
    if (!req.file) return renderList(req, res, req.user, 'Выберите видеофайл.');

    const type = media.detect(req.file.buffer, req.file.mimetype);
    if (!type || type.kind !== 'video') {
      return renderList(req, res, req.user, 'Это не похоже на видео. Поддерживаются MP4 и WebM.');
    }
    if (req.file.buffer.length > media.LIMITS.video) {
      return renderList(req, res, req.user, 'Файл больше ' + media.humanSize(media.LIMITS.video) + '.');
    }

    const saved = await media.saveVideo(req.file.buffer, type);
    db.videos.insert({
      owner_id: req.user.id,
      title: trim(req.body.title, 120) || 'Видеозапись',
      description: trim(req.body.description, 1000),
      file: saved.file,
      poster: saved.poster,
      duration: saved.duration,
      size: saved.size,
      created_at: now(),
    });

    res.redirect('/video');
  });

router.get(/^\/video(\d+)_(\d+)$/, requireAuth, (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  const video = M.db.videos.get(Number(req.params[1]));
  if (!owner || !video || video.owner_id !== owner.id) return next();
  if (!M.canSee(req.user.id, owner, 'profile')) {
    return res.status(403).render('error', { code: 403, message: 'Запись доступна только друзьям.' });
  }
  res.render('video_one', {
    owner,
    video,
    comments: M.listComments('video', video.id),
  });
});

router.post(/^\/video\/(\d+)\/delete$/, requireAuth, (req, res) => {
  const video = M.db.videos.get(Number(req.params[0]));
  if (video && video.owner_id === req.user.id) {
    media.removeFile(video.file);
    if (video.poster) {
      media.removeFile(video.poster);
      media.removeFile(video.poster.replace('thumb_', ''));
    }
    db.attachments.remove({ kind: 'video', ref_id: video.id });
    db.videos.remove(video.id);
  }
  res.redirect(backTo(req, '/video'));
});

module.exports = router;
