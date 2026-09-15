'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, hashPassword, verifyPassword } = require('../lib/auth');
const { trim } = require('../lib/util');
const { imageUpload, saveImage, removeFile } = require('../lib/upload');

const router = express.Router();

const TEXT_FIELDS = [
  ['first_name', 30], ['last_name', 30], ['status', 140], ['bday', 10], ['city', 60], ['hometown', 60],
  ['relationship', 40], ['politics', 40], ['worldview', 60], ['activity', 500], ['interests', 500],
  ['music', 500], ['films', 500], ['tv', 500], ['books', 500], ['games', 500], ['quotes', 1000], ['about', 2000],
];

router.get('/settings', requireAuth, (req, res) => {
  res.render('settings', { error: null, notice: req.query.saved ? 'Изменения сохранены.' : null });
});

router.post('/settings', requireAuth, (req, res) => {
  const values = {};
  for (const [field, max] of TEXT_FIELDS) values[field] = trim(req.body[field], max);

  if (!values.first_name || !values.last_name) {
    return res.render('settings', { error: 'Имя и фамилия не могут быть пустыми.', notice: null });
  }
  if (values.bday && !/^\d{1,2}\.\d{1,2}(\.\d{4})?$/.test(values.bday)) {
    return res.render('settings', { error: 'День рождения указывается как ДД.ММ.ГГГГ или ДД.ММ.', notice: null });
  }

  values.sex = req.body.sex === 'f' ? 'f' : 'm';
  values.wall_who = ['all', 'friends', 'me'].includes(req.body.wall_who) ? req.body.wall_who : 'all';

  const assignments = Object.keys(values).map((k) => k + ' = @' + k).join(', ');
  db.prepare('UPDATE users SET ' + assignments + ' WHERE id = @id').run(Object.assign({ id: req.user.id }, values));
  res.redirect('/settings?saved=1');
});

router.post('/settings/avatar', requireAuth, imageUpload.single('avatar'), async (req, res) => {
  if (!req.file) return res.render('settings', { error: 'Выберите файл с картинкой.', notice: null });
  const saved = await saveImage(req.file.buffer, 'avatars', { width: 400, thumb: 200, square: true });
  const old = req.user.avatar;
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(saved.file, req.user.id);
  if (old) {
    removeFile(old);
    removeFile(old.replace(/([^/]+)$/, 'thumb_$1'));
  }
  res.redirect('/settings?saved=1');
});

router.get('/settings/avatar/delete', requireAuth, (req, res) => {
  if (req.user.avatar) {
    removeFile(req.user.avatar);
    removeFile(req.user.avatar.replace(/([^/]+)$/, 'thumb_$1'));
    db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  }
  res.redirect('/settings');
});

router.post('/settings/password', requireAuth, (req, res) => {
  const password = String(req.body.password || '');
  const render = (error, notice) => res.render('settings', { error: error || null, notice: notice || null });

  if (!verifyPassword(String(req.body.old_password || ''), req.user.password_hash)) {
    return render('Старый пароль указан неверно.');
  }
  if (password.length < 6) return render('Новый пароль должен быть не короче 6 символов.');
  if (password !== String(req.body.password2 || '')) return render('Новые пароли не совпадают.');

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), req.user.id);
  render(null, 'Пароль изменён.');
});

module.exports = router;
