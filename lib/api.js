import { all, one, run, now, tx } from './db.js';
import {
  hashPassword, verifyPassword, verifyDummy, createSession, dropSession,
  dropAllSessions, banUser, unbanUser, isStaff, roleAtLeast,
} from './auth.js';
import { CHANNELS, LANES, RANK_IDS, HERO_NAMES, FEATS, rankOf, rankIndex } from './mlbb.js';

const USERNAME_RE = /^[a-zA-Zа-яА-Я0-9_][a-zA-Zа-яА-Я0-9_.-]{1,23}$/;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

/** Ключ уникальности ника. COLLATE NOCASE в SQLite приводит регистр только
    у латиницы, поэтому «Мифик» и «МИФИК» считались разными людьми. */
const normalizeName = (value) => String(value ?? '').trim().toLowerCase();

const findUser = (username) =>
  one('SELECT * FROM users WHERE username_lower = ?', normalizeName(username));
const listTags = (raw) => {
  const source = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,\s]+/);
  return [...new Set(source
    .map((t) => t.replace(/^#/, '').toLowerCase().replace(/[^0-9a-zа-яё_-]/gi, ''))
    .filter((t) => t.length >= 2 && t.length <= 20))].slice(0, 5);
};

// --- сериализация -----------------------------------------------------------

export function publicUser(row, viewer = null) {
  if (!row) return null;
  const rank = rankOf(row.rank_id);
  const counts = one(`
    SELECT
      (SELECT COUNT(*) FROM posts    WHERE author_id = ?1) AS posts,
      (SELECT COUNT(*) FROM comments WHERE author_id = ?1) AS comments,
      (SELECT COUNT(*) FROM likes l JOIN posts p ON p.id = l.post_id WHERE p.author_id = ?1) AS karma,
      (SELECT COUNT(*) FROM follows WHERE followee_id = ?1) AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?1) AS following
  `, row.id);

  return {
    id: row.id,
    username: row.username,
    role: row.role,
    banned: !!row.banned_at,
    banReason: row.ban_reason || '',
    bio: row.bio,
    status: row.status,
    accent: row.accent,
    hero: row.hero,
    lane: row.lane,
    laneName: LANES[row.lane]?.name || '',
    rankId: row.rank_id,
    rankName: rank.name,
    rankColor: rank.color,
    rankIndex: rankIndex(row.rank_id),
    gameId: row.game_id,
    winRate: row.win_rate,
    createdAt: row.created_at,
    ...counts,
    isMe: !!viewer && viewer.id === row.id,
    followed: viewer
      ? !!one('SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ?', viewer.id, row.id)
      : false,
  };
}

const authorShape = (row) => ({
  id: row.author_id,
  username: row.author_name,
  accent: row.author_accent,
  role: row.author_role,
  hero: row.author_hero,
  lane: row.author_lane,
  rankId: row.author_rank,
  rankName: rankOf(row.author_rank).name,
  rankColor: rankOf(row.author_rank).color,
});

const POST_SELECT = `
  SELECT p.*,
         u.username AS author_name, u.accent AS author_accent, u.role AS author_role,
         u.hero AS author_hero, u.lane AS author_lane, u.rank_id AS author_rank,
         (SELECT COUNT(*) FROM likes    WHERE post_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
  FROM posts p JOIN users u ON u.id = p.author_id
`;

function serializePost(row, viewer) {
  const liked = viewer
    ? !!one('SELECT 1 AS x FROM likes WHERE post_id = ? AND user_id = ?', row.id, viewer.id)
    : false;
  const ageHours = (Date.now() - Date.parse(row.created_at)) / 36e5;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    channel: row.channel,
    channelName: CHANNELS[row.channel] || row.channel,
    tags: row.tags ? row.tags.split(',') : [],
    hero: row.hero,
    feat: row.feat,
    featName: FEATS[row.feat]?.name || '',
    lfgLane: row.lfg_lane,
    lfgRank: row.lfg_rank,
    lfgRankName: row.lfg_rank ? rankOf(row.lfg_rank).name : '',
    pinned: !!row.pinned,
    createdAt: row.created_at,
    editedAt: row.edited_at || null,
    likes: row.like_count,
    liked,
    commentCount: row.comment_count,
    author: authorShape(row),
    mine: !!viewer && viewer.id === row.author_id,
    canModerate: !!viewer && (viewer.id === row.author_id || isStaff(viewer)),
    hot: (row.like_count + row.comment_count * 2 + 1) / Math.pow(ageHours + 2, 1.4),
  };
}

