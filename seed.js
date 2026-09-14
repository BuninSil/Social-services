import { one, run, now } from './lib/db.js';
import { hashPassword } from './lib/auth.js';

const PASSWORD = 'demo1234';

const PLAYERS = [
  ['Savage', 'admin',     'Ланселот',  'jungle', 'mythic_glory', 'бью первым, думаю потом', 'три Savage за сезон — и ни одного на записи', 1, 'ID 128840291 (RU)', 62],
  ['Turtle', 'moderator', 'Тигреал',   'roam',   'mythic',       'роум, который реально роумит', 'если я не в пинге — я в тимфайте', 0, 'ID 118273645 (RU)', 58],
  ['Retrib', 'user',      'Ю Чжун',    'exp',    'legend',       'экспа и терпение', 'один против троих — это не смелость, это фарм', 5, 'ID 992041337 (RU)', 54],
  ['MidDiff', 'user',     'Кагура',    'mid',    'epic',         'мид по вызову', 'скилл-шоты мимо, но стильно', 2, 'ID 771122900 (RU)', 49],
  ['GoldLane', 'user',    'Грейнджер', 'gold',   'mythic',       'фарм — тоже тактика', 'дайте мне 10 минут и я выиграю', 4, 'ID 445566781 (RU)', 61],
];

const POSTS = [
  ['Savage', 'Патч порезал лес: как теперь фармить джанглеру',
   'Ретрибуция чинит меньше, черепаха даёт меньше опыта до четвёртой минуты. Итог: классический маршрут «синий → черепаха» больше не окупается.\n\nЧто работает: забирать красного первым, идти на линию с роумом и возвращаться в лес только под черепаху. Проверил в двадцати каточках — разница по фарму к шестой минуте примерно полтора уровня в плюс.',
   'meta', 'патч,лес,джангл', 'Ланселот', '', 3, 1],
  ['Turtle', 'Хуфра против Лансе: почему саппорт решает больше, чем кажется',
   'Вечная боль: враг берёт Ланселота, наш мид кричит «он неубиваемый». Неубиваемый — пока у тебя нет контроля, который ловит его в дэше.\n\nХуфра, Франко, Атлас. Второй скилл Хуфры отменяет рывок, и весь герой превращается в мишень. Это не сложно, это просто никто не пикает.',
   'draft', 'драфт,контрпик,саппорт', 'Хуфра', '', 2, 0],
  ['Savage', 'Savage на Ланселоте в решающей каточке за Мифическую славу',
   'Их керри зашли впятером на нашего лорда. Я стоял в кустах с полным хп и ультой. Дальше было четырнадцать секунд, которые я пересматриваю до сих пор.\n\nЗапись не сохранилась, потому что я забыл включить повтор. Верьте на слово.',
   'highlights', 'savage,ланселот', 'Ланселот', 'savage', 4, 0],
  ['GoldLane', 'Грейнджер: сборка под затяжной матч, а не под ранний бурст',
   'Все качают крит с первого айтема, а потом сливаются на двадцатой минуте, когда танки собрали броню.\n\nПопробуйте: ботинки на атакспид, потом Берсерк, а третьим — не крит, а пробивание брони. К двадцать пятой минуте вы бьёте танка так же больно, как керри.',
   'guides', 'грейнджер,сборка,гайд', 'Грейнджер', '', 2, 0],
  ['MidDiff', 'Ищу роума на вечер, Эпик и выше',
   'Играю мид, нужен постоянный роум под ротации. Голосовая связь обязательна, токсики мимо.\n\nОбычно с восьми вечера по мск, каточек пять-шесть подряд.',
   'lfg', 'поиск,роум', '', '', 1, 0],
  ['Retrib', 'Скин на Ю Чжуна: стоит ли своих алмазов',
   'Анимация ульты переделана полностью, звук удара другой. По ощущениям попадать стало проще — хотя хитбокс, конечно, тот же, это чистая психология.\n\nБрал за 899. Если ты на нём не мейнишь — не бери, обычный эпик не стоит того.',
   'skins', 'скины,ючжун', 'Ю Чжун', '', 1, 0],
];

