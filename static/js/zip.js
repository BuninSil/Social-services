/* Сборка ZIP прямо в браузере — без сжатия (метод store).
   Нужна ровно для одного: собрать архив сайта со своими данными,
   чтобы залить его обратно на хостинг. */
(function () {
  'use strict';

  var TABLE = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosTime(date) {
    var time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() / 2) & 31);
    var day = (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
    return { time: time, date: day };
  }

  function u8(len) { return new Uint8Array(len); }
  function w16(arr, off, v) { arr[off] = v & 255; arr[off + 1] = (v >>> 8) & 255; }
  function w32(arr, off, v) { w16(arr, off, v & 0xFFFF); w16(arr, off + 2, (v >>> 16) & 0xFFFF); }

  /**
   * files: [{ name: 'index.html', data: Uint8Array }]
   * Возвращает Blob с архивом.
   */
  function build(files) {
    var parts = [], central = [], offset = 0;
    var stamp = dosTime(new Date());

    files.forEach(function (f) {
      var name = new TextEncoder().encode(f.name);
      var data = f.data;
      var crc = crc32(data);

      var local = u8(30 + name.length);
      w32(local, 0, 0x04034b50);
      w16(local, 4, 20);            // версия
      w16(local, 6, 0x0800);        // имена в utf-8
      w16(local, 8, 0);             // без сжатия
      w16(local, 10, stamp.time);
      w16(local, 12, stamp.date);
      w32(local, 14, crc);
      w32(local, 18, data.length);
      w32(local, 22, data.length);
      w16(local, 26, name.length);
      w16(local, 28, 0);
      local.set(name, 30);

      parts.push(local, data);

      var dir = u8(46 + name.length);
      w32(dir, 0, 0x02014b50);
      w16(dir, 4, 20);
      w16(dir, 6, 20);
      w16(dir, 8, 0x0800);
      w16(dir, 10, 0);
      w16(dir, 12, stamp.time);
      w16(dir, 14, stamp.date);
      w32(dir, 16, crc);
      w32(dir, 20, data.length);
      w32(dir, 24, data.length);
      w16(dir, 28, name.length);
      w32(dir, 42, offset);
      dir.set(name, 46);
      central.push(dir);

      offset += local.length + data.length;
    });

    var centralSize = central.reduce(function (n, d) { return n + d.length; }, 0);
    var end = u8(22);
    w32(end, 0, 0x06054b50);
    w16(end, 8, files.length);
    w16(end, 10, files.length);
    w32(end, 12, centralSize);
    w32(end, 16, offset);

    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }

  window.VO = window.VO || {};
  window.VO.zip = { build: build, crc32: crc32 };
})();
