'use strict';

const db = require('../db');
const { now, trim } = require('./util');

/* ------------------------------------------------------------------ users */

const users = {
  byId: db.prepare('SELECT * FROM users WHERE id = ?'),
  byLogin: db.prepare('SELECT * FROM users WHERE login = ? COLLATE NOCASE'),
  brief: db.prepare(`
    SELECT id, login, first_name, last_name, sex, avatar, city, status, last_seen FROM users WHERE id = ?
  `),
};

function getUser(id) {
  return users.byId.get(id);
}

function searchUsers(query, limit) {
  const like = '%' + String(query || '').trim() + '%';
  return db.prepare(`
    SELECT * FROM users
    WHERE first_name LIKE ? OR last_name LIKE ? OR (first_name || ' ' || last_name) LIKE ? OR login LIKE ?
    ORDER BY last_name, first_name LIMIT ?
  `).all(like, like, like, like, limit || 50);
}

/* ---------------------------------------------------------------- friends */

const friendsQ = {
  pair: db.prepare('SELECT * FROM friendships WHERE from_id = ? AND to_id = ?'),
  insert: db.prepare(
    "INSERT OR IGNORE INTO friendships (from_id, to_id, status, created_at) VALUES (?, ?, 'pending', ?)"),
  accept: db.prepare("UPDATE friendships SET status = 'accepted' WHERE from_id = ? AND to_id = ?"),
  remove: db.prepare('DELETE FROM friendships WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)'),
  list: db.prepare(`
    SELECT u.* FROM users u
    JOIN friendships f ON (f.to_id = u.id AND f.from_id = @id) OR (f.from_id = u.id AND f.to_id = @id)
    WHERE f.status = 'accepted'
    GROUP BY u.id ORDER BY u.last_name, u.first_name
  `),
  ids: db.prepare(`
    SELECT CASE WHEN from_id = @id THEN to_id ELSE from_id END AS uid
    FROM friendships WHERE status = 'accepted' AND (from_id = @id OR to_id = @id)
  `),
  incoming: db.prepare(`
    SELECT u.* FROM users u JOIN friendships f ON f.from_id = u.id
    WHERE f.to_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC
  `),
  outgoing: db.prepare(`
    SELECT u.* FROM users u JOIN friendships f ON f.to_id = u.id
    WHERE f.from_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC
  `),
};

function friendStatus(meId, otherId) {
  if (meId === otherId) return 'self';
  const a = friendsQ.pair.get(meId, otherId);
  if (a) return a.status === 'accepted' ? 'friends' : 'out';
  const b = friendsQ.pair.get(otherId, meId);
  if (b) return b.status === 'accepted' ? 'friends' : 'in';
  return 'none';
}

const friendIds = (id) => friendsQ.ids.all({ id }).map((r) => r.uid);
const friendList = (id) => friendsQ.list.all({ id });
const areFriends = (a, b) => friendStatus(a, b) === 'friends';

function mutualFriends(aId, bId) {
  const a = new Set(friendIds(aId));
  return friendIds(bId).filter((id) => a.has(id)).map(getUser);
}

function addFriend(meId, otherId) {
  if (friendsQ.pair.get(otherId, meId)) {
    friendsQ.accept.run(otherId, meId);
    return 'friends';
  }
  friendsQ.insert.run(meId, otherId, now());
  return 'out';
}

function removeFriend(meId, otherId) {
  friendsQ.remove.run(meId, otherId, otherId, meId);
}

/* -------------------------------------------------- блокировки и приватность */

const blocksQ = {
  add: db.prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)'),
  del: db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?'),
  one: db.prepare('SELECT 1 x FROM blocks WHERE user_id = ? AND blocked_id = ?'),
  list: db.prepare(`
    SELECT u.*, b.created_at AS blocked_at FROM users u JOIN blocks b ON b.blocked_id = u.id
    WHERE b.user_id = ? ORDER BY b.created_at DESC
  `),
};

/** Я заблокировал его. */
const hasBlocked = (meId, otherId) => !!blocksQ.one.get(meId, otherId);
/** Блокировка в любую сторону — общение невозможно. */
const blockedEither = (a, b) => a !== b && (hasBlocked(a, b) || hasBlocked(b, a));

function blockUser(meId, otherId) {
  if (meId === otherId) return;
  blocksQ.add.run(meId, otherId, now());
  removeFriend(meId, otherId);
}

const unblockUser = (meId, otherId) => blocksQ.del.run(meId, otherId);

/**
 * Настройки приватности: 'all' — всем, 'friends' — друзьям, 'me' — только себе.
 * section: profile | photos | audio | friends | message | wall
 */
