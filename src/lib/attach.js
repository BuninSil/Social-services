'use strict';

const db = require('../db');
const media = require('./media');
const { now, trim } = require('./util');

/** Альбом с заданным названием: для вложений со стены и из сообщений. */
function albumFor(userId, title) {
  let album = db.prepare("SELECT * FROM albums WHERE owner_type = 'user' AND owner_id = ? AND title = ?")
    .get(userId, title);
  if (!album) {
    const id = db.prepare(
      "INSERT INTO albums (owner_type, owner_id, title, created_at) VALUES ('user', ?, ?, ?)")
      .run(userId, title, now()).lastInsertRowid;
    album = db.prepare('SELECT * FROM albums WHERE id = ?').get(id);
  }
  return album;
}

const insertPhoto = db.prepare(`
  INSERT INTO photos (album_id, owner_id, file, thumb, description, width, height, size, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertVideo = db.prepare(`
  INSERT INTO videos (owner_id, title, file, poster, duration, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertAudio = db.prepare(`
  INSERT INTO audios (owner_id, artist, title, file, duration, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertDoc = db.prepare(`
  INSERT INTO docs (owner_id, name, file, ext, size, created_at) VALUES (?, ?, ?, ?, ?, ?)
`);

const LIMIT_BY_KIND = {
  image: media.LIMITS.image,
  audio: media.LIMITS.audio,
  video: media.LIMITS.video,
  doc: media.LIMITS.doc,
};

/** Имя файла приходит от пользователя, поэтому чистим его перед показом и хранением. */
function cleanName(name) {
  const stripped = String(name || 'файл')
    .split(/[\\/]/).pop()
    .replace(/[^\p{L}\p{N} ._()\[\]#+-]/gu, '')
    .trim()
    .slice(0, 120);
  return stripped || 'файл';
}

/** «Артист - Название» из имени файла, если оно так оформлено. */
function splitTrackName(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length > 1) return { artist: parts[0], title: parts.slice(1).join(' - ') };
  return { artist: 'Неизвестен', title: base };
}

/**
 * Превращает загруженные файлы во вложения: тип определяем по содержимому,
 * кладём в нужное хранилище и заводим записи в photos/videos/audios/docs.
 * Возвращает { items, errors } — что не приняли, честно перечисляем.
 */
async function fromFiles(userId, files, albumTitle) {
  const items = [];
  const errors = [];

  for (const file of files || []) {
    const type = media.detectDoc(file.buffer, file.originalname, file.mimetype);
    const name = cleanName(file.originalname);

    if (!type) {
      errors.push('Файл «' + name + '» неподдерживаемого типа.');
      continue;
    }
    const limit = LIMIT_BY_KIND[type.kind] || media.LIMITS.doc;
    if (file.buffer.length > limit) {
      errors.push('Файл «' + name + '» больше ' + media.humanSize(limit) + '.');
      continue;
    }

    try {
      if (type.kind === 'image') {
        const saved = await media.saveImage(file.buffer, 'photos', { width: 1600, thumb: 180 });
        const photoId = insertPhoto.run(albumFor(userId, albumTitle).id, userId, saved.file, saved.thumb,
          '', saved.width, saved.height, saved.size, now()).lastInsertRowid;
        items.push({ kind: 'photo', ref_id: photoId });
      } else if (type.kind === 'video') {
        const saved = await media.saveVideo(file.buffer, type);
        const videoId = insertVideo.run(userId, trim(name.replace(/\.[^.]+$/, ''), 80) || 'Видеозапись',
          saved.file, saved.poster, saved.duration, saved.size, now()).lastInsertRowid;
        items.push({ kind: 'video', ref_id: videoId });
      } else if (type.kind === 'audio') {
        const saved = media.saveAudio(file.buffer, type);
        const track = splitTrackName(name);
        const audioId = insertAudio.run(userId, trim(track.artist, 80), trim(track.title, 80) || name,
          saved.file, saved.duration, saved.size, now()).lastInsertRowid;
        items.push({ kind: 'audio', ref_id: audioId });
      } else {
        const saved = media.saveDoc(file.buffer, type);
        const docId = insertDoc.run(userId, name, saved.file, type.ext.replace('.', ''),
          saved.size, now()).lastInsertRowid;
        items.push({ kind: 'doc', ref_id: docId });
      }
    } catch (err) {
      errors.push('Файл «' + name + '» не удалось обработать.');
    }
  }

  return { items, errors };
}

module.exports = { fromFiles, albumFor, cleanName, splitTrackName };
