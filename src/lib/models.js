'use strict';

const db = require('../db');
const { now } = require('./util');

/* ------------------------------------------------------------------ users */

const users = {
  byId: db.prepare('SELECT * FROM users WHERE id = ?'),
  byLogin: db.prepare('SELECT * FROM users WHERE login = ? COLLATE NOCASE'),
  brief: db.prepare('SELECT id, first_name, last_name, sex, avatar, city, status, last_seen FROM users WHERE id = ?'),
  all: db.prepare('SELECT * FROM users ORDER BY id'),
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
  insert: db.prepare("INSERT OR IGNORE INTO friendships (from_id, to_id, status, created_at) VALUES (?, ?, 'pending', ?)"),
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

/** 'none' | 'friends' | 'out' (я отправил) | 'in' (мне отправили) | 'self' */
function friendStatus(meId, otherId) {
  if (meId === otherId) return 'self';
  const a = friendsQ.pair.get(meId, otherId);
  if (a) return a.status === 'accepted' ? 'friends' : 'out';
  const b = friendsQ.pair.get(otherId, meId);
  if (b) return b.status === 'accepted' ? 'friends' : 'in';
  return 'none';
}

function friendIds(id) {
  return friendsQ.ids.all({ id }).map((r) => r.uid);
}

function friendList(id) {
  return friendsQ.list.all({ id });
}

function mutualFriends(aId, bId) {
  const a = new Set(friendIds(aId));
  return friendIds(bId).filter((id) => a.has(id)).map(getUser);
}

function addFriend(meId, otherId) {
  const incoming = friendsQ.pair.get(otherId, meId);
  if (incoming) {
    friendsQ.accept.run(otherId, meId);
    return 'friends';
  }
  friendsQ.insert.run(meId, otherId, now());
  return 'out';
}

function removeFriend(meId, otherId) {
  friendsQ.remove.run(meId, otherId, otherId, meId);
}

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

/* ------------------------------------------------------- posts / comments */

const likesQ = {
  count: db.prepare('SELECT COUNT(*) n FROM likes WHERE target_type = ? AND target_id = ?'),
  mine: db.prepare('SELECT 1 x FROM likes WHERE target_type = ? AND target_id = ? AND user_id = ?'),
  add: db.prepare('INSERT OR IGNORE INTO likes (target_type, target_id, user_id, created_at) VALUES (?, ?, ?, ?)'),
  del: db.prepare('DELETE FROM likes WHERE target_type = ? AND target_id = ? AND user_id = ?'),
  users: db.prepare(`
    SELECT u.* FROM users u JOIN likes l ON l.user_id = u.id
    WHERE l.target_type = ? AND l.target_id = ? ORDER BY l.created_at DESC
  `),
};

function toggleLike(targetType, targetId, userId) {
  if (likesQ.mine.get(targetType, targetId, userId)) {
    likesQ.del.run(targetType, targetId, userId);
  } else {
    likesQ.add.run(targetType, targetId, userId, now());
  }
  return {
    count: likesQ.count.get(targetType, targetId).n,
    liked: !!likesQ.mine.get(targetType, targetId, userId),
  };
}

const commentsQ = {
  list: db.prepare(`
    SELECT c.*, u.first_name, u.last_name, u.avatar, u.sex FROM comments c
    JOIN users u ON u.id = c.author_id
    WHERE c.target_type = ? AND c.target_id = ? ORDER BY c.id
  `),
  count: db.prepare('SELECT COUNT(*) n FROM comments WHERE target_type = ? AND target_id = ?'),
  insert: db.prepare('INSERT INTO comments (target_type, target_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)'),
  byId: db.prepare('SELECT * FROM comments WHERE id = ?'),
  del: db.prepare('DELETE FROM comments WHERE id = ?'),
};

const photosQ = {
  byId: db.prepare('SELECT * FROM photos WHERE id = ?'),
};

const audiosQ = {
  byId: db.prepare('SELECT * FROM audios WHERE id = ?'),
};

/** Дополняет записи автором, владельцем, лайками, комментариями и вложениями. */
function decoratePosts(rows, meId) {
  return rows.map((p) => {
    const post = Object.assign({}, p);
    post.author = users.brief.get(p.author_id);
    post.owner = p.owner_type === 'group' ? groupsQ.byId.get(p.owner_id) : users.brief.get(p.owner_id);
    post.likes = likesQ.count.get('post', p.id).n;
    post.liked = meId ? !!likesQ.mine.get('post', p.id, meId) : false;
    post.comments = commentsQ.list.all('post', p.id);
    post.photo = p.photo_id ? photosQ.byId.get(p.photo_id) : null;
    post.audio = p.audio_id ? audiosQ.byId.get(p.audio_id) : null;
    return post;
  });
}

function wallPosts(ownerType, ownerId, meId, limit, offset) {
  const rows = db.prepare(`
    SELECT * FROM posts WHERE owner_type = ? AND owner_id = ? ORDER BY id DESC LIMIT ? OFFSET ?
  `).all(ownerType, ownerId, limit, offset || 0);
  return decoratePosts(rows, meId);
}

function wallCount(ownerType, ownerId) {
  return db.prepare('SELECT COUNT(*) n FROM posts WHERE owner_type = ? AND owner_id = ?')
    .get(ownerType, ownerId).n;
}

/** Лента: записи со стен друзей и групп, в которых я состою. */
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
  return decoratePosts(rows, meId);
}

module.exports = {
  db, users, getUser, searchUsers,
  friendsQ, friendStatus, friendIds, friendList, mutualFriends, addFriend, removeFriend,
  groupsQ, likesQ, toggleLike, commentsQ, photosQ, audiosQ,
  decoratePosts, wallPosts, wallCount, feedPosts,
};
