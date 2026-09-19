'use strict';

/**
 * Вход через сеть RetroCore.
 *
 * Отдельного логина у участника сети нет: он жмёт кнопку, сеть возвращает его
 * обратно с одноразовым кодом, код мы меняем на данные участника со своего
 * сервера. Страница в ВОнлайне заводится сама при первом входе.
 */

const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const rc = require('../lib/retrocore');
const M = require('../lib/models');
const { hashPassword } = require('../lib/auth');
const { now } = require('../lib/util');
const { rateLimit, safePath } = require('../lib/security');
const { RESERVED, LOGIN_RE } = require('./auth');

const router = express.Router();

const STATE_LIFE = 10 * 60 * 1000;
const connectLimit = rateLimit('connect', 600000, 30, 'Слишком много попыток входа через сеть. Подождите немного.');

function unavailable(res) {
  return res.status(404).render('error', {
    code: 404,
    message: 'Вход через RetroCore на этом сервере не настроен.',
  });
}

function problem(res, text) {
  return res.status(400).render('error', { code: 400, message: 'Вход через RetroCore не удался: ' + text });
}

router.get('/connect/start', connectLimit, (req, res) => {
  if (req.user) return res.redirect('/feed');
  if (!rc.configured()) return unavailable(res);

  const state = rc.newState();
  req.session.rc = { state: state, next: safePath(req.query.next, '/feed'), at: Date.now() };
  // Сохраняем сессию до редиректа: иначе state может не успеть записаться.
  req.session.save((err) => {
    if (err) return problem(res, 'не получилось начать вход, попробуйте ещё раз');
    res.redirect(rc.authorizeUrl(state));
  });
});

router.get('/connect/callback', connectLimit, async (req, res) => {
  if (!rc.configured()) return unavailable(res);

  const saved = req.session.rc;
  delete req.session.rc; // state одноразовый, второй раз тот же код не пройдёт

  if (req.user) return res.redirect('/feed');
  if (req.query.error) return problem(res, 'сеть отказала во входе');

  const state = String(req.query.state || '');
  if (!saved || !saved.state || !safeEqual(saved.state, state)) {
    return problem(res, 'адрес возврата не совпал с началом входа. Начните заново с /login');
  }
  if (Date.now() - saved.at > STATE_LIFE) return problem(res, 'вход слишком долго ждал, начните заново');

  const code = String(req.query.code || '');
  if (!code || code.length > 512) return problem(res, 'сеть не прислала код');

  let info;
  try {
    info = await rc.exchange(code);
  } catch (e) {
    console.error('[retrocore]', e && e.message ? e.message : e);
    return problem(res, e && e.message ? e.message : 'сеть недоступна');
  }

  let user;
  try {
    user = upsert(info.user);
  } catch (e) {
    console.error('[retrocore] страница не завелась:', e && e.message ? e.message : e);
    return problem(res, 'не получилось завести страницу для этого аккаунта');
  }

  const next = saved.next && saved.next !== '/login' ? saved.next : '/feed';
  req.session.regenerate((err) => {
    if (err) return problem(res, 'не получилось открыть сеанс, попробуйте ещё раз');
    req.session.userId = user.id;
    res.redirect(user.fresh ? '/settings' : next);
  });
});

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Логин для новой страницы: имя из сети, а если занято — с номером участника. */
function pickLogin(rcUser) {
  let base = rcUser.username.toLowerCase().replace(/[^a-z0-9_.]/g, '');
  if (!LOGIN_RE.test(base)) base = 'rc' + rcUser.id;
  if (RESERVED.has(base)) base = base + rcUser.id;

  let login = base.slice(0, 20);
  let attempt = 0;
  while (M.userByLogin(login)) {
    attempt += 1;
    const suffix = attempt === 1 ? String(rcUser.id) : rcUser.id + '_' + attempt;
    login = base.slice(0, 20 - suffix.length) + suffix;
    if (attempt > 50) throw new Error('логин не подобрался');
  }
  return login;
}

/** Первый вход заводит страницу, последующие — обновляют данные из сети. */
function upsert(rcUser) {
  const existing = db.users.find({ rc_id: rcUser.id });
  if (existing) {
    db.users.update(existing.id, {
      rc_username: rcUser.username,
      rc_avatar: rcUser.avatar,
      rc_profile: rcUser.profile,
      rc_role: rcUser.roleName || rcUser.role,
      last_seen: now(),
    });
    const fresh = db.users.get(existing.id);
    fresh.fresh = false;
    return fresh;
  }

  const login = pickLogin(rcUser);
  const firstName = (rcUser.title || rcUser.username).slice(0, 30);
  // Пароля у страницы нет: кладём случайный хеш, чтобы обычный вход не сработал.
  const stub = hashPassword(crypto.randomBytes(32).toString('hex'));

  const user = db.users.insert({
    login: login,
    password_hash: stub,
    first_name: firstName,
    status: rcUser.statusMsg || '',
    created_at: now(),
    last_seen: now(),
    rc_id: rcUser.id,
    rc_username: rcUser.username,
    rc_avatar: rcUser.avatar,
    rc_profile: rcUser.profile,
    rc_role: rcUser.roleName || rcUser.role,
    rc_only: 1,
  });

  db.albums.insert({
    owner_type: 'user', owner_id: user.id, title: 'Фотографии со страницы', created_at: now(),
  });
  db.save();

  user.fresh = true;
  return user;
}

module.exports = router;
