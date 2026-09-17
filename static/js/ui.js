/* ВОнлайне — статическая версия. Общие мелочи: даты, склонения, вложения,
   приём файлов и разметка, одинаковая для всех страниц. */
(function () {
  'use strict';

  var MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа',
    'сентября', 'октября', 'ноября', 'декабря'];

  var now = function () { return Math.floor(Date.now() / 1000); };
  var pad = function (n) { return n < 10 ? '0' + n : String(n); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Текст записи: экранируем, разбираем переносы, ссылки и #хештеги. */
  function text2html(s) {
    var out = esc(s);
    out = out.replace(/(https?:\/\/[^\s<]+)/g, function (m) {
      return '<a href="' + m + '" rel="nofollow noopener" target="_blank">' + m + '</a>';
    });
    out = out.replace(/(^|\s)#([\wа-яёА-ЯЁ]{2,30})/g, function (m, pre, tag) {
      return pre + '<a href="search.html?q=%23' + encodeURIComponent(tag) + '">#' + tag + '</a>';
    });
    return out.replace(/\n/g, '<br>');
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }
  function pluralCount(n, one, few, many) { return n + ' ' + plural(n, one, few, many); }

  function vkDate(ts) {
    var d = new Date(ts * 1000), today = new Date();
    var yesterday = new Date(today.getTime() - 86400000);
    var same = function (a, b) {
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    };
    var time = d.getHours() + ':' + pad(d.getMinutes());
    if (same(d, today)) return 'сегодня в ' + time;
    if (same(d, yesterday)) return 'вчера в ' + time;
    if (d.getFullYear() === today.getFullYear()) return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' в ' + time;
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear() + ' в ' + time;
  }

  function shortDate(ts) {
    var d = new Date(ts * 1000), today = new Date();
    if (d.toDateString() === today.toDateString()) return d.getHours() + ':' + pad(d.getMinutes());
    if (d.getFullYear() === today.getFullYear()) return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  function formatBday(bday) {
    if (!bday) return '';
    var p = String(bday).split('.');
    var day = parseInt(p[0], 10), month = parseInt(p[1], 10);
    if (!day || !month || month < 1 || month > 12) return bday;
    var out = day + ' ' + MONTHS_FULL[month - 1];
    var year = p[2] ? parseInt(p[2], 10) : null;
    if (year) {
      out += ' ' + year;
      var t = new Date(), age = t.getFullYear() - year;
      if (t.getMonth() + 1 < month || (t.getMonth() + 1 === month && t.getDate() < day)) age--;
      if (age >= 0 && age < 130) out += ' (' + pluralCount(age, 'год', 'года', 'лет') + ')';
    }
    return out;
  }

  function size(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' ГБ';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' МБ';
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' КБ';
    return bytes + ' Б';
  }

  function duration(sec) {
    if (!sec) return '';
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m + ':' + pad(s);
  }

  function fullName(u) { return (u.first_name + ' ' + (u.last_name || '')).trim(); }

  /* ------------------------------------------------------------- приём файлов */

  var MAX = { image: 12, video: 256, audio: 30, doc: 50 };  // МБ
  // Всё это исполняется браузером, если открыть файл по прямой ссылке,
  // а сайт лежит на общем хостинге — поэтому такие файлы не принимаем.
  var FORBIDDEN = /\.(svg|svgz|html?|xhtml|xml|js|mjs|php\d?|phtml|cgi|pl|py|sh|exe|bat|cmd|com|scr|msi|jar|apk|dll)$/i;

  function kindOf(file) {
    var type = file.type || '';
    var name = file.name || '';
    if (FORBIDDEN.test(name)) return null;
    if (/^image\/(jpeg|png|gif|webp)$/.test(type)) return 'photo';
    if (/^video\/(mp4|webm|quicktime|x-matroska)$/.test(type)) return 'video';
    if (/^audio\//.test(type)) return 'audio';
    if (/^image\/svg/.test(type) || /^text\/html/.test(type)) return null;
    return 'doc';
  }

  function ext(name, fallback) {
    var m = /\.([a-z0-9]{1,8})$/i.exec(name || '');
    return m ? m[1].toLowerCase() : fallback;
  }

  function rnd() {
    var s = '';
    var bytes = new Uint8Array(6);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i++) s += ('0' + bytes[i].toString(16)).slice(-2);
    return s;
  }

  function cleanName(name) {
    return String(name || 'файл').split(/[\\/]/).pop()
      .replace(/[^\wа-яёА-ЯЁ \.\-\(\)\[\]#\+]/g, '').trim().slice(0, 120) || 'файл';
  }

  /** Картинка ужимается прямо в браузере: большая до 1600px, миниатюра до 180px. */
  function prepareImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var out = { width: img.naturalWidth, height: img.naturalHeight };
          var gif = file.type === 'image/gif';
          var big = gif ? Promise.resolve(file) : resize(img, 1600, .85);
          big.then(function (blob) {
            out.blob = blob;
            return resize(img, 180, .8);
          }).then(function (thumb) {
            out.thumb = thumb;
            resolve(out);
          }).catch(reject);
        };
        img.onerror = function () { reject(new Error('битая картинка')); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  function resize(img, max, quality) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var scale = Math.min(1, max / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        blob ? resolve(blob) : reject(new Error('не удалось пережать'));
      }, 'image/jpeg', quality);
    });
  }

  /** Длительность видео и музыки — спрашиваем у самого браузера. */
  function probeDuration(file) {
    return new Promise(function (resolve) {
      var el = document.createElement(/^video\//.test(file.type) ? 'video' : 'audio');
      var url = URL.createObjectURL(file);
      var done = function (v) { URL.revokeObjectURL(url); resolve(v); };
      el.preload = 'metadata';
      el.onloadedmetadata = function () { done(isFinite(el.duration) ? Math.round(el.duration) : 0); };
      el.onerror = function () { done(0); };
      setTimeout(function () { done(0); }, 4000);
      el.src = url;
    });
  }

  function splitTrack(name) {
    var base = String(name).replace(/\.[^.]+$/, '');
    var parts = base.split(/\s+[-–—]\s+/);
    if (parts.length > 1) return { artist: parts[0], title: parts.slice(1).join(' - ') };
    return { artist: 'Неизвестен', title: base };
  }

  /**
   * Кладёт выбранные файлы в нужные списки состояния и возвращает вложения
   * вида {kind, id} — ровно как их хранит серверная версия.
   */
  function ingest(files, options) {
    var store = window.VO.store, S = store.get();
    var opts = options || {};
    var list = Array.prototype.slice.call(files || []).slice(0, 10);
    var chain = Promise.resolve([]);
    var skipped = [];

    list.forEach(function (file) {
      chain = chain.then(function (acc) {
        var kind = kindOf(file);
        if (!kind) { skipped.push(file.name + ' — такой тип файла сайт не принимает'); return acc; }
        var limitMb = MAX[kind === 'photo' ? 'image' : kind];
        if (file.size > limitMb * 1048576) {
          skipped.push(file.name + ' — больше ' + limitMb + ' МБ');
          return acc;
        }

        if (kind === 'photo') {
          return prepareImage(file).then(function (img) {
            var id = store.nextId('photo');
            var e = file.type === 'image/gif' ? 'gif' : 'jpg';
            var path = 'uploads/photos/' + rnd() + '.' + e;
            var thumb = 'uploads/photos/' + rnd() + '_s.jpg';
            return Promise.all([store.putFile(path, img.blob), store.putFile(thumb, img.thumb)])
              .then(function () {
                S.photos.push({
                  id: id, album_id: opts.album || 1, file: path, thumb: thumb,
                  width: img.width, height: img.height, size: img.blob.size,
                  description: '', likes: 0, comments: [], created_at: now(),
                });
                acc.push({ kind: 'photo', id: id });
                return acc;
              });
          }).catch(function () { skipped.push(file.name + ' — не удалось прочитать картинку'); return acc; });
        }

        if (kind === 'video') {
          return probeDuration(file).then(function (sec) {
            var id = store.nextId('video');
            var path = 'uploads/videos/' + rnd() + '.' + ext(file.name, 'mp4');
            return store.putFile(path, file).then(function () {
              S.videos.push({
                id: id, file: path, title: cleanName(file.name).replace(/\.[^.]+$/, ''),
                duration: sec, size: file.size, type: file.type || 'video/mp4', created_at: now(),
              });
              acc.push({ kind: 'video', id: id });
              return acc;
            });
          });
        }

        if (kind === 'audio') {
          return probeDuration(file).then(function (sec) {
            var id = store.nextId('audio');
            var path = 'uploads/audio/' + rnd() + '.' + ext(file.name, 'mp3');
            var t = splitTrack(cleanName(file.name));
            return store.putFile(path, file).then(function () {
              S.audios.push({
                id: id, file: path, artist: t.artist, title: t.title, duration: sec,
                size: file.size, type: file.type || 'audio/mpeg',
                voice: !!opts.voice, created_at: now(),
              });
              acc.push({ kind: opts.voice ? 'voice' : 'audio', id: id });
              return acc;
            });
          });
        }

        var id = store.nextId('doc');
        var path = 'uploads/docs/' + rnd() + '.' + ext(file.name, 'bin');
        return store.putFile(path, file).then(function () {
          S.docs.push({
            id: id, file: path, name: cleanName(file.name), ext: ext(file.name, 'bin'),
            size: file.size, type: file.type || 'application/octet-stream', created_at: now(),
          });
          acc.push({ kind: 'doc', id: id });
          return acc;
        });
      });
    });

    return chain.then(function (att) { return { att: att, skipped: skipped }; });
  }

  /* --------------------------------------------------------------- вложения */

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** Пути всех файлов вложений — чтобы страница заранее достала их из базы. */
  function attachPaths(att) {
    var S = window.VO.store.get(), out = [];
    (att || []).forEach(function (a) {
      var item = null;
      if (a.kind === 'photo') { item = byId(S.photos, a.id); if (item) out.push(item.thumb, item.file); }
      else if (a.kind === 'video') { item = byId(S.videos, a.id); if (item) out.push(item.file); }
      else if (a.kind === 'audio' || a.kind === 'voice') { item = byId(S.audios, a.id); if (item) out.push(item.file); }
      else if (a.kind === 'doc') { item = byId(S.docs, a.id); if (item) out.push(item.file); }
    });
    return out;
  }

  function attachmentsHtml(att) {
    var S = window.VO.store.get(), url = window.VO.store.url;
    if (!att || !att.length) return '';
    var photos = [], rest = '';

    att.forEach(function (a) {
      if (a.kind === 'photo') {
        var p = byId(S.photos, a.id);
        if (p) photos.push(p);
        return;
      }
      if (a.kind === 'video') {
        var v = byId(S.videos, a.id);
        if (!v) return;
        rest += '<div class="att_video"><video controls preload="metadata" src="' + esc(url(v.file)) + '"></video>' +
          '<div class="att_cap gray small">' + esc(v.title) + ' &middot; ' + size(v.size) +
          (v.duration ? ' &middot; ' + duration(v.duration) : '') + '</div></div>';
        return;
      }
      if (a.kind === 'audio' || a.kind === 'voice') {
        var s = byId(S.audios, a.id);
        if (!s) return;
        if (a.kind === 'voice' || s.voice) {
          rest += '<div class="att_voice"><span class="voice_ico">&#9834;</span>' +
            '<span class="gray">Голосовое сообщение' + (s.duration ? ', ' + duration(s.duration) : '') + '</span>' +
            '<div><audio controls preload="none" src="' + esc(url(s.file)) + '"></audio></div></div>';
        } else {
          rest += '<div class="att_audio"><div class="att_audio_ttl"><b>' + esc(s.artist) + '</b> &ndash; ' +
            esc(s.title) + (s.duration ? ' <span class="gray small">' + duration(s.duration) + '</span>' : '') + '</div>' +
            '<audio controls preload="none" src="' + esc(url(s.file)) + '"></audio></div>';
        }
        return;
      }
      if (a.kind === 'doc') {
        var d = byId(S.docs, a.id);
        if (!d) return;
        rest += '<div class="att_doc"><a href="' + esc(url(d.file)) + '" download="' + esc(d.name) + '">' +
          esc(d.name) + '</a><span class="gray">' + d.ext.toUpperCase() + ', ' + size(d.size) + '</span></div>';
      }
    });

    var html = '';
    if (photos.length) {
      html += '<div class="att_photos">';
      photos.forEach(function (p) {
        var cls = photos.length === 1 ? ' class="single"' : '';
        var src = photos.length === 1 ? p.file : p.thumb;
        html += '<a class="att_photo" href="photo.html?id=' + p.id + '"><img' + cls +
          ' src="' + esc(url(src)) + '" alt=""></a>';
      });
      html += '<div class="clear"></div></div>';
    }
    return '<div class="attachments">' + html + rest + '</div>';
  }

  /* ------------------------------------------------------------- заглушки */

  var PLACEHOLDER = {
    user: 'img/camera_200.svg',
    userSmall: 'img/camera_100.svg',
    group: 'img/group_200.svg',
    video: 'img/video_200.svg',
  };

  function avatar(user, small) {
    var u = user || window.VO.store.get().user;
    if (u && u.avatar) return window.VO.store.url(u.avatar);
    return small ? PLACEHOLDER.userSmall : PLACEHOLDER.user;
  }

  function groupAvatar(g) {
    return g && g.avatar ? window.VO.store.url(g.avatar) : PLACEHOLDER.group;
  }

  window.VO = window.VO || {};
  window.VO.ui = {
    esc: esc, text2html: text2html, plural: plural, pluralCount: pluralCount,
    vkDate: vkDate, shortDate: shortDate, formatBday: formatBday, size: size,
    duration: duration, fullName: fullName, now: now, rnd: rnd, ext: ext,
    cleanName: cleanName, splitTrack: splitTrack, ingest: ingest, byId: byId,
    attachmentsHtml: attachmentsHtml, attachPaths: attachPaths,
    avatar: avatar, groupAvatar: groupAvatar, prepareImage: prepareImage,
    PLACEHOLDER: PLACEHOLDER, MAX: MAX,
  };
})();
