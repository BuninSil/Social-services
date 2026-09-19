'use strict';

const session = require('express-session');
const db = require('../db');

const Store = session.Store;
const seconds = () => Math.floor(Date.now() / 1000);

/** Сессии лежат в той же файловой базе — чтобы вход переживал перезапуск. */
class FileStore extends Store {
  constructor() {
    super();
    this.cleanup();
    this.timer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
    this.timer.unref();
  }

  cleanup() {
    db.sessions.remove((row) => row.expires < seconds());
  }

  get(sid, cb) {
    try {
      const row = db.sessions.get(sid);
      if (!row) return cb(null, null);
      if (row.expires < seconds()) {
        db.sessions.remove(sid);
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
      db.sessions.upsert({ id: sid }, {
        data: JSON.stringify(sess),
        expires: Math.floor((Date.now() + maxAge) / 1000),
      });
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
      db.sessions.remove(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  length(cb) {
    cb(null, db.sessions.count());
  }
}

module.exports = FileStore;
