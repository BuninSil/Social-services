'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');

const UPLOAD_DIR = process.env.VO_UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
for (const sub of ['photos', 'avatars', 'audio']) {
  fs.mkdirSync(path.join(UPLOAD_DIR, sub), { recursive: true });
}

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter(req, file, cb) {
    cb(null, /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype));
  },
});

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES },
  fileFilter(req, file, cb) {
    cb(null, /^audio\//.test(file.mimetype) || /\.mp3$/i.test(file.originalname));
  },
});

function randomName(ext) {
  return crypto.randomBytes(12).toString('hex') + ext;
}

/**
 * Кладёт картинку в uploads/<sub> в двух размерах.
 * Возвращает { file, thumb } — пути относительно /uploads.
 */
async function saveImage(buffer, sub, opts) {
  const options = Object.assign({ width: 1280, thumb: 130, square: false }, opts);
  const name = randomName('.jpg');
  const dir = path.join(UPLOAD_DIR, sub);
  const thumbName = 'thumb_' + name;

  await sharp(buffer)
    .rotate()
    .resize({ width: options.width, height: options.width, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toFile(path.join(dir, name));

  await sharp(buffer)
    .rotate()
    .resize({
      width: options.thumb,
      height: options.thumb,
      fit: options.square ? 'cover' : 'inside',
      withoutEnlargement: !options.square,
    })
    .jpeg({ quality: 85 })
    .toFile(path.join(dir, thumbName));

  return { file: sub + '/' + name, thumb: sub + '/' + thumbName };
}

function saveAudio(buffer, originalName) {
  const ext = path.extname(originalName).toLowerCase() || '.mp3';
  const name = randomName(ext.replace(/[^.a-z0-9]/g, ''));
  fs.writeFileSync(path.join(UPLOAD_DIR, 'audio', name), buffer);
  return 'audio/' + name;
}

function removeFile(relPath) {
  if (!relPath) return;
  const full = path.join(UPLOAD_DIR, relPath);
  if (full.startsWith(UPLOAD_DIR)) fs.rm(full, { force: true }, () => {});
}

module.exports = { UPLOAD_DIR, imageUpload, audioUpload, saveImage, saveAudio, removeFile };
