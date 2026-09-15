'use strict';

const crypto = require('crypto');

/* ------------------------------------------------------------------ CSRF */

/**
 * Токен живёт в сессии и требуется для каждого изменяющего запроса.
 * Cookie и так SameSite=lax, но токен закрывает и то, что lax пропускает.
 */
function csrfToken(req) {
  if (!req.session) return '';
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  return req.session.csrf;
}

function tokenFrom(req) {
  return String(
    (req.body && req.body._csrf) ||
    req.get('x-csrf-token') ||
    (req.query && req.query._csrf) || ''
  );
}

function tokensMatch(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function rejectCsrf(req, res) {
  if (req.xhr || req.get('x-requested-with') || (req.get('accept') || '').includes('json')) {
    return res.status(403).json({ error: 'csrf' });
  }
  return res.status(403).render('error', {
    code: 403,
    message: 'Сессия устарела или форма отправлена не с этого сайта. Обновите страницу и повторите.',
  });
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Для обычных форм проверяем сразу. Файловые формы разбирает multer,
 * поэтому их проверяет checkCsrf уже после него (см. uploadThen).
 */
function csrfProtect(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if ((req.get('content-type') || '').startsWith('multipart/form-data')) {
    req._csrfDeferred = true;
    return next();
  }
  if (!tokensMatch(tokenFrom(req), req.session && req.session.csrf)) return rejectCsrf(req, res);
  next();
}

function checkCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!tokensMatch(tokenFrom(req), req.session && req.session.csrf)) return rejectCsrf(req, res);
  req._csrfChecked = true;
  next();
}

/** Приём файлов: сначала multer, сразу за ним — проверка токена. */
function uploadThen(multerMiddleware) {
  return [multerMiddleware, checkCsrf];
}

/* ------------------------------------------------------- ограничение частоты */

const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of buckets) {
    const alive = hits.filter((t) => t > now - 3600000);
    if (alive.length) buckets.set(key, alive);
    else buckets.delete(key);
  }
}, 600000).unref();

function hit(key, windowMs, max) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => t > now - windowMs);
  hits.push(now);
  buckets.set(key, hits);
  return hits.length <= max;
}

function clientIp(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * Лимит на действие. message показывается как обычная ошибка,
 * json-запросам отвечаем кодом 429.
 */
function rateLimit(name, windowMs, max, message) {
  return (req, res, next) => {
    const key = name + ':' + clientIp(req) + ':' + ((req.session && req.session.userId) || 0);
    if (hit(key, windowMs, max)) return next();
    if ((req.get('content-type') || '').includes('json')) {
      return res.status(429).json({ error: 'rate_limit' });
    }
    res.status(429).render('error', { code: 429, message: message || 'Слишком часто. Подождите немного.' });
  };
}

/** Отдельный счётчик неудачных входов — по адресу и по логину. */
const loginGuard = {
  allow(req, login) {
    const ip = clientIp(req);
    return hit('login-ip:' + ip, 15 * 60000, 20) && hit('login-user:' + String(login).toLowerCase(), 15 * 60000, 10);
  },
  reset(req, login) {
    buckets.delete('login-ip:' + clientIp(req));
    buckets.delete('login-user:' + String(login).toLowerCase());
  },
};

/* ------------------------------------------------------- редиректы и адреса */

/** Пускаем только внутренние адреса: без этого получается открытый редирект. */
function safePath(value, fallback) {
  const url = String(value || '');
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return fallback;
  if (/[\r\n]/.test(url)) return fallback;
  return url;
}

/** Куда вернуться после действия: явное поле back, иначе свой же referer. */
function backTo(req, fallback) {
  if (req.body && req.body.back) return safePath(req.body.back, fallback);
  if (req.query && req.query.back) return safePath(req.query.back, fallback);
  const referer = req.get('referer');
  if (referer) {
    try {
      const parsed = new URL(referer);
      if (parsed.host === req.get('host')) return safePath(parsed.pathname + parsed.search, fallback);
    } catch (err) { /* кривой referer — просто игнорируем */ }
  }
  return fallback;
}

/* ------------------------------------------------------------- заголовки */

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' ws: wss:",
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(self), interest-cohort=()');
  next();
}

module.exports = {
  csrfToken, csrfProtect, checkCsrf, uploadThen,
  rateLimit, loginGuard, clientIp,
  safePath, backTo, securityHeaders,
};
