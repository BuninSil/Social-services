/* Связь с сетью RetroCore для загруженного в неё сайта («Вариант А»).

   Скрипт /connect.js отдаёт сама сеть, и он уже знает, кто открыл страницу:
   загруженные сайты видны только участникам. Если сайт открыт не из сети
   (например, файлом с диска), объекта RetroCore просто нет — тогда всё
   работает по-старому, только без имён и списка людей. */
(function () {
  'use strict';

  var RC = window.RetroCore || null;
  var cached = null;

  function user() {
    if (!RC || !RC.user) return Promise.resolve(null);
    if (cached) return Promise.resolve(cached);
    return Promise.resolve(RC.user()).then(function (u) {
      cached = u && u.username ? u : null;
      return cached;
    }).catch(function () { return null; });
  }

  function users(params) {
    if (!RC || !RC.users) return Promise.resolve([]);
    return Promise.resolve(RC.users(params || {})).then(function (list) {
      return Array.isArray(list) ? list : [];
    }).catch(function () { return []; });
  }

  /** Показатели в карточку проекта в профиле участника сети. */
  function stats(obj) {
    if (!RC || !RC.stats) return;
    try { RC.stats(obj); } catch (e) { /* сеть не обязана отвечать */ }
  }

  /** Событие в ленту активности профиля. */
  function activity(text, link) {
    if (!RC || !RC.activity) return;
    try { RC.activity(String(text).slice(0, 200), link); } catch (e) { /* не критично */ }
  }

  function profileUrl(login) {
    if (RC && RC.profileUrl) {
      try { return RC.profileUrl(login); } catch (e) { /* ниже */ }
    }
    return '';
  }

  window.VO = window.VO || {};
  window.VO.rc = {
    available: !!RC,
    user: user,
    users: users,
    stats: stats,
    activity: activity,
    profileUrl: profileUrl,
  };
})();
