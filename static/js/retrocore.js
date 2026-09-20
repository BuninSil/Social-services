/* Связь с сетью RetroCore — необязательная.

   Включается тумблером retrocore в js/config.js. Пока он выключен, этот файл
   не делает ровным счётом ничего: скрипт сети не подключается, запросов наружу
   нет, сайт работает как обычная страница.

   Когда включён — подтягивается /connect.js, который отдаёт сама сеть. Он уже
   знает, кто открыл страницу: загруженные в сеть сайты видны только участникам. */
(function () {
  'use strict';

  var CFG = window.VO_CONFIG || {};
  var enabled = CFG.retrocore === true;
  var loading = null;
  var cached = null;

  /** Подключает скрипт сети один раз и отдаёт объект RetroCore (или null). */
  function api() {
    if (!enabled) return Promise.resolve(null);
    if (loading) return loading;

    loading = new Promise(function (resolve) {
      if (window.RetroCore) return resolve(window.RetroCore);
      var script = document.createElement('script');
      script.src = CFG.retrocore_script || '/connect.js';
      script.onload = function () { resolve(window.RetroCore || null); };
      script.onerror = function () { resolve(null); };  // сети нет — и ладно
      document.head.appendChild(script);
    });
    return loading;
  }

  function user() {
    if (cached) return Promise.resolve(cached);
    return api().then(function (rc) {
      if (!rc || !rc.user) return null;
      return Promise.resolve(rc.user()).then(function (who) {
        cached = who && who.username ? who : null;
        return cached;
      });
    }).catch(function () { return null; });
  }

  function users(params) {
    return api().then(function (rc) {
      if (!rc || !rc.users) return [];
      return Promise.resolve(rc.users(params || {}));
    }).then(function (list) {
      return Array.isArray(list) ? list : [];
    }).catch(function () { return []; });
  }

  /** Показатели в карточку проекта в профиле участника сети. */
  function stats(obj) {
    api().then(function (rc) {
      if (rc && rc.stats) rc.stats(obj);
    }).catch(function () { /* сеть не обязана отвечать */ });
  }

  /** Событие в ленту активности профиля. */
  function activity(text, link) {
    api().then(function (rc) {
      if (rc && rc.activity) rc.activity(String(text).slice(0, 200), link);
    }).catch(function () { /* не критично */ });
  }

  function profileUrl(login) {
    if (window.RetroCore && window.RetroCore.profileUrl) {
      try { return window.RetroCore.profileUrl(login); } catch (e) { /* ниже */ }
    }
    return '';
  }

  window.VO = window.VO || {};
  window.VO.rc = {
    enabled: enabled,
    user: user,
    users: users,
    stats: stats,
    activity: activity,
    profileUrl: profileUrl,
  };
})();
