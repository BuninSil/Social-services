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

function seedUsers() {
  const ids = {};
  for (const person of PEOPLE) {
    const existing = db.users.find({ login: person.login });
    if (existing) {
      ids[person.login] = existing.id;
      continue;
    }
    const user = db.users.insert(Object.assign({}, person, {
      password_hash: hashPassword(PASSWORD),
      created_at: now(),
      last_seen: now() - 600,
    }));
    ids[person.login] = user.id;
    db.albums.insert({
      owner_type: 'user', owner_id: user.id, title: 'Фотографии со страницы', created_at: now(),
    });
  }
  return ids;
}

function friendship(fromId, toId, status) {
  if (db.friendships.has({ from_id: fromId, to_id: toId })) return;
  db.friendships.insert({ from_id: fromId, to_id: toId, status: status, created_at: now() });
}

function seedFriends(ids) {
  friendship(ids.pavel, ids.ivan, 'accepted');
  friendship(ids.pavel, ids.olga, 'accepted');
  friendship(ids.ivan, ids.olga, 'accepted');
  friendship(ids.max, ids.pavel, 'pending');
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
  const album = db.albums.filter({ owner_type: 'user', owner_id: ownerId })[0];
  return db.photos.insert({
    album_id: album ? album.id : null,
    owner_id: ownerId,
    file: saved.file,
    thumb: saved.thumb,
    description: 'Вид с горы',
    width: saved.width,
    height: saved.height,
    size: saved.size,
    created_at: now(),
  }).id;
}

function seedWall(ids, photoId) {
  if (db.posts.count()) return;

  const wallPost = (ownerId, authorId, text, at, extra) =>
    db.posts.insert(Object.assign({
      owner_type: 'user', owner_id: ownerId, author_id: authorId, text: text, created_at: at,
    }, extra || {}));

  const first = wallPost(ids.pavel, ids.pavel,
    'Сайт поднят. Заходите, регистрируйтесь, пишите на стену. #локалка', now() - 7200);
  wallPost(ids.pavel, ids.ivan, 'Отлично выглядит, прям как раньше!', now() - 3600);
  wallPost(ids.ivan, ids.ivan, 'Сегодня опять весь вечер за компом.', now() - 1800);

  const withPhoto = wallPost(ids.olga, ids.olga, 'Кто идёт гулять в выходные? @ivan, ты как?', now() - 900);
  if (photoId) {
    db.attachments.insert({
      parent_type: 'post', parent_id: withPhoto.id, kind: 'photo', ref_id: photoId, position: 0,
    });
  }

  db.comments.insert({
    target_type: 'post', target_id: first.id, author_id: ids.olga,
    text: 'Ностальгия!', created_at: now() - 3000,
  });
  db.likes.insert({ target_type: 'post', target_id: first.id, user_id: ids.ivan, created_at: now() });

  // Репост записи на другую стену.
  wallPost(ids.ivan, ids.ivan, 'Вот это дело!', now() - 600, { repost_of: first.id });
}

function seedGroup(ids) {
  if (db.groups.has({ name: 'Наша локалка' })) return;

  const group = db.groups.insert({
    name: 'Наша локалка',
    description: 'Обсуждаем всё, что происходит в сети: игры, файлы, встречи.',
    kind: 'group', creator_id: ids.pavel, created_at: now(),
  });

  const member = (userId, role) =>
    db.group_members.insert({ group_id: group.id, user_id: userId, role: role, joined_at: now() });
  member(ids.pavel, 'admin');
  member(ids.ivan, 'member');
  member(ids.olga, 'member');

  db.posts.insert({
    owner_type: 'group', owner_id: group.id, author_id: ids.pavel,
    text: 'В пятницу в 20:00 сходка в CS. Сервер тот же.', created_at: now() - 5400,
  });
}

function seedMessages(ids) {
  if (db.messages.count()) return;

  const addMember = (convId, userId, role) =>
    db.conversation_members.insert({
      conv_id: convId, user_id: userId, role: role, joined_at: now(), last_read_id: 0,
    });
  const send = (convId, fromId, text, at) =>
    db.messages.insert({ conv_id: convId, from_id: fromId, text: text, kind: 'text', created_at: at });

  const dm = db.conversations.insert({ kind: 'dm', created_at: now() });
  addMember(dm.id, ids.ivan, 'member');
  addMember(dm.id, ids.pavel, 'member');

  send(dm.id, ids.ivan, 'Привет! Как затащил всё это на локалку?', now() - 4200);
  send(dm.id, ids.pavel, 'Да просто нода и файлы, ничего сложного.', now() - 4100);
  const last = send(dm.id, ids.ivan, 'Красава. Скинь потом конфиг.', now() - 4000);

  db.conversation_members.update({ conv_id: dm.id, user_id: ids.ivan }, { last_read_id: last.id });

  // Групповая беседа.
  const chat = db.conversations.insert({
    kind: 'chat', title: 'Сходка в пятницу', creator_id: ids.pavel, created_at: now(),
  });
  addMember(chat.id, ids.pavel, 'admin');
  addMember(chat.id, ids.ivan, 'member');
  addMember(chat.id, ids.olga, 'member');
  send(chat.id, ids.pavel, 'Собираемся у меня в 20:00, беру колонки.', now() - 3000);
  send(chat.id, ids.olga, 'Буду! Принесу печенье.', now() - 2900);
}

function seedNotifications(ids) {
  if (db.notifications.count()) return;
  const post = db.posts.filter({ author_id: ids.pavel })[0];
  if (!post) return;
  db.notifications.insert({
    user_id: ids.pavel, kind: 'like_post', actor_id: ids.ivan,
    target_type: 'post', target_id: post.id,
    url: '/id' + ids.pavel + '#post' + post.id,
    preview: 'Сайт поднят.', created_at: now() - 3000,
  });
}

(async () => {
  const ids = seedUsers();
  seedFriends(ids);
  const photoId = await demoPhoto(ids.olga);
  seedWall(ids, photoId);
  seedGroup(ids);
  seedMessages(ids);
  seedNotifications(ids);
  db.save();

  console.log('Демо-данные готовы. Пароль у всех: ' + PASSWORD);
  for (const person of PEOPLE) {
    console.log('  ' + person.login + ' — ' + person.first_name + ' ' + person.last_name + ' (id' + ids[person.login] + ')');
  }
})();
