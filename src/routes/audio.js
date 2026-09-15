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

const listOf = db.prepare('SELECT * FROM audios WHERE owner_id = ? ORDER BY id DESC');

function render(req, res, owner, error) {
  res.render('audio', { owner, audios: listOf.all(owner.id), error: error || null });
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

    db.prepare(`
      INSERT INTO audios (owner_id, artist, title, file, duration, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, trim(req.body.artist, 80) || track.artist,
      trim(req.body.title, 80) || track.title, saved.file, saved.duration, saved.size, now());

    res.redirect('/audio');
  });

router.post(/^\/audio\/(\d+)\/delete$/, requireAuth, (req, res) => {
  const audio = M.audiosQ.byId.get(Number(req.params[0]));
  if (audio && audio.owner_id === req.user.id) {
    media.removeFile(audio.file);
    db.prepare("DELETE FROM attachments WHERE kind = 'audio' AND ref_id = ?").run(audio.id);
    db.prepare('DELETE FROM audios WHERE id = ?').run(audio.id);
  }
  res.redirect(backTo(req, '/audio'));
});

module.exports = router;
