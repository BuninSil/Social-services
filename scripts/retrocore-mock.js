'use strict';

/**
 * Игрушечный RetroCore для разработки.
 *
 * Повторяет ровно то, что описано в инструкции сети: страницу /connect/authorize
 * и обмен кода на участника через POST /api/connect/token. Нужен, чтобы
 * проверять вход, не имея доступа к настоящей сети.
 *
 *   node scripts/retrocore-mock.js
 *   RC_BASE=http://127.0.0.1:8099 RC_CLIENT_ID=demo RC_CLIENT_SECRET=rcs_demo \
 *   RC_REDIRECT_URI=http://127.0.0.1:8080/connect/callback npm start
 */

const http = require('http');
const crypto = require('crypto');

const PORT = parseInt(process.env.RC_MOCK_PORT, 10) || 8099;
const SECRET = process.env.RC_MOCK_SECRET || 'rcs_demo';
const USERS = {
  1: { id: 1, username: 'buninsil', role: 'admin', role_name: 'Администратор', title: '' },
  5: { id: 5, username: 'jessica', role: 'member', role_name: 'Участник', title: '' },
};

const codes = new Map();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (req.method === 'GET' && url.pathname === '/connect/authorize') {
    const redirect = url.searchParams.get('redirect_uri') || '';
    const state = url.searchParams.get('state') || '';
    const who = url.searchParams.get('as') || '1';
    if (!redirect) return text(res, 400, 'нет redirect_uri');

    const code = crypto.randomBytes(12).toString('hex');
    codes.set(code, { user: USERS[who] || USERS[1], redirect: redirect, at: Date.now() });
    const back = new URL(redirect);
    back.searchParams.set('code', code);
    back.searchParams.set('state', state);
    res.writeHead(302, { Location: back.href });
    return res.end();
  }

  if (req.method === 'POST' && url.pathname === '/api/connect/token') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10000) req.destroy();
    });
    req.on('end', () => {
      if (req.headers.authorization !== 'Bearer ' + SECRET) {
        return json(res, 401, { ok: false, error: 'плохой секрет' });
      }
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch (e) { /* ниже отвалится */ }

      const entry = codes.get(String(payload.code || ''));
      if (!entry) return json(res, 400, { ok: false, error: 'код не найден или уже использован' });
      codes.delete(String(payload.code));
      if (Date.now() - entry.at > 5 * 60 * 1000) return json(res, 400, { ok: false, error: 'код протух' });
      if (payload.redirect_uri !== entry.redirect) {
        return json(res, 400, { ok: false, error: 'redirect_uri не совпал' });
      }

      const u = entry.user;
      json(res, 200, {
        ok: true,
        access_token: 'rct_' + crypto.randomBytes(8).toString('hex'),
        token_type: 'Bearer',
        expires_in: 2592000,
        user: {
          id: u.id,
          username: u.username,
          role: u.role,
          role_name: u.role_name,
          title: u.title,
          status: 'online',
          status_msg: 'Работаю над новым сайтом',
          avatar_url: 'http://127.0.0.1:' + PORT + '/static/icons/user.svg',
          profile_url: 'http://127.0.0.1:' + PORT + '/people/' + u.username,
          blocked: false,
          deleted: false,
        },
      });
    });
    return;
  }

  if (url.pathname === '/static/icons/user.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
      '<rect width="200" height="200" fill="#dfe3e8"/><circle cx="100" cy="78" r="38" fill="#b8c1cc"/>' +
      '<circle cx="100" cy="200" r="72" fill="#b8c1cc"/></svg>');
  }

  text(res, 404, 'нет такой страницы');
});

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function text(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log('Игрушечный RetroCore на http://127.0.0.1:' + PORT);
  console.log('Секрет приложения: ' + SECRET);
  console.log('Войти другим участником: добавьте &as=5 к адресу /connect/authorize');
});
