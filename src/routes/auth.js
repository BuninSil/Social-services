'use strict';

const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../lib/auth');
const { now, trim } = require('../lib/util');

const router = express.Router();

const LOGIN_RE = /^[a-z0-9_.]{3,20}$/i;

router.get('/', (req, res) => {
  if (req.user) return res.redirect('/feed');
  res.render('auth', { mode: 'login', error: null, notice: null, form: {}, next: '' });
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/feed');
  res.render('auth', { mode: 'login', error: null, notice: null, form: {}, next: req.query.next || '' });
});

router.post('/login', (req, res) => {
  const login = trim(req.body.login, 20);
  const user = db.prepare('SELECT * FROM users WHERE login = ? COLLATE NOCASE').get(login);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) {
    return res.render('auth', {
      mode: 'login', error: 'Неверный логин или пароль.', notice: null,
      form: { login }, next: req.body.next || '',
    });
  }
  req.session.regenerate((err) => {
    if (err) return res.render('auth', { mode: 'login', error: 'Не удалось войти, попробуйте ещё раз.', notice: null, form: { login }, next: '' });
    req.session.userId = user.id;
    const target = String(req.body.next || '');
    res.redirect(target.startsWith('/') && !target.startsWith('//') ? target : '/feed');
  });
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/feed');
  res.render('auth', { mode: 'register', error: null, notice: null, form: {}, next: '' });
});

router.post('/register', (req, res) => {
  const form = {
    first_name: trim(req.body.first_name, 30),
    last_name: trim(req.body.last_name, 30),
    login: trim(req.body.login, 20),
    sex: req.body.sex === 'f' ? 'f' : 'm',
  };
  const password = String(req.body.password || '');
  const fail = (error) => res.render('auth', { mode: 'register', error, notice: null, form, next: '' });

  if (!form.first_name || !form.last_name) return fail('Укажите имя и фамилию.');
  if (!LOGIN_RE.test(form.login)) return fail('Логин: латиница, цифры, точка и подчёркивание, от 3 до 20 символов.');
  if (password.length < 6) return fail('Пароль должен быть не короче 6 символов.');
  if (password !== String(req.body.password2 || '')) return fail('Пароли не совпадают.');
  if (db.prepare('SELECT 1 x FROM users WHERE login = ? COLLATE NOCASE').get(form.login)) {
    return fail('Такой логин уже занят.');
  }

  const info = db.prepare(`
    INSERT INTO users (login, password_hash, first_name, last_name, sex, created_at, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(form.login, hashPassword(password), form.first_name, form.last_name, form.sex, now(), now());

  db.prepare('INSERT INTO albums (owner_type, owner_id, title, description, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('user', info.lastInsertRowid, 'Фотографии со страницы', '', now());

  req.session.regenerate((err) => {
    if (err) return fail('Не удалось создать страницу, попробуйте ещё раз.');
    req.session.userId = info.lastInsertRowid;
    res.redirect('/settings');
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
