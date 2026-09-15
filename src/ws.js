'use strict';

const { WebSocketServer } = require('ws');

/** Простейший хаб: соединения, сгруппированные по id пользователя. */
const clients = new Map();

function add(userId, socket) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(socket);
}

function drop(userId, socket) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(socket);
  if (!set.size) clients.delete(userId);
}

/** Шлёт событие всем вкладкам пользователя. */
function send(userId, payload) {
  const set = clients.get(userId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const socket of set) {
    if (socket.readyState === socket.OPEN) socket.send(data);
  }
}

function isOnline(userId) {
  return clients.has(userId);
}

/**
 * Поднимает /ws поверх http-сервера. Пользователя определяем по той же
 * express-сессии, что и обычные страницы.
 */
function attach(server, sessionParser) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/ws')) {
      socket.destroy();
      return;
    }
    sessionParser(req, {}, () => {
      const userId = req.session && req.session.userId;
      if (!userId) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.userId = userId;
        wss.emit('connection', ws, req);
      });
    });
  });

  wss.on('connection', (ws) => {
    add(ws.userId, ws);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => drop(ws.userId, ws));
    ws.on('error', () => drop(ws.userId, ws));
  });

  const ping = setInterval(() => {
    for (const set of clients.values()) {
      for (const ws of set) {
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }
  }, 30000);
  ping.unref();

  return wss;
}

module.exports = { attach, send, isOnline };
