'use strict';

const express = require('express');
const db = require('../db');
const M = require('../lib/models');
const { now, trim } = require('../lib/util');
const { requireAuth } = require('../lib/auth');
const { imageUpload, saveImage } = require('../lib/upload');

const router = express.Router();
const PER_PAGE = 20;

/** Альбом, куда падают фотографии, прикреплённые к записям на стене. */
function wallAlbum(userId) {
  const title = 'Фотографии на стене';
  let album = db.prepare('SELECT * FROM albums WHERE owner_type = ? AND owner_id = ? AND title = ?')
    .get('user', userId, title);
  if (!album) {
    const info = db.prepare('INSERT INTO albums (owner_type, owner_id, title, created_at) VALUES (?, ?, ?, ?)')
      .run('user', userId, title, now());
    album = db.prepare('SELECT * FROM albums WHERE id = ?').get(info.lastInsertRowid);
  }
  return album;
}

function canPostOn(owner, me) {
  if (!me) return false;
  if (owner.id === me.id) return true;
  if (owner.wall_who === 'me') return false;
  if (owner.wall_who === 'friends') return M.friendStatus(me.id, owner.id) === 'friends';
  return true;
}

router.get(/^\/id(\d+)$/, requireAuth, (req, res, next) => {
  const user = M.getUser(Number(req.params[0]));
  if (!user) return next();

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const total = M.wallCount('user', user.id);
  const friends = M.friendList(user.id);
  const photos = db.prepare(`
    SELECT p.* FROM photos p WHERE p.owner_id = ? ORDER BY p.id DESC LIMIT 6
  `).all(user.id);

  res.render('profile', {
    user,
    status: M.friendStatus(req.user.id, user.id),
    friends,
    friendsCount: friends.length,
    mutual: user.id === req.user.id ? [] : M.mutualFriends(req.user.id, user.id),
    photos,
    photosCount: db.prepare('SELECT COUNT(*) n FROM photos WHERE owner_id = ?').get(user.id).n,
    audioCount: db.prepare('SELECT COUNT(*) n FROM audios WHERE owner_id = ?').get(user.id).n,
    groupsCount: db.prepare('SELECT COUNT(*) n FROM group_members WHERE user_id = ?').get(user.id).n,
    posts: M.wallPosts('user', user.id, req.user.id, PER_PAGE, (page - 1) * PER_PAGE),
    wallCount: total,
    canPost: canPostOn(user, req.user),
    page,
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
  });
});

router.post(/^\/id(\d+)\/wall$/, requireAuth, imageUpload.single('photo'), async (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  if (!owner) return next();
  if (!canPostOn(owner, req.user)) return res.status(403).render('error', { code: 403, message: 'Писать на эту стену нельзя.' });

  const text = trim(req.body.text, 4000);
  let photoId = null;

  if (req.file) {
    const saved = await saveImage(req.file.buffer, 'photos', { width: 1280, thumb: 130 });
    const album = wallAlbum(req.user.id);
    photoId = db.prepare(`
      INSERT INTO photos (album_id, owner_id, file, thumb, description, created_at) VALUES (?, ?, ?, ?, ?, ?)
    `).run(album.id, req.user.id, saved.file, saved.thumb, '', now()).lastInsertRowid;
  }

  if (!text && !photoId) return res.redirect('/id' + owner.id);

  db.prepare(`
    INSERT INTO posts (owner_type, owner_id, author_id, text, photo_id, created_at) VALUES ('user', ?, ?, ?, ?, ?)
  `).run(owner.id, req.user.id, text, photoId, now());

  res.redirect(req.body.back && String(req.body.back).startsWith('/') ? req.body.back : '/id' + owner.id);
});

module.exports = router;
module.exports.wallAlbum = wallAlbum;
