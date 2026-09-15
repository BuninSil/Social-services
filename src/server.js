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
const { loadUser } = require('./lib/auth');
const SqliteStore = require('./lib/session-store');
const { UPLOAD_DIR } = require('./lib/upload');
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
app.disable('x-powered-by');

// Хелперы, доступные во всех шаблонах.
app.locals.u = u;
app.locals.avatar = view.avatar;
app.locals.gavatar = view.gavatar;

app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css'), { maxAge: '1h' }));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js'), { maxAge: '1h' }));
app.use('/img', express.static(path.join(__dirname, '..', 'public', 'img'), { maxAge: '7d' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false, dotfiles: 'deny' }));

app.use(express.urlencoded({ extended: false, limit: '1mb' }));

const sessionParser = session({
  name: 'vo_sid',
  secret: sessionSecret(),
  store: new SqliteStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 },
});
app.use(sessionParser);
app.use(loadUser);

app.use(require('./routes/auth'));
app.use(require('./routes/profile'));
app.use(require('./routes/settings'));
app.use(require('./routes/friends'));
app.use(require('./routes/wall'));
app.use(require('./routes/im'));
app.use(require('./routes/photos'));
app.use(require('./routes/audio'));
app.use(require('./routes/groups'));
app.use(require('./routes/misc'));

app.use((req, res) => {
  res.status(404).render('error', { code: 404, message: 'Такой страницы здесь нет.' });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).render('error', { code: 413, message: 'Файл слишком большой.' });
  }
  console.error(err);
  res.status(500).render('error', { code: 500, message: 'Что-то сломалось. Попробуйте ещё раз.' });
});

const server = http.createServer(app);
ws.attach(server, sessionParser);

server.listen(PORT, HOST, () => {
  const users = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  console.log('ВОнлайне слушает http://' + HOST + ':' + PORT + ' (пользователей: ' + users + ')');
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
