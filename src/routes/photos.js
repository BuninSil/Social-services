'use strict';

const express = require('express');
const db = require('../db');
const M = require('../lib/models');
const { requireAuth } = require('../lib/auth');
const { now, trim } = require('../lib/util');
const { imageUpload, saveImage, removeFile } = require('../lib/upload');

const router = express.Router();

const q = {
  albums: db.prepare("SELECT * FROM albums WHERE owner_type = 'user' AND owner_id = ? ORDER BY id"),
  album: db.prepare('SELECT * FROM albums WHERE id = ?'),
  photosOf: db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY id DESC'),
  countOf: db.prepare('SELECT COUNT(*) n FROM photos WHERE album_id = ?'),
  coverOf: db.prepare('SELECT thumb FROM photos WHERE album_id = ? ORDER BY id DESC LIMIT 1'),
  photo: db.prepare('SELECT * FROM photos WHERE id = ?'),
};

/** У каждого пользователя всегда есть альбом по умолчанию. */
function defaultAlbum(userId) {
  let album = db.prepare("SELECT * FROM albums WHERE owner_type = 'user' AND owner_id = ? ORDER BY id LIMIT 1")
    .get(userId);
  if (!album) {
    const info = db.prepare('INSERT INTO albums (owner_type, owner_id, title, created_at) VALUES (?, ?, ?, ?)')
      .run('user', userId, 'Фотографии со страницы', now());
    album = q.album.get(info.lastInsertRowid);
  }
  return album;
}

function albumList(userId) {
  defaultAlbum(userId);
  return q.albums.all(userId).map((a) => Object.assign({}, a, {
    count: q.countOf.get(a.id).n,
    cover: (q.coverOf.get(a.id) || {}).thumb || null,
  }));
}

router.get('/photos', requireAuth, (req, res) => {
  res.render('albums', { owner: req.user, albums: albumList(req.user.id) });
});

router.get(/^\/photos\/(\d+)$/, requireAuth, (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  if (!owner) return next();
  res.render('albums', { owner, albums: albumList(owner.id) });
});

router.get('/albums/new', requireAuth, (req, res) => res.render('album_new', { error: null }));

router.post('/albums/new', requireAuth, (req, res) => {
  const title = trim(req.body.title, 80);
  if (!title) return res.render('album_new', { error: 'Укажите название альбома.' });
  const info = db.prepare(`
    INSERT INTO albums (owner_type, owner_id, title, description, created_at) VALUES ('user', ?, ?, ?, ?)
  `).run(req.user.id, title, trim(req.body.description, 500), now());
  res.redirect('/album' + req.user.id + '_' + info.lastInsertRowid);
});

router.get(/^\/album(\d+)_(\d+)$/, requireAuth, (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  const album = q.album.get(Number(req.params[1]));
  if (!owner || !album || album.owner_id !== owner.id) return next();
  res.render('album', { owner, album, photos: q.photosOf.all(album.id) });
});

router.get(/^\/album(\d+)_(\d+)\/delete$/, requireAuth, (req, res, next) => {
  const album = q.album.get(Number(req.params[1]));
  if (!album) return next();
  if (album.owner_id !== req.user.id) {
    return res.status(403).render('error', { code: 403, message: 'Это не Ваш альбом.' });
  }
  for (const photo of q.photosOf.all(album.id)) {
    removeFile(photo.file);
    removeFile(photo.thumb);
    db.prepare("DELETE FROM comments WHERE target_type = 'photo' AND target_id = ?").run(photo.id);
    db.prepare("DELETE FROM likes WHERE target_type = 'photo' AND target_id = ?").run(photo.id);
  }
  db.prepare('DELETE FROM albums WHERE id = ?').run(album.id);
  res.redirect('/photos');
});

router.get('/photos/upload', requireAuth, (req, res) => {
  res.render('photo_upload', {
    error: null,
    albums: albumList(req.user.id),
    selected: parseInt(req.query.album, 10) || defaultAlbum(req.user.id).id,
  });
});

router.post('/photos/upload', requireAuth, imageUpload.array('photos', 20), async (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    return res.render('photo_upload', {
      error: 'Выберите хотя бы один файл с картинкой.',
      albums: albumList(req.user.id),
      selected: parseInt(req.body.album_id, 10) || defaultAlbum(req.user.id).id,
    });
  }
  let album = q.album.get(parseInt(req.body.album_id, 10));
  if (!album || album.owner_id !== req.user.id) album = defaultAlbum(req.user.id);

  const description = trim(req.body.description, 300);
  for (const file of files) {
    const saved = await saveImage(file.buffer, 'photos', { width: 1280, thumb: 130 });
    db.prepare(`
      INSERT INTO photos (album_id, owner_id, file, thumb, description, created_at) VALUES (?, ?, ?, ?, ?, ?)
    `).run(album.id, req.user.id, saved.file, saved.thumb, description, now());
  }
  res.redirect('/album' + req.user.id + '_' + album.id);
});

router.get(/^\/photo(\d+)_(\d+)$/, requireAuth, (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  const photo = q.photo.get(Number(req.params[1]));
  if (!owner || !photo || photo.owner_id !== owner.id) return next();

  const siblings = photo.album_id ? q.photosOf.all(photo.album_id) : [photo];
  const idx = siblings.findIndex((p) => p.id === photo.id);

  res.render('photo', {
    owner,
    photo,
    album: photo.album_id ? q.album.get(photo.album_id) : null,
    prev: idx > 0 ? siblings[idx - 1].id : null,
    next: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null,
    likes: M.likesQ.count.get('photo', photo.id).n,
    liked: !!M.likesQ.mine.get('photo', photo.id, req.user.id),
    comments: M.commentsQ.list.all('photo', photo.id),
  });
});

router.get(/^\/photo(\d+)_(\d+)\/delete$/, requireAuth, (req, res, next) => {
  const photo = q.photo.get(Number(req.params[1]));
  if (!photo) return next();
  if (photo.owner_id !== req.user.id) {
    return res.status(403).render('error', { code: 403, message: 'Это не Ваша фотография.' });
  }
  removeFile(photo.file);
  removeFile(photo.thumb);
  db.prepare("DELETE FROM comments WHERE target_type = 'photo' AND target_id = ?").run(photo.id);
  db.prepare("DELETE FROM likes WHERE target_type = 'photo' AND target_id = ?").run(photo.id);
  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  res.redirect(photo.album_id ? '/album' + req.user.id + '_' + photo.album_id : '/photos');
});

module.exports = router;
