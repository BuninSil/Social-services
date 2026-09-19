'use strict';

/**
 * Работа с данными: люди, дружбы, приватность, стена, беседы, уведомления.
 *
 * Базы с запросами тут нет — есть коллекции из src/db.js и обычный JavaScript.
 * Выборки линейные: сайт рассчитан на десятки людей, а не на миллион.
 */

const db = require('../db');
const { now, trim } = require('./util');

const BRIEF_FIELDS = ['id', 'login', 'first_name', 'last_name', 'sex', 'avatar',
  'city', 'status', 'last_seen', 'rc_avatar', 'rc_profile'];

/** Сравнение по-русски: «Яшин» после «Аникеева», а не наоборот. */
const byName = (a, b) =>
  String(a.last_name || '').localeCompare(String(b.last_name || ''), 'ru') ||
  String(a.first_name || '').localeCompare(String(b.first_name || ''), 'ru');

const byIdDesc = (a, b) => b.id - a.id;

function pick(row, fields) {
  if (!row) return null;
  const out = {};
  for (const key of fields) out[key] = row[key];
  return out;
}

const contains = (haystack, needle) =>
  String(haystack || '').toLowerCase().includes(needle);

/* ------------------------------------------------------------------ люди */

const getUser = (id) => db.users.get(id);

const brief = (id) => pick(db.users.get(id), BRIEF_FIELDS);

function userByLogin(login) {
  const needle = String(login || '').toLowerCase();
  return db.users.find((u) => String(u.login).toLowerCase() === needle);
}

function searchUsers(query, limit) {
  const needle = String(query || '').trim().toLowerCase();
  const found = db.users.filter((u) =>
    contains(u.first_name, needle) || contains(u.last_name, needle) ||
    contains(u.first_name + ' ' + u.last_name, needle) || contains(u.login, needle));
  return found.sort(byName).slice(0, limit || 50);
}

/* ---------------------------------------------------------------- друзья */

const friendPair = (fromId, toId) => db.friendships.find({ from_id: fromId, to_id: toId });

function friendStatus(meId, otherId) {
  if (meId === otherId) return 'self';
  const out = friendPair(meId, otherId);
  if (out) return out.status === 'accepted' ? 'friends' : 'out';
  const incoming = friendPair(otherId, meId);
  if (incoming) return incoming.status === 'accepted' ? 'friends' : 'in';
  return 'none';
}

function friendIds(id) {
  return db.friendships
    .filter((f) => f.status === 'accepted' && (f.from_id === id || f.to_id === id))
    .map((f) => (f.from_id === id ? f.to_id : f.from_id));
}

const friendList = (id) => friendIds(id).map(getUser).filter(Boolean).sort(byName);

const areFriends = (a, b) => friendStatus(a, b) === 'friends';

function mutualFriends(aId, bId) {
  const mine = new Set(friendIds(aId));
  return friendIds(bId).filter((id) => mine.has(id)).map(getUser).filter(Boolean);
}

/** Заявки ко мне и от меня — свежие сверху. */
function incomingRequests(meId) {
  return db.friendships
    .filter({ to_id: meId, status: 'pending' })
    .sort((a, b) => b.created_at - a.created_at)
    .map((f) => getUser(f.from_id))
    .filter(Boolean);
}

function outgoingRequests(meId) {
  return db.friendships
    .filter({ from_id: meId, status: 'pending' })
    .sort((a, b) => b.created_at - a.created_at)
    .map((f) => getUser(f.to_id))
    .filter(Boolean);
}

/** Заявка в ответ на заявку сразу делает друзьями. */
function addFriend(meId, otherId) {
  if (friendPair(otherId, meId)) {
    db.friendships.update({ from_id: otherId, to_id: meId }, { status: 'accepted' });
    return 'friends';
  }
  if (!friendPair(meId, otherId)) {
    db.friendships.insert({ from_id: meId, to_id: otherId, status: 'pending', created_at: now() });
  }
  return 'out';
}

function removeFriend(meId, otherId) {
  db.friendships.remove((f) =>
    (f.from_id === meId && f.to_id === otherId) || (f.from_id === otherId && f.to_id === meId));
}

/* -------------------------------------------------- блокировки и приватность */