const COMMENTS = [
  [1, 'Turtle', 'Подтверждаю по красному. Ещё нюанс: если роум ставит вард на черепаху заранее, враг просто не заходит.'],
  [1, 'MidDiff', 'А на Фанни это работает? У неё маршрут вообще другой.'],
  [1, 'Savage', 'На Фанни всё ещё через синего, ей мана критична. Но черепаху до четвёртой тоже не трогай.'],
  [2, 'GoldLane', 'Проблема в том, что саппорта у нас берут последним пиком и уже вслепую.'],
  [2, 'Savage', 'Вот поэтому роум должен пикаться вторым. Всегда.'],
  [3, 'Retrib', 'Без записи не считается, таков закон.'],
  [4, 'MidDiff', 'Сколько у тебя винрейт на нём с такой сборкой?'],
  [4, 'GoldLane', '61 за сезон. До этого было 53 с критом.'],
];

export function seedIfEmpty() {
  if (one('SELECT 1 AS x FROM users LIMIT 1')) return false;

  const password = hashPassword(PASSWORD);
  const ids = new Map();

  PLAYERS.forEach(([username, role, hero, lane, rankId, bio, status, accent, gameId, winRate], i) => {
    const result = run(`
      INSERT INTO users(username, password, role, bio, status, accent, hero, lane, rank_id, game_id, win_rate, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      username, password, role, bio, status, accent, hero, lane, rankId, gameId, winRate,
      new Date(Date.now() - (30 - i) * 86400e3).toISOString());
    ids.set(username, Number(result.lastInsertRowid));
  });

  const postIds = [];
  POSTS.forEach(([author, title, body, channel, tags, hero, feat, likes, pinned], i) => {
    const result = run(`
      INSERT INTO posts(author_id, title, body, channel, tags, hero, feat, lfg_lane, lfg_rank, pinned, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ids.get(author), title, body, channel, tags, hero, feat,
      channel === 'lfg' ? 'roam' : '', channel === 'lfg' ? 'epic' : '', pinned,
      new Date(Date.now() - (POSTS.length - i) * 6.5 * 36e5).toISOString());
    postIds.push(Number(result.lastInsertRowid));

    [...ids.values()].slice(0, likes).forEach((userId) => {
      run('INSERT OR IGNORE INTO likes(post_id, user_id) VALUES(?, ?)', postIds[i], userId);
    });
  });

  COMMENTS.forEach(([postIdx, author, body], i) => {
    run('INSERT INTO comments(post_id, author_id, body, created_at) VALUES(?, ?, ?, ?)',
      postIds[postIdx - 1], ids.get(author), body,
      new Date(Date.now() - (COMMENTS.length - i) * 1.6 * 36e5).toISOString());
  });

  // подписки и пара сообщений, чтобы разделы не встречали пустотой
  const follow = (a, b) => run('INSERT OR IGNORE INTO follows(follower_id, followee_id, created_at) VALUES(?, ?, ?)',
    ids.get(a), ids.get(b), now());
  follow('Turtle', 'Savage'); follow('MidDiff', 'Savage');
  follow('GoldLane', 'Savage'); follow('Retrib', 'Turtle'); follow('Savage', 'Turtle');

  run('INSERT INTO messages(sender_id, recipient_id, body, created_at) VALUES(?, ?, ?, ?)',
    ids.get('Turtle'), ids.get('Savage'), 'Погнали пару каточек? Мне не хватает джанглера под ротации.',
    new Date(Date.now() - 3.2 * 36e5).toISOString());
  run('INSERT INTO messages(sender_id, recipient_id, body, created_at) VALUES(?, ?, ?, ?)',
    ids.get('Savage'), ids.get('Turtle'), 'Давай после девяти. Только без Франко, я тебя умоляю.',
    new Date(Date.now() - 3.0 * 36e5).toISOString());

  console.log(`[seed] залит демо-контент · пароль у всех аккаунтов: ${PASSWORD}`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) seedIfEmpty();
