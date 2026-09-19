'use strict';

/**
 * Ультра-простая база: без SQL и без нативных модулей.
 *
 * Каждая коллекция — обычный файл JSON в папке данных: users.json, posts.json
 * и так далее. Всё держится в памяти, на диск сбрасывается отложенно и
 * атомарно: сначала во временный файл, потом переименованием. Прошлая версия
 * файла остаётся рядом как .bak — если процесс убьют ровно между двумя
 * переименованиями, при следующем запуске возьмётся она.
 *
 * Объекты наружу отдаются копиями, как строки из настоящей базы: менять их
 * у себя безопасно, на хранилище это не влияет. Записывают только insert,
 * update, upsert и remove.
 *
 * Рассчитано на десятки людей и десятки тысяч записей — то есть на локальную
 * сеть и небольшой сайт. Поиск линейный, никаких индексов, кроме id.
 */

const fs = require('fs');
const path = require('path');

const FLUSH_DELAY = 200;

function open(dir, schema) {
  fs.mkdirSync(dir, { recursive: true });

  const collections = {};
  const dirty = new Set();
  let timer = null;
  let closed = false;

  function scheduleFlush(name) {
    dirty.add(name);
    if (timer || closed) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, FLUSH_DELAY);
    if (timer.unref) timer.unref();
  }

  function flush() {
    for (const name of dirty) collections[name]._write();
    dirty.clear();
  }

  for (const name of Object.keys(schema)) {
    collections[name] = new Collection(name, dir, schema[name] || {}, () => scheduleFlush(name));
  }

  const db = Object.assign({}, collections, {
    /** Немедленно сбросить всё на диск. */
    save: flush,

    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      flush();
    },

    /** Сколько чего лежит — для страницы состояния и тестов. */
    stats() {
      const out = {};
      for (const name of Object.keys(collections)) out[name] = collections[name].count();
      return out;
    },

    collections: Object.keys(collections),
  });

  // Незаписанное не должно теряться при обычной остановке.
  const onExit = () => { try { flush(); } catch (e) { /* уже не поможем */ } };
  process.once('exit', onExit);

  return db;
}

class Collection {
  constructor(name, dir, options, onChange) {
    this.name = name;
    this.file = path.join(dir, name + '.json');
    this.defaults = options.defaults || {};
    this.onChange = onChange;
    this.rows = [];
    this.byId = new Map();
    this.seq = 0;
    this._read();
  }

  /* ------------------------------------------------------------ чтение */

  _read() {
    const data = readJson(this.file) || readJson(this.file + '.bak');
    if (!data) return;
    this.rows = Array.isArray(data.rows) ? data.rows : [];
    this.seq = Number(data.seq) || 0;
    for (const row of this.rows) {
      this.byId.set(row.id, row);
      if (typeof row.id === 'number' && row.id > this.seq) this.seq = row.id;
    }
  }

  _write() {
    const tmp = this.file + '.tmp';
    const body = JSON.stringify({ seq: this.seq, rows: this.rows });
    fs.writeFileSync(tmp, body);
    if (fs.existsSync(this.file)) {
      fs.renameSync(this.file, this.file + '.bak');
    }
    fs.renameSync(tmp, this.file);
  }

  _touch() {
    this.onChange();
  }

  /* ------------------------------------------------------------- поиск */

  all() {
    return this.rows.map(copy);
  }

  get(id) {
    const row = this.byId.get(id);
    return row ? copy(row) : null;
  }

  find(where) {
    const test = matcher(where);
    for (const row of this.rows) if (test(row)) return copy(row);
    return null;
  }

  filter(where) {
    const test = matcher(where);
    const out = [];
    for (const row of this.rows) if (test(row)) out.push(copy(row));
    return out;
  }

  count(where) {
    if (where === undefined) return this.rows.length;
    const test = matcher(where);
    let n = 0;
    for (const row of this.rows) if (test(row)) n += 1;
    return n;
  }

  has(where) {
    const test = matcher(where);
    for (const row of this.rows) if (test(row)) return true;
    return false;
  }

  /* ------------------------------------------------------------ запись */

  insert(values) {
    const row = Object.assign({}, this.defaults, values);
    if (row.id === undefined || row.id === null) {
      this.seq += 1;
      row.id = this.seq;
    } else if (typeof row.id === 'number' && row.id > this.seq) {
      this.seq = row.id;
    }
    if (this.byId.has(row.id)) throw new Error(this.name + ': запись с таким id уже есть — ' + row.id);

    this.rows.push(row);
    this.byId.set(row.id, row);
    this._touch();
    return copy(row);
  }

  /** Меняет первую подходящую запись (или все, если передан набор). */
  update(where, patch) {
    const test = matcher(where);
    let changed = 0;
    for (const row of this.rows) {
      if (!test(row)) continue;
      Object.assign(row, patch);
      changed += 1;
      if (isId(where)) break;
    }
    if (changed) this._touch();
    return changed;
  }

  /** Есть — обновляем, нет — заводим. Вместо INSERT OR REPLACE. */
  upsert(where, values) {
    const test = matcher(where);
    for (const row of this.rows) {
      if (!test(row)) continue;
      Object.assign(row, values);
      this._touch();
      return copy(row);
    }
    return this.insert(Object.assign({}, where && typeof where === 'object' ? where : {}, values));
  }

  remove(where) {
    const test = matcher(where);
    const kept = [];
    let removed = 0;
    for (const row of this.rows) {
      if (test(row) && !(isId(where) && removed)) {
        this.byId.delete(row.id);
        removed += 1;
        continue;
      }
      kept.push(row);
    }
    if (removed) {
      this.rows = kept;
      this._touch();
    }
    return removed;
  }
}

/* ------------------------------------------------------------ мелочи */

function copy(row) {
  return Object.assign({}, row);
}

function isId(where) {
  return typeof where === 'number' || typeof where === 'string';
}

/**
 * Условие: id, объект «поле = значение» или своя функция.
 * В объекте значение-массив означает «любое из».
 */
function matcher(where) {
  if (where === undefined || where === null) return () => true;
  if (typeof where === 'function') return where;
  if (isId(where)) return (row) => row.id === where;

  const keys = Object.keys(where);
  return (row) => {
    for (const key of keys) {
      const want = where[key];
      if (Array.isArray(want)) {
        if (!want.includes(row[key])) return false;
      } else if (row[key] !== want) {
        return false;
      }
    }
    return true;
  };
}

function readJson(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('[база] не читается ' + path.basename(file) + ': ' + e.message);
    }
    return null;
  }
}

module.exports = { open };