const serializeComment = (row, viewer) => ({
  id: row.id,
  postId: row.post_id,
  body: row.body,
  createdAt: row.created_at,
  editedAt: row.edited_at || null,
  author: authorShape(row),
  mine: !!viewer && viewer.id === row.author_id,
  canModerate: !!viewer && (viewer.id === row.author_id || isStaff(viewer)),
});

// --- аккаунты ---------------------------------------------------------------

export function register({ username, password, hero, lane, rankId }) {
  const name = clean(username, 24);
  if (!USERNAME_RE.test(name)) fail(400, 'Ник: 2–24 символа, буквы, цифры, _ . -');
  if (String(password ?? '').length < 6) fail(400, 'Пароль минимум 6 символов');
  if (findUser(name)) fail(409, 'Такой ник уже занят');

  // первый зарегистрировавшийся получает админку — иначе панель некому открыть
  const isFirst = !one('SELECT 1 AS x FROM users LIMIT 1');

  const result = run(`
    INSERT INTO users(username, username_lower, password, role, accent, hero, lane, rank_id, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    name, normalizeName(name), hashPassword(password), isFirst ? 'admin' : 'user',
    Math.floor(Math.random() * 6),
    HERO_NAMES.includes(hero) ? hero : '',
    LANES[lane] ? lane : 'roam',
    RANK_IDS.includes(rankId) ? rankId : 'warrior',
    now());

  const user = one('SELECT * FROM users WHERE id = ?', result.lastInsertRowid);
  return { user, token: createSession(user.id) };
}

export function login({ username, password }) {
  const user = findUser(clean(username, 24));
  // считаем scrypt в обоих случаях — иначе по задержке видно, занят ли ник
  const ok = user
    ? verifyPassword(String(password ?? ''), user.password)
    : verifyDummy(password);
  if (!ok) fail(401, 'Неверный ник или пароль');
  if (user.banned_at) fail(403, `Аккаунт заблокирован: ${user.ban_reason || 'без указания причины'}`);
  return { user, token: createSession(user.id) };
}

export const logout = (token) => dropSession(token);

export function updateProfile(viewer, patch) {
  if (!viewer) fail(401, 'Нужно войти');
  const fields = {
    bio: patch.bio !== undefined ? clean(patch.bio, 200) : viewer.bio,
    status: patch.status !== undefined ? clean(patch.status, 60) : viewer.status,
    accent: patch.accent !== undefined ? Math.max(0, Math.min(5, Number(patch.accent) || 0)) : viewer.accent,
    hero: patch.hero !== undefined ? (HERO_NAMES.includes(patch.hero) ? patch.hero : '') : viewer.hero,
    lane: patch.lane !== undefined ? (LANES[patch.lane] ? patch.lane : viewer.lane) : viewer.lane,
    rank_id: patch.rankId !== undefined
      ? (RANK_IDS.includes(patch.rankId) ? patch.rankId : viewer.rank_id) : viewer.rank_id,
    game_id: patch.gameId !== undefined ? clean(patch.gameId, 24) : viewer.game_id,
    win_rate: patch.winRate !== undefined
      ? Math.max(0, Math.min(100, Math.round(Number(patch.winRate) || 0))) : viewer.win_rate,
  };

  run(`UPDATE users SET bio = ?, status = ?, accent = ?, hero = ?, lane = ?, rank_id = ?,
       game_id = ?, win_rate = ? WHERE id = ?`,
    fields.bio, fields.status, fields.accent, fields.hero, fields.lane,
    fields.rank_id, fields.game_id, fields.win_rate, viewer.id);

  return publicUser(one('SELECT * FROM users WHERE id = ?', viewer.id), viewer);
}

export function changePassword(viewer, { current, next }) {
  if (!viewer) fail(401, 'Нужно войти');
  if (!verifyPassword(String(current ?? ''), viewer.password)) fail(403, 'Текущий пароль не подходит');
  if (String(next ?? '').length < 6) fail(400, 'Новый пароль минимум 6 символов');
  run('UPDATE users SET password = ? WHERE id = ?', hashPassword(next), viewer.id);
  dropAllSessions(viewer.id);
  return { ok: true, reauth: true };
}

export function logoutEverywhere(viewer) {
  if (!viewer) fail(401, 'Нужно войти');
  dropAllSessions(viewer.id);
  return { ok: true };
}

export function deleteAccount(viewer, { password }) {
  if (!viewer) fail(401, 'Нужно войти');
  if (!verifyPassword(String(password ?? ''), viewer.password)) fail(403, 'Пароль не подходит');
  if (roleAtLeast(viewer, 'admin') && one('SELECT COUNT(*) AS n FROM users WHERE role = ?', 'admin').n <= 1) {
    fail(400, 'Ты единственный админ — сначала передай роль кому-то ещё');
  }
  // внешние ключи с ON DELETE CASCADE уносят посты, ответы, лайки и переписку
  run('DELETE FROM users WHERE id = ?', viewer.id);
  return { ok: true };
}

export function profile(username, viewer) {
  const row = findUser(username);
  if (!row) fail(404, 'Игрок не найден');
  return publicUser(row, viewer);
}

// --- блокировки -------------------------------------------------------------

export const isBlocked = (blockerId, blockedId) =>
  !!one('SELECT 1 AS x FROM blocks WHERE blocker_id = ? AND blocked_id = ?', blockerId, blockedId);

export function toggleBlock(viewer, username) {
  if (!viewer) fail(401, 'Нужно войти');
  const target = findUser(username);
  if (!target) fail(404, 'Игрок не найден');
  if (target.id === viewer.id) fail(400, 'Себя заблокировать нельзя');

  if (isBlocked(viewer.id, target.id)) {
    run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', viewer.id, target.id);
    return { blocked: false };
  }
  tx(() => {
    run('INSERT INTO blocks(blocker_id, blocked_id, created_at) VALUES(?, ?, ?)',
      viewer.id, target.id, now());
    // блокировка рвёт взаимные подписки в обе стороны
    run('DELETE FROM follows WHERE (follower_id = ?1 AND followee_id = ?2) OR (follower_id = ?2 AND followee_id = ?1)',
      viewer.id, target.id);
  });
  return { blocked: true };
}

export const blockedList = (viewer) => {
  if (!viewer) fail(401, 'Нужно войти');
  return all(`SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id
              WHERE b.blocker_id = ? ORDER BY b.created_at DESC`, viewer.id)
    .map((row) => publicUser(row, viewer));
};

// --- уведомления ------------------------------------------------------------

function notify(userId, actorId, kind, postId, preview) {
  if (userId === actorId) return;                    // свои действия не уведомляют
  if (isBlocked(userId, actorId)) return;            // от заблокированных — тишина
  run(`INSERT INTO notifications(user_id, actor_id, kind, post_id, preview, created_at)
       VALUES(?, ?, ?, ?, ?, ?)`,
    userId, actorId, kind, postId || null, clean(preview, 120), now());
}

export function notifications(viewer) {
  if (!viewer) fail(401, 'Нужно войти');
  const rows = all(`
    SELECT n.*, u.username AS actor_name, u.accent AS actor_accent, u.rank_id AS actor_rank,
           p.title AS post_title
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN posts p ON p.id = n.post_id
    WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 100`, viewer.id);

  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    postId: n.post_id,
    postTitle: n.post_title || '',
    preview: n.preview,
    read: !!n.read_at,
    createdAt: n.created_at,
    actor: {
      username: n.actor_name, accent: n.actor_accent,
      rankId: n.actor_rank, rankName: rankOf(n.actor_rank).name,
      rankColor: rankOf(n.actor_rank).color,
    },
  }));
}

export function readNotifications(viewer) {
  if (!viewer) fail(401, 'Нужно войти');
  run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), viewer.id);
  return { ok: true };
}

export const unreadNotifications = (viewer) => viewer
  ? one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', viewer.id).n
  : 0;

// --- поиск игроков ----------------------------------------------------------

export function searchUsers(query, viewer) {
  const needle = normalizeName(query);
  if (needle.length < 2) return [];
  return all(`SELECT * FROM users WHERE username_lower LIKE ? ORDER BY username LIMIT 20`,
    `%${needle}%`).map((row) => publicUser(row, viewer));
}

// --- подписки ---------------------------------------------------------------

export function toggleFollow(viewer, username) {
  if (!viewer) fail(401, 'Нужно войти');
  const target = findUser(username);
  if (!target) fail(404, 'Игрок не найден');
  if (target.id === viewer.id) fail(400, 'На себя подписаться нельзя');
  if (isBlocked(target.id, viewer.id)) fail(403, 'Игрок вас заблокировал');

  const existing = one('SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ?',
    viewer.id, target.id);
  if (existing) {
    run('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?', viewer.id, target.id);
  } else {
    run('INSERT INTO follows(follower_id, followee_id, created_at) VALUES(?, ?, ?)',
      viewer.id, target.id, now());
    notify(target.id, viewer.id, 'follow', null, '');
  }
  return { followed: !existing, followers: one('SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?', target.id).n };
}

export const followList = (username, kind, viewer) => {
  const target = findUser(username);
  if (!target) fail(404, 'Игрок не найден');
  const rows = kind === 'followers'
    ? all(`SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id
           WHERE f.followee_id = ? ORDER BY f.created_at DESC LIMIT 100`, target.id)
    : all(`SELECT u.* FROM follows f JOIN users u ON u.id = f.followee_id
           WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT 100`, target.id);
  return rows.map((row) => publicUser(row, viewer));
};

// --- посты ------------------------------------------------------------------

export function listPosts(viewer, query = {}) {
  const { channel, sort = 'hot', q, author, hero, feed } = query;
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 30));
  const offset = Math.max(0, Number(query.offset) || 0);
  const where = [];
  const params = [];

  if (channel && channel !== 'all') { where.push('p.channel = ?'); params.push(channel); }
  if (author) { where.push('u.username_lower = ?'); params.push(normalizeName(author)); }
  if (hero) { where.push('p.hero = ?'); params.push(hero); }
  if (feed === 'following') {
    if (!viewer) fail(401, 'Нужно войти');
    where.push('p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)');
    params.push(viewer.id);
  }
  if (q) {
    where.push('(p.title LIKE ? OR p.body LIKE ? OR p.tags LIKE ? OR p.hero LIKE ?)');
    const like = `%${String(q).toLowerCase()}%`;
    params.push(like, like, like, like);
  }

  // прячем тех, кого зритель заблокировал, и тех, кто заблокировал его
  if (viewer) {
    where.push(`p.author_id NOT IN (
      SELECT blocked_id FROM blocks WHERE blocker_id = ?
      UNION SELECT blocker_id FROM blocks WHERE blocked_id = ?)`);
    params.push(viewer.id, viewer.id);
  }

  const base = POST_SELECT + (where.length ? ` WHERE ${where.join(' AND ')}` : '');
  const total = one(`SELECT COUNT(*) AS n FROM (${base})`, ...params).n;

  // сортировка идёт по всему набору, страницу режем после неё
  const posts = all(`${base} ORDER BY p.pinned DESC, p.created_at DESC LIMIT 1000`, ...params)
    .map((row) => serializePost(row, viewer));

  if (sort === 'top') posts.sort((a, b) => b.pinned - a.pinned || b.likes - a.likes);
  else if (sort === 'hot') posts.sort((a, b) => b.pinned - a.pinned || b.hot - a.hot);

  const page = posts.slice(offset, offset + limit);
  return { items: page, total, offset, limit, hasMore: offset + page.length < total };
}

export function getPost(viewer, id) {
  const row = one(`${POST_SELECT} WHERE p.id = ?`, id);
  if (!row) fail(404, 'Пост не найден');
  const post = serializePost(row, viewer);
  post.comments = all(`
    SELECT c.*, u.username AS author_name, u.accent AS author_accent, u.role AS author_role,
           u.hero AS author_hero, u.lane AS author_lane, u.rank_id AS author_rank
    FROM comments c JOIN users u ON u.id = c.author_id
    WHERE c.post_id = ? ORDER BY c.created_at ASC`, id)
    .map((c) => serializeComment(c, viewer));
  return post;
}

export function createPost(viewer, data) {
  if (!viewer) fail(401, 'Нужно войти');
  const title = clean(data.title, 120);
  const body = clean(data.body, 5000);
  if (title.length < 3) fail(400, 'Заголовок минимум 3 символа');
  if (!body) fail(400, 'Пустой пост никому не интересен');

  const channel = CHANNELS[data.channel] ? data.channel : 'offtop';
  const result = run(`
    INSERT INTO posts(author_id, title, body, channel, tags, hero, feat, lfg_lane, lfg_rank, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    viewer.id, title, body, channel,
    listTags(data.tags).join(','),
    HERO_NAMES.includes(data.hero) ? data.hero : '',
    FEATS[data.feat] ? data.feat : '',
    channel === 'lfg' && LANES[data.lfgLane] ? data.lfgLane : '',
    channel === 'lfg' && RANK_IDS.includes(data.lfgRank) ? data.lfgRank : '',
    now());

  return getPost(viewer, Number(result.lastInsertRowid));
}

export function editPost(viewer, id, data) {
  const post = one('SELECT * FROM posts WHERE id = ?', id);
  if (!post) fail(404, 'Пост не найден');
  if (!viewer || post.author_id !== viewer.id) fail(403, 'Править можно только свой пост');

  const title = data.title !== undefined ? clean(data.title, 120) : post.title;
  const body = data.body !== undefined ? clean(data.body, 5000) : post.body;
  if (title.length < 3) fail(400, 'Заголовок минимум 3 символа');
  if (!body) fail(400, 'Пустой пост никому не интересен');

  run(`UPDATE posts SET title = ?, body = ?, tags = ?, hero = ?, feat = ?, edited_at = ? WHERE id = ?`,
    title, body,
    data.tags !== undefined ? listTags(data.tags).join(',') : post.tags,
    data.hero !== undefined ? (HERO_NAMES.includes(data.hero) ? data.hero : '') : post.hero,
    data.feat !== undefined ? (FEATS[data.feat] ? data.feat : '') : post.feat,
    now(), id);

  return getPost(viewer, id);
}

export function editComment(viewer, id, { body }) {
  const comment = one('SELECT * FROM comments WHERE id = ?', id);
  if (!comment) fail(404, 'Комментарий не найден');
  if (!viewer || comment.author_id !== viewer.id) fail(403, 'Править можно только свой ответ');
  const text = clean(body, 1500);
  if (!text) fail(400, 'Комментарий пустой');
  run('UPDATE comments SET body = ?, edited_at = ? WHERE id = ?', text, now(), id);
  const row = one(`
    SELECT c.*, u.username AS author_name, u.accent AS author_accent, u.role AS author_role,
           u.hero AS author_hero, u.lane AS author_lane, u.rank_id AS author_rank
    FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`, id);
  return serializeComment(row, viewer);
}

export function deletePost(viewer, id) {
  const post = one('SELECT * FROM posts WHERE id = ?', id);
  if (!post) fail(404, 'Пост не найден');
  if (!viewer || (post.author_id !== viewer.id && !isStaff(viewer))) fail(403, 'Это не твой пост');
  run('DELETE FROM posts WHERE id = ?', id);
  return { ok: true };
}

export function togglePin(viewer, id) {
  if (!isStaff(viewer)) fail(403, 'Нужны права модератора');
  const post = one('SELECT * FROM posts WHERE id = ?', id);
  if (!post) fail(404, 'Пост не найден');
  run('UPDATE posts SET pinned = ? WHERE id = ?', post.pinned ? 0 : 1, id);
  return { pinned: !post.pinned };
}

export function toggleLike(viewer, id) {
  if (!viewer) fail(401, 'Нужно войти');
  if (!one('SELECT 1 AS x FROM posts WHERE id = ?', id)) fail(404, 'Пост не найден');
  const post = one('SELECT * FROM posts WHERE id = ?', id);
  const existing = one('SELECT 1 AS x FROM likes WHERE post_id = ? AND user_id = ?', id, viewer.id);
  if (existing) {
    run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', id, viewer.id);
  } else {
    run('INSERT INTO likes(post_id, user_id) VALUES(?, ?)', id, viewer.id);
    notify(post.author_id, viewer.id, 'like', id, post.title);
  }
  return {
    liked: !existing,
    likes: one('SELECT COUNT(*) AS n FROM likes WHERE post_id = ?', id).n,
  };
}

// --- комментарии ------------------------------------------------------------

export function addComment(viewer, postId, { body }) {
  if (!viewer) fail(401, 'Нужно войти');
  if (!one('SELECT 1 AS x FROM posts WHERE id = ?', postId)) fail(404, 'Пост не найден');
  const text = clean(body, 1500);
  if (!text) fail(400, 'Комментарий пустой');
  const post = one('SELECT * FROM posts WHERE id = ?', postId);
  const result = run('INSERT INTO comments(post_id, author_id, body, created_at) VALUES(?, ?, ?, ?)',
    postId, viewer.id, text, now());
  notify(post.author_id, viewer.id, 'comment', postId, text);
  const row = one(`
    SELECT c.*, u.username AS author_name, u.accent AS author_accent, u.role AS author_role,
           u.hero AS author_hero, u.lane AS author_lane, u.rank_id AS author_rank
    FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`, result.lastInsertRowid);
  return serializeComment(row, viewer);
}

export function deleteComment(viewer, id) {
  const comment = one('SELECT * FROM comments WHERE id = ?', id);
  if (!comment) fail(404, 'Комментарий не найден');
  if (!viewer || (comment.author_id !== viewer.id && !isStaff(viewer))) fail(403, 'Это не твой комментарий');
  run('DELETE FROM comments WHERE id = ?', id);
  return { ok: true };
}

// --- личные сообщения -------------------------------------------------------

export function conversations(viewer) {
  if (!viewer) fail(401, 'Нужно войти');
  const rows = all(`
    SELECT u.*, 
           (SELECT body FROM messages m
             WHERE (m.sender_id = u.id AND m.recipient_id = ?1)
                OR (m.sender_id = ?1 AND m.recipient_id = u.id)
             ORDER BY m.created_at DESC LIMIT 1) AS last_body,
           (SELECT created_at FROM messages m
             WHERE (m.sender_id = u.id AND m.recipient_id = ?1)
                OR (m.sender_id = ?1 AND m.recipient_id = u.id)
             ORDER BY m.created_at DESC LIMIT 1) AS last_at,
           (SELECT COUNT(*) FROM messages m
             WHERE m.sender_id = u.id AND m.recipient_id = ?1 AND m.read_at IS NULL) AS unread
    FROM users u
    WHERE u.id IN (
      SELECT recipient_id FROM messages WHERE sender_id = ?1
      UNION SELECT sender_id FROM messages WHERE recipient_id = ?1
    )
    ORDER BY last_at DESC`, viewer.id);

  return rows.map((row) => ({
    user: publicUser(row, viewer),
    lastMessage: row.last_body,
    lastAt: row.last_at,
    unread: row.unread,
  }));
}

export function thread(viewer, username) {
  if (!viewer) fail(401, 'Нужно войти');
  const other = findUser(username);
  if (!other) fail(404, 'Игрок не найден');

  const rows = all(`
    SELECT * FROM messages
    WHERE (sender_id = ?1 AND recipient_id = ?2) OR (sender_id = ?2 AND recipient_id = ?1)
    ORDER BY created_at ASC LIMIT 500`, viewer.id, other.id);

  run('UPDATE messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL',
    now(), viewer.id, other.id);

  return {
    user: publicUser(other, viewer),
    messages: rows.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      mine: m.sender_id === viewer.id,
      read: !!m.read_at,
    })),
  };
}

