import { data, nextId, persistNow, hashPassword } from './lib/store.js';

const DEMO_USERS = [
  ['neon', 'фронтендер, коллекционирую градиенты и чужие баги', 0],
  ['vaporwave', 'делаю музыку в 3 ночи, сплю в 5', 2],
  ['kernel', 'системщик. если оно не падает — значит недотестировали', 4],
  ['glitch', 'дизайн, типографика, немного хаоса', 1],
  ['astra', 'астрофизика и слишком длинные треды', 3],
];

const DEMO_POSTS = [
  ['neon', 'Тёмная тема — это не просто инверсия цветов', 'Переключил палитру в лоб и получил серую кашу. Оказалось, в тёмной теме нужно поднимать насыщенность акцентов и ронять её у фона, иначе всё сливается. Плюс тени не работают — глубину приходится строить светом, а не темнотой.', 'design', ['ui', 'darkmode', 'css'], 4],
  ['kernel', 'Один воркер вместо пула — и latency упал в три раза', 'Классика: пул на 16 процессов, каждый со своим коннектом к базе. Пул дрался сам с собой за соединения. Свёл до одного воркера с очередью — p99 с 840мс до 260мс. Иногда параллелизм это просто более дорогой способ ждать.', 'code', ['backend', 'perf'], 9],
  ['vaporwave', 'Собрал луп целиком в браузере, без единого плагина', 'WebAudio + пара осцилляторов + свёрточная реверберация на импульсе из подъезда. Звучит грязно и мне нравится. Скину исходники, если кому интересно поковырять.', 'music', ['webaudio', 'lofi'], 6],
  ['astra', 'Почему снимки чёрных дыр оранжевые, а не чёрные', 'Спойлер: цвет придуман. Радиотелескоп пишет интенсивность на 1.3 мм — это не видимый свет вообще. Оранжевый выбрали, потому что мозг читает его как «горячо». Красивая ложь в интересах интуиции.', 'science', ['space', 'eht'], 7],
  ['glitch', 'Минимализм — это не «мало элементов»', 'Это когда каждый оставшийся элемент несёт вес. Убрал рамку — значит работу границы взял на себя отступ. Убрал подпись — значит иконка однозначна. Если после вычитания пользователь тормозит, это не минимализм, а недоделанность.', 'design', ['ux', 'minimal'], 11],
  ['neon', 'Что вы слушаете, когда пишете код?', 'У меня два режима: дебаг — тишина, рефакторинг — что угодно с битом 120+. Стало интересно, у кого как устроено.', 'random', ['offtop'], 3],
];

const DEMO_COMMENTS = [
  [1, 'glitch', 'Ещё момент: в тёмной теме чистый белый текст жжёт глаза. #e8e8f0 читается мягче.'],
  [1, 'kernel', 'И не забывай про OLED — настоящий чёрный красив, но смазывает при скролле.'],
  [2, 'neon', 'Сколько соединений держала база до этого?'],
  [2, 'kernel', 'Полтораста. Из них реально работало штук двадцать, остальные сидели в ожидании.'],
  [4, 'vaporwave', 'Интересно, как бы она звучала, если озвучить те же данные.'],
  [5, 'astra', 'Формулировка «если после вычитания пользователь тормозит» — заберу в заметки.'],
  [5, 'neon', 'Половина моих правок в ревью — это возврат того, что я слишком рано убрал.'],
];

export function seedIfEmpty() {
  const db = data();
  if (db.users.length) return false;

  const hash = hashPassword('demo1234');
  const byName = new Map();
  for (const [username, bio, accent] of DEMO_USERS) {
    const user = {
      id: nextId(), username, password: hash, bio, accent,
      createdAt: new Date(Date.now() - 86400e3 * 30).toISOString(),
    };
    db.users.push(user);
    byName.set(username, user);
  }

  const ids = new Map();
  DEMO_POSTS.forEach(([author, title, body, channel, tags, likes], i) => {
    const post = {
      id: nextId(),
      authorId: byName.get(author).id,
      title, body, channel, tags,
      likes: [...byName.values()].slice(0, likes % 5).map((u) => u.id),
      createdAt: new Date(Date.now() - (DEMO_POSTS.length - i) * 5.5 * 36e5).toISOString(),
    };
    db.posts.push(post);
    ids.set(i + 1, post.id);
  });

  DEMO_COMMENTS.forEach(([postIdx, author, body], i) => {
    db.comments.push({
      id: nextId(),
      postId: ids.get(postIdx),
      authorId: byName.get(author).id,
      body,
      createdAt: new Date(Date.now() - (DEMO_COMMENTS.length - i) * 1.7 * 36e5).toISOString(),
    });
  });

  persistNow();
  console.log('[seed] демо-контент залит (пароль у всех демо-аккаунтов: demo1234)');
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) seedIfEmpty();
