'use strict';

/**
 * Завести страницу или поменять пароль из командной строки.
 * Удобно на хостинге: сайт можно открыть уже с готовым аккаунтом.
 *
 *   node scripts/account.js vladislav "Владислав Бунин" мой-пароль
 *
 * Если логин уже есть — у него просто меняется пароль.
 */

const db = require('../src/db');
const { hashPassword } = require('../src/lib/auth');
const { now } = require('../src/lib/util');

const [login, fullName, password] = process.argv.slice(2);

if (!login || !password) {
  console.log('');
  console.log('  node scripts/account.js <логин> "<Имя Фамилия>" <пароль>');
  console.log('');
  console.log('  Логин: латиница, цифры, точка и подчёркивание, от 3 до 20 символов.');
  console.log('');
  process.exit(1);
}

if (!/^[a-z0-9_.]{3,20}$/i.test(login)) {
  console.error('Логин не подходит: только латиница, цифры, точка и подчёркивание, 3–20 символов.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Пароль короче 8 символов.');
  process.exit(1);
}

const parts = String(fullName || login).trim().split(/\s+/);
const firstName = parts[0].slice(0, 30);
const lastName = parts.slice(1).join(' ').slice(0, 30);

const existing = db.users.find((u) => String(u.login).toLowerCase() === login.toLowerCase());

if (existing) {
  db.users.update(existing.id, { password_hash: hashPassword(password), rc_only: 0 });
  db.save();
  console.log('Пароль для «' + existing.login + '» изменён (id' + existing.id + ').');
} else {
  const user = db.users.insert({
    login: login,
    password_hash: hashPassword(password),
    first_name: firstName,
    last_name: lastName,
    created_at: now(),
    last_seen: now(),
  });
  db.albums.insert({
    owner_type: 'user', owner_id: user.id, title: 'Фотографии со страницы', created_at: now(),
  });
  db.save();
  console.log('Страница заведена: ' + firstName + ' ' + lastName + ' — /' + login + ' (id' + user.id + ').');
}

console.log('Сайт при этом должен быть остановлен: он пишет в те же файлы.');