export function sendMessage(viewer, username, { body }) {
  if (!viewer) fail(401, 'Нужно войти');
  const other = findUser(username);
  if (!other) fail(404, 'Игрок не найден');
  if (other.id === viewer.id) fail(400, 'Писать самому себе — так себе затея');
  if (isBlocked(other.id, viewer.id)) fail(403, 'Игрок вас заблокировал');
  if (isBlocked(viewer.id, other.id)) fail(403, 'Вы заблокировали этого игрока');
  if (other.banned_at) fail(403, 'Игрок заблокирован');
  const text = clean(body, 2000);
  if (!text) fail(400, 'Пустое сообщение');

  const result = run('INSERT INTO messages(sender_id, recipient_id, body, created_at) VALUES(?, ?, ?, ?)',
    viewer.id, other.id, text, now());
  return { id: Number(result.lastInsertRowid), body: text, createdAt: now(), mine: true, read: false };
}

export const unreadCount = (viewer) => viewer
  ? one('SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL', viewer.id).n
  : 0;

// --- жалобы -----------------------------------------------------------------

export function report(viewer, { targetType, targetId, reason }) {
  if (!viewer) fail(401, 'Нужно войти');
  if (!['post', 'comment', 'user'].includes(targetType)) fail(400, 'Непонятный объект жалобы');
  const text = clean(reason, 300);
  if (!text) fail(400, 'Опиши, что не так');

  const table = { post: 'posts', comment: 'comments', user: 'users' }[targetType];
  if (!one(`SELECT 1 AS x FROM ${table} WHERE id = ?`, Number(targetId))) {
    fail(404, 'Объект жалобы не найден');
  }
  if (one('SELECT 1 AS x FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND resolved_at IS NULL',
      viewer.id, targetType, Number(targetId))) {
    fail(409, 'Ты уже жаловался на это — модераторы видят');
  }
  run('INSERT INTO reports(reporter_id, target_type, target_id, reason, created_at) VALUES(?, ?, ?, ?, ?)',
    viewer.id, targetType, Number(targetId), text, now());
  return { ok: true };
}

