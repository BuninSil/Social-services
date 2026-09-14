import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { one, run, now } from './db.js';

const SESSION_TTL = 1000 * 60 * 60 * 24 * 30;
const ROLE_WEIGHT = { user: 0, moderator: 1, admin: 2 };

export const roleAtLeast = (user, role) =>
  !!user && (ROLE_WEIGHT[user.role] ?? 0) >= (ROLE_WEIGHT[role] ?? 99);

export const isStaff = (user) => roleAtLeast(user, 'moderator');

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

/** Хеш-пустышка: прогоняем scrypt даже для несуществующего ника,
    иначе время ответа выдаёт, занят ли он. */
const DUMMY_HASH = hashPassword(randomBytes(24).toString('hex'));

export function verifyDummy(password) {
  verifyPassword(String(password ?? ''), DUMMY_HASH);
  return false;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  run('INSERT INTO sessions(token, user_id, expires_at) VALUES(?, ?, ?)',
    token, userId, Date.now() + SESSION_TTL);
  return token;
}

export function readSession(token) {
  if (!token) return null;
  const session = one('SELECT * FROM sessions WHERE token = ?', token);
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    run('DELETE FROM sessions WHERE token = ?', token);
    return null;
  }
  return one('SELECT * FROM users WHERE id = ?', session.user_id);
}

export const dropSession = (token) => {
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
};

/** Бан рвёт все сессии: разлогинивает забаненного немедленно. */
export function banUser(userId, reason) {
  run('UPDATE users SET banned_at = ?, ban_reason = ? WHERE id = ?', now(), String(reason || ''), userId);
  run('DELETE FROM sessions WHERE user_id = ?', userId);
}

export const unbanUser = (userId) =>
  run('UPDATE users SET banned_at = NULL, ban_reason = NULL WHERE id = ?', userId);

/** Разлогинить везде: применяется при смене пароля и по кнопке. */
export const dropAllSessions = (userId) =>
  run('DELETE FROM sessions WHERE user_id = ?', userId);

export const purgeExpiredSessions = () =>
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
