/* ВОнлайне — статическая версия. Хранилище.

   Сервера нет, поэтому данные живут в двух местах:
   • data/site.json — то, что опубликовано в архиве и видно каждому гостю;
   • localStorage браузера владельца — правки поверх опубликованного.

   Файлы (фото, видео, музыка, документы) лежат в IndexedDB под тем же путём,
   под которым они потом попадут в архив: uploads/photos/ab12cd34.jpg.
   Поэтому ссылка на файл всегда одна и та же, а откуда его брать — из базы
   браузера или с диска хостинга — решает VO.store.url(). */
(function () {
  'use strict';

  var KEY_STATE = 'vo.state';
  var KEY_OWNER = 'vo.owner';
  var DB_NAME = 'vo-files';
  var DB_STORE = 'files';

  var state = null;
  var published = null;
  var owner = false;
  var dbPromise = null;
  var urlCache = {};

  /* --------------------------------------------------------------- база файлов */

  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(mode, run) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(DB_STORE, mode);
        var req = run(t.objectStore(DB_STORE));
        t.oncomplete = function () { resolve(req && req.result); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  function putFile(path, blob) {
    return tx('readwrite', function (s) { return s.put(blob, path); }).then(function () {
      delete urlCache[path];
      return path;
    });
  }

  function getFile(path) {
    return tx('readonly', function (s) { return s.get(path); });
  }

  function deleteFile(path) {
    if (!path) return Promise.resolve();
    if (urlCache[path]) { URL.revokeObjectURL(urlCache[path]); delete urlCache[path]; }
    return tx('readwrite', function (s) { return s.delete(path); });
  }

  function allFiles() {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var out = [];
        var t = d.transaction(DB_STORE, 'readonly');
        var cursor = t.objectStore(DB_STORE).openCursor();
        cursor.onsuccess = function () {
          var c = cursor.result;
          if (!c) return resolve(out);
          out.push({ path: c.key, blob: c.value });
          c.continue();
        };
        cursor.onerror = function () { reject(cursor.error); };
      });
    });
  }

  /** Адрес файла для <img src>: из базы браузера, если он там есть, иначе с сайта. */
  var known = {};
  function url(path) {
    if (!path) return '';
    if (urlCache[path]) return urlCache[path];
    if (known[path] === false) return path;
    return path;
  }

  /** Заранее достаёт из базы все файлы, которые понадобятся странице. */
  function preload(paths) {
    var need = paths.filter(function (p) { return p && !urlCache[p] && known[p] !== false; });
    if (!need.length) return Promise.resolve();
    return Promise.all(need.map(function (p) {
      return getFile(p).then(function (blob) {
        if (blob) urlCache[p] = URL.createObjectURL(blob);
        else known[p] = false;
      }).catch(function () { known[p] = false; });
    }));
  }

  /* -------------------------------------------------------------- состояние */

  function defaults() {
    var ts = Math.floor(Date.now() / 1000);
    return {
      v: 1,
      user: {
        first_name: 'Владислав', last_name: '', login: 'vladislav', sex: 'm',
        status: '', bday: '', city: '', hometown: '', relationship: '', politics: '',
        worldview: '', activity: '', interests: '', music: '', films: '', tv: '',
        books: '', games: '', quotes: '', about: '',
        avatar: null,
        theme: 'vo',
        neon: { c1: '#2fe0ff', c2: '#ff4ecd', bg: '#070b16' },
        created_at: ts,
      },
      posts: [], albums: [{ id: 1, title: 'Фотографии со страницы', description: '', created_at: ts }],
      photos: [], videos: [], audios: [], docs: [], groups: [], notes: [],
      seq: { post: 0, album: 1, photo: 0, video: 0, audio: 0, doc: 0, group: 0, note: 0, comment: 0 },
    };
  }

  /** Достраивает недостающие поля: файл site.json мог быть сделан старой версией. */
  function normalize(s) {
    var d = defaults();
    if (!s || typeof s !== 'object') return d;
    var out = Object.assign({}, d, s);
    out.user = Object.assign({}, d.user, s.user || {});
    out.user.neon = Object.assign({}, d.user.neon, (s.user && s.user.neon) || {});
    ['posts', 'albums', 'photos', 'videos', 'audios', 'docs', 'groups', 'notes'].forEach(function (k) {
      if (!Array.isArray(out[k])) out[k] = d[k];
    });
    out.seq = Object.assign({}, d.seq, s.seq || {});
    return out;
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(KEY_STATE);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }

  function save() {
    if (!owner) return false;
    try {
      localStorage.setItem(KEY_STATE, JSON.stringify(state));
      return true;
    } catch (e) {
      alert('Не удалось сохранить: в браузере кончилось место для сайта.');
      return false;
    }
  }

  function nextId(kind) {
    state.seq[kind] = (state.seq[kind] || 0) + 1;
    return state.seq[kind];
  }

  function setOwner(on) {
    if (on) {
      localStorage.setItem(KEY_OWNER, '1');
      if (!readLocal()) {
        state = normalize(JSON.parse(JSON.stringify(published)));
        owner = true;
        save();
      }
      owner = true;
    } else {
      localStorage.removeItem(KEY_OWNER);
      owner = false;
      state = normalize(JSON.parse(JSON.stringify(published)));
    }
  }

  /** Полная очистка: и правки, и загруженные файлы. */
  function reset() {
    localStorage.removeItem(KEY_STATE);
    localStorage.removeItem(KEY_OWNER);
    owner = false;
    return tx('readwrite', function (s) { return s.clear(); }).then(function () {
      urlCache = {}; known = {};
      state = normalize(JSON.parse(JSON.stringify(published)));
    });
  }

  function load() {
    return fetch('data/site.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (data) {
        published = normalize(data);
        var local = readLocal();
        owner = localStorage.getItem(KEY_OWNER) === '1';
        state = owner && local ? local : normalize(JSON.parse(JSON.stringify(published)));
        if (owner && !local) save();
        return state;
      });
  }

  window.VO = window.VO || {};
  window.VO.store = {
    load: load,
    save: save,
    reset: reset,
    nextId: nextId,
    setOwner: setOwner,
    isOwner: function () { return owner; },
    get: function () { return state; },
    published: function () { return published; },
    putFile: putFile,
    getFile: getFile,
    deleteFile: deleteFile,
    allFiles: allFiles,
    preload: preload,
    url: url,
    defaults: defaults,
    normalize: normalize,
  };
})();
