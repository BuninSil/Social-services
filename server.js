import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as api from './lib/api.js';
import { HttpError } from './lib/api.js';
import { readSession, purgeExpiredSessions } from './lib/auth.js';
import { hit, clear as clearRate } from './lib/rate.js';
import { close as closeDb } from './lib/db.js';
import { CHANNELS, LANES, ROLES, RANKS, HEROES, FEATS } from './lib/mlbb.js';
import { seedIfEmpty } from './seed.js';

const root = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(root, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...SECURITY_HEADERS,
    ...headers,
  });
  res.end(body);
}

const readCookies = (req) => Object.fromEntries(
  (req.headers.cookie || '').split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
  }));

// за HTTPS-прокси ставим Secure: NEONHUB_SECURE=1
const SECURE = process.env.NEONHUB_SECURE === '1' ? '; Secure' : '';
const sessionCookie = (token) =>
  `nh_session=${token}; Path=/; HttpOnly; SameSite=Lax${SECURE}; Max-Age=${60 * 60 * 24 * 30}`;
const clearCookie = () => `nh_session=; Path=/; HttpOnly; SameSite=Lax${SECURE}; Max-Age=0`;

/* Заголовки безопасности. CSP запрещает inline-скрипты и чужие источники,
   frame-ancestors 'none' закрывает кликджекинг. Шрифты Google разрешены явно. */
const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'geolocation=(), camera=(), microphone=()',
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 256 * 1024) throw new HttpError(413, 'Слишком большой запрос');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Ожидался JSON'); }
}

async function serveStatic(req, res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(PUBLIC, rel);
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(PUBLIC, 'index.html'); // SPA-фолбэк
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=300',
      ...SECURITY_HEADERS,
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}

/** Справочник игры — клиент тянет его один раз при старте. */
const META = {
  channels: CHANNELS,
  lanes: LANES,
  roles: ROLES,
  ranks: RANKS,
  heroes: HEROES,
  feats: FEATS,
};

