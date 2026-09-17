'use strict';

const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../lib/auth');
const { now, trim } = require('../lib/util');
const { loginGuard, rateLimit, safePath } = require('../lib/security');
const { passwordProblem, MIN_PASSWORD } = require('./settings');

const router = express.Router();

const LOGIN_RE = /^[a-z0-9_.]{3,20}$/i;
const RESERVED = new Set([
  'id', 'im', 'feed', 'login', 'logout', 'register', 'settings', 'search', 'help', 'friends', 'photos',
  'photo', 'album', 'albums', 'audio', 'video', 'docs', 'doc', 'club', 'groups', 'group', 'post', 'wall',
  'comment', 'like', 'likes', 'notifications', 'admin', 'api', 'ws', 'uploads', 'css', 'js', 'img', 'message',
  'block', 'unblock',
]);
const registerLimit = rateLimit('register', 3600000, 10, 'Слишком много регистраций с этого адреса. Подождите час.');

/**
 * Пароль проверяем даже для несуществующего логина: иначе по скорости ответа
 * видно, какие логины заняты.
 */
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

function render(res, mode, opts) {
  res.render('auth', Object.assign({
    mode, error: null, notice: null, form: {}, next: '', minPassword: MIN_PASSWORD,
  }, opts));
}

router.get('/', (req, res) => {
  if (req.user) return res.redirect('/feed');
  render(res, 'login', {});
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/feed');
  render(res, 'login', { next: safePath(req.query.next, '') });
});

router.post('/login', (req, res) => {
  const login = trim(req.body.login, 20);
  const password = String(req.body.password || '');
  const next = safePath(req.body.next, '/feed');

  if (!loginGuard.allow(req, login)) {
    return render(res, 'login', {
      error: 'Слишком много попыток входа. Попробуйте через четверть часа.',
      form: { login }, next,
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE login = ? COLLATE NOCASE').get(login);
  const ok = user ? verifyPassword(password, user.password_hash) : verifyPassword(password, DUMMY_HASH) && false;

  if (!ok) {
    return render(res, 'login', { error: 'Неверный логин или пароль.', form: { login }, next });
  }

  // Новая сессия на каждый вход — чтобы нельзя было подсунуть чужой идентификатор.
  req.session.regenerate((err) => {
    if (err) {
      return render(res, 'login', { error: 'Не удалось войти, попробуйте ещё раз.', form: { login }, next: '' });
    }
    loginGuard.reset(req, login);
    req.session.userId = user.id;
    res.redirect(next === '/login' ? '/feed' : next);
  });
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/feed');
  render(res, 'register', {});
});

router.post('/register', registerLimit, (req, res) => {
  const form = {
    first_name: trim(req.body.first_name, 30),
    last_name: trim(req.body.last_name, 30),
    login: trim(req.body.login, 20),
    sex: req.body.sex === 'f' ? 'f' : 'm',
  };
  const password = String(req.body.password || '');
  const fail = (error) => render(res, 'register', { error, form });

  if (!form.first_name || !form.last_name) return fail('Укажите имя и фамилию.');
  if (!LOGIN_RE.test(form.login)) {
    return fail('Логин: латиница, цифры, точка и подчёркивание, от 3 до 20 символов.');
  }
  if (RESERVED.has(form.login.toLowerCase())) return fail('Этот логин занят системой, выберите другой.');

  const problem = passwordProblem(password);
  if (problem) return fail(problem);
  if (password !== String(req.body.password2 || '')) return fail('Пароли не совпадают.');
  if (db.prepare('SELECT 1 x FROM users WHERE login = ? COLLATE NOCASE').get(form.login)) {
    return fail('Такой логин уже занят.');
  }

  const info = db.prepare(`
    INSERT INTO users (login, password_hash, first_name, last_name, sex, created_at, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(form.login, hashPassword(password), form.first_name, form.last_name, form.sex, now(), now());

  db.prepare("INSERT INTO albums (owner_type, owner_id, title, created_at) VALUES ('user', ?, ?, ?)")
    .run(info.lastInsertRowid, 'Фотографии со страницы', now());

  req.session.regenerate((err) => {
    if (err) return fail('Не удалось создать страницу, попробуйте ещё раз.');
    req.session.userId = info.lastInsertRowid;
    res.redirect('/settings');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
// Нужны входу через RetroCore: он заводит страницы по тем же правилам.
module.exports.RESERVED = RESERVED;
module.exports.LOGIN_RE = LOGIN_RE;