// --- админпанель ------------------------------------------------------------

export function adminOverview(viewer) {
  if (!isStaff(viewer)) fail(403, 'Нужны права модератора');
  const counts = one(`
    SELECT (SELECT COUNT(*) FROM users) AS users,
           (SELECT COUNT(*) FROM users WHERE banned_at IS NOT NULL) AS banned,
           (SELECT COUNT(*) FROM posts) AS posts,
           (SELECT COUNT(*) FROM comments) AS comments,
           (SELECT COUNT(*) FROM messages) AS messages,
           (SELECT COUNT(*) FROM reports WHERE resolved_at IS NULL) AS openReports`);

  return {
    counts,
    channels: Object.keys(CHANNELS).map((id) => ({
      id, name: CHANNELS[id],
      posts: one('SELECT COUNT(*) AS n FROM posts WHERE channel = ?', id).n,
    })),
    users: all('SELECT * FROM users ORDER BY created_at DESC LIMIT 200')
      .map((row) => publicUser(row, viewer)),
    reports: all(`
      SELECT r.*, u.username AS reporter FROM reports r JOIN users u ON u.id = r.reporter_id
      WHERE r.resolved_at IS NULL ORDER BY r.created_at DESC LIMIT 100`)
      .map((r) => ({
        id: r.id, targetType: r.target_type, targetId: r.target_id,
        reason: r.reason, reporter: r.reporter, createdAt: r.created_at,
      })),
  };
}