/** Ключ лимита: для гостя — адрес, для своего — id, чтобы не били по общему NAT. */
function limitKey(req, viewer) {
  if (viewer) return `u${viewer.id}`;
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function guard(req, res, viewer, action) {
  const { ok, retryAfter } = hit(action, limitKey(req, viewer));
  if (ok) return true;
  json(res, 429, { error: `Слишком часто. Попробуй через ${retryAfter} с.` },
    { 'retry-after': String(retryAfter) });
  return false;
}

async function route(req, res, url, viewer, token) {
  const segments = url.pathname.split('/').filter(Boolean); // ['api', section, id, action, ...]
  const [, section, id, action] = segments;
  const query = Object.fromEntries(url.searchParams);
  const method = req.method;

  if (section === 'meta' && method === 'GET') return json(res, 200, META);

  if (section === 'auth') {
    if (method === 'POST' && id === 'register') {
      if (!guard(req, res, viewer, 'register')) return;
      const { user, token: fresh } = api.register(await readBody(req));
      return json(res, 201, api.publicUser(user, user), { 'set-cookie': sessionCookie(fresh) });
    }
    if (method === 'POST' && id === 'login') {
      if (!guard(req, res, viewer, 'login')) return;
      const { user, token: fresh } = api.login(await readBody(req));
      clearRate('login', limitKey(req, viewer));   // успешный вход снимает счётчик
      return json(res, 200, api.publicUser(user, user), { 'set-cookie': sessionCookie(fresh) });
    }
    if (method === 'POST' && id === 'logout-all') {
      api.logoutEverywhere(viewer);
      return json(res, 200, { ok: true }, { 'set-cookie': clearCookie() });
    }
    if (method === 'POST' && id === 'logout') {
      api.logout(token);
      return json(res, 200, { ok: true }, { 'set-cookie': clearCookie() });
    }
  }

  if (section === 'me') {
    if (method === 'GET') {
      if (!viewer) return json(res, 200, null);
      return json(res, 200, {
        ...api.publicUser(viewer, viewer),
        unread: api.unreadCount(viewer),
        unreadNotifications: api.unreadNotifications(viewer),
      });
    }
    if (method === 'PATCH') return json(res, 200, api.updateProfile(viewer, await readBody(req)));
    if (method === 'DELETE' && !id) {
      api.deleteAccount(viewer, await readBody(req));
      return json(res, 200, { ok: true }, { 'set-cookie': clearCookie() });
    }
    if (method === 'POST' && id === 'password') {
      const result = api.changePassword(viewer, await readBody(req));
      return json(res, 200, result, { 'set-cookie': clearCookie() });
    }
  }

  if (section === 'posts') {
    if (method === 'GET' && !id) return json(res, 200, api.listPosts(viewer, query));
    if (method === 'POST' && !id) {
      if (!guard(req, res, viewer, 'post')) return;
      return json(res, 201, api.createPost(viewer, await readBody(req)));
    }
    if (method === 'PATCH' && id && !action) {
      return json(res, 200, api.editPost(viewer, Number(id), await readBody(req)));
    }
    if (method === 'GET' && id && !action) return json(res, 200, api.getPost(viewer, Number(id)));
    if (method === 'DELETE' && id && !action) return json(res, 200, api.deletePost(viewer, Number(id)));
    if (method === 'POST' && action === 'like') return json(res, 200, api.toggleLike(viewer, Number(id)));
    if (method === 'POST' && action === 'pin') return json(res, 200, api.togglePin(viewer, Number(id)));
    if (method === 'POST' && action === 'comments') {
      if (!guard(req, res, viewer, 'comment')) return;
      return json(res, 201, api.addComment(viewer, Number(id), await readBody(req)));
    }
  }

  if (section === 'comments' && id) {
    if (method === 'DELETE') return json(res, 200, api.deleteComment(viewer, Number(id)));
    if (method === 'PATCH') return json(res, 200, api.editComment(viewer, Number(id), await readBody(req)));
  }

  if (section === 'users' && method === 'GET' && !id) {
    return json(res, 200, api.searchUsers(query.q || '', viewer));
  }

  if (section === 'users' && id) {
    if (method === 'GET' && !action) return json(res, 200, api.profile(id, viewer));
    if (method === 'POST' && action === 'follow') return json(res, 200, api.toggleFollow(viewer, id));
    if (method === 'POST' && action === 'block') return json(res, 200, api.toggleBlock(viewer, id));
    if (method === 'GET' && (action === 'followers' || action === 'following')) {
      return json(res, 200, api.followList(id, action, viewer));
    }
  }

  if (section === 'messages') {
    if (method === 'GET' && !id) return json(res, 200, api.conversations(viewer));
    if (method === 'GET' && id) return json(res, 200, api.thread(viewer, id));
    if (method === 'POST' && id) {
      if (!guard(req, res, viewer, 'message')) return;
      return json(res, 201, api.sendMessage(viewer, id, await readBody(req)));
    }
  }

  if (section === 'notifications') {
    if (method === 'GET') return json(res, 200, api.notifications(viewer));
    if (method === 'POST' && id === 'read') return json(res, 200, api.readNotifications(viewer));
  }

  if (section === 'blocks' && method === 'GET') return json(res, 200, api.blockedList(viewer));

  if (section === 'reports' && method === 'POST') {
    if (!guard(req, res, viewer, 'report')) return;
    return json(res, 201, api.report(viewer, await readBody(req)));
  }

  if (section === 'admin') {
    if (method === 'GET' && !id) return json(res, 200, api.adminOverview(viewer));
    if (method === 'POST' && id === 'role') {
      const body = await readBody(req);
      return json(res, 200, api.setRole(viewer, Number(body.userId), body.role));
    }
    if (method === 'POST' && id === 'ban') {
      const body = await readBody(req);
      return json(res, 200, api.setBan(viewer, Number(body.userId), !!body.banned, body.reason));
    }
    if (method === 'POST' && id === 'resolve') {
      const body = await readBody(req);
      return json(res, 200, api.resolveReport(viewer, Number(body.reportId)));
    }
  }

  if (section === 'stats' && method === 'GET') return json(res, 200, api.stats(viewer));

  throw new HttpError(404, 'Нет такого эндпоинта');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

  const token = readCookies(req).nh_session;
  const viewer = readSession(token);

  // забаненного не пускаем дальше чтения и выхода
  if (viewer?.banned_at && !(req.method === 'GET' || url.pathname === '/api/auth/logout')) {
    return json(res, 403, { error: `Аккаунт заблокирован: ${viewer.ban_reason || 'без указания причины'}` });
  }

  try {
    await route(req, res, url, viewer, token);
  } catch (err) {
    if (err instanceof HttpError) return json(res, err.status, { error: err.message });
    console.error('[api]', err);
    json(res, 500, { error: 'Внутренняя ошибка сервера' });
  }
});

purgeExpiredSessions();
seedIfEmpty();

server.listen(PORT, HOST, () => {
  console.log(`\n  ▞▞ NEONHUB · MLBB → http://localhost:${PORT}`);
  const s = api.stats(null);
  console.log(`     ${s.users} игроков · ${s.posts} постов · ${s.comments} комментов\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => { closeDb(); process.exit(0); });
    server.closeAllConnections?.();
    setTimeout(() => { closeDb(); process.exit(0); }, 800).unref();
  });
}