function canSee(viewerId, owner, section) {
  if (!owner) return false;
  if (viewerId === owner.id) return true;
  if (blockedEither(viewerId, owner.id)) return false;
  const rule = owner[section + '_who'] || 'all';
  if (rule === 'all') return true;
  if (rule === 'friends') return areFriends(viewerId, owner.id);
  return false;
}

/** Кто может писать на стену. Владелец — всегда. */
function canPostOnWall(owner, viewerId) {
  if (!viewerId) return false;
  if (owner.id === viewerId) return true;
  if (blockedEither(viewerId, owner.id)) return false;
  if (owner.wall_who === 'me') return false;
  if (owner.wall_who === 'friends') return areFriends(viewerId, owner.id);
  return true;
}

const canMessage = (viewerId, owner) => canSee(viewerId, owner, 'message');

/* ----------------------------------------------------------------- groups */

const groupsQ = {
  byId: db.prepare('SELECT * FROM groups WHERE id = ?'),
  membersCount: db.prepare('SELECT COUNT(*) n FROM group_members WHERE group_id = ?'),
  members: db.prepare(`
    SELECT u.*, gm.role FROM users u JOIN group_members gm ON gm.user_id = u.id
    WHERE gm.group_id = ? ORDER BY (gm.role = 'admin') DESC, u.last_name
  `),
  isMember: db.prepare('SELECT 1 x FROM group_members WHERE group_id = ? AND user_id = ?'),
  ofUser: db.prepare(`
    SELECT g.* FROM groups g JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ? ORDER BY g.name
  `),
  groupIds: db.prepare('SELECT group_id FROM group_members WHERE user_id = ?'),
};

/* ------------------------------------------------------------- вложения */

const attachQ = {
  insert: db.prepare(`
    INSERT INTO attachments (parent_type, parent_id, kind, ref_id, file, meta, position)
    VALUES (@parent_type, @parent_id, @kind, @ref_id, @file, @meta, @position)
  `),
  ofParent: db.prepare(
    'SELECT * FROM attachments WHERE parent_type = ? AND parent_id = ? ORDER BY position, id'),
  delParent: db.prepare('DELETE FROM attachments WHERE parent_type = ? AND parent_id = ?'),
};

const photosQ = { byId: db.prepare('SELECT * FROM photos WHERE id = ?') };
const audiosQ = { byId: db.prepare('SELECT * FROM audios WHERE id = ?') };
const videosQ = { byId: db.prepare('SELECT * FROM videos WHERE id = ?') };
const docsQ = { byId: db.prepare('SELECT * FROM docs WHERE id = ?') };

/** items: [{ kind, ref_id?, file?, meta? }] */
function saveAttachments(parentType, parentId, items) {
  let position = 0;
  for (const item of items || []) {
    attachQ.insert.run({
      parent_type: parentType,
      parent_id: parentId,
      kind: item.kind,
      ref_id: item.ref_id || null,
      file: item.file || null,
      meta: JSON.stringify(item.meta || {}),
      position: position++,
    });
  }
}

/** Разворачивает строки attachments в объекты с данными фото/видео/аудио/документа. */
function loadAttachments(parentType, parentId) {
  return attachQ.ofParent.all(parentType, parentId).map((row) => {
    const item = {
      id: row.id,
      kind: row.kind,
      file: row.file,
      meta: JSON.parse(row.meta || '{}'),
    };
    if (row.kind === 'photo') item.photo = photosQ.byId.get(row.ref_id);
    if (row.kind === 'audio') item.audio = audiosQ.byId.get(row.ref_id);
    if (row.kind === 'video') item.video = videosQ.byId.get(row.ref_id);
    if (row.kind === 'doc') item.doc = docsQ.byId.get(row.ref_id);
    return item;
  }).filter((item) => {
    if (item.kind === 'photo') return !!item.photo;
    if (item.kind === 'audio') return !!item.audio;
    if (item.kind === 'video') return !!item.video;
    if (item.kind === 'doc') return !!item.doc;
    return !!item.file;
  });
}

/* --------------------------------------------------------- лайки и комменты */

const likesQ = {
  count: db.prepare('SELECT COUNT(*) n FROM likes WHERE target_type = ? AND target_id = ?'),
  mine: db.prepare('SELECT 1 x FROM likes WHERE target_type = ? AND target_id = ? AND user_id = ?'),
  add: db.prepare(
    'INSERT OR IGNORE INTO likes (target_type, target_id, user_id, created_at) VALUES (?, ?, ?, ?)'),
  del: db.prepare('DELETE FROM likes WHERE target_type = ? AND target_id = ? AND user_id = ?'),
  users: db.prepare(`
    SELECT u.* FROM users u JOIN likes l ON l.user_id = u.id
    WHERE l.target_type = ? AND l.target_id = ? ORDER BY l.created_at DESC LIMIT 100
  `),
};

