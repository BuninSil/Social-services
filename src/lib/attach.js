'use strict';

const db = require('../db');
const media = require('./media');
const { now, trim } = require('./util');

/** Альбом с заданным названием: для вложений со стены и из сообщений. */
function albumFor(userId, title) {
  const found = db.albums.find({ owner_type: 'user', owner_id: userId, title: title });
  if (found) return found;
  return db.albums.insert({ owner_type: 'user', owner_id: userId, title: title, created_at: now() });
}

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
        const photo = db.photos.insert({
          album_id: albumFor(userId, albumTitle).id, owner_id: userId,
          file: saved.file, thumb: saved.thumb, description: '',
          width: saved.width, height: saved.height, size: saved.size, created_at: now(),
        });
        items.push({ kind: 'photo', ref_id: photo.id });
      } else if (type.kind === 'video') {
        const saved = await media.saveVideo(file.buffer, type);
        const video = db.videos.insert({
          owner_id: userId, title: trim(name.replace(/\.[^.]+$/, ''), 80) || 'Видеозапись',
          file: saved.file, poster: saved.poster, duration: saved.duration,
          size: saved.size, created_at: now(),
        });
        items.push({ kind: 'video', ref_id: video.id });
      } else if (type.kind === 'audio') {
        const saved = media.saveAudio(file.buffer, type);
        const track = splitTrackName(name);
        const audio = db.audios.insert({
          owner_id: userId, artist: trim(track.artist, 80), title: trim(track.title, 80) || name,
          file: saved.file, duration: saved.duration, size: saved.size, created_at: now(),
        });
        items.push({ kind: 'audio', ref_id: audio.id });
      } else {
        const saved = media.saveDoc(file.buffer, type);
        const doc = db.docs.insert({
          owner_id: userId, name: name, file: saved.file,
          ext: type.ext.replace('.', ''), size: saved.size, created_at: now(),
        });
        items.push({ kind: 'doc', ref_id: doc.id });
      }
    } catch (err) {
      errors.push('Файл «' + name + '» не удалось обработать.');
    }
  }

  return { items, errors };
}

module.exports = { fromFiles, albumFor, cleanName, splitTrackName };
