'use strict';

const { WebSocketServer } = require('ws');

/** Соединения, сгруппированные по id пользователя: у человека бывает несколько вкладок. */
const clients = new Map();

/** Обработчики сообщений от клиента, чтобы не тащить сюда модели. */
const handlers = new Map();

function add(userId, socket) {
  const first = !clients.has(userId);
  if (first) clients.set(userId, new Set());
  clients.get(userId).add(socket);
  return first;
}

function drop(userId, socket) {
  const set = clients.get(userId);
  if (!set) return false;
  set.delete(socket);
  if (set.size) return false;
  clients.delete(userId);
  return true;
}

function send(userId, payload) {
  const set = clients.get(userId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const socket of set) {
    if (socket.readyState === socket.OPEN) socket.send(data);
  }
}

function sendMany(userIds, payload, exceptId) {
  for (const id of new Set(userIds)) {
    if (id !== exceptId) send(id, payload);
  }
}

const isOnline = (userId) => clients.has(userId);
const onlineIds = () => [...clients.keys()];

/** Регистрирует обработчик входящего события: on('typing', (userId, data) => ...) */
function on(kind, fn) {
  handlers.set(kind, fn);
}

/** Вызывается при первом входе и последнем выходе — для статуса «в сети». */
let presenceHook = null;
const onPresence = (fn) => { presenceHook = fn; };

function attach(server, sessionParser) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/ws')) return socket.destroy();

    // Соединение из чужой вкладки нам не нужно: проверяем источник.
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return socket.destroy();
      } catch (err) {
        return socket.destroy();
      }
    }

    sessionParser(req, {}, () => {
      const userId = req.session && req.session.userId;
      if (!userId) return socket.destroy();
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.userId = userId;
        wss.emit('connection', ws, req);
      });
    });
  });

  wss.on('connection', (ws) => {
    const first = add(ws.userId, ws);
    ws.isAlive = true;
    if (first && presenceHook) presenceHook(ws.userId, true);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch (err) {
        return;
      }
      const handler = data && typeof data.kind === 'string' ? handlers.get(data.kind) : null;
      if (handler) handler(ws.userId, data);
    });

    const bye = () => {
      if (drop(ws.userId, ws) && presenceHook) presenceHook(ws.userId, false);
    };
    ws.on('close', bye);
    ws.on('error', bye);
  });

  const ping = setInterval(() => {
    for (const set of clients.values()) {
      for (const socket of set) {
        if (!socket.isAlive) {
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        socket.ping();
      }
    }
  }, 30000);
  ping.unref();

  return wss;
}

module.exports = { attach, send, sendMany, isOnline, onlineIds, on, onPresence };
