'use strict';

const crypto = require('crypto');
const db = require('../db');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

/** Пароль хранится как «scrypt$соль$хеш». */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(password, parts[1], expected.length, SCRYPT_PARAMS);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const selectUser = db.prepare('SELECT * FROM users WHERE id = ?');
const touchUser = db.prepare('UPDATE users SET last_seen = ? WHERE id = ?');

/** Подмешивает текущего пользователя и счётчики в каждый запрос. */
function loadUser(req, res, next) {
  res.locals.me = null;
  res.locals.counters = { messages: 0, requests: 0 };
  if (req.session && req.session.userId) {
    const user = selectUser.get(req.session.userId);
    if (user) {
      touchUser.run(Math.floor(Date.now() / 1000), user.id);
      req.user = user;
      res.locals.me = user;
      res.locals.counters = {
        messages: db.prepare('SELECT COUNT(DISTINCT from_id) n FROM messages WHERE to_id = ? AND is_read = 0')
          .get(user.id).n,
        requests: db.prepare("SELECT COUNT(*) n FROM friendships WHERE to_id = ? AND status = 'pending'")
          .get(user.id).n,
      };
    } else {
      req.session.destroy(() => {});
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  next();
}

module.exports = { hashPassword, verifyPassword, loadUser, requireAuth };
