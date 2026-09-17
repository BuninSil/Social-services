'use strict';

/**
 * Полная очистка: база и все загруженные файлы.
 * Нужна перед тем, как открывать сайт людям — чтобы демо-страницы не мешались.
 *
 *   npm run reset -- --yes
 */

const fs = require('fs');
const path = require('path');

require('../src/lib/env');

const DATA_DIR = process.env.VO_DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = process.env.VO_UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

if (!process.argv.includes('--yes')) {
  console.log('');
  console.log('  Это сотрёт ВСЕ страницы, записи, фотографии и переписку.');
  console.log('  Отменить будет нельзя. Если точно хотите:');
  console.log('');
  console.log('    npm run reset -- --yes');
  console.log('');
  process.exit(1);
}

let removed = 0;

for (const name of safeList(DATA_DIR)) {
  // Секрет сессий не трогаем: иначе у всех разъедутся куки без всякой пользы.
  if (name === 'session.secret') continue;
  fs.rmSync(path.join(DATA_DIR, name), { recursive: true, force: true });
  removed += 1;
}

for (const name of safeList(UPLOAD_DIR)) {
  if (name === '.gitkeep') continue;
  fs.rmSync(path.join(UPLOAD_DIR, name), { recursive: true, force: true });
  removed += 1;
}

console.log('Очищено. Удалено объектов: ' + removed + '.');
console.log('База заведётся заново при следующем запуске: npm start');

function safeList(dir) {
  try {
    return fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
}
