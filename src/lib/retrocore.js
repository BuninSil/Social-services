'use strict';

/**
 * Вход через RetroCore — «Вариант Б» из инструкции сети:
 * отдельный проект со своим сервером получает участника по коду.
 *
 * 1. Кнопка ведёт на /connect/authorize сети с client_id, адресом возврата и state;
 * 2. сеть возвращает участника на наш /connect/callback?code=…&state=…;
 * 3. код меняем на данные участника уже с сервера — секрет наружу не светим.
 *
 * Приложение регистрируется в панели сети: Панель сервера → Приложения.
 * Адрес возврата должен совпадать символ в символ с указанным там.
 */

const crypto = require('crypto');

const BASE = String(process.env.RC_BASE || 'http://88.87.70.78:8080').replace(/\/+$/, '');
const CLIENT_ID = String(process.env.RC_CLIENT_ID || '').trim();
const CLIENT_SECRET = String(process.env.RC_CLIENT_SECRET || '').trim();
const REDIRECT_URI = String(process.env.RC_REDIRECT_URI || '').trim();
const TIMEOUT = 10000;

function configured() {
  return !!(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

/** Куда отправить человека, чтобы сеть его узнала. */
function authorizeUrl(state) {
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state: state,
  });
  return BASE + '/connect/authorize?' + query.toString();
}

function newState() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Меняет одноразовый код на участника. Всё пришедшее считаем чужими данными:
 * проверяем форму и приводим к своим типам.
 */
async function exchange(code) {
  const res = await fetch(BASE + '/api/connect/token', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + CLIENT_SECRET,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ code: String(code), redirect_uri: REDIRECT_URI }),
    signal: AbortSignal.timeout(TIMEOUT),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('сеть ответила не по-человечески (код ' + res.status + ')');
  }
  if (!res.ok || !data || data.ok !== true) {
    throw new Error((data && (data.error || data.message)) || 'сеть отклонила код (' + res.status + ')');
  }

  const user = data.user || {};
  const id = parseInt(user.id, 10);
  const username = String(user.username || '').trim();
  if (!id || !username) throw new Error('сеть не прислала участника');
  if (user.blocked || user.deleted) throw new Error('этот аккаунт в сети заблокирован');

  return {
    token: String(data.access_token || ''),
    expires: parseInt(data.expires_in, 10) || 0,
    user: {
      id: id,
      username: username,
      title: str(user.title, 60),
      role: str(user.role, 30),
      roleName: str(user.role_name, 40),
      statusMsg: str(user.status_msg, 140),
      online: user.status === 'online',
      avatar: absolute(user.avatar_url),
      profile: absolute(user.profile_url),
    },
  };
}

const CONTROL_CHARS = new RegExp('[\\x00-\\x1f]', 'g');

function str(value, max) {
  return String(value == null ? '' : value).replace(CONTROL_CHARS, '').trim().slice(0, max);
}

/** Ссылки из ответа принимаем только на саму сеть — чужие адреса нам ни к чему. */
function absolute(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw, BASE);
  } catch (e) {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (url.origin !== new URL(BASE).origin) return '';
  return url.href;
}

module.exports = { BASE, CLIENT_ID, configured, authorizeUrl, newState, exchange };
