/** Игровой словарь Mobile Legends: Bang Bang — единый источник правды для сервера и клиента. */

export const LANES = {
  gold:   { name: 'Золотая линия', short: 'Gold',   accent: 4 },
  exp:    { name: 'Линия опыта',   short: 'EXP',    accent: 5 },
  mid:    { name: 'Центр',         short: 'Mid',    accent: 2 },
  jungle: { name: 'Лес',           short: 'Jungle', accent: 3 },
  roam:   { name: 'Роум',          short: 'Roam',   accent: 0 },
};

export const ROLES = {
  tank:     'Танк',
  fighter:  'Боец',
  assassin: 'Убийца',
  mage:     'Маг',
  marksman: 'Стрелок',
  support:  'Саппорт',
};

/** Ранги снизу вверх: индекс задаёт вес, цвет — свечение бейджа. */
export const RANKS = [
  { id: 'warrior',      name: 'Воин',            color: '#9aa3b8' },
  { id: 'elite',        name: 'Элита',           color: '#6fd3a8' },
  { id: 'master',       name: 'Мастер',          color: '#4db6ff' },
  { id: 'grandmaster',  name: 'Грандмастер',     color: '#7b7bff' },
  { id: 'epic',         name: 'Эпик',            color: '#b455ff' },
  { id: 'legend',       name: 'Легенда',         color: '#ffb020' },
  { id: 'mythic',       name: 'Мифик',           color: '#ff4d8d' },
  { id: 'mythic_honor', name: 'Мифическая честь',color: '#ff6ad5' },
  { id: 'mythic_glory', name: 'Мифическая слава', color: '#ffd166' },
  { id: 'immortal',     name: 'Бессмертный',     color: '#7ef9ff' },
];

export const RANK_IDS = RANKS.map((r) => r.id);

export const HEROES = [
  ['Ланселот', 'assassin'], ['Гусион', 'assassin'], ['Ханзо', 'assassin'],
  ['Фанни', 'assassin'], ['Линг', 'assassin'], ['Хаябуса', 'assassin'],
  ['Кагура', 'mage'], ['Эудора', 'mage'], ['Люо И', 'mage'], ['Валентина', 'mage'],
  ['Ив', 'mage'], ['Джулиан', 'mage'], ['Новария', 'mage'], ['Чжусинь', 'mage'],
  ['Грейнджер', 'marksman'], ['Клод', 'marksman'], ['Беатрис', 'marksman'],
  ['Ванван', 'marksman'], ['Лесли', 'marksman'], ['Мия', 'marksman'], ['Лейла', 'marksman'],
  ['Тигреал', 'tank'], ['Франко', 'tank'], ['Атлас', 'tank'], ['Хуфра', 'tank'],
  ['Джонсон', 'tank'], ['Акай', 'tank'], ['Гатоткака', 'tank'],
  ['Чоу', 'fighter'], ['Пакито', 'fighter'], ['Ю Чжун', 'fighter'], ['Арлотт', 'fighter'],
  ['Зилонг', 'fighter'], ['Алукард', 'fighter'], ['Сиси', 'fighter'], ['Нолан', 'fighter'],
  ['Анджела', 'support'], ['Эстес', 'support'], ['Рафаэла', 'support'],
  ['Матильда', 'support'], ['Флорин', 'support'], ['Диггер', 'support'],
].map(([name, role]) => ({ name, role }));

export const HERO_NAMES = HEROES.map((h) => h.name);

export const CHANNELS = {
  meta:       'Мета и патчи',
  heroes:     'Герои',
  guides:     'Гайды',
  draft:      'Драфт и тактика',
  highlights: 'Хайлайты',
  lfg:        'Поиск тиммейтов',
  skins:      'Скины',
  offtop:     'Флудилка',
};

export const CHANNEL_IDS = Object.keys(CHANNELS);

/** Отметки на посте-хайлайте: то, чем в MLBB принято хвастаться. */
export const FEATS = {
  savage:    { name: 'Savage',     hint: 'пять фрагов подряд' },
  maniac:    { name: 'Maniac',     hint: 'четыре фрага подряд' },
  legendary: { name: 'Legendary',  hint: 'десять убийств без смертей' },
  mvp:       { name: 'MVP',        hint: 'лучший в матче' },
};

export const rankIndex = (id) => Math.max(0, RANK_IDS.indexOf(id));
export const rankOf = (id) => RANKS[rankIndex(id)];