export function setRole(viewer, userId, role) {
  if (!roleAtLeast(viewer, 'admin')) fail(403, 'Роли меняет только админ');
  if (!['user', 'moderator', 'admin'].includes(role)) fail(400, 'Такой роли нет');
  const target = one('SELECT * FROM users WHERE id = ?', userId);
  if (!target) fail(404, 'Игрок не найден');
  if (target.id === viewer.id) fail(400, 'Свою роль менять нельзя');
  if (roleAtLeast(target, 'admin')) fail(403, 'Роль другого админа менять нельзя');
  run('UPDATE users SET role = ? WHERE id = ?', role, userId);
  return publicUser(one('SELECT * FROM users WHERE id = ?', userId), viewer);
}

export function setBan(viewer, userId, banned, reason) {
  if (!isStaff(viewer)) fail(403, 'Нужны права модератора');
  const target = one('SELECT * FROM users WHERE id = ?', userId);
  if (!target) fail(404, 'Игрок не найден');
  if (target.id === viewer.id) fail(400, 'Себя банить не надо');
  if (roleAtLeast(target, 'admin')) fail(403, 'Админа не забанить');
  if (banned) banUser(userId, reason); else unbanUser(userId);
  return publicUser(one('SELECT * FROM users WHERE id = ?', userId), viewer);
}

