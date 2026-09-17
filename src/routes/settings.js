'use strict';

const express = require('express');
const db = require('../db');
const media = require('../lib/media');
const { requireAuth, hashPassword, verifyPassword } = require('../lib/auth');
const { trim } = require('../lib/util');
const { uploadThen, rateLimit, backTo } = require('../lib/security');
const theme = require('../lib/theme');

const router = express.Router();
const passwordLimit = rateLimit('password', 15 * 60000, 10, 'Слишком много попыток. Подождите.');

const TEXT_FIELDS = [
  ['first_name', 30], ['last_name', 30], ['status', 140], ['bday', 10], ['city', 60], ['hometown', 60],
  ['relationship', 40], ['politics', 40], ['worldview', 60], ['activity', 500], ['interests', 500],
  ['music', 500], ['films', 500], ['tv', 500], ['books', 500], ['games', 500], ['quotes', 1000], ['about', 2000],
];

const PRIVACY_FIELDS = ['profile_who', 'wall_who', 'photos_who', 'audio_who', 'friends_who', 'message_who'];
const PRIVACY_VALUES = ['all', 'friends', 'me'];

const MIN_PASSWORD = 8;
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'qwertyui', 'qwerty123', 'iloveyou',
  'password1', 'parol123', 'qwerty12', '11111111', '87654321', 'admin123',
]);

function passwordProblem(password) {
  if (password.length < MIN_PASSWORD) return 'Пароль должен быть не короче ' + MIN_PASSWORD + ' символов.';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'Такой пароль слишком простой, придумайте другой.';
  if (/^(.)\1+$/.test(password)) return 'Пароль из одного повторяющегося символа не годится.';
  return null;
}

function view(req, res, error, notice) {
  res.render('settings', {
    error: error || null,
    notice: notice || (req.query.saved ? 'Изменения сохранены.' : null),
    minPassword: MIN_PASSWORD,
    themes: theme.THEMES,
    presets: theme.NEON_PRESETS,
  });
}

router.get('/settings', requireAuth, (req, res) => view(req, res));

router.post('/settings', requireAuth, (req, res) => {
  const values = {};
  for (const [field, max] of TEXT_FIELDS) values[field] = trim(req.body[field], max);

  if (!values.first_name || !values.last_name) {
    return view(req, res, 'Имя и фамилия не могут быть пустыми.');
  }
  if (values.bday && !/^\d{1,2}\.\d{1,2}(\.\d{4})?$/.test(values.bday)) {
    return view(req, res, 'День рождения указывается как ДД.ММ.ГГГГ или ДД.ММ.');
  }

  values.sex = req.body.sex === 'f' ? 'f' : 'm';
  for (const field of PRIVACY_FIELDS) {
    values[field] = PRIVACY_VALUES.includes(req.body[field]) ? req.body[field] : 'all';
  }

  const assignments = Object.keys(values).map((k) => k + ' = @' + k).join(', ');
  db.prepare('UPDATE users SET ' + assignments + ' WHERE id = @id')
    .run(Object.assign({ id: req.user.id }, values));
  res.redirect('/settings?saved=1');
});

router.post('/settings/avatar', requireAuth,
  uploadThen(media.uploadImage.single('avatar')), async (req, res) => {
    if (!req.file) return view(req, res, 'Выберите файл с картинкой.');

    const type = media.detect(req.file.buffer, req.file.mimetype);
    if (!type || type.kind !== 'image') {
      return view(req, res, 'Это не изображение. Подойдут JPEG, PNG, GIF или WebP.');
    }

    const saved = await media.saveImage(req.file.buffer, 'avatars', { width: 400, thumb: 200, square: true });
    const old = req.user.avatar;
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(saved.file, req.user.id);
    if (old) {
      media.removeFile(old);
      media.removeFile(media.thumbOf(old));
    }
    res.redirect('/settings?saved=1');
  });

