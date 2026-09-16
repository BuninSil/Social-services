#!/bin/sh
# Запуск ВОнлайне одной командой: ./start.sh
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Нужен Node.js версии 20 или новее: https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Первый запуск: ставлю зависимости..."
  npm install || exit 1
fi

if [ ! -d data ]; then
  echo "Создаю демо-страницы (пароль у всех vonline2010)..."
  npm run seed
fi

exec node src/server.js