export function resolveReport(viewer, reportId) {
  if (!isStaff(viewer)) fail(403, 'Нужны права модератора');
  run('UPDATE reports SET resolved_at = ? WHERE id = ?', now(), reportId);
  return { ok: true };
}

// --- витрина ----------------------------------------------------------------

export function stats(viewer) {
  const tagRows = all("SELECT tags FROM posts WHERE tags <> ''");
  const tally = new Map();
  for (const row of tagRows) {
    for (const tag of row.tags.split(',')) tally.set(tag, (tally.get(tag) || 0) + 1);
  }

  return {
    users: one('SELECT COUNT(*) AS n FROM users').n,
    posts: one('SELECT COUNT(*) AS n FROM posts').n,
    comments: one('SELECT COUNT(*) AS n FROM comments').n,
    online: one('SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE expires_at > ?', Date.now()).n,
    channels: Object.keys(CHANNELS).map((id) => ({
      id, name: CHANNELS[id],
      posts: one('SELECT COUNT(*) AS n FROM posts WHERE channel = ?', id).n,
    })),
    trending: [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([tag, count]) => ({ tag, count })),
    topPlayers: all(`
      SELECT u.*, (SELECT COUNT(*) FROM likes l JOIN posts p ON p.id = l.post_id
                   WHERE p.author_id = u.id) AS karma
      FROM users u WHERE u.banned_at IS NULL ORDER BY karma DESC, u.id ASC LIMIT 5`)
      .map((row) => publicUser(row, viewer)),
    topHeroes: all(`
      SELECT hero, COUNT(*) AS n FROM posts WHERE hero <> ''
      GROUP BY hero ORDER BY n DESC LIMIT 6`),
  };
}

export { CHANNELS, LANES, FEATS };
