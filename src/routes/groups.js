'use strict';

const express = require('express');
const db = require('../db');
const M = require('../lib/models');
const { requireAuth } = require('../lib/auth');
const { now, trim } = require('../lib/util');
const { imageUpload, saveImage, removeFile } = require('../lib/upload');
const { wallAlbum } = require('./profile');

const router = express.Router();
const PER_PAGE = 20;

function withMembers(groups) {
  return groups.map((g) => Object.assign({}, g, { members: M.groupsQ.membersCount.get(g.id).n }));
}

function isAdmin(groupId, userId) {
  const row = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  return !!row && row.role === 'admin';
}

router.get('/groups', requireAuth, (req, res) => {
  res.render('groups', { mode: 'my', owner: req.user, groups: withMembers(M.groupsQ.ofUser.all(req.user.id)) });
});

router.get('/groups/all', requireAuth, (req, res) => {
  res.render('groups', {
    mode: 'all', owner: req.user,
    groups: withMembers(db.prepare('SELECT * FROM groups ORDER BY name').all()),
  });
});

router.get('/groups/new', requireAuth, (req, res) => res.render('group_form', { group: null, error: null }));

router.post('/groups/new', requireAuth, imageUpload.single('avatar'), async (req, res) => {
  const name = trim(req.body.name, 80);
  if (!name) return res.render('group_form', { group: null, error: 'Укажите название группы.' });

  let avatarFile = null;
  if (req.file) {
    const saved = await saveImage(req.file.buffer, 'avatars', { width: 400, thumb: 200, square: true });
    avatarFile = saved.file;
  }
  const info = db.prepare(`
    INSERT INTO groups (name, description, kind, avatar, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, trim(req.body.description, 2000), req.body.kind === 'public' ? 'public' : 'group',
    avatarFile, req.user.id, now());

  db.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)")
    .run(info.lastInsertRowid, req.user.id, now());
  res.redirect('/club' + info.lastInsertRowid);
});

router.get(/^\/groups\/(\d+)$/, requireAuth, (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  if (!owner) return next();
  res.render('groups', { mode: 'user', owner, groups: withMembers(M.groupsQ.ofUser.all(owner.id)) });
});

router.get(/^\/club(\d+)$/, requireAuth, (req, res, next) => {
  const group = M.groupsQ.byId.get(Number(req.params[0]));
  if (!group) return next();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const total = M.wallCount('group', group.id);
  res.render('group', {
    group,
    creator: M.getUser(group.creator_id) || { id: 0, first_name: 'Удалённая', last_name: 'страница' },
    members: M.groupsQ.members.all(group.id),
    isMember: !!M.groupsQ.isMember.get(group.id, req.user.id),
    isAdmin: isAdmin(group.id, req.user.id),
    posts: M.wallPosts('group', group.id, req.user.id, PER_PAGE, (page - 1) * PER_PAGE),
    wallCount: total,
    page,
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
  });
});

router.get(/^\/club(\d+)\/join$/, requireAuth, (req, res, next) => {
  const group = M.groupsQ.byId.get(Number(req.params[0]));
  if (!group) return next();
  db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
    .run(group.id, req.user.id, now());
  res.redirect('/club' + group.id);
});

router.get(/^\/club(\d+)\/leave$/, requireAuth, (req, res, next) => {
  const group = M.groupsQ.byId.get(Number(req.params[0]));
  if (!group) return next();
  if (!isAdmin(group.id, req.user.id)) {
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(group.id, req.user.id);
  }
  res.redirect('/club' + group.id);
});

router.get(/^\/club(\d+)\/edit$/, requireAuth, (req, res, next) => {
  const group = M.groupsQ.byId.get(Number(req.params[0]));
  if (!group) return next();
  if (!isAdmin(group.id, req.user.id)) {
    return res.status(403).render('error', { code: 403, message: 'Редактировать группу может только её создатель.' });
  }
  res.render('group_form', { group, error: null });
});

router.post(/^\/club(\d+)\/edit$/, requireAuth, imageUpload.single('avatar'), async (req, res, next) => {
  const group = M.groupsQ.byId.get(Number(req.params[0]));
  if (!group) return next();
  if (!isAdmin(group.id, req.user.id)) {
    return res.status(403).render('error', { code: 403, message: 'Редактировать группу может только её создатель.' });
  }
  const name = trim(req.body.name, 80);
  if (!name) return res.render('group_form', { group, error: 'Укажите название группы.' });

  if (req.file) {
    const saved = await saveImage(req.file.buffer, 'avatars', { width: 400, thumb: 200, square: true });
    if (group.avatar) removeFile(group.avatar);
    db.prepare('UPDATE groups SET avatar = ? WHERE id = ?').run(saved.file, group.id);
  }
  db.prepare('UPDATE groups SET name = ?, description = ?, kind = ? WHERE id = ?')
    .run(name, trim(req.body.description, 2000), req.body.kind === 'public' ? 'public' : 'group', group.id);
  res.redirect('/club' + group.id);
});

router.get(/^\/club(\d+)\/delete$/, requireAuth, (req, res, next) => {
  const group = M.groupsQ.byId.get(Number(req.params[0]));
  if (!group) return next();
  if (!isAdmin(group.id, req.user.id)) {
    return res.status(403).render('error', { code: 403, message: 'Удалить группу может только её создатель.' });
  }
  const posts = db.prepare("SELECT id FROM posts WHERE owner_type = 'group' AND owner_id = ?").all(group.id);
  for (const post of posts) {
    db.prepare("DELETE FROM comments WHERE target_type = 'post' AND target_id = ?").run(post.id);
    db.prepare("DELETE FROM likes WHERE target_type = 'post' AND target_id = ?").run(post.id);
  }
  db.prepare("DELETE FROM posts WHERE owner_type = 'group' AND owner_id = ?").run(group.id);
  if (group.avatar) removeFile(group.avatar);
  db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
  res.redirect('/groups');
});

router.post(/^\/club(\d+)\/wall$/, requireAuth, imageUpload.single('photo'), async (req, res, next) => {
  const group = M.groupsQ.byId.get(Number(req.params[0]));
  if (!group) return next();
  if (!M.groupsQ.isMember.get(group.id, req.user.id)) {
    return res.status(403).render('error', { code: 403, message: 'Писать на стену могут только участники группы.' });
  }
  const text = trim(req.body.text, 4000);
  let photoId = null;

  if (req.file) {
    const saved = await saveImage(req.file.buffer, 'photos', { width: 1280, thumb: 130 });
    photoId = db.prepare(`
      INSERT INTO photos (album_id, owner_id, file, thumb, description, created_at) VALUES (?, ?, ?, ?, ?, ?)
    `).run(wallAlbum(req.user.id).id, req.user.id, saved.file, saved.thumb, '', now()).lastInsertRowid;
  }
  if (!text && !photoId) return res.redirect('/club' + group.id);

  db.prepare(`
    INSERT INTO posts (owner_type, owner_id, author_id, text, photo_id, created_at) VALUES ('group', ?, ?, ?, ?, ?)
  `).run(group.id, req.user.id, text, photoId, now());
  res.redirect('/club' + group.id);
});

module.exports = router;
