'use strict';

/**
 * Демо-данные: страницы, дружбы, стена с вложением, группа, беседа и переписка.
 * Запуск: npm run seed   (у всех пароль vonline2010)
 */

const db = require('../src/db');
const { hashPassword } = require('../src/lib/auth');
const { now } = require('../src/lib/util');
const media = require('../src/lib/media');
const sharp = require('sharp');

const PASSWORD = process.env.VO_SEED_PASSWORD || 'vonline2010';

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

function seedUsers() {
  const ids = {};
  for (const person of PEOPLE) {
    const existing = db.prepare('SELECT id FROM users WHERE login = ?').get(person.login);
    if (existing) {
      ids[person.login] = existing.id;
      continue;
    }
    const info = insertUser.run(Object.assign({
      status: '', bday: '', city: '', relationship: '', music: '', films: '', books: '',
      games: '', interests: '', about: '',
    }, person, {
      password_hash: hashPassword(PASSWORD),
      created_at: now(),
      last_seen: now() - 600,
    }));
    ids[person.login] = info.lastInsertRowid;
    db.prepare("INSERT INTO albums (owner_type, owner_id, title, created_at) VALUES ('user', ?, ?, ?)")
      .run(info.lastInsertRowid, 'Фотографии со страницы', now());
  }
  return ids;
}

function seedFriends(ids) {
  const accepted = db.prepare(
    "INSERT OR IGNORE INTO friendships (from_id, to_id, status, created_at) VALUES (?, ?, 'accepted', ?)");
  accepted.run(ids.pavel, ids.ivan, now());
  accepted.run(ids.pavel, ids.olga, now());
  accepted.run(ids.ivan, ids.olga, now());
  db.prepare("INSERT OR IGNORE INTO friendships (from_id, to_id, status, created_at) VALUES (?, ?, 'pending', ?)")
    .run(ids.max, ids.pavel, now());
}

