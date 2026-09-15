'use strict';

const express = require('express');
const db = require('../db');
const M = require('../lib/models');
const { requireAuth } = require('../lib/auth');
const { now, trim } = require('../lib/util');
const { audioUpload, saveAudio, removeFile } = require('../lib/upload');

const router = express.Router();

const listOf = db.prepare('SELECT * FROM audios WHERE owner_id = ? ORDER BY id DESC');

router.get('/audio', requireAuth, (req, res) => {
  res.render('audio', { owner: req.user, audios: listOf.all(req.user.id), error: null });
});

router.get(/^\/audio\/(\d+)$/, requireAuth, (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  if (!owner) return next();
  res.render('audio', { owner, audios: listOf.all(owner.id), error: null });
});

router.post('/audio/upload', requireAuth, audioUpload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.render('audio', {
      owner: req.user, audios: listOf.all(req.user.id), error: 'Выберите аудиофайл.',
    });
  }
  const file = saveAudio(req.file.buffer, req.file.originalname);
  const fallback = req.file.originalname.replace(/\.[^.]+$/, '');
  db.prepare('INSERT INTO audios (owner_id, artist, title, file, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, trim(req.body.artist, 80) || 'Неизвестен', trim(req.body.title, 80) || fallback, file, now());
  res.redirect('/audio');
});

router.get(/^\/audio\/(\d+)\/delete$/, requireAuth, (req, res) => {
  const audio = M.audiosQ.byId.get(Number(req.params[0]));
  if (audio && audio.owner_id === req.user.id) {
    removeFile(audio.file);
    db.prepare('UPDATE posts SET audio_id = NULL WHERE audio_id = ?').run(audio.id);
    db.prepare('DELETE FROM audios WHERE id = ?').run(audio.id);
  }
  res.redirect('/audio');
});

module.exports = router;
