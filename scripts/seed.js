'use strict';

/**
 * Демо-данные: несколько страниц, дружбы, стена, группа и переписка.
 * Запуск: npm run seed   (у всех пароль 123456)
 */

const db = require('../src/db');
const { hashPassword } = require('../src/lib/auth');
const { now } = require('../src/lib/util');

const PASSWORD = process.env.VO_SEED_PASSWORD || '123456';

const PEOPLE = [
  { login: 'pavel', first_name: 'Павел', last_name: 'Дуров', sex: 'm', city: 'Санкт-Петербург',
    status: 'Всё только начинается', bday: '10.10.1984', music: 'The Prodigy, Пикник',
    about: 'Держу сайт на компьютере в углу комнаты.' },
  { login: 'ivan', first_name: 'Иван', last_name: 'Петров', sex: 'm', city: 'Москва',
    status: 'учусь, не мешать', bday: '03.05.1990', films: 'Матрица, Брат-2', games: 'Counter-Strike 1.6' },
  { login: 'olga', first_name: 'Ольга', last_name: 'Смирнова', sex: 'f', city: 'Казань',
    status: 'кофе и дедлайны', bday: '21.07.1992', books: 'Стругацкие', relationship: 'всё сложно' },
  { login: 'max', first_name: 'Максим', last_name: 'Ковалёв', sex: 'm', city: 'Новосибирск',
    status: 'на связи', bday: '14.02.1989', interests: 'железо, паяльник, ретро-игры' },
];

const insertUser = db.prepare(`
  INSERT INTO users (login, password_hash, first_name, last_name, sex, status, bday, city, relationship,
                     music, films, books, games, interests, about, created_at, last_seen)
  VALUES (@login, @password_hash, @first_name, @last_name, @sex, @status, @bday, @city, @relationship,
          @music, @films, @books, @games, @interests, @about, @created_at, @last_seen)
`);

const seed = db.transaction(() => {
  const ids = {};

  for (const p of PEOPLE) {
    if (db.prepare('SELECT 1 x FROM users WHERE login = ?').get(p.login)) {
      ids[p.login] = db.prepare('SELECT id FROM users WHERE login = ?').get(p.login).id;
      continue;
    }
    const info = insertUser.run(Object.assign({
      status: '', bday: '', city: '', relationship: '', music: '', films: '', books: '',
      games: '', interests: '', about: '',
    }, p, {
      password_hash: hashPassword(PASSWORD),
      created_at: now(),
      last_seen: now() - 600,
    }));
    ids[p.login] = info.lastInsertRowid;
    db.prepare("INSERT INTO albums (owner_type, owner_id, title, created_at) VALUES ('user', ?, ?, ?)")
      .run(info.lastInsertRowid, 'Фотографии со страницы', now());
  }

  const friend = db.prepare(
    "INSERT OR IGNORE INTO friendships (from_id, to_id, status, created_at) VALUES (?, ?, 'accepted', ?)");
  friend.run(ids.pavel, ids.ivan, now());
  friend.run(ids.pavel, ids.olga, now());
  friend.run(ids.ivan, ids.olga, now());
  db.prepare("INSERT OR IGNORE INTO friendships (from_id, to_id, status, created_at) VALUES (?, ?, 'pending', ?)")
    .run(ids.max, ids.pavel, now());

  const post = db.prepare(`
    INSERT INTO posts (owner_type, owner_id, author_id, text, created_at) VALUES ('user', ?, ?, ?, ?)
  `);
  post.run(ids.pavel, ids.pavel, 'Сайт поднят. Заходите, регистрируйтесь, пишите на стену.', now() - 7200);
  post.run(ids.pavel, ids.ivan, 'Отлично выглядит, прям как раньше!', now() - 3600);
  post.run(ids.ivan, ids.ivan, 'Сегодня опять весь вечер за компом.', now() - 1800);
  post.run(ids.olga, ids.olga, 'Кто идёт гулять в выходные?', now() - 900);

  db.prepare(`
    INSERT INTO comments (target_type, target_id, author_id, text, created_at) VALUES ('post', 1, ?, ?, ?)
  `).run(ids.olga, 'Ностальгия!', now() - 3000);

  db.prepare("INSERT OR IGNORE INTO likes (target_type, target_id, user_id, created_at) VALUES ('post', 1, ?, ?)")
    .run(ids.ivan, now());

  let groupId = (db.prepare('SELECT id FROM groups WHERE name = ?').get('Наша локалка') || {}).id;
  if (!groupId) {
    groupId = db.prepare(`
      INSERT INTO groups (name, description, kind, creator_id, created_at) VALUES (?, ?, 'group', ?, ?)
    `).run('Наша локалка', 'Обсуждаем всё, что происходит в сети: игры, файлы, встречи.', ids.pavel, now())
      .lastInsertRowid;
    const member = db.prepare(
      'INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
    member.run(groupId, ids.pavel, 'admin', now());
    member.run(groupId, ids.ivan, 'member', now());
    member.run(groupId, ids.olga, 'member', now());
    db.prepare(`
      INSERT INTO posts (owner_type, owner_id, author_id, text, created_at) VALUES ('group', ?, ?, ?, ?)
    `).run(groupId, ids.pavel, 'В пятницу в 20:00 сходка в CS. Сервер тот же.', now() - 5400);
  }

  const msg = db.prepare('INSERT INTO messages (from_id, to_id, text, is_read, created_at) VALUES (?, ?, ?, ?, ?)');
  if (!db.prepare('SELECT 1 x FROM messages LIMIT 1').get()) {
    msg.run(ids.ivan, ids.pavel, 'Привет! Как затащил всё это на локалку?', 1, now() - 4200);
    msg.run(ids.pavel, ids.ivan, 'Да просто нода и sqlite, ничего сложного.', 1, now() - 4100);
    msg.run(ids.ivan, ids.pavel, 'Красава. Скинь потом конфиг.', 0, now() - 4000);
  }

  return ids;
});

const ids = seed();
console.log('Демо-данные готовы. Пароль у всех: ' + PASSWORD);
for (const p of PEOPLE) console.log('  ' + p.login + ' — ' + p.first_name + ' ' + p.last_name + ' (id' + ids[p.login] + ')');