/** Картинку для вложения рисуем прямо тут, чтобы не тащить в репозиторий бинарники. */
async function demoPhoto(ownerId) {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">' +
    '<rect width="800" height="500" fill="#4c75a3"/>' +
    '<circle cx="640" cy="110" r="70" fill="#f2c94c"/>' +
    '<polygon points="0,500 260,250 480,500" fill="#3a5f87"/>' +
    '<polygon points="320,500 560,300 800,500" fill="#2f4f72"/>' +
    '</svg>'
  );
  const jpeg = await sharp(svg).jpeg().toBuffer();
  const saved = await media.saveImage(jpeg, 'photos', { width: 1600, thumb: 180 });
  const album = db.prepare("SELECT id FROM albums WHERE owner_type = 'user' AND owner_id = ? ORDER BY id LIMIT 1")
    .get(ownerId);
  return db.prepare(`
    INSERT INTO photos (album_id, owner_id, file, thumb, description, width, height, size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(album ? album.id : null, ownerId, saved.file, saved.thumb, 'Вид с горы',
    saved.width, saved.height, saved.size, now()).lastInsertRowid;
}

function seedWall(ids, photoId) {
  if (db.prepare('SELECT 1 x FROM posts LIMIT 1').get()) return;

  const post = db.prepare(`
    INSERT INTO posts (owner_type, owner_id, author_id, text, created_at) VALUES ('user', ?, ?, ?, ?)
  `);
  const first = post.run(ids.pavel, ids.pavel,
    'Сайт поднят. Заходите, регистрируйтесь, пишите на стену. #локалка', now() - 7200).lastInsertRowid;
  post.run(ids.pavel, ids.ivan, 'Отлично выглядит, прям как раньше!', now() - 3600);
  post.run(ids.ivan, ids.ivan, 'Сегодня опять весь вечер за компом.', now() - 1800);

  const withPhoto = post.run(ids.olga, ids.olga,
    'Кто идёт гулять в выходные? @ivan, ты как?', now() - 900).lastInsertRowid;
  if (photoId) {
    db.prepare(`
      INSERT INTO attachments (parent_type, parent_id, kind, ref_id, position) VALUES ('post', ?, 'photo', ?, 0)
    `).run(withPhoto, photoId);
  }

  db.prepare(`
    INSERT INTO comments (target_type, target_id, author_id, text, created_at) VALUES ('post', ?, ?, ?, ?)
  `).run(first, ids.olga, 'Ностальгия!', now() - 3000);

  db.prepare("INSERT OR IGNORE INTO likes (target_type, target_id, user_id, created_at) VALUES ('post', ?, ?, ?)")
    .run(first, ids.ivan, now());

  // Репост записи на другую стену.
  db.prepare(`
    INSERT INTO posts (owner_type, owner_id, author_id, text, repost_of, created_at) VALUES ('user', ?, ?, ?, ?, ?)
  `).run(ids.ivan, ids.ivan, 'Вот это дело!', first, now() - 600);
}

function seedGroup(ids) {
  const existing = db.prepare('SELECT id FROM groups WHERE name = ?').get('Наша локалка');
  if (existing) return;

  const groupId = db.prepare(`
    INSERT INTO groups (name, description, kind, creator_id, created_at) VALUES (?, ?, 'group', ?, ?)
  `).run('Наша локалка', 'Обсуждаем всё, что происходит в сети: игры, файлы, встречи.',
    ids.pavel, now()).lastInsertRowid;

  const member = db.prepare(
    'INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
  member.run(groupId, ids.pavel, 'admin', now());
  member.run(groupId, ids.ivan, 'member', now());
  member.run(groupId, ids.olga, 'member', now());

  db.prepare(`
    INSERT INTO posts (owner_type, owner_id, author_id, text, created_at) VALUES ('group', ?, ?, ?, ?)
  `).run(groupId, ids.pavel, 'В пятницу в 20:00 сходка в CS. Сервер тот же.', now() - 5400);
}

function seedMessages(ids) {
  if (db.prepare('SELECT 1 x FROM messages LIMIT 1').get()) return;

  const convId = db.prepare("INSERT INTO conversations (kind, created_at) VALUES ('dm', ?)")
    .run(now()).lastInsertRowid;
  const addMember = db.prepare(
    'INSERT OR IGNORE INTO conversation_members (conv_id, user_id, role, joined_at, last_read_id) VALUES (?, ?, ?, ?, 0)');
  addMember.run(convId, ids.ivan, 'member', now());
  addMember.run(convId, ids.pavel, 'member', now());

  const send = db.prepare(
    "INSERT INTO messages (conv_id, from_id, text, kind, created_at) VALUES (?, ?, ?, 'text', ?)");
  send.run(convId, ids.ivan, 'Привет! Как затащил всё это на локалку?', now() - 4200);
  send.run(convId, ids.pavel, 'Да просто нода и sqlite, ничего сложного.', now() - 4100);
  const last = send.run(convId, ids.ivan, 'Красава. Скинь потом конфиг.', now() - 4000).lastInsertRowid;

  db.prepare('UPDATE conversation_members SET last_read_id = ? WHERE conv_id = ? AND user_id = ?')
    .run(last, convId, ids.ivan);

  // Групповая беседа.
  const chatId = db.prepare(
    "INSERT INTO conversations (kind, title, creator_id, created_at) VALUES ('chat', ?, ?, ?)")
    .run('Сходка в пятницу', ids.pavel, now()).lastInsertRowid;
  addMember.run(chatId, ids.pavel, 'admin', now());
  addMember.run(chatId, ids.ivan, 'member', now());
  addMember.run(chatId, ids.olga, 'member', now());
  send.run(chatId, ids.pavel, 'Собираемся у меня в 20:00, беру колонки.', now() - 3000);
  send.run(chatId, ids.olga, 'Буду! Принесу печенье.', now() - 2900);
}

function seedNotifications(ids) {
  if (db.prepare('SELECT 1 x FROM notifications LIMIT 1').get()) return;
  const post = db.prepare("SELECT id FROM posts WHERE author_id = ? ORDER BY id LIMIT 1").get(ids.pavel);
  if (!post) return;
  db.prepare(`
    INSERT INTO notifications (user_id, kind, actor_id, target_type, target_id, url, preview, created_at)
    VALUES (?, 'like_post', ?, 'post', ?, ?, ?, ?)
  `).run(ids.pavel, ids.ivan, post.id, '/id' + ids.pavel + '#post' + post.id, 'Сайт поднят.', now() - 3000);
}

(async () => {
  const ids = seedUsers();
  seedFriends(ids);
  const photoId = await demoPhoto(ids.olga);
  const fill = db.transaction(() => {
    seedWall(ids, photoId);
    seedGroup(ids);
    seedMessages(ids);
    seedNotifications(ids);
  });
  fill();

  console.log('Демо-данные готовы. Пароль у всех: ' + PASSWORD);
  for (const person of PEOPLE) {
    console.log('  ' + person.login + ' — ' + person.first_name + ' ' + person.last_name + ' (id' + ids[person.login] + ')');
  }
})();
