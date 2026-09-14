import {
  data, nextId, now, persist,
  hashPassword, verifyPassword, createSession, dropSession,
} from './store.js';

const USERNAME_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{1,23}$/;
const CHANNELS = ['general', 'code', 'design', 'music', 'science', 'random'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
export { HttpError, CHANNELS };

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

// --- сериализация -----------------------------------------------------------

export function publicUser(user) {
  if (!user) return null;
  const { id, username, bio, accent, createdAt } = user;
  const db = data();
  return {
    id, username, bio, accent, createdAt,
    posts: db.posts.filter((p) => p.authorId === id).length,
    comments: db.comments.filter((c) => c.authorId === id).length,
    karma: db.posts
      .filter((p) => p.authorId === id)
      .reduce((sum, p) => sum + p.likes.length, 0),
  };
}

function serializePost(post, viewer, { withComments = false } = {}) {
  const db = data();
  const author = db.users.find((u) => u.id === post.authorId);
  const comments = db.comments.filter((c) => c.postId === post.id);
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    channel: post.channel,
    tags: post.tags,
    createdAt: post.createdAt,
    likes: post.likes.length,
    liked: viewer ? post.likes.includes(viewer.id) : false,
    mine: viewer ? post.authorId === viewer.id : false,
    commentCount: comments.length,
    author: author ? { id: author.id, username: author.username, accent: author.accent } : null,
    hot: hotScore(post, comments.length),
    comments: withComments
      ? comments
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((c) => serializeComment(c, viewer))
      : undefined,
  };
}

function serializeComment(comment, viewer) {
  const author = data().users.find((u) => u.id === comment.authorId);
  return {
    id: comment.id,
    postId: comment.postId,
    body: comment.body,
    createdAt: comment.createdAt,
    mine: viewer ? comment.authorId === viewer.id : false,
    author: author ? { id: author.id, username: author.username, accent: author.accent } : null,
  };
}

/** Рейтинг в духе HN: вес обсуждения затухает со временем. */
function hotScore(post, commentCount) {
  const ageHours = (Date.now() - Date.parse(post.createdAt)) / 36e5;
  return (post.likes.length + commentCount * 2 + 1) / Math.pow(ageHours + 2, 1.4);
}

// --- аутентификация ---------------------------------------------------------

export function register({ username, password, bio }) {
  const name = clean(username, 24);
  if (!USERNAME_RE.test(name)) fail(400, 'Ник: 2–24 символа, латиница, цифры, _ . -');
  if (String(password ?? '').length < 6) fail(400, 'Пароль минимум 6 символов');
  const db = data();
  if (db.users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
    fail(409, 'Такой ник уже занят');
  }
  const user = {
    id: nextId(),
    username: name,
    password: hashPassword(password),
    bio: clean(bio, 160),
    accent: Math.floor(Math.random() * 6),
    createdAt: now(),
  };
  db.users.push(user);
  persist();
  return { user, token: createSession(user.id) };
}

export function login({ username, password }) {
  const name = clean(username, 24).toLowerCase();
  const user = data().users.find((u) => u.username.toLowerCase() === name);
  if (!user || !verifyPassword(String(password ?? ''), user.password)) {
    fail(401, 'Неверный ник или пароль');
  }
  return { user, token: createSession(user.id) };
}

export const logout = (token) => dropSession(token);

export function updateProfile(viewer, { bio, accent }) {
  if (!viewer) fail(401, 'Нужно войти');
  if (bio !== undefined) viewer.bio = clean(bio, 160);
  if (accent !== undefined) viewer.accent = Math.max(0, Math.min(5, Number(accent) || 0));
  persist();
  return publicUser(viewer);
}

// --- посты ------------------------------------------------------------------

export function listPosts(viewer, query = {}) {
  const { channel, sort = 'hot', q, author, liked } = query;
  const db = data();
  let posts = db.posts.slice();

  if (channel && channel !== 'all') posts = posts.filter((p) => p.channel === channel);
  if (author) posts = posts.filter((p) => {
    const a = db.users.find((u) => u.id === p.authorId);
    return a && a.username.toLowerCase() === String(author).toLowerCase();
  });
  if (liked === '1' && viewer) posts = posts.filter((p) => p.likes.includes(viewer.id));
  if (q) {
    const needle = String(q).toLowerCase();
    posts = posts.filter((p) =>
      p.title.toLowerCase().includes(needle) ||
      p.body.toLowerCase().includes(needle) ||
      p.tags.some((t) => t.includes(needle)));
  }

  const items = posts.map((p) => serializePost(p, viewer));
  const order = {
    new: (a, b) => b.createdAt.localeCompare(a.createdAt),
    top: (a, b) => b.likes - a.likes || b.createdAt.localeCompare(a.createdAt),
    hot: (a, b) => b.hot - a.hot,
  };
  items.sort(order[sort] || order.hot);
  return items;
}

