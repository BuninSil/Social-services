'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const multer = require('multer');
const sharp = require('sharp');

const UPLOAD_DIR = process.env.VO_UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
const SUBDIRS = ['photos', 'avatars', 'audio', 'video', 'docs', 'voice'];
for (const sub of SUBDIRS) fs.mkdirSync(path.join(UPLOAD_DIR, sub), { recursive: true });

const LIMITS = {
  image: 12 * 1024 * 1024,
  audio: 30 * 1024 * 1024,
  video: 256 * 1024 * 1024,
  voice: 10 * 1024 * 1024,
  doc: 50 * 1024 * 1024,
};

/* --------------------------------------------------- определение типа файла */

/**
 * Тип определяем по сигнатуре содержимого, а не по заголовку от браузера:
 * клиент может прислать что угодно с mime-типом image/jpeg.
 */
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  const hex = buf.subarray(0, 16).toString('hex').toLowerCase();
  const ascii = (from, len) => buf.subarray(from, from + len).toString('latin1');

  if (hex.startsWith('ffd8ff')) return { kind: 'image', ext: '.jpg', mime: 'image/jpeg' };
  if (hex.startsWith('89504e470d0a1a0a')) return { kind: 'image', ext: '.png', mime: 'image/png' };
  if (ascii(0, 3) === 'GIF') return { kind: 'image', ext: '.gif', mime: 'image/gif' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return { kind: 'image', ext: '.webp', mime: 'image/webp' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return { kind: 'audio', ext: '.wav', mime: 'audio/wav' };
  if (hex.startsWith('1a45dfa3')) return { kind: 'matroska', ext: '.webm', mime: 'video/webm' };
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (/^(M4A |M4B |mp42)$/.test(brand) && brand.startsWith('M4A')) {
      return { kind: 'audio', ext: '.m4a', mime: 'audio/mp4' };
    }
    return { kind: 'video', ext: '.mp4', mime: 'video/mp4' };
  }
  if (ascii(0, 4) === 'OggS') return { kind: 'audio', ext: '.ogg', mime: 'audio/ogg' };
  if (ascii(0, 3) === 'ID3' || hex.startsWith('fffb') || hex.startsWith('fff3') || hex.startsWith('fff2')) {
    return { kind: 'audio', ext: '.mp3', mime: 'audio/mpeg' };
  }
  if (ascii(0, 4) === 'fLaC') return { kind: 'audio', ext: '.flac', mime: 'audio/flac' };
  if (ascii(0, 4) === '%PDF') return { kind: 'doc', ext: '.pdf', mime: 'application/pdf' };
  if (hex.startsWith('504b0304')) return { kind: 'doc', ext: '.zip', mime: 'application/zip' };
  if (hex.startsWith('526172211a07')) return { kind: 'doc', ext: '.rar', mime: 'application/vnd.rar' };
  if (hex.startsWith('377abcaf271c')) return { kind: 'doc', ext: '.7z', mime: 'application/x-7z-compressed' };
  if (hex.startsWith('1f8b')) return { kind: 'doc', ext: '.gz', mime: 'application/gzip' };
  return null;
}

/** webm/mkv бывает и видео, и звуком с микрофона — различаем по дорожкам. */
function refineMatroska(buf, declaredMime) {
  const head = buf.subarray(0, Math.min(buf.length, 262144)).toString('latin1');
  const looksAudioOnly = /A_OPUS|A_VORBIS/.test(head) && !/V_VP8|V_VP9|V_AV1|V_MPEG/.test(head);
  if (looksAudioOnly || /^audio\//.test(String(declaredMime || ''))) {
    return { kind: 'audio', ext: '.webm', mime: 'audio/webm' };
  }
  return { kind: 'video', ext: '.webm', mime: 'video/webm' };
}

/** Итоговый тип файла: image | audio | video | doc, либо null, если формат не поддержан. */
function detect(buffer, declaredMime) {
  const hit = sniff(buffer);
  if (!hit) return null;
  if (hit.kind === 'matroska') return refineMatroska(buffer, declaredMime);
  return hit;
}

/** Текстовые документы сигнатуры не имеют — пускаем по расширению и содержимому. */
const PLAIN_EXT = new Set(['.txt', '.md', '.csv', '.log', '.json', '.xml', '.srt', '.ini', '.conf']);

function detectDoc(buffer, originalName, declaredMime) {
  const hit = detect(buffer, declaredMime);
  if (hit) return hit;
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (PLAIN_EXT.has(ext)) {
    const sample = buffer.subarray(0, 4096);
    if (!sample.includes(0)) return { kind: 'doc', ext, mime: 'text/plain' };
  }
  return null;
}