function toggleLike(targetType, targetId, userId) {
  const had = !!likesQ.mine.get(targetType, targetId, userId);
  if (had) likesQ.del.run(targetType, targetId, userId);
  else likesQ.add.run(targetType, targetId, userId, now());
  return { count: likesQ.count.get(targetType, targetId).n, liked: !had, added: !had };
}

const commentsQ = {
  list: db.prepare(`
    SELECT c.*, u.first_name, u.last_name, u.avatar, u.sex, u.login FROM comments c
    JOIN users u ON u.id = c.author_id
    WHERE c.target_type = ? AND c.target_id = ? ORDER BY c.id
  `),
  count: db.prepare('SELECT COUNT(*) n FROM comments WHERE target_type = ? AND target_id = ?'),
  insert: db.prepare(`
    INSERT INTO comments (target_type, target_id, author_id, text, reply_to, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  byId: db.prepare('SELECT * FROM comments WHERE id = ?'),
  update: db.prepare('UPDATE comments SET text = ?, edited_at = ? WHERE id = ?'),
  del: db.prepare('DELETE FROM comments WHERE id = ?'),
};

/* ------------------------------------------------------------------ записи */

const postsQ = {
  byId: db.prepare('SELECT * FROM posts WHERE id = ?'),
  update: db.prepare('UPDATE posts SET text = ?, edited_at = ? WHERE id = ?'),
  del: db.prepare('DELETE FROM posts WHERE id = ?'),
  insert: db.prepare(`
    INSERT INTO posts (owner_type, owner_id, author_id, text, repost_of, created_at)
    VALUES (@owner_type, @owner_id, @author_id, @text, @repost_of, @created_at)
  `),
  unpinAll: db.prepare('UPDATE posts SET pinned = 0 WHERE owner_type = ? AND owner_id = ?'),
  pin: db.prepare('UPDATE posts SET pinned = 1 WHERE id = ?'),
  repostCount: db.prepare('SELECT COUNT(*) n FROM posts WHERE repost_of = ?'),
};

function ownerOf(post) {
  return post.owner_type === 'group' ? groupsQ.byId.get(post.owner_id) : users.brief.get(post.owner_id);
}

/** Одна запись со всем обвесом: автор, владелец, вложения, лайки, комментарии, репост. */
function decoratePost(row, meId, depth) {
  const post = Object.assign({}, row);
  post.author = users.brief.get(row.author_id);
  post.owner = ownerOf(row);
  post.attachments = loadAttachments('post', row.id);
  post.likes = likesQ.count.get('post', row.id).n;
  post.liked = meId ? !!likesQ.mine.get('post', row.id, meId) : false;
  post.reposts = postsQ.repostCount.get(row.id).n;
  post.comments = commentsQ.list.all('post', row.id);
  post.source = null;
  if (row.repost_of && (depth || 0) < 1) {
    const source = postsQ.byId.get(row.repost_of);
    if (source) post.source = decoratePost(source, meId, (depth || 0) + 1);
  }
  return post;
}

const decoratePosts = (rows, meId) => rows.map((row) => decoratePost(row, meId));

function wallPosts(ownerType, ownerId, meId, limit, offset) {
  const rows = db.prepare(`
    SELECT * FROM posts WHERE owner_type = ? AND owner_id = ?
    ORDER BY pinned DESC, id DESC LIMIT ? OFFSET ?
  `).all(ownerType, ownerId, limit, offset || 0);
  return decoratePosts(rows, meId);
}

const wallCount = (ownerType, ownerId) =>
  db.prepare('SELECT COUNT(*) n FROM posts WHERE owner_type = ? AND owner_id = ?').get(ownerType, ownerId).n;

/** Лента: стены друзей, свои записи и группы, где я состою. Блокировки убираем. */
function feedPosts(meId, limit, offset) {
  const uids = friendIds(meId).concat([meId]);
  const gids = groupsQ.groupIds.all(meId).map((r) => r.group_id);
  const userMarks = uids.map(() => '?').join(',') || 'NULL';
  const groupMarks = gids.map(() => '?').join(',') || 'NULL';
  const rows = db.prepare(`
    SELECT * FROM posts
    WHERE (owner_type = 'user' AND owner_id IN (${userMarks}))
       OR (owner_type = 'group' AND owner_id IN (${groupMarks}))
    ORDER BY id DESC LIMIT ? OFFSET ?
  `).all(...uids, ...gids, limit, offset || 0);
  return decoratePosts(rows.filter((p) => !blockedEither(meId, p.author_id)), meId);
}

function searchPosts(meId, query, limit) {
  const like = '%' + String(query || '').trim() + '%';
  const rows = db.prepare(`
    SELECT * FROM posts WHERE text LIKE ? ORDER BY id DESC LIMIT ?
  `).all(like, limit || 50);
  return decoratePosts(
    rows.filter((p) => {
      if (blockedEither(meId, p.author_id)) return false;
      if (p.owner_type === 'user') return canSee(meId, getUser(p.owner_id), 'profile');
      return true;
    }),
    meId
  );
}

/* ------------------------------------------------------------- уведомления */

const notifQ = {
  insert: db.prepare(`
    INSERT INTO notifications (user_id, kind, actor_id, target_type, target_id, url, preview, created_at)
    VALUES (@user_id, @kind, @actor_id, @target_type, @target_id, @url, @preview, @created_at)
  `),
  unread: db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND is_read = 0'),
  list: db.prepare(`
    SELECT n.*, u.first_name, u.last_name, u.avatar, u.sex, u.login FROM notifications n
    LEFT JOIN users u ON u.id = n.actor_id
    WHERE n.user_id = ? ORDER BY n.id DESC LIMIT ? OFFSET ?
  `),
  markAll: db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0'),
  dropSame: db.prepare(`
    DELETE FROM notifications
    WHERE user_id = ? AND kind = ? AND actor_id = ? AND target_type = ? AND target_id = ?
  `),
};

/**
 * Кладёт уведомление и возвращает его, чтобы роут мог толкнуть событие в сокет.
 * Себе не уведомляем, заблокированным тоже.
 */
function notify(opts) {
  if (!opts.userId || opts.userId === opts.actorId) return null;
  if (blockedEither(opts.userId, opts.actorId)) return null;
  if (opts.unique) notifQ.dropSame.run(opts.userId, opts.kind, opts.actorId, opts.targetType || '', opts.targetId || 0);
  const info = notifQ.insert.run({
    user_id: opts.userId,
    kind: opts.kind,
    actor_id: opts.actorId || null,
    target_type: opts.targetType || '',
    target_id: opts.targetId || 0,
    url: opts.url || '',
    preview: trim(opts.preview || '', 200),
    created_at: now(),
  });
  return { id: info.lastInsertRowid, kind: opts.kind, url: opts.url || '' };
}

/** Убирает уведомление, когда действие отменили (сняли лайк, удалили запись). */
function dropNotification(userId, kind, actorId, targetType, targetId) {
  notifQ.dropSame.run(userId, kind, actorId, targetType || '', targetId || 0);
}

/* ------------------------------------------------------ беседы и сообщения */

const convQ = {
  byId: db.prepare('SELECT * FROM conversations WHERE id = ?'),
  create: db.prepare(
    'INSERT INTO conversations (kind, title, avatar, creator_id, created_at) VALUES (?, ?, ?, ?, ?)'),
  addMember: db.prepare(`
    INSERT OR IGNORE INTO conversation_members (conv_id, user_id, role, joined_at, last_read_id)
    VALUES (?, ?, ?, ?, 0)
  `),
  dropMember: db.prepare('DELETE FROM conversation_members WHERE conv_id = ? AND user_id = ?'),
  member: db.prepare('SELECT * FROM conversation_members WHERE conv_id = ? AND user_id = ?'),
  members: db.prepare(`
    SELECT u.*, cm.role, cm.last_read_id FROM users u JOIN conversation_members cm ON cm.user_id = u.id
    WHERE cm.conv_id = ? ORDER BY (cm.role = 'admin') DESC, u.first_name
  `),
  memberIds: db.prepare('SELECT user_id FROM conversation_members WHERE conv_id = ?'),
  ofUser: db.prepare(`
    SELECT c.* FROM conversations c JOIN conversation_members cm ON cm.conv_id = c.id
    WHERE cm.user_id = ?
  `),
  setRead: db.prepare(`
    UPDATE conversation_members SET last_read_id = MAX(last_read_id, ?) WHERE conv_id = ? AND user_id = ?
  `),
  lastMessage: db.prepare(
    'SELECT * FROM messages WHERE conv_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1'),
  unread: db.prepare(`
    SELECT COUNT(*) n FROM messages m
    JOIN conversation_members cm ON cm.conv_id = m.conv_id AND cm.user_id = @me
    WHERE m.conv_id = @conv AND m.id > cm.last_read_id AND m.from_id != @me AND m.deleted_at IS NULL
  `),
  history: db.prepare(`
    SELECT * FROM messages WHERE conv_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT ? OFFSET ?
  `),
  message: db.prepare('SELECT * FROM messages WHERE id = ?'),
  send: db.prepare(
    "INSERT INTO messages (conv_id, from_id, text, kind, created_at) VALUES (?, ?, ?, 'text', ?)"),
  editMessage: db.prepare('UPDATE messages SET text = ?, edited_at = ? WHERE id = ?'),
  deleteMessage: db.prepare('UPDATE messages SET deleted_at = ? WHERE id = ?'),
  searchMessages: db.prepare(`
    SELECT m.* FROM messages m
    JOIN conversation_members cm ON cm.conv_id = m.conv_id AND cm.user_id = ?
    WHERE m.deleted_at IS NULL AND m.text LIKE ? ORDER BY m.id DESC LIMIT ?
  `),
};

/** Личный диалог двоих: находим существующий или заводим новый. */
function dmWith(aId, bId) {
  const found = db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_members m1 ON m1.conv_id = c.id AND m1.user_id = ?
    JOIN conversation_members m2 ON m2.conv_id = c.id AND m2.user_id = ?
    WHERE c.kind = 'dm'
    LIMIT 1
  `).get(aId, bId);
  if (found) return convQ.byId.get(found.id);

  const id = convQ.create.run('dm', '', null, aId, now()).lastInsertRowid;
  convQ.addMember.run(id, aId, 'member', now());
  convQ.addMember.run(id, bId, 'member', now());
  return convQ.byId.get(id);
}