export function getPost(viewer, id) {
  const post = data().posts.find((p) => p.id === id);
  if (!post) fail(404, 'Пост не найден');
  return serializePost(post, viewer, { withComments: true });
}

export function createPost(viewer, { title, body, channel, tags }) {
  if (!viewer) fail(401, 'Нужно войти');
  const post = {
    id: nextId(),
    authorId: viewer.id,
    title: clean(title, 120),
    body: clean(body, 4000),
    channel: CHANNELS.includes(channel) ? channel : 'general',
    tags: parseTags(tags),
    likes: [],
    createdAt: now(),
  };
  if (post.title.length < 3) fail(400, 'Заголовок минимум 3 символа');
  if (post.body.length < 1) fail(400, 'Пустой пост никому не интересен');
  data().posts.push(post);
  persist();
  return serializePost(post, viewer, { withComments: true });
}

export function deletePost(viewer, id) {
  const db = data();
  const post = db.posts.find((p) => p.id === id);
  if (!post) fail(404, 'Пост не найден');
  if (!viewer || post.authorId !== viewer.id) fail(403, 'Это не твой пост');
  db.posts = db.posts.filter((p) => p.id !== id);
  db.comments = db.comments.filter((c) => c.postId !== id);
  persist();
  return { ok: true };
}

export function toggleLike(viewer, id) {
  if (!viewer) fail(401, 'Нужно войти');
  const post = data().posts.find((p) => p.id === id);
  if (!post) fail(404, 'Пост не найден');
  const at = post.likes.indexOf(viewer.id);
  if (at === -1) post.likes.push(viewer.id); else post.likes.splice(at, 1);
  persist();
  return { likes: post.likes.length, liked: at === -1 };
}

function parseTags(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,\s]+/);
  return [...new Set(list
    .map((t) => t.replace(/^#/, '').toLowerCase().replace(/[^a-zа-я0-9_-]/gi, ''))
    .filter((t) => t.length >= 2 && t.length <= 20))].slice(0, 5);
}

// --- комментарии ------------------------------------------------------------

export function addComment(viewer, postId, { body }) {
  if (!viewer) fail(401, 'Нужно войти');
  const post = data().posts.find((p) => p.id === postId);
  if (!post) fail(404, 'Пост не найден');
  const text = clean(body, 1000);
  if (!text) fail(400, 'Комментарий пустой');
  const comment = { id: nextId(), postId, authorId: viewer.id, body: text, createdAt: now() };
  data().comments.push(comment);
  persist();
  return serializeComment(comment, viewer);
}

export function deleteComment(viewer, id) {
  const db = data();
  const comment = db.comments.find((c) => c.id === id);
  if (!comment) fail(404, 'Комментарий не найден');
  if (!viewer || comment.authorId !== viewer.id) fail(403, 'Это не твой комментарий');
  db.comments = db.comments.filter((c) => c.id !== id);
  persist();
  return { ok: true };
}

// --- витрина ----------------------------------------------------------------

export function stats() {
  const db = data();
  const online = Object.values(db.sessions).filter((s) => s.expires > Date.now()).length;
  return {
    users: db.users.length,
    posts: db.posts.length,
    comments: db.comments.length,
    online,
    channels: CHANNELS.map((c) => ({
      name: c,
      posts: db.posts.filter((p) => p.channel === c).length,
    })),
    trending: trendingTags(),
    topUsers: db.users
      .map(publicUser)
      .sort((a, b) => b.karma - a.karma || b.posts - a.posts)
      .slice(0, 5),
  };
}

function trendingTags() {
  const counts = new Map();
  for (const post of data().posts) {
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));
}

export function profile(username) {
  const user = data().users.find(
    (u) => u.username.toLowerCase() === String(username).toLowerCase());
  if (!user) fail(404, 'Пользователь не найден');
  return publicUser(user);
}
