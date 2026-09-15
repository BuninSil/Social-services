'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.VO_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'vonline.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ------------------------------------------------------------------ схема */

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  login         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  sex           TEXT NOT NULL DEFAULT 'm',
  status        TEXT NOT NULL DEFAULT '',
  avatar        TEXT,
  bday          TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  hometown      TEXT NOT NULL DEFAULT '',
  relationship  TEXT NOT NULL DEFAULT '',
  politics      TEXT NOT NULL DEFAULT '',
  worldview     TEXT NOT NULL DEFAULT '',
  activity      TEXT NOT NULL DEFAULT '',
  interests     TEXT NOT NULL DEFAULT '',
  music         TEXT NOT NULL DEFAULT '',
  films         TEXT NOT NULL DEFAULT '',
  tv            TEXT NOT NULL DEFAULT '',
  books         TEXT NOT NULL DEFAULT '',
  games         TEXT NOT NULL DEFAULT '',
  quotes        TEXT NOT NULL DEFAULT '',
  about         TEXT NOT NULL DEFAULT '',
  wall_who      TEXT NOT NULL DEFAULT 'all',
  created_at    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS friendships (
  from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_to ON friendships(to_id, status);

CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'group',
  avatar      TEXT,
  creator_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL,
  owner_id   INTEGER NOT NULL,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  photo_id   INTEGER,
  audio_id   INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_owner ON posts(owner_type, owner_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id, id DESC);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, id);

CREATE TABLE IF NOT EXISTS likes (
  target_type TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (target_type, target_id, user_id)
);

CREATE TABLE IF NOT EXISTS albums (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type  TEXT NOT NULL DEFAULT 'user',
  owner_id    INTEGER NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id    INTEGER REFERENCES albums(id) ON DELETE CASCADE,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file        TEXT NOT NULL,
  thumb       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_album ON photos(album_id, id DESC);

CREATE TABLE IF NOT EXISTS audios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist     TEXT NOT NULL,
  title      TEXT NOT NULL,
  file       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  expires INTEGER NOT NULL
);

/* ---- вторая версия: медиа, беседы, уведомления, приватность ---- */

CREATE TABLE IF NOT EXISTS videos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  file        TEXT NOT NULL,
  poster      TEXT,
  duration    INTEGER NOT NULL DEFAULT 0,
  size        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_videos_owner ON videos(owner_id, id DESC);

CREATE TABLE IF NOT EXISTS docs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  file       TEXT NOT NULL,
  ext        TEXT NOT NULL DEFAULT '',
  size       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_owner ON docs(owner_id, id DESC);

-- Вложения записей и сообщений. kind: photo | video | audio | doc | voice
CREATE TABLE IF NOT EXISTS attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_type TEXT NOT NULL,
  parent_id   INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  ref_id      INTEGER,
  file        TEXT,
  meta        TEXT NOT NULL DEFAULT '{}',
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_attach_parent ON attachments(parent_type, parent_id, position);

CREATE TABLE IF NOT EXISTS conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL DEFAULT 'dm',
  title      TEXT NOT NULL DEFAULT '',
  avatar     TEXT,
  creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conv_id      INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member',
  joined_at    INTEGER NOT NULL,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  left_at      INTEGER,
  PRIMARY KEY (conv_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  actor_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL DEFAULT '',
  target_id   INTEGER NOT NULL DEFAULT 0,
  url         TEXT NOT NULL DEFAULT '',
  preview     TEXT NOT NULL DEFAULT '',
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, id DESC);

