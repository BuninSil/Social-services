'use strict';

/**
 * Настройки из файла .env рядом с проектом.
 *
 * Нужен ради одной вещи: чтобы секрет приложения RetroCore можно было положить
 * в файл и запускать сайт двойным кликом, не возясь с переменными окружения.
 * Уже заданные переменные окружения всегда главнее файла.
 */

const fs = require('fs');
const path = require('path');

const FILE = process.env.VO_ENV_FILE || path.join(__dirname, '..', '..', '.env');

function load() {
  let raw;
  try {
    raw = fs.readFileSync(FILE, 'utf8');
  } catch (e) {
    return false; // файла нет — это нормально
  }

  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const eq = text.indexOf('=');
    if (eq < 1) continue;
    const key = text.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    if (process.env[key] !== undefined) continue;

    let value = text.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
  return true;
}

module.exports = { load, FILE, loaded: load() };