/* ------------------------------------------------------------ сохранение */

function randomName(ext) {
  return crypto.randomBytes(12).toString('hex') + ext;
}

function thumbOf(file) {
  return file.replace(/([^/]+)$/, 'thumb_$1');
}

/** Картинка: полноразмерная копия и превью. Метаданные пережимаются вместе с пикселями. */
async function saveImage(buffer, sub, opts) {
  const options = Object.assign({ width: 1280, thumb: 130, square: false }, opts);
  const name = randomName('.jpg');
  const dir = path.join(UPLOAD_DIR, sub);

  const info = await sharp(buffer)
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
    .toFile(path.join(dir, 'thumb_' + name));

  return {
    file: sub + '/' + name,
    thumb: sub + '/thumb_' + name,
    width: info.width,
    height: info.height,
    size: info.size,
  };
}

/* ---------------------------------------------------- необязательный ffmpeg */

let ffmpegChecked = false;
let hasFfmpeg = false;

function ffmpegAvailable() {
  if (!ffmpegChecked) {
    ffmpegChecked = true;
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 5000 });
      hasFfmpeg = true;
    } catch (err) {
      hasFfmpeg = false;
    }
  }
  return hasFfmpeg;
}

/** Длительность в секундах через ffprobe. Без ffmpeg просто вернём 0. */
function probeDuration(fullPath) {
  if (!ffmpegAvailable()) return 0;
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', fullPath,
    ], { encoding: 'utf8', timeout: 20000 });
    return Math.round(parseFloat(out.trim()) || 0);
  } catch (err) {
    return 0;
  }
}

/** Кадр из середины ролика как обложка. Без ffmpeg обложки не будет — не страшно. */
async function makePoster(fullPath, duration) {
  if (!ffmpegAvailable()) return null;
  const raw = path.join(UPLOAD_DIR, 'video', randomName('.png'));
  try {
    execFileSync('ffmpeg', [
      '-v', 'error', '-ss', String(Math.min(3, Math.max(0, Math.floor(duration / 2)))),
      '-i', fullPath, '-frames:v', '1', '-y', raw,
    ], { stdio: 'ignore', timeout: 30000 });
    const buf = fs.readFileSync(raw);
    fs.rmSync(raw, { force: true });
    const saved = await saveImage(buf, 'video', { width: 960, thumb: 320 });
    return saved;
  } catch (err) {
    fs.rmSync(raw, { force: true });
    return null;
  }
}

function writeFile(buffer, sub, ext) {
  const name = randomName(ext);
  fs.writeFileSync(path.join(UPLOAD_DIR, sub, name), buffer);
  return sub + '/' + name;
}

async function saveVideo(buffer, type) {
  const file = writeFile(buffer, 'video', type.ext);
  const full = path.join(UPLOAD_DIR, file);
  const duration = probeDuration(full);
  const poster = await makePoster(full, duration);
  return { file, poster: poster ? poster.thumb : null, duration, size: buffer.length };
}

function saveAudio(buffer, type) {
  const file = writeFile(buffer, 'audio', type.ext);
  return { file, duration: probeDuration(path.join(UPLOAD_DIR, file)), size: buffer.length };
}

function saveVoice(buffer, type) {
  const file = writeFile(buffer, 'voice', type.ext);
  return { file, duration: probeDuration(path.join(UPLOAD_DIR, file)), size: buffer.length };
}

function saveDoc(buffer, type) {
  return { file: writeFile(buffer, 'docs', type.ext), size: buffer.length };
}

function removeFile(relPath) {
  if (!relPath) return;
  const full = path.resolve(UPLOAD_DIR, relPath);
  if (full.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) fs.rm(full, { force: true }, () => {});
}

/* ------------------------------------------------------------- приём формы */

/** Одна общая форма приёма: текст + любые файлы, тип разберём по содержимому. */
const uploadAny = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.video, files: 10, fields: 40 },
});

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.image, files: 20 },
});

/** Человеческий размер файла: 1.4 МБ. */
function humanSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' ГБ';
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' КБ';
  return bytes + ' Б';
}

/** 0:07, 3:41, 1:02:15 */
function humanDuration(seconds) {
  seconds = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
}

module.exports = {
  UPLOAD_DIR, LIMITS, detect, detectDoc, sniff,
  saveImage, saveVideo, saveAudio, saveVoice, saveDoc, removeFile, thumbOf,
  uploadAny, uploadImage, ffmpegAvailable, probeDuration,
  humanSize, humanDuration,
};
