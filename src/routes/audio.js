'use strict';

const express = require('express');
const db = require('../db');
const M = require('../lib/models');
const media = require('../lib/media');
const attach = require('../lib/attach');
const { requireAuth } = require('../lib/auth');
const { now, trim } = require('../lib/util');
const { uploadThen, rateLimit, backTo } = require('../lib/security');

const router = express.Router();
const uploadLimit = rateLimit('upload', 3600000, 200, 'Слишком много загрузок за час. Подождите.');

const listOf = (ownerId) => db.audios.filter({ owner_id: ownerId }).sort((a, b) => b.id - a.id);

function render(req, res, owner, error) {
  res.render('audio', { owner, audios: listOf(owner.id), error: error || null });
}

router.get('/audio', requireAuth, (req, res) => render(req, res, req.user));

router.get(/^\/audio\/(\d+)$/, requireAuth, (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  if (!owner) return next();
  if (!M.canSee(req.user.id, owner, 'audio')) {
    return res.status(403).render('error', { code: 403, message: 'Аудиозаписи этого пользователя скрыты.' });
  }
  render(req, res, owner);
});

router.post('/audio/upload', requireAuth, uploadLimit,
  uploadThen(media.uploadAny.single('audio')), (req, res) => {
    if (!req.file) return render(req, res, req.user, 'Выберите аудиофайл.');

    const type = media.detect(req.file.buffer, req.file.mimetype);
    if (!type || type.kind !== 'audio') {
      return render(req, res, req.user, 'Это не аудиофайл. Подойдут MP3, OGG, WAV, FLAC, M4A.');
    }
    if (req.file.buffer.length > media.LIMITS.audio) {
      return render(req, res, req.user, 'Файл больше ' + media.humanSize(media.LIMITS.audio) + '.');
    }

    const saved = media.saveAudio(req.file.buffer, type);
    const name = attach.cleanName(req.file.originalname);
    const track = attach.splitTrackName(name);

    db.audios.insert({
      owner_id: req.user.id,
      artist: trim(req.body.artist, 80) || track.artist,
      title: trim(req.body.title, 80) || track.title,
      file: saved.file,
      duration: saved.duration,
      size: saved.size,
      created_at: now(),
    });

    res.redirect('/audio');
  });

router.post(/^\/audio\/(\d+)\/delete$/, requireAuth, (req, res) => {
  const audio = M.db.audios.get(Number(req.params[0]));
  if (audio && audio.owner_id === req.user.id) {
    media.removeFile(audio.file);
    db.attachments.remove((a) => (a.kind === 'audio' || a.kind === 'voice') && a.ref_id === audio.id);
    db.audios.remove(audio.id);
  }
  res.redirect(backTo(req, '/audio'));
});

module.exports = router;