const hasBlocked = (meId, otherId) => db.blocks.has({ user_id: meId, blocked_id: otherId });

/** Блокировка в любую сторону — общение невозможно. */
const blockedEither = (a, b) => a !== b && (hasBlocked(a, b) || hasBlocked(b, a));

function blockUser(meId, otherId) {
  if (meId === otherId) return;
  if (!hasBlocked(meId, otherId)) {
    db.blocks.insert({ user_id: meId, blocked_id: otherId, created_at: now() });
  }
  removeFriend(meId, otherId);
}

const unblockUser = (meId, otherId) => db.blocks.remove({ user_id: meId, blocked_id: otherId });

function blockList(meId) {
  return db.blocks
    .filter({ user_id: meId })
    .sort((a, b) => b.created_at - a.created_at)
    .map((b) => {
      const user = getUser(b.blocked_id);
      return user ? Object.assign(user, { blocked_at: b.created_at }) : null;
    })
    .filter(Boolean);
}

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

/* ----------------------------------------------------------------- группы */

const groupMembersCount = (groupId) => db.group_members.count({ group_id: groupId });

const isGroupMember = (groupId, userId) => db.group_members.has({ group_id: groupId, user_id: userId });

function groupMembers(groupId) {
  return db.group_members
    .filter({ group_id: groupId })
    .map((m) => {
      const user = getUser(m.user_id);
      return user ? Object.assign(user, { role: m.role }) : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.role === 'admin') - (a.role === 'admin') || byName(a, b));
}

const groupMemberIds = (groupId) =>
  db.group_members.filter({ group_id: groupId }).map((m) => m.user_id);

function groupsOfUser(userId) {
  return db.group_members
    .filter({ user_id: userId })
    .map((m) => db.groups.get(m.group_id))
    .filter(Boolean)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
}

const groupIdsOfUser = (userId) => db.group_members.filter({ user_id: userId }).map((m) => m.group_id);

/* -------------------------------------------------------------- вложения */

