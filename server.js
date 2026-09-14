import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as api from './lib/api.js';
import { HttpError } from './lib/api.js';
import { readSession, persistNow, data } from './lib/store.js';
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
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

const json = (res, status, payload, headers = {}) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
};

function readCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf('=');
        return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
      }));
}

const sessionCookie = (token) =>
  `nh_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
const clearCookie = () => 'nh_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

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
    file = join(PUBLIC, 'index.html'); // SPA fallback: любой путь отдаёт приложение
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=300',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}

async function route(req, res, url, viewer, token) {
  const { pathname, searchParams } = url;
  const query = Object.fromEntries(searchParams);
  const segments = pathname.split('/').filter(Boolean); // ['api', ...]
  const [, section, id, action] = segments;
  const method = req.method;

  if (section === 'auth') {
    if (method === 'POST' && id === 'register') {
      const { user, token: t } = api.register(await readBody(req));
      return json(res, 201, api.publicUser(user), { 'set-cookie': sessionCookie(t) });
    }
    if (method === 'POST' && id === 'login') {
      const { user, token: t } = api.login(await readBody(req));
      return json(res, 200, api.publicUser(user), { 'set-cookie': sessionCookie(t) });
    }
    if (method === 'POST' && id === 'logout') {
      api.logout(token);
      return json(res, 200, { ok: true }, { 'set-cookie': clearCookie() });
    }
  }

  if (section === 'me') {
    if (method === 'GET') return json(res, 200, api.publicUser(viewer));
    if (method === 'PATCH') return json(res, 200, api.updateProfile(viewer, await readBody(req)));
  }

  if (section === 'posts') {
    if (method === 'GET' && !id) return json(res, 200, api.listPosts(viewer, query));
    if (method === 'POST' && !id) return json(res, 201, api.createPost(viewer, await readBody(req)));
    if (method === 'GET' && id && !action) return json(res, 200, api.getPost(viewer, id));
    if (method === 'DELETE' && id && !action) return json(res, 200, api.deletePost(viewer, id));
    if (method === 'POST' && action === 'like') return json(res, 200, api.toggleLike(viewer, id));
    if (method === 'POST' && action === 'comments') {
      return json(res, 201, api.addComment(viewer, id, await readBody(req)));
    }
  }

  if (section === 'comments' && method === 'DELETE' && id) {
    return json(res, 200, api.deleteComment(viewer, id));
  }

  if (section === 'users' && method === 'GET' && id) return json(res, 200, api.profile(id));
  if (section === 'stats' && method === 'GET') return json(res, 200, api.stats());

  throw new HttpError(404, 'Нет такого эндпоинта');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

  const token = readCookies(req).nh_session;
  const viewer = readSession(token);
  try {
    await route(req, res, url, viewer, token);
  } catch (err) {
    if (err instanceof HttpError) return json(res, err.status, { error: err.message });
    console.error('[api]', err);
    json(res, 500, { error: 'Внутренняя ошибка сервера' });
  }
});

seedIfEmpty();

server.listen(PORT, HOST, () => {
  const db = data();
  console.log(`\n  ▞▞ NEONHUB запущен → http://localhost:${PORT}`);
  console.log(`     ${db.users.length} юзеров · ${db.posts.length} постов · ${db.comments.length} комментов\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    persistNow();
    server.close(() => process.exit(0));
    // keep-alive соединения не дают close() завершиться сами по себе
    server.closeAllConnections?.();
    setTimeout(() => process.exit(0), 800).unref();
  });
}
