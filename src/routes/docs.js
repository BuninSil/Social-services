'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const M = require('../lib/models');
const media = require('../lib/media');
const attach = require('../lib/attach');
const { requireAuth } = require('../lib/auth');
const { now } = require('../lib/util');
const { uploadThen, rateLimit, backTo } = require('../lib/security');

const router = express.Router();
const uploadLimit = rateLimit('upload', 3600000, 200, 'Слишком много загрузок за час. Подождите.');

const listOf = (ownerId) => db.docs.filter({ owner_id: ownerId }).sort((a, b) => b.id - a.id);

router.get('/docs', requireAuth, (req, res) => {
  res.render('docs', { docs: listOf(req.user.id), error: null });
});

router.post('/docs/upload', requireAuth, uploadLimit,
  uploadThen(media.uploadAny.single('doc')), (req, res) => {
    if (!req.file) {
      return res.render('docs', { docs: listOf(req.user.id), error: 'Выберите файл.' });
    }
    const type = media.detectDoc(req.file.buffer, req.file.originalname, req.file.mimetype);
    if (!type) {
      return res.render('docs', {
        docs: listOf(req.user.id),
        error: 'Такой тип файла не поддерживается. Можно изображения, аудио, видео, PDF, архивы и текст.',
      });
    }
    if (req.file.buffer.length > media.LIMITS.doc) {
      return res.render('docs', {
        docs: listOf(req.user.id),
        error: 'Файл больше ' + media.humanSize(media.LIMITS.doc) + '.',
      });
    }

    const saved = media.saveDoc(req.file.buffer, type);
    db.docs.insert({
      owner_id: req.user.id,
      name: attach.cleanName(req.file.originalname),
      file: saved.file,
      ext: type.ext.replace('.', ''),
      size: saved.size,
      created_at: now(),
    });

    res.redirect('/docs');
  });

/**
 * Скачивание документа. Файлы лежат под случайными именами, а отдаём их
 * с исходным названием и обязательно как вложение — чтобы браузер ничего не исполнял.
 */
router.get(/^\/doc(\d+)_(\d+)$/, requireAuth, (req, res, next) => {
  const ownerId = Number(req.params[0]);
  const doc = M.db.docs.get(Number(req.params[1]));
  if (!doc || doc.owner_id !== ownerId) return next();

  const owner = M.getUser(ownerId);
  const shared = db.attachments.has({ kind: 'doc', ref_id: doc.id });
  if (req.user.id !== doc.owner_id && !shared && !M.canSee(req.user.id, owner, 'profile')) {
    return res.status(403).render('error', { code: 403, message: 'Документ недоступен.' });
  }

  const full = path.join(media.UPLOAD_DIR, doc.file);
  if (!fs.existsSync(full)) return next();

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(full, doc.name);
});

router.post(/^\/doc\/(\d+)\/delete$/, requireAuth, (req, res) => {
  const doc = M.db.docs.get(Number(req.params[0]));
  if (doc && doc.owner_id === req.user.id) {
    media.removeFile(doc.file);
    db.attachments.remove({ kind: 'doc', ref_id: doc.id });
    db.docs.remove(doc.id);
  }
  res.redirect(backTo(req, '/docs'));
});

module.exports = router;