/** items: [{ kind, ref_id?, file?, meta? }] */
function saveAttachments(parentType, parentId, items) {
  let position = 0;
  for (const item of items || []) {
    db.attachments.insert({
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

const dropAttachments = (parentType, parentId) =>
  db.attachments.remove({ parent_type: parentType, parent_id: parentId });

/** Разворачивает вложения в объекты с данными фото/видео/аудио/документа. */
function loadAttachments(parentType, parentId) {
  return db.attachments
    .filter({ parent_type: parentType, parent_id: parentId })
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((row) => {
      const item = { id: row.id, kind: row.kind, file: row.file, meta: safeMeta(row.meta) };
      if (row.kind === 'photo') item.photo = db.photos.get(row.ref_id);
      if (row.kind === 'audio' || row.kind === 'voice') item.audio = db.audios.get(row.ref_id);
      if (row.kind === 'video') item.video = db.videos.get(row.ref_id);
      if (row.kind === 'doc') item.doc = db.docs.get(row.ref_id);
      return item;
    })
    .filter((item) => {
      if (item.kind === 'photo') return !!item.photo;
      if (item.kind === 'audio') return !!item.audio;
      if (item.kind === 'video') return !!item.video;
      if (item.kind === 'doc') return !!item.doc;
      return !!item.file || !!item.audio;
    });
}

function safeMeta(value) {
  try {
    return JSON.parse(value || '{}');
  } catch (e) {
    return {};
  }
}

/* --------------------------------------------------------- лайки и комменты */

const likeCount = (targetType, targetId) =>
  db.likes.count({ target_type: targetType, target_id: targetId });

const likedBy = (targetType, targetId, userId) =>
  !!userId && db.likes.has({ target_type: targetType, target_id: targetId, user_id: userId });

function likeUsers(targetType, targetId, limit) {
  return db.likes
    .filter({ target_type: targetType, target_id: targetId })
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit || 100)
    .map((l) => getUser(l.user_id))
    .filter(Boolean);
}

function toggleLike(targetType, targetId, userId) {
  const where = { target_type: targetType, target_id: targetId, user_id: userId };
  const had = db.likes.has(where);
  if (had) db.likes.remove(where);
  else db.likes.insert(Object.assign({ created_at: now() }, where));
  return { count: likeCount(targetType, targetId), liked: !had, added: !had };
}

/** Комментарии с автором внутри — шаблону больше ничего не нужно. */
function listComments(targetType, targetId) {
  return db.comments
    .filter({ target_type: targetType, target_id: targetId })
    .sort((a, b) => a.id - b.id)
    .map((c) => {
      const author = brief(c.author_id) || {};
      return Object.assign({}, c, {
        first_name: author.first_name, last_name: author.last_name,
        avatar: author.avatar, sex: author.sex, login: author.login,
        rc_avatar: author.rc_avatar,
      });
    });
}

const countComments = (targetType, targetId) =>
  db.comments.count({ target_type: targetType, target_id: targetId });

function addComment(targetType, targetId, authorId, text, replyTo) {
  return db.comments.insert({
    target_type: targetType, target_id: targetId, author_id: authorId,
    text: text, reply_to: replyTo || null, created_at: now(),
  });
}

const editComment = (id, text) => db.comments.update(id, { text: text, edited_at: now() });
const deleteComment = (id) => db.comments.remove(id);

/* ------------------------------------------------------------------ записи */

const repostCount = (postId) => db.posts.count({ repost_of: postId });

function ownerOf(post) {
  return post.owner_type === 'group' ? db.groups.get(post.owner_id) : brief(post.owner_id);
}

/** Одна запись со всем обвесом: автор, владелец, вложения, лайки, комментарии, репост. */
function decoratePost(row, meId, depth) {
  const post = Object.assign({}, row);
  post.author = brief(row.author_id);
  post.owner = ownerOf(row);
  post.attachments = loadAttachments('post', row.id);
  post.likes = likeCount('post', row.id);
  post.liked = likedBy('post', row.id, meId);
  post.reposts = repostCount(row.id);
  post.comments = listComments('post', row.id);
  post.source = null;
  if (row.repost_of && (depth || 0) < 1) {
    const source = db.posts.get(row.repost_of);
    if (source) post.source = decoratePost(source, meId, (depth || 0) + 1);
  }
  return post;
}

const decoratePosts = (rows, meId) => rows.map((row) => decoratePost(row, meId));

function wallPosts(ownerType, ownerId, meId, limit, offset) {
  const rows = db.posts
    .filter({ owner_type: ownerType, owner_id: ownerId })
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.id - a.id)
    .slice(offset || 0, (offset || 0) + limit);
  return decoratePosts(rows, meId);
}

const wallCount = (ownerType, ownerId) => db.posts.count({ owner_type: ownerType, owner_id: ownerId });

/** Лента: стены друзей, свои записи и группы, где я состою. Блокировки убираем. */
function feedPosts(meId, limit, offset) {
  const userIds = new Set(friendIds(meId).concat([meId]));
  const groupIds = new Set(groupIdsOfUser(meId));

  const rows = db.posts
    .filter((p) =>
      (p.owner_type === 'user' && userIds.has(p.owner_id)) ||
      (p.owner_type === 'group' && groupIds.has(p.owner_id)))
    .sort(byIdDesc)
    .filter((p) => !blockedEither(meId, p.author_id))
    .slice(offset || 0, (offset || 0) + limit);
  return decoratePosts(rows, meId);
}

function searchPosts(meId, query, limit) {
  const needle = String(query || '').trim().toLowerCase();
  const rows = db.posts
    .filter((p) => contains(p.text, needle))
    .sort(byIdDesc)
    .filter((p) => {
      if (blockedEither(meId, p.author_id)) return false;
      if (p.owner_type === 'user') return canSee(meId, getUser(p.owner_id), 'profile');
      return true;
    })
    .slice(0, limit || 50);
  return decoratePosts(rows, meId);
}

function pinPost(post) {
  db.posts.update((p) => p.owner_type === post.owner_type && p.owner_id === post.owner_id, { pinned: 0 });
  db.posts.update(post.id, { pinned: 1 });
}

/* ------------------------------------------------------------- уведомления */

const unreadNotifications = (userId) => db.notifications.count({ user_id: userId, is_read: 0 });

function listNotifications(userId, limit, offset) {
  return db.notifications
    .filter({ user_id: userId })
    .sort(byIdDesc)
    .slice(offset || 0, (offset || 0) + limit)
    .map((n) => {
      const actor = n.actor_id ? brief(n.actor_id) : null;
      return Object.assign({}, n, {
        first_name: actor && actor.first_name, last_name: actor && actor.last_name,
        avatar: actor && actor.avatar, sex: actor && actor.sex, login: actor && actor.login,
        rc_avatar: actor && actor.rc_avatar,
      });
    });
}

const markNotificationsRead = (userId) =>
  db.notifications.update((n) => n.user_id === userId && !n.is_read, { is_read: 1 });

/**
 * Кладёт уведомление и возвращает его, чтобы роут мог толкнуть событие в сокет.
 * Себе не уведомляем, заблокированным тоже.
 */
function notify(opts) {
  if (!opts.userId || opts.userId === opts.actorId) return null;
  if (blockedEither(opts.userId, opts.actorId)) return null;
  if (opts.unique) {
    dropNotification(opts.userId, opts.kind, opts.actorId, opts.targetType, opts.targetId);
  }
  const row = db.notifications.insert({
    user_id: opts.userId,
    kind: opts.kind,
    actor_id: opts.actorId || null,
    target_type: opts.targetType || '',
    target_id: opts.targetId || 0,
    url: opts.url || '',
    preview: trim(opts.preview || '', 200),
    is_read: 0,
    created_at: now(),
  });
  return { id: row.id, kind: row.kind, url: row.url };
}

/** Убирает уведомление, когда действие отменили (сняли лайк, удалили запись). */
function dropNotification(userId, kind, actorId, targetType, targetId) {
  return db.notifications.remove({
    user_id: userId, kind: kind, actor_id: actorId || null,
    target_type: targetType || '', target_id: targetId || 0,
  });
}

/* ------------------------------------------------------ беседы и сообщения */

const getConv = (id) => db.conversations.get(id);

const convMember = (convId, userId) => db.conversation_members.find({ conv_id: convId, user_id: userId });

const isConvMember = (convId, userId) => !!convMember(convId, userId);

const convMemberIds = (convId) => db.conversation_members.filter({ conv_id: convId }).map((m) => m.user_id);

function convMembers(convId) {
  return db.conversation_members
    .filter({ conv_id: convId })
    .map((m) => {
      const user = getUser(m.user_id);
      return user ? Object.assign(user, { role: m.role, last_read_id: m.last_read_id }) : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.role === 'admin') - (a.role === 'admin') ||
      String(a.first_name).localeCompare(String(b.first_name), 'ru'));
}

function addConvMember(convId, userId, role) {
  if (convMember(convId, userId)) return;
  db.conversation_members.insert({
    conv_id: convId, user_id: userId, role: role || 'member', joined_at: now(), last_read_id: 0,
  });
}

const dropConvMember = (convId, userId) =>
  db.conversation_members.remove({ conv_id: convId, user_id: userId });

/** Отметка «прочитано» только вперёд: назад её двигать незачем. */
function setRead(convId, userId, messageId) {
  const member = convMember(convId, userId);
  if (!member || member.last_read_id >= messageId) return;
  db.conversation_members.update({ conv_id: convId, user_id: userId }, { last_read_id: messageId });
}

const lastMessage = (convId) => {
  const rows = db.messages.filter((m) => m.conv_id === convId && !m.deleted_at);
  return rows.length ? rows.sort(byIdDesc)[0] : null;
};

function unreadCount(convId, meId) {
  const member = convMember(convId, meId);
  if (!member) return 0;
  return db.messages.count((m) =>
    m.conv_id === convId && !m.deleted_at && m.from_id !== meId && m.id > member.last_read_id);
}

const getMessage = (id) => db.messages.get(id);

function sendMessage(convId, fromId, text) {
  const message = db.messages.insert({
    conv_id: convId, from_id: fromId, text: text, kind: 'text', created_at: now(),
  });
  db.save(); // сообщение не должно потеряться, если сервер прибьют
  return message;
}

const editMessage = (id, text) => db.messages.update(id, { text: text, edited_at: now() });
const deleteMessage = (id) => db.messages.update(id, { deleted_at: now() });

function searchMessages(meId, query, limit) {
  const needle = String(query || '').trim().toLowerCase();
  const mine = new Set(db.conversation_members.filter({ user_id: meId }).map((m) => m.conv_id));
  return db.messages
    .filter((m) => !m.deleted_at && mine.has(m.conv_id) && contains(m.text, needle))
    .sort(byIdDesc)
    .slice(0, limit || 50);
}

/** Личный диалог двоих: находим существующий или заводим новый. */
function dmWith(aId, bId) {
  const mine = db.conversation_members.filter({ user_id: aId }).map((m) => m.conv_id);
  for (const convId of mine) {
    const conv = db.conversations.get(convId);
    if (conv && conv.kind === 'dm' && isConvMember(convId, bId)) return conv;
  }
  const conv = db.conversations.insert({ kind: 'dm', title: '', creator_id: aId, created_at: now() });
  addConvMember(conv.id, aId, 'member');
  addConvMember(conv.id, bId, 'member');
  return conv;
}

function createChat(creatorId, title, memberIds) {
  const conv = db.conversations.insert({
    kind: 'chat', title: trim(title, 80) || 'Беседа', creator_id: creatorId, created_at: now(),
  });
  addConvMember(conv.id, creatorId, 'admin');
  for (const uid of memberIds) {
    if (uid !== creatorId) addConvMember(conv.id, uid, 'member');
  }
  return conv;
}

/** Собеседник в личном диалоге — тот, кто не я. */
function dmPeer(convId, meId) {
  const other = db.conversation_members.find((m) => m.conv_id === convId && m.user_id !== meId);
  return other ? brief(other.user_id) : null;
}

/** Название и картинка беседы так, как их видит конкретный человек. */
function convView(conv, meId) {
  const view = Object.assign({}, conv);
  if (conv.kind === 'dm') {
    view.peer = dmPeer(conv.id, meId);
    view.title = view.peer ? view.peer.first_name + ' ' + view.peer.last_name : 'Удалённая страница';
  } else {
    view.peer = null;
    view.membersCount = convMemberIds(conv.id).length;
  }
  view.last = lastMessage(conv.id);
  view.unread = unreadCount(conv.id, meId);
  return view;
}

function conversationsOf(meId) {
  return db.conversation_members
    .filter({ user_id: meId })
    .map((m) => db.conversations.get(m.conv_id))
    .filter(Boolean)
    .map((c) => convView(c, meId))
    .filter((c) => c.kind !== 'dm' || c.peer)
    .sort((a, b) => ((b.last && b.last.id) || 0) - ((a.last && a.last.id) || 0));
}

const unreadDialogs = (meId) => conversationsOf(meId).filter((c) => c.unread > 0).length;

/** Сообщение с автором и вложениями. */
function decorateMessage(row) {
  return Object.assign({}, row, {
    author: brief(row.from_id),
    attachments: loadAttachments('message', row.id),
  });
}

function history(convId, limit, offset) {
  return db.messages
    .filter((m) => m.conv_id === convId && !m.deleted_at)
    .sort(byIdDesc)
    .slice(offset || 0, (offset || 0) + limit)
    .reverse()
    .map(decorateMessage);
}

module.exports = {
  db, byName,
  getUser, brief, userByLogin, searchUsers,
  friendStatus, friendIds, friendList, areFriends, mutualFriends,
  addFriend, removeFriend, incomingRequests, outgoingRequests,
  hasBlocked, blockedEither, blockUser, unblockUser, blockList,
  canSee, canPostOnWall, canMessage,
  groupMembers, groupMemberIds, groupMembersCount, isGroupMember, groupsOfUser, groupIdsOfUser,
  saveAttachments, loadAttachments, dropAttachments,
  toggleLike, likeCount, likedBy, likeUsers,
  listComments, countComments, addComment, editComment, deleteComment,
  decoratePost, decoratePosts, wallPosts, wallCount, feedPosts, searchPosts, ownerOf,
  repostCount, pinPost,
  notify, dropNotification, unreadNotifications, listNotifications, markNotificationsRead,
  getConv, convMember, convMembers, convMemberIds, isConvMember, addConvMember, dropConvMember,
  setRead, lastMessage, unreadCount, getMessage, sendMessage, editMessage, deleteMessage,
  searchMessages, dmWith, createChat, dmPeer, convView, conversationsOf, unreadDialogs,
  decorateMessage, history,
};
