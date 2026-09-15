'use strict';

const session = require('express-session');
const db = require('../db');

const Store = session.Store;

const q = {
  get: db.prepare('SELECT data, expires FROM sessions WHERE sid = ?'),
  set: db.prepare('INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?) ' +
    'ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires'),
  del: db.prepare('DELETE FROM sessions WHERE sid = ?'),
  clean: db.prepare('DELETE FROM sessions WHERE expires < ?'),
  count: db.prepare('SELECT COUNT(*) n FROM sessions'),
};

/** Хранилище сессий в той же SQLite — чтобы логин переживал перезапуск. */
class SqliteStore extends Store {
  constructor() {
    super();
    this.cleanup();
    this.timer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
    this.timer.unref();
  }

  cleanup() {
    q.clean.run(Math.floor(Date.now() / 1000));
  }

  get(sid, cb) {
    try {
      const row = q.get.get(sid);
      if (!row) return cb(null, null);
      if (row.expires < Math.floor(Date.now() / 1000)) {
        q.del.run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.data));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 30 * 86400 * 1000;
      const expires = Math.floor((Date.now() + maxAge) / 1000);
      q.set.run(sid, JSON.stringify(sess), expires);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sess, cb) {
    this.set(sid, sess, cb);
  }

  destroy(sid, cb) {
    try {
      q.del.run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  length(cb) {
    cb(null, q.count.get().n);
  }
}

module.exports = SqliteStore;