router.post('/settings/avatar/delete', requireAuth, (req, res) => {
  if (req.user.avatar) {
    media.removeFile(req.user.avatar);
    media.removeFile(media.thumbOf(req.user.avatar));
    db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  }
  res.redirect('/settings');
});

router.post('/settings/password', requireAuth, passwordLimit, (req, res) => {
  const password = String(req.body.password || '');

  // У страницы, заведённой через RetroCore, старого пароля нет вовсе:
  // в базе лежит случайный хеш. Такой странице пароль просто заводят.
  if (!req.user.rc_only && !verifyPassword(String(req.body.old_password || ''), req.user.password_hash)) {
    return view(req, res, 'Старый пароль указан неверно.');
  }
  const problem = passwordProblem(password);
  if (problem) return view(req, res, problem);
  if (password !== String(req.body.password2 || '')) return view(req, res, 'Новые пароли не совпадают.');

  db.prepare('UPDATE users SET password_hash = ?, rc_only = 0 WHERE id = ?')
    .run(hashPassword(password), req.user.id);

  // Смена пароля выкидывает все прочие сессии — иначе чужой вход останется живым.
  const currentSid = req.sessionID;
  for (const row of db.prepare('SELECT sid, data FROM sessions').all()) {
    if (row.sid === currentSid) continue;
    try {
      if (JSON.parse(row.data).userId === req.user.id) {
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(row.sid);
      }
    } catch (err) { /* повреждённую запись просто пропускаем */ }
  }

  view(req, res, null, 'Пароль изменён. Остальные сеансы завершены.');
});

/**
 * Оформление: выбор темы и свои цвета для неоновой.
 * Цвета принимаем только строгим шестизначным hex — они попадают в разметку.
 */
router.post('/settings/theme', requireAuth, (req, res) => {
  const chosen = theme.isTheme(req.body.theme) ? req.body.theme : 'vo';
  const preset = theme.NEON_PRESETS.find((p) => p.id === req.body.preset);
  const defaults = theme.NEON_DEFAULTS;

  const colors = preset ? preset : {
    c1: theme.color(req.body.neon_c1, defaults.c1),
    c2: theme.color(req.body.neon_c2, defaults.c2),
    bg: theme.color(req.body.neon_bg, defaults.bg),
  };

  db.prepare('UPDATE users SET theme = ?, neon_c1 = ?, neon_c2 = ?, neon_bg = ? WHERE id = ?')
    .run(chosen, colors.c1, colors.c2, colors.bg, req.user.id);
  req.session.theme = chosen;

  res.redirect(backTo(req, '/settings') + '#theme');
});

/** Удаление страницы вместе со всем содержимым. */
router.post('/settings/delete', requireAuth, (req, res) => {
  if (!verifyPassword(String(req.body.password || ''), req.user.password_hash)) {
    return view(req, res, 'Для удаления страницы нужен текущий пароль.');
  }
  const userId = req.user.id;

  const wipe = db.transaction(() => {
    for (const table of ['photos', 'videos', 'audios', 'docs']) {
      for (const row of db.prepare('SELECT * FROM ' + table + ' WHERE owner_id = ?').all(userId)) {
        media.removeFile(row.file);
        if (row.thumb) media.removeFile(row.thumb);
        if (row.poster) media.removeFile(row.poster);
      }
    }
    if (req.user.avatar) {
      media.removeFile(req.user.avatar);
      media.removeFile(media.thumbOf(req.user.avatar));
    }
    db.prepare('DELETE FROM likes WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM notifications WHERE user_id = ? OR actor_id = ?').run(userId, userId);
    db.prepare("DELETE FROM posts WHERE author_id = ? OR (owner_type = 'user' AND owner_id = ?)")
      .run(userId, userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });
  wipe();

  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
module.exports.passwordProblem = passwordProblem;
module.exports.MIN_PASSWORD = MIN_PASSWORD;