function createChat(creatorId, title, memberIds) {
  const id = convQ.create.run('chat', trim(title, 80) || 'Беседа', null, creatorId, now()).lastInsertRowid;
  convQ.addMember.run(id, creatorId, 'admin', now());
  for (const uid of memberIds) {
    if (uid !== creatorId) convQ.addMember.run(id, uid, 'member', now());
  }
  return convQ.byId.get(id);
}

const isConvMember = (convId, userId) => !!convQ.member.get(convId, userId);

/** Собеседник в личном диалоге — тот, кто не я. */
function dmPeer(convId, meId) {
  const row = db.prepare(`
    SELECT user_id FROM conversation_members WHERE conv_id = ? AND user_id != ? LIMIT 1
  `).get(convId, meId);
  return row ? users.brief.get(row.user_id) : null;
}

/** Название и картинка беседы так, как их видит конкретный человек. */
function convView(conv, meId) {
  const view = Object.assign({}, conv);
  if (conv.kind === 'dm') {
    view.peer = dmPeer(conv.id, meId);
    view.title = view.peer ? view.peer.first_name + ' ' + view.peer.last_name : 'Удалённая страница';
  } else {
    view.peer = null;
    view.membersCount = convQ.memberIds.all(conv.id).length;
  }
  view.last = convQ.lastMessage.get(conv.id);
  view.unread = convQ.unread.get({ me: meId, conv: conv.id }).n;
  return view;
}

