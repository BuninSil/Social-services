import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DB_PATH = process.env.NEONHUB_DB || join(root, 'data', 'db.json');

const EMPTY = { users: [], posts: [], comments: [], sessions: {}, seq: 1 };

let db = load();
let writeTimer = null;

function load() {
  if (!existsSync(DB_PATH)) return structuredClone(EMPTY);
  try {
    const parsed = JSON.parse(readFileSync(DB_PATH, 'utf8'));
    return { ...structuredClone(EMPTY), ...parsed };
  } catch {
    console.warn('[store] db.json повреждён, стартуем с пустой базы');
    return structuredClone(EMPTY);
  }
}

function flush() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DB_PATH);
}

/** Отложенная запись — пачка правок схлопывается в один fsync. */
export function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => { writeTimer = null; flush(); }, 50);
}

export function persistNow() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  flush();
}

export const data = () => db;
export const nextId = () => String(db.seq++);
export const now = () => new Date().toISOString();

export function reset(seedData) {
  db = { ...structuredClone(EMPTY), ...seedData };
  persistNow();
}

// --- пароли -----------------------------------------------------------------

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// --- сессии -----------------------------------------------------------------

const SESSION_TTL = 1000 * 60 * 60 * 24 * 30;

export function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  db.sessions[token] = { userId, expires: Date.now() + SESSION_TTL };
  persist();
  return token;
}

export function readSession(token) {
  const s = token && db.sessions[token];
  if (!s) return null;
  if (s.expires < Date.now()) { delete db.sessions[token]; persist(); return null; }
  return db.users.find((u) => u.id === s.userId) || null;
}

export function dropSession(token) {
  if (token && db.sessions[token]) { delete db.sessions[token]; persist(); }
}
