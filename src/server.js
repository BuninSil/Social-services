'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const db = require('./db');
const u = require('./lib/util');
const view = require('./lib/view');
const media = require('./lib/media');
const M = require('./lib/models');
const { loadUser } = require('./lib/auth');
const SqliteStore = require('./lib/session-store');
const security = require('./lib/security');
const ws = require('./ws');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.VO_DATA_DIR || path.join(__dirname, '..', 'data');

/** Секрет сессий переживает перезапуск, иначе всех выкидывает из аккаунтов. */
function sessionSecret() {
  if (process.env.VO_SECRET) return process.env.VO_SECRET;
  const file = path.join(DATA_DIR, 'session.secret');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return fs.readFileSync(file, 'utf8').trim();
}

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1);
app.set('query parser', 'simple');
app.disable('x-powered-by');

// Хелперы, доступные во всех шаблонах.
app.locals.u = u;
app.locals.avatar = view.avatar;
app.locals.gavatar = view.gavatar;
app.locals.convAvatar = view.convAvatar;
app.locals.act = view.act;
app.locals.duration = view.duration;
app.locals.fileSize = view.size;
app.locals.online = (userId) => ws.isOnline(userId);

app.use(security.securityHeaders);

const staticOptions = { maxAge: '1h', redirect: false };
app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css'), staticOptions));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js'), staticOptions));
app.use('/img', express.static(path.join(__dirname, '..', 'public', 'img'), { maxAge: '7d', redirect: false }));

/**
 * Загруженные файлы отдаём только как данные: без разбора типа браузером
 * и без выполнения — иначе картинка с html внутри становится чужим скриптом.
 */
app.use('/uploads', (req, res, next) => {
  if (req.path.startsWith('/docs/')) return res.status(404).end();
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  next();
}, express.static(media.UPLOAD_DIR, {
  maxAge: '7d',
  index: false,
  dotfiles: 'deny',
  redirect: false,
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

app.use(express.urlencoded({ extended: false, limit: '256kb', parameterLimit: 200 }));

const sessionParser = session({
  name: 'vo_sid',
  secret: sessionSecret(),
  store: new SqliteStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  proxy: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
});
app.use(sessionParser);

/**
 * Оформление выбирается на лету: /id1?theme=neon и дальше запоминается.
 * Нужно, чтобы сравнивать варианты дизайна не пересобирая ничего.
 */
const THEMES = new Set(['vo', 'neon', 'fresh', 'modern']);
app.use((req, res, next) => {
  if (req.query.theme && THEMES.has(req.query.theme)) req.session.theme = req.query.theme;
  res.locals.theme = (req.session && req.session.theme) || 'vo';
  next();
});

app.use(loadUser);
app.use(security.csrfProtect);

app.use(require('./routes/auth'));
app.use(require('./routes/profile'));
app.use(require('./routes/settings'));
app.use(require('./routes/friends'));
app.use(require('./routes/wall'));
app.use(require('./routes/im'));
app.use(require('./routes/photos'));
app.use(require('./routes/video'));
app.use(require('./routes/audio'));
app.use(require('./routes/docs'));
app.use(require('./routes/groups'));
app.use(require('./routes/notifications'));
app.use(require('./routes/misc'));

app.use((req, res) => {
  res.status(404).render('error', { code: 404, message: 'Такой страницы здесь нет.' });
});

app.use((err, req, res, next) => {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT')) {
    return res.status(413).render('error', {
      code: 413, message: 'Файл слишком большой или файлов слишком много.',
    });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).render('error', { code: 413, message: 'Слишком много данных в запросе.' });
  }
  console.error('[ошибка]', err && err.message ? err.message : err);
  res.status(500).render('error', { code: 500, message: 'Что-то сломалось. Попробуйте ещё раз.' });
});

const server = http.createServer(app);
ws.attach(server, sessionParser);

/** Статус «в сети» показываем друзьям сразу, без перезагрузки страницы. */
ws.onPresence((userId, online) => {
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(u.now(), userId);
  ws.sendMany(M.friendIds(userId), { kind: 'presence', user_id: userId, online });
});

server.listen(PORT, HOST, () => {
  const users = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  console.log('ВОнлайне слушает http://' + HOST + ':' + PORT + ' (пользователей: ' + users + ')');
  if (!media.ffmpegAvailable()) {
    console.log('ffmpeg не найден: видео примут, но без обложки и длительности.');
  }
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
