'use strict';

const express = require('express');
const db = require('../db');
const M = require('../lib/models');
const media = require('../lib/media');
const { requireAuth } = require('../lib/auth');
const { now, trim } = require('../lib/util');
const { uploadThen, rateLimit, backTo } = require('../lib/security');

const router = express.Router();
const uploadLimit = rateLimit('upload', 3600000, 300, 'Слишком много загрузок за час. Подождите.');

/** Фотографии альбома, свежие сверху. */
const photosOf = (albumId) =>
  db.photos.filter({ album_id: albumId }).sort((a, b) => b.id - a.id);

function albumsOf(userId) {
  return db.albums.filter({ owner_type: 'user', owner_id: userId }).sort((a, b) => a.id - b.id);
}

function defaultAlbum(userId) {
  const albums = albumsOf(userId);
  if (albums.length) return albums[0];
  return db.albums.insert({
    owner_type: 'user', owner_id: userId, title: 'Фотографии со страницы', created_at: now(),
  });
}

function albumList(userId) {
  defaultAlbum(userId);
  return albumsOf(userId).map((a) => {
    const inside = photosOf(a.id);
    return Object.assign({}, a, {
      count: inside.length,
      cover: inside.length ? inside[0].thumb : null,
    });
  });
}

/** Полное удаление фотографии: файлы, комментарии, лайки и вложения. */
function dropPhoto(photo) {
  media.removeFile(photo.file);
  media.removeFile(photo.thumb);
  db.comments.remove({ target_type: 'photo', target_id: photo.id });
  db.likes.remove({ target_type: 'photo', target_id: photo.id });
  db.attachments.remove({ kind: 'photo', ref_id: photo.id });
  db.photos.remove(photo.id);
}

/** Доступ к чужим фотографиям определяется настройками приватности владельца. */
function ensureCanSeePhotos(req, res, owner) {
  if (M.canSee(req.user.id, owner, 'photos')) return true;
  res.status(403).render('error', { code: 403, message: 'Фотографии этого пользователя скрыты.' });
  return false;
}

router.get('/photos', requireAuth, (req, res) => {
  res.render('albums', { owner: req.user, albums: albumList(req.user.id) });
});

router.get(/^\/photos\/(\d+)$/, requireAuth, (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  if (!owner) return next();
  if (!ensureCanSeePhotos(req, res, owner)) return;
  res.render('albums', { owner, albums: albumList(owner.id) });
});

router.get('/albums/new', requireAuth, (req, res) => res.render('album_new', { error: null }));

router.post('/albums/new', requireAuth, (req, res) => {
  const title = trim(req.body.title, 80);
  if (!title) return res.render('album_new', { error: 'Укажите название альбома.' });
  const album = db.albums.insert({
    owner_type: 'user', owner_id: req.user.id, title: title,
    description: trim(req.body.description, 500), created_at: now(),
  });
  res.redirect('/album' + req.user.id + '_' + album.id);
});

router.get(/^\/album(\d+)_(\d+)$/, requireAuth, (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  const album = db.albums.get(Number(req.params[1]));
  if (!owner || !album || album.owner_id !== owner.id) return next();
  if (!ensureCanSeePhotos(req, res, owner)) return;
  res.render('album', { owner, album, photos: photosOf(album.id) });
});

router.post(/^\/album\/(\d+)\/delete$/, requireAuth, (req, res, next) => {
  const album = db.albums.get(Number(req.params[0]));
  if (!album) return next();
  if (album.owner_id !== req.user.id) {
    return res.status(403).render('error', { code: 403, message: 'Это не Ваш альбом.' });
  }
  for (const photo of photosOf(album.id)) dropPhoto(photo);
  db.albums.remove(album.id);
  res.redirect('/photos');
});

router.get('/photos/upload', requireAuth, (req, res) => {
  res.render('photo_upload', {
    error: null,
    albums: albumList(req.user.id),
    selected: parseInt(req.query.album, 10) || defaultAlbum(req.user.id).id,
  });
});

router.post('/photos/upload', requireAuth, uploadLimit,
  uploadThen(media.uploadImage.array('photos', 20)), async (req, res) => {
    const files = req.files || [];
    const fail = (error) => res.render('photo_upload', {
      error,
      albums: albumList(req.user.id),
      selected: parseInt(req.body.album_id, 10) || defaultAlbum(req.user.id).id,
    });
    if (!files.length) return fail('Выберите хотя бы один файл с картинкой.');

    let album = db.albums.get(parseInt(req.body.album_id, 10));
    if (!album || album.owner_id !== req.user.id) album = defaultAlbum(req.user.id);

    const description = trim(req.body.description, 300);
    const skipped = [];

    for (const file of files) {
      const type = media.detect(file.buffer, file.mimetype);
      if (!type || type.kind !== 'image') {
        skipped.push(file.originalname);
        continue;
      }
      const saved = await media.saveImage(file.buffer, 'photos', { width: 1600, thumb: 180 });
      db.photos.insert({
        album_id: album.id, owner_id: req.user.id, file: saved.file, thumb: saved.thumb,
        description: description, width: saved.width, height: saved.height,
        size: saved.size, created_at: now(),
      });
    }

    if (skipped.length === files.length) return fail('Ни один файл не оказался изображением.');
    res.redirect('/album' + req.user.id + '_' + album.id);
  });

router.get(/^\/photo(\d+)_(\d+)$/, requireAuth, (req, res, next) => {
  const owner = M.getUser(Number(req.params[0]));
  const photo = db.photos.get(Number(req.params[1]));
  if (!owner || !photo || photo.owner_id !== owner.id) return next();
  if (!ensureCanSeePhotos(req, res, owner)) return;

  const siblings = photo.album_id ? photosOf(photo.album_id) : [photo];
  const idx = siblings.findIndex((p) => p.id === photo.id);

  res.render('photo', {
    owner,
    photo,
    album: photo.album_id ? db.albums.get(photo.album_id) : null,
    prev: idx > 0 ? siblings[idx - 1].id : null,
    next: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null,
    likes: M.likeCount('photo', photo.id),
    liked: M.likedBy('photo', photo.id, req.user.id),
    comments: M.listComments('photo', photo.id),
  });
});

router.post(/^\/photo\/(\d+)\/delete$/, requireAuth, (req, res, next) => {
  const photo = db.photos.get(Number(req.params[0]));
  if (!photo) return next();
  if (photo.owner_id !== req.user.id) {
    return res.status(403).render('error', { code: 403, message: 'Это не Ваша фотография.' });
  }
  dropPhoto(photo);

  const fallback = photo.album_id ? '/album' + req.user.id + '_' + photo.album_id : '/photos';
  res.redirect(backTo(req, fallback));
});

/** Поставить фотографию на страницу как аватар. */
router.post(/^\/photo\/(\d+)\/avatar$/, requireAuth, (req, res, next) => {
  const photo = db.photos.get(Number(req.params[0]));
  if (!photo) return next();
  if (photo.owner_id !== req.user.id) {
    return res.status(403).render('error', { code: 403, message: 'Это не Ваша фотография.' });
  }
  db.users.update(req.user.id, { avatar: photo.file });
  res.redirect(backTo(req, '/id' + req.user.id));
});

module.exports = router;