function conversationsOf(meId) {
  return convQ.ofUser.all(meId)
    .map((c) => convView(c, meId))
    .filter((c) => c.kind !== 'dm' || c.peer)
    .sort((a, b) => ((b.last && b.last.id) || 0) - ((a.last && a.last.id) || 0));
}

const unreadDialogs = (meId) => conversationsOf(meId).filter((c) => c.unread > 0).length;

/** Сообщение с автором и вложениями. */
function decorateMessage(row) {
  return Object.assign({}, row, {
    author: users.brief.get(row.from_id),
    attachments: loadAttachments('message', row.id),
  });
}

function history(convId, limit, offset) {
  return convQ.history.all(convId, limit, offset || 0).reverse().map(decorateMessage);
}

module.exports = {
  db, users, getUser, searchUsers,
  friendsQ, friendStatus, friendIds, friendList, areFriends, mutualFriends, addFriend, removeFriend,
  blocksQ, hasBlocked, blockedEither, blockUser, unblockUser, canSee, canPostOnWall, canMessage,
  groupsQ,
  attachQ, photosQ, audiosQ, videosQ, docsQ, saveAttachments, loadAttachments,
  likesQ, toggleLike, commentsQ,
  postsQ, decoratePost, decoratePosts, wallPosts, wallCount, feedPosts, searchPosts, ownerOf,
  notifQ, notify, dropNotification,
  convQ, dmWith, createChat, isConvMember, dmPeer, convView, conversationsOf, unreadDialogs,
  decorateMessage, history,
};