CREATE TABLE IF NOT EXISTS blocks (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);
`);

/* -------------------------------------------------------------- миграции */

function columns(table) {
  return db.prepare('PRAGMA table_info(' + table + ')').all().map((c) => c.name);
}

function addColumn(table, name, definition) {
  if (!columns(table).includes(name)) {
    db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + name + ' ' + definition);
  }
}

// Приватность и профиль
addColumn('users', 'profile_who', "TEXT NOT NULL DEFAULT 'all'");
addColumn('users', 'photos_who', "TEXT NOT NULL DEFAULT 'all'");
addColumn('users', 'audio_who', "TEXT NOT NULL DEFAULT 'all'");
addColumn('users', 'friends_who', "TEXT NOT NULL DEFAULT 'all'");
addColumn('users', 'message_who', "TEXT NOT NULL DEFAULT 'all'");

// Записи: редактирование, закрепление, репосты
addColumn('posts', 'edited_at', 'INTEGER');
addColumn('posts', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
addColumn('posts', 'repost_of', 'INTEGER');

// Комментарии: редактирование и ответы
addColumn('comments', 'edited_at', 'INTEGER');
addColumn('comments', 'reply_to', 'INTEGER');

// Медиа: размеры и длительность
addColumn('photos', 'width', 'INTEGER NOT NULL DEFAULT 0');
addColumn('photos', 'height', 'INTEGER NOT NULL DEFAULT 0');
addColumn('photos', 'size', 'INTEGER NOT NULL DEFAULT 0');
addColumn('audios', 'duration', 'INTEGER NOT NULL DEFAULT 0');
addColumn('audios', 'size', 'INTEGER NOT NULL DEFAULT 0');

/**
 * Первая версия хранила личные сообщения парой from_id/to_id.
 * Переводим их в беседы, чтобы групповые чаты и диалоги жили в одной модели.
 */
function migrateMessagesToConversations() {
  const cols = columns('messages');
  if (cols.length && !cols.includes('to_id')) return; // уже новая форма

  const hadOld = cols.includes('to_id');
  if (hadOld) db.exec('ALTER TABLE messages RENAME TO messages_v1');

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      conv_id    INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text       TEXT NOT NULL DEFAULT '',
      kind       TEXT NOT NULL DEFAULT 'text',
      created_at INTEGER NOT NULL,
      edited_at  INTEGER,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conv_id, id DESC);
  `);

  if (!hadOld) return;

  const pairs = db.prepare(`
    SELECT DISTINCT MIN(from_id, to_id) AS a, MAX(from_id, to_id) AS b FROM messages_v1
  `).all();

  const newConv = db.prepare("INSERT INTO conversations (kind, created_at) VALUES ('dm', ?)");
  const newMember = db.prepare(
    'INSERT OR IGNORE INTO conversation_members (conv_id, user_id, joined_at, last_read_id) VALUES (?, ?, ?, 0)');
  const copy = db.prepare(
    'INSERT INTO messages (id, conv_id, from_id, text, created_at) VALUES (?, ?, ?, ?, ?)');
  const setRead = db.prepare(
    'UPDATE conversation_members SET last_read_id = ? WHERE conv_id = ? AND user_id = ?');

  const move = db.transaction(() => {
    for (const { a, b } of pairs) {
      const convId = newConv.run(Date.now() / 1000 | 0).lastInsertRowid;
      newMember.run(convId, a, Date.now() / 1000 | 0);
      newMember.run(convId, b, Date.now() / 1000 | 0);

      const rows = db.prepare(`
        SELECT * FROM messages_v1 WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id
      `).all(a, b, b, a);

      for (const m of rows) copy.run(m.id, convId, m.from_id, m.text, m.created_at);

      for (const uid of [a, b]) {
        const lastRead = db.prepare(`
          SELECT MAX(id) AS id FROM messages_v1
          WHERE to_id = ? AND from_id = ? AND is_read = 1
        `).get(uid, uid === a ? b : a);
        if (lastRead && lastRead.id) setRead.run(lastRead.id, convId, uid);
      }
    }
    db.exec('DROP TABLE messages_v1');
  });
  move();
}

migrateMessagesToConversations();

/** Старые вложения записей (одно фото / одно аудио) переносим в attachments. */
function migratePostAttachments() {
  const postCols = columns('posts');
  if (!postCols.includes('photo_id')) return;
  const pending = db.prepare(`
    SELECT id, photo_id, audio_id FROM posts WHERE photo_id IS NOT NULL OR audio_id IS NOT NULL
  `).all();
  if (!pending.length) return;

  const insert = db.prepare(`
    INSERT INTO attachments (parent_type, parent_id, kind, ref_id, position) VALUES ('post', ?, ?, ?, ?)
  `);
  const clear = db.prepare('UPDATE posts SET photo_id = NULL, audio_id = NULL WHERE id = ?');
  const move = db.transaction(() => {
    for (const post of pending) {
      let pos = 0;
      if (post.photo_id) insert.run(post.id, 'photo', post.photo_id, pos++);
      if (post.audio_id) insert.run(post.id, 'audio', post.audio_id, pos++);
      clear.run(post.id);
    }
  });
  move();
}

migratePostAttachments();

module.exports = db;
