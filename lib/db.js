import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DB_PATH = process.env.NEONHUB_DB || join(root, 'data', 'neonhub.sqlite');

if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL UNIQUE,
  password   TEXT    NOT NULL,
  role       TEXT    NOT NULL DEFAULT 'user',      -- user | moderator | admin
  banned_at  TEXT,
  ban_reason TEXT,
  bio        TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT '',          -- строка-подпись под ником
  accent     INTEGER NOT NULL DEFAULT 0,
  hero       TEXT    NOT NULL DEFAULT '',          -- любимый герой
  lane       TEXT    NOT NULL DEFAULT 'roam',
  rank_id    TEXT    NOT NULL DEFAULT 'warrior',
  game_id    TEXT    NOT NULL DEFAULT '',          -- ID (сервер) в игре
  win_rate   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  channel    TEXT    NOT NULL,
  tags       TEXT    NOT NULL DEFAULT '',          -- через запятую
  hero       TEXT    NOT NULL DEFAULT '',          -- о каком герое пост
  feat       TEXT    NOT NULL DEFAULT '',          -- savage | maniac | legendary | mvp
  lfg_lane   TEXT    NOT NULL DEFAULT '',          -- для поиска тиммейтов
  lfg_rank   TEXT    NOT NULL DEFAULT '',
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS likes (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  read_at    TEXT,
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT    NOT NULL,                    -- post | comment | user
  target_id   INTEGER NOT NULL,
  reason      TEXT    NOT NULL,
  resolved_at TEXT,
  created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_channel  ON posts(channel);
CREATE INDEX IF NOT EXISTS idx_posts_author   ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created  ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post  ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_messages_pair  ON messages(sender_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_inbox ON messages(recipient_id, read_at);
CREATE INDEX IF NOT EXISTS idx_reports_open   ON reports(resolved_at);
`);

/* Миграции для баз, созданных прошлыми версиями. SQLite не умеет
   ADD COLUMN IF NOT EXISTS, поэтому смотрим на фактический список колонок. */
function columns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}
function addColumn(table, name, definition) {
  if (!columns(table).includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

addColumn('users', 'username_lower', "TEXT NOT NULL DEFAULT ''");
addColumn('posts', 'edited_at', 'TEXT');
addColumn('comments', 'edited_at', 'TEXT');

// заполняем ключ уникальности для старых записей
db.exec("UPDATE users SET username_lower = lower(username) WHERE username_lower = ''");
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lower ON users(username_lower)');

db.exec(`
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL,          -- like | comment | follow | mention
  post_id    INTEGER,
  preview    TEXT    NOT NULL DEFAULT '',
  read_at    TEXT,
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker     ON blocks(blocker_id);
`);

export const now = () => new Date().toISOString();

/** Мелкие обёртки: в коде домена не хочется видеть prepare() на каждой строке. */
export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const one = (sql, ...params) => db.prepare(sql).get(...params) ?? null;
export const run = (sql, ...params) => db.prepare(sql).run(...params);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function close() {
  try { db.close(); } catch { /* уже закрыта */ }
}
