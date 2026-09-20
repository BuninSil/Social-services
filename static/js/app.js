/* ВОнлайне — статическая версия. Сборка страниц.
   Разметку страниц рисует этот файл: сервера нет, данные берутся из
   VO.store (опубликованный data/site.json + правки владельца в браузере). */
(function () {
  'use strict';

  var store = VO.store, ui = VO.ui;
  var S = null;
  var owner = false;

  var THEMES = {
    vo: { title: 'Светлая', hint: 'оригинальный старый ВК', css: 'css/vo.css', icon: '☀', bar: '#5e82a6' },
    dark: { title: 'Тёмная', hint: 'тот же вид в тёмных тонах', css: 'css/vo-dark.css', icon: '☾', bar: '#2a3a4e' },
    neon: { title: 'Неоновая', hint: 'тёмная со свечением и своими цветами', css: 'css/vo-neon.css', icon: '✦', bar: null },
    fresh: { title: 'Обновлённая', hint: 'светлая с современной подачей', css: 'css/vo-fresh.css', icon: '☀', bar: '#5181b8' },
    modern: { title: 'Современная', hint: 'карточки и колонка пошире', css: 'css/vo-modern.css', icon: '☀', bar: '#4680c2' },
  };
  var CYCLE = ['vo', 'dark', 'neon'];

  var PRESETS = [
    { id: 'cyber', title: 'Киберпанк', c1: '#2fe0ff', c2: '#ff4ecd', bg: '#070b16' },
    { id: 'acid', title: 'Кислота', c1: '#7cff3d', c2: '#ffe600', bg: '#06110a' },
    { id: 'sunset', title: 'Закат', c1: '#ff8a3d', c2: '#ff3d77', bg: '#130a12' },
    { id: 'ice', title: 'Лёд', c1: '#8fd8ff', c2: '#c9a7ff', bg: '#0a1020' },
    { id: 'matrix', title: 'Матрица', c1: '#39ff87', c2: '#1fbf6b', bg: '#040d07' },
  ];

  /* ------------------------------------------------------------- мелочи */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function param(name) { return new URLSearchParams(location.search).get(name); }
  function esc(s) { return ui.esc(s); }
  function save() { store.save(); }

  function html(node, markup) { if (node) node.innerHTML = markup; }

  function confirmed(message) { return window.confirm(message); }

  function notice(text) {
    var box = $('#page_notice');
    if (!box) return;
    box.className = 'notice';
    box.textContent = text;
    box.hidden = false;
    setTimeout(function () { box.hidden = true; }, 4000);
  }

  function fail(text) {
    var box = $('#page_notice');
    if (!box) return alert(text);
    box.className = 'error';
    box.textContent = text;
    box.hidden = false;
  }

  /* ------------------------------------------------------------- оформление */

  function applyTheme() {
    var name = THEMES[S.user.theme] ? S.user.theme : 'vo';
    var link = $('#theme_css');
    if (link && link.getAttribute('href') !== THEMES[name].css) link.setAttribute('href', THEMES[name].css);

    var vars = $('#neon_vars');
    if (!vars) {
      vars = document.createElement('style');
      vars.id = 'neon_vars';
      document.head.appendChild(vars);
    }
    var n = S.user.neon;
    vars.textContent = name === 'neon'
      ? ':root{--cyan:' + hex(n.c1) + ';--pink:' + hex(n.c2) + ';--bg:' + hex(n.bg) + ';}' : '';

    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEMES[name].bar || hex(n.bg));
    document.documentElement.setAttribute('data-theme', name);
  }

  function hex(value) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? value : '#000000';
  }

  function setTheme(name) {
    if (!THEMES[name]) return;
    S.user.theme = name;
    if (owner) save();
    else { try { localStorage.setItem('vo.theme', name); } catch (e) {} }
    applyTheme();
    var pick = $('#theme_name');
    if (pick) pick.textContent = THEMES[name].title;
    var btn = $('#theme_btn');
    if (btn) {
      btn.textContent = THEMES[nextTheme(name)] ? THEMES[name].icon : '☀';
      btn.title = 'Оформление: ' + THEMES[name].title + '. Нажмите, чтобы сменить';
    }
  }

  function nextTheme(name) {
    var i = CYCLE.indexOf(name);
    return i === -1 ? CYCLE[0] : CYCLE[(i + 1) % CYCLE.length];
  }

  /* --------------------------------------------------------------- каркас */

  function renderChrome() {
    var nav = document.body.dataset.nav || '';

    // Без связи с сетью показывать участников неоткуда — прячем пункт меню.
    if (!VO.rc.enabled) {
      var people = $('#left_menu a[data-nav="people"]');
      if (people && people.parentNode) people.parentNode.remove();
    }
    $$('#left_menu a').forEach(function (a) {
      if (a.dataset.nav === nav) a.classList.add('sel');
    });

    var counters = {
      im: S.notes.length, photos: S.photos.length, video: S.videos.length,
      audio: S.audios.length, docs: S.docs.length, groups: S.groups.length,
    };
    $$('#left_menu a').forEach(function (a) {
      var n = counters[a.dataset.nav];
      if (!n) return;
      var span = document.createElement('span');
      span.className = 'cnt';
      span.textContent = n;
      a.insertBefore(span, a.firstChild);
    });

    var name = ui.fullName(S.user);
    $$('.js_me_name').forEach(function (el) {
      if (!owner && viewer) {
        // Загруженный в сеть сайт видит участника — значит, можно поздороваться.
        var who = viewer.title || viewer.username;
        el.innerHTML = (viewer.avatar_url ? '<img class="rc_ava" src="' + esc(viewer.avatar_url) + '" alt="">' : '') +
          'Привет, ' + esc(who);
        var link = viewer.profile_url || VO.rc.profileUrl(viewer.username);
        if (link) { el.href = link; el.target = '_blank'; el.rel = 'noopener'; }
        return;
      }
      el.textContent = name;
    });

    var btn = $('#theme_btn');
    if (btn) {
      btn.textContent = THEMES[S.user.theme].icon;
      btn.title = 'Оформление: ' + THEMES[S.user.theme].title + '. Нажмите, чтобы сменить';
      btn.addEventListener('click', function () { setTheme(nextTheme(S.user.theme)); });
    }
    var themeName = $('#theme_name');
    if (themeName) themeName.textContent = THEMES[S.user.theme].title;

    applyTitle();
    renderModeLine();
  }

  /** Строка в подвале: кто смотрит страницу и как включить правку. */
  /** Название сайта из js/config.js — шапка, подвал и заголовок вкладки. */
  function applyTitle() {
    var name = (window.VO_CONFIG && window.VO_CONFIG.title) || 'ВОнлайне';
    if (name === 'ВОнлайне') return;
    $$('.js_site_name').forEach(function (el) { el.textContent = name; });
    document.title = document.title.replace('ВОнлайне', name);
  }

  function renderModeLine() {
    var box = $('#mode_line');
    if (!box) return;
    if (owner) {
      var byNetwork = viewer && String(viewer.username).toLowerCase() ===
        String((S.owner && S.owner.rc_username) || '').toLowerCase();
      box.innerHTML = 'режим: <b>моя страница</b>' + (byNetwork ? ' (узнала сеть)' : '') + ' &middot; ' +
        '<button type="button" class="link_btn" id="mode_off">только смотреть</button>';
      $('#mode_off').addEventListener('click', function () {
        store.setOwner(false);
        location.reload();
      });
    } else {
      box.innerHTML = 'режим: просмотр &middot; ' +
        '<button type="button" class="link_btn" id="mode_on">это моя страница</button>';
      $('#mode_on').addEventListener('click', function () {
        store.setOwner(true);
        location.reload();
      });
    }
  }

  /* ------------------------------------------------------ форма с вложениями */

  /**
   * Форма записи: текст + файлы. onSubmit(text, attachments) должен вернуть true,
   * если запись создана — тогда форма очистится.
   */
  function wallForm(box, opts) {
    if (!box) return;
    if (!owner) { box.innerHTML = ''; return; }
    var options = opts || {};
    box.className = 'block wall_form';
    box.innerHTML =
      '<div class="block_body">' +
      '<textarea class="text" placeholder="' + esc(options.placeholder || 'Что у Вас нового?') + '"></textarea>' +
      '<div class="wf_foot">' +
      '<div class="attach_box"><span class="attach_label">Прикрепить:</span> ' +
      '<input type="file" multiple>' +
      '<div class="gray small">фото, видео, музыка, документы — до 10 файлов</div></div>' +
      '<button class="button button_blue" type="button">' + esc(options.submit || 'Отправить') + '</button>' +
      '</div></div>';

    var area = $('textarea', box), files = $('input[type=file]', box), btn = $('button', box);

    function send() {
      var text = area.value.trim();
      if (!text && !files.files.length) return;
      btn.disabled = true;
      btn.textContent = 'Секунду…';
      ui.ingest(files.files, options.ingest || {}).then(function (res) {
        if (!text && !res.att.length) { reset(); return; }
        options.onSubmit(text, res.att);
        save();
        if (res.skipped.length) fail('Не приняты: ' + res.skipped.join('; '));
        reset();
        if (options.after) options.after();
      }).catch(function (e) {
        fail('Не получилось: ' + (e && e.message ? e.message : 'ошибка'));
        reset();
      });
    }

    function reset() {
      btn.disabled = false;
      btn.textContent = options.submit || 'Отправить';
      area.value = '';
      files.value = '';
    }

    btn.addEventListener('click', send);
    area.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
    });
  }

  /* ------------------------------------------------------------ записи */

  function postsOf(groupId) {
    return S.posts.filter(function (p) {
      return (groupId ? p.group_id === groupId : !p.group_id);
    }).sort(function (a, b) {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return b.created_at - a.created_at;
    });
  }

  function postPaths(posts) {
    var paths = [];
    posts.forEach(function (p) { paths = paths.concat(ui.attachPaths(p.att)); });
    if (S.user.avatar) paths.push(S.user.avatar);
    S.groups.forEach(function (g) { if (g.avatar) paths.push(g.avatar); });
    return paths;
  }

  function postHtml(post) {
    var group = post.group_id ? ui.byId(S.groups, post.group_id) : null;
    var who = group
      ? '<a href="group.html?id=' + group.id + '" class="author">' + esc(group.name) + '</a>'
      : '<a href="index.html" class="author">' + esc(ui.fullName(S.user)) + '</a>';
    var ava = group ? ui.groupAvatar(group) : ui.avatar(S.user, true);

    var actions = '';
    if (owner) {
      actions =
        '<a href="#" class="like_link' + (post.liked ? ' liked' : '') + '" data-act="like" data-id="' + post.id + '">' +
        (post.liked ? 'Мне не нравится' : 'Мне нравится') + (post.likes ? ' (' + post.likes + ')' : '') + '</a>' +
        '<a href="#" data-act="reply" data-id="' + post.id + '">Комментировать' +
        (post.comments.length ? ' (' + post.comments.length + ')' : '') + '</a>' +
        '<a href="#" data-act="pin" data-id="' + post.id + '">' + (post.pinned ? 'Открепить' : 'Закрепить') + '</a>' +
        '<a href="#" data-act="edit" data-id="' + post.id + '">Редактировать</a>' +
        '<a href="#" data-act="del-post" data-id="' + post.id + '">Удалить</a>';
    } else {
      actions = '<span class="gray">' +
        (post.likes ? 'Нравится: ' + post.likes + ' &middot; ' : '') +
        ui.pluralCount(post.comments.length, 'комментарий', 'комментария', 'комментариев') + '</span>';
    }

    var replies = '';
    if (post.comments.length) {
      replies = '<div class="replies">' + post.comments.map(function (c) {
        return '<div class="reply"><div class="ava"><img src="' + esc(ui.avatar(S.user, true)) +
          '" width="32" height="32" alt=""></div><div class="body">' +
          '<span class="author">' + esc(ui.fullName(S.user)) + '</span>' +
          '<span class="date">' + ui.vkDate(c.created_at) + '</span>' +
          (owner ? ' <button class="link_btn gray" data-act="del-comment" data-id="' + post.id +
            '" data-cid="' + c.id + '">удалить</button>' : '') +
          '<div class="text">' + ui.text2html(c.text) + '</div></div></div>';
      }).join('') + '</div>';
    }

    return '<div class="post' + (post.pinned ? ' pinned' : '') + '" id="post' + post.id + '">' +
      '<div class="ava"><img src="' + esc(ava) + '" width="50" height="50" alt=""></div>' +
      '<div class="body">' +
      '<div class="phead">' + who + '<span class="date">' + ui.vkDate(post.created_at) + '</span>' +
      (post.edited_at ? '<span class="pin_mark">изменено</span>' : '') +
      (post.pinned ? '<span class="pin_mark">закреплено</span>' : '') + '</div>' +
      '<div class="ptext">' + ui.text2html(post.text) + '</div>' +
      ui.attachmentsHtml(post.att) +
      '<div class="pactions">' + actions + '</div>' +
      '</div>' + replies +
      '<div class="reply_form" id="reply' + post.id + '" hidden>' +
      '<textarea class="text" placeholder="Ваш комментарий..."></textarea>' +
      '<div style="padding-top:4px"><button class="button button_small" data-act="send-reply" data-id="' +
      post.id + '">Отправить</button></div></div>' +
      '</div>';
  }

  function renderPosts(box, posts, emptyText) {
    if (!posts.length) {
      html(box, '<div class="empty" style="padding:10px">' + esc(emptyText || 'Записей пока нет.') + '</div>');
      return Promise.resolve();
    }
    return store.preload(postPaths(posts)).then(function () {
      html(box, posts.map(postHtml).join(''));
    });
  }

  /** Общий обработчик кликов по записям. */
  function bindPostActions(box, rerender) {
    if (!box) return;
    box.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (!el) return;
      var act = el.dataset.act;
      var post = ui.byId(S.posts, parseInt(el.dataset.id, 10));
      if (!post) return;
      if (act !== 'send-reply') e.preventDefault();
      if (!owner) return;

      if (act === 'like') {
        post.liked = !post.liked;
        post.likes = Math.max(0, (post.likes || 0) + (post.liked ? 1 : -1));
        save(); rerender();
      } else if (act === 'reply') {
        var form = $('#reply' + post.id, box);
        form.hidden = !form.hidden;
        if (!form.hidden) $('textarea', form).focus();
      } else if (act === 'send-reply') {
        var area = $('#reply' + post.id + ' textarea', box);
        var text = area.value.trim();
        if (!text) return;
        post.comments.push({ id: store.nextId('comment'), text: text, created_at: ui.now() });
        save(); rerender();
      } else if (act === 'del-comment') {
        var cid = parseInt(el.dataset.cid, 10);
        post.comments = post.comments.filter(function (c) { return c.id !== cid; });
        save(); rerender();
      } else if (act === 'pin') {
        var was = post.pinned;
        S.posts.forEach(function (p) { if (p.group_id === post.group_id) p.pinned = false; });
        post.pinned = !was;
        save(); rerender();
      } else if (act === 'edit') {
        var text2 = prompt('Текст записи:', post.text);
        if (text2 === null) return;
        post.text = text2.trim();
        post.edited_at = ui.now();
        save(); rerender();
      } else if (act === 'del-post') {
        if (!confirmed('Удалить запись?')) return;
        S.posts = S.posts.filter(function (p) { return p.id !== post.id; });
        save(); rerender();
      }
    });
  }

  /* ------------------------------------------------------------- страницы */

  var PAGES = {};

  /* --- моя страница ------------------------------------------------------ */

  PAGES.index = function () {
    var u = S.user;

    // Карточка проекта в профиле участника сети: цифры опубликованной страницы,
    // а не черновиков в браузере — чужие видят именно её.
    if (owner && VO.rc.enabled) {
      var pub = store.published();
      VO.rc.stats({
        'Записей': pub.posts.length,
        'Фотографий': pub.photos.length,
        'Аудиозаписей': pub.audios.length,
        'Групп': pub.groups.length,
      });
    }
    $('#profile_name').textContent = ui.fullName(u);
    $('#profile_state').textContent = owner ? 'это Вы' : '';

    var paths = [];
    if (u.avatar) paths.push(u.avatar);
    S.photos.slice(-6).forEach(function (p) { paths.push(p.thumb); });

    store.preload(paths).then(function () {
      html($('#profile_left'),
        '<img class="pavatar" src="' + esc(ui.avatar(u)) + '" width="200" alt="">' +
        (owner ?
          '<div class="profile_actions">' +
          '<a href="settings.html">Редактировать страницу</a>' +
          '<a href="photos.html">Загрузить фотографию</a>' +
          '<a href="video.html">Загрузить видео</a>' +
          '</div>' : '') +
        photosBlock());

      html($('#profile_right'),
        '<div class="pname">' + esc(ui.fullName(u)) + '</div>' +
        '<div class="pstatus">' + (u.status ? esc(u.status) :
          (owner ? '<span class="gray">Здесь может быть Ваш статус.</span>' : '')) +
        (owner ? ' <a class="edit_status" href="settings.html">изменить</a>' : '') + '</div>' +
        infoBlock() +
        '<div class="block" id="wall_form_box"></div>' +
        '<div class="block"><div class="block_head">Стена <span class="right">' +
        postsOf(null).length + '</span></div><div class="block_body tight" id="wall"></div></div>');

      wallForm($('#wall_form_box'), {
        onSubmit: function (text, att) {
          S.posts.push({
            id: store.nextId('post'), group_id: null, text: text, att: att,
            likes: 0, liked: false, comments: [], pinned: false, created_at: ui.now(),
          });
        },
        after: drawWall,
      });
      drawWall();
      bindPostActions($('#wall'), drawWall);
    });

    function drawWall() { renderPosts($('#wall'), postsOf(null), 'Записей пока нет.'); }

    function photosBlock() {
      var list = S.photos.slice().sort(function (a, b) { return b.created_at - a.created_at; }).slice(0, 6);
      if (!list.length) return '';
      return '<div class="block" style="margin-top:10px"><div class="block_head">Фотографии ' +
        '<span class="right"><a href="photos.html">' + S.photos.length + '</a></span></div>' +
        '<div class="block_body">' + list.map(function (p) {
          return '<div class="photo_item"><a href="photo.html?id=' + p.id + '"><img src="' +
            esc(store.url(p.thumb)) + '" width="55" height="55" alt=""></a></div>';
        }).join('') + '<div class="clear"></div></div></div>';
    }

    function infoBlock() {
      var rows = [];
      var add = function (label, value) {
        if (value) rows.push('<tr><td class="label">' + label + '</td><td>' + value + '</td></tr>');
      };
      add('День рождения:', esc(ui.formatBday(u.bday)));
      add('Город:', esc(u.city));
      add('Родной город:', esc(u.hometown));
      add('Семейное положение:', esc(u.relationship));
      add('Полит. взгляды:', esc(u.politics));
      add('Мировоззрение:', esc(u.worldview));
      add('Короткий адрес:', '<span class="gray">/' + esc(u.login) + '</span>');

      var personal = ['activity', 'interests', 'music', 'films', 'tv', 'books', 'games', 'quotes', 'about'];
      var labels = {
        activity: 'Деятельность:', interests: 'Интересы:', music: 'Любимая музыка:',
        films: 'Любимые фильмы:', tv: 'Любимые телешоу:', books: 'Любимые книги:',
        games: 'Любимые игры:', quotes: 'Любимые цитаты:', about: 'О себе:',
      };
      if (personal.some(function (k) { return u[k]; })) {
        rows.push('<tr class="section"><td colspan="2">Личная информация</td></tr>');
        personal.forEach(function (k) { add(labels[k], ui.text2html(u[k])); });
      }

      return '<div class="block"><div class="block_head">Основная информация</div><div class="block_body">' +
        '<table class="pinfo">' + rows.join('') + '</table>' +
        '<div class="counters">' +
        '<a href="photos.html"><b>' + S.photos.length + '</b> ' +
        ui.plural(S.photos.length, 'фотография', 'фотографии', 'фотографий') + '</a>' +
        '<a href="video.html"><b>' + S.videos.length + '</b> ' +
        ui.plural(S.videos.length, 'видеозапись', 'видеозаписи', 'видеозаписей') + '</a>' +
        '<a href="audio.html"><b>' + S.audios.length + '</b> ' +
        ui.plural(S.audios.length, 'аудиозапись', 'аудиозаписи', 'аудиозаписей') + '</a>' +
        '<a href="groups.html"><b>' + S.groups.length + '</b> ' +
        ui.plural(S.groups.length, 'группа', 'группы', 'групп') + '</a>' +
        '<a href="docs.html"><b>' + S.docs.length + '</b> ' +
        ui.plural(S.docs.length, 'документ', 'документа', 'документов') + '</a>' +
        '</div></div></div>';
    }
  };

  /* --- новости ----------------------------------------------------------- */

  PAGES.feed = function () {
    var all = S.posts.slice().sort(function (a, b) { return b.created_at - a.created_at; });
    wallForm($('#wall_form_box'), {
      onSubmit: function (text, att) {
        S.posts.push({
          id: store.nextId('post'), group_id: null, text: text, att: att,
          likes: 0, liked: false, comments: [], pinned: false, created_at: ui.now(),
        });
      },
      after: draw,
    });
    draw();
    bindPostActions($('#feed_list'), draw);

    function draw() {
      var list = S.posts.slice().sort(function (a, b) { return b.created_at - a.created_at; });
      renderPosts($('#feed_list'), list, 'Здесь появятся записи со страницы и из групп.');
      var c = $('#feed_count');
      if (c) c.textContent = list.length;
    }
  };

  /* --- заметки (мои сообщения) ------------------------------------------- */

  PAGES.im = function () {
    draw();
    wallForm($('#note_form_box'), {
      placeholder: 'Заметка себе… (Ctrl+Enter — отправить)',
      onSubmit: function (text, att) {
        S.notes.push({ id: store.nextId('note'), text: text, att: att, created_at: ui.now() });
      },
      after: draw,
    });

    $('#chat').addEventListener('click', function (e) {
      var el = e.target.closest('[data-del-note]');
      if (!el || !owner) return;
      if (!confirmed('Удалить заметку?')) return;
      var id = parseInt(el.dataset.delNote, 10);
      S.notes = S.notes.filter(function (n) { return n.id !== id; });
      save(); draw();
    });

    function draw() {
      var box = $('#chat');
      var list = S.notes.slice().sort(function (a, b) { return a.created_at - b.created_at; });
      if (!list.length) {
        html(box, '<div class="empty">Пока пусто. Сюда удобно складывать ссылки, файлы и мысли.</div>');
        return;
      }
      var paths = [];
      list.forEach(function (n) { paths = paths.concat(ui.attachPaths(n.att)); });
      if (S.user.avatar) paths.push(S.user.avatar);
      store.preload(paths).then(function () {
        html(box, list.map(function (n) {
          return '<div class="msg"><div class="ava"><img src="' + esc(ui.avatar(S.user, true)) +
            '" width="36" height="36" alt=""></div><div class="body">' +
            (owner ? '<span class="msg_acts"><button class="link_btn gray small_act" data-del-note="' +
              n.id + '">удалить</button></span>' : '') +
            '<span class="author">' + esc(ui.fullName(S.user)) + '</span>' +
            '<span class="date">' + ui.vkDate(n.created_at) + '</span>' +
            '<div class="mtext">' + ui.text2html(n.text) + '</div>' +
            ui.attachmentsHtml(n.att) + '</div></div>';
        }).join(''));
        box.scrollTop = box.scrollHeight;
      });
    }
  };

  /* --- мои ответы -------------------------------------------------------- */

  PAGES.notifications = function () {
    var items = [];
    S.posts.forEach(function (p) {
      p.comments.forEach(function (c) {
        items.push({ ts: c.created_at, text: 'комментарий к записи', body: c.text, href: 'index.html#post' + p.id });
      });
      if (p.likes) items.push({ ts: p.created_at, text: 'отметка «мне нравится» на записи', body: p.text, href: 'index.html#post' + p.id });
    });
    S.photos.forEach(function (p) {
      (p.comments || []).forEach(function (c) {
        items.push({ ts: c.created_at, text: 'комментарий к фотографии', body: c.text, href: 'photo.html?id=' + p.id });
      });
    });
    items.sort(function (a, b) { return b.ts - a.ts; });

    var box = $('#notif_list');
    if (!items.length) {
      html(box, '<div class="empty" style="padding:10px">Пока ничего нет.</div>');
      return;
    }
    store.preload(S.user.avatar ? [S.user.avatar] : []).then(function () {
      html(box, items.slice(0, 50).map(function (n) {
        return '<div class="notif"><div class="ava"><img src="' + esc(ui.avatar(S.user, true)) +
          '" width="36" height="36" alt=""></div><div class="body">' +
          '<a class="author" href="' + n.href + '">' + esc(ui.fullName(S.user)) + '</a> ' + esc(n.text) +
          '<span class="date">' + ui.vkDate(n.ts) + '</span>' +
          '<div class="gray">' + esc(String(n.body || '').slice(0, 120)) + '</div></div></div>';
      }).join(''));
    });
  };

  /* --- фотографии -------------------------------------------------------- */

  PAGES.photos = function () {
    if (owner) {
      $('#photos_actions').hidden = false;
      $('#album_add').addEventListener('click', function () {
        var title = prompt('Название альбома:', 'Новый альбом');
        if (!title) return;
        S.albums.push({ id: store.nextId('album'), title: title.trim().slice(0, 60), description: '', created_at: ui.now() });
        save(); draw();
      });
      $('#photo_files').addEventListener('change', function (e) {
        upload(e.target.files, 1);
        e.target.value = '';
      });
    }
    draw();

    function upload(files, album) {
      notice('Загружаю…');
      ui.ingest(files, { album: album }).then(function (res) {
        save();
        if (res.skipped.length) fail('Не приняты: ' + res.skipped.join('; '));
        else notice('Готово.');
        draw();
      });
    }

    function draw() {
      var box = $('#albums');
      if (!S.albums.length) { html(box, '<div class="empty">Альбомов пока нет.</div>'); return; }
      var covers = S.albums.map(function (a) {
        var inside = S.photos.filter(function (p) { return p.album_id === a.id; });
        return { album: a, count: inside.length, cover: inside.length ? inside[inside.length - 1].thumb : null };
      });
      store.preload(covers.map(function (c) { return c.cover; })).then(function () {
        html(box, covers.map(function (c) {
          return '<div class="album_item"><a href="album.html?id=' + c.album.id + '">' +
            '<img src="' + esc(c.cover ? store.url(c.cover) : ui.PLACEHOLDER.user) + '" width="140" height="105" alt=""></a>' +
            '<div class="t"><a href="album.html?id=' + c.album.id + '">' + esc(c.album.title) + '</a></div>' +
            '<div class="c">' + ui.pluralCount(c.count, 'фотография', 'фотографии', 'фотографий') + '</div></div>';
        }).join('') + '<div class="clear"></div>');
      });
    }
  };

  PAGES.album = function () {
    var id = parseInt(param('id'), 10) || 1;
    var album = ui.byId(S.albums, id);
    if (!album) { html($('#album_body'), '<div class="empty">Такого альбома нет.</div>'); return; }

    $('#album_title').textContent = album.title;
    document.title = album.title + ' | ВОнлайне';
    if (owner) {
      $('#album_actions').hidden = false;
      $('#album_files').addEventListener('change', function (e) {
        notice('Загружаю…');
        ui.ingest(e.target.files, { album: album.id }).then(function (res) {
          save();
          if (res.skipped.length) fail('Не приняты: ' + res.skipped.join('; '));
          else notice('Готово.');
          e.target.value = '';
          draw();
        });
      });
      $('#album_del').addEventListener('click', function () {
        if (album.id === 1) return fail('Основной альбом удалить нельзя.');
        if (!confirmed('Удалить альбом вместе с фотографиями?')) return;
        S.photos.filter(function (p) { return p.album_id === album.id; })
          .forEach(function (p) { store.deleteFile(p.file); store.deleteFile(p.thumb); });
        S.photos = S.photos.filter(function (p) { return p.album_id !== album.id; });
        S.albums = S.albums.filter(function (a) { return a.id !== album.id; });
        save();
        location.href = 'photos.html';
      });
    }
    draw();

    function draw() {
      var list = S.photos.filter(function (p) { return p.album_id === album.id; })
        .sort(function (a, b) { return b.created_at - a.created_at; });
      $('#album_count').textContent = list.length;
      var box = $('#album_body');
      if (!list.length) { html(box, '<div class="empty">В альбоме пока нет фотографий.</div>'); return; }
      store.preload(list.map(function (p) { return p.thumb; })).then(function () {
        html(box, list.map(function (p) {
          return '<div class="photo_item"><a href="photo.html?id=' + p.id + '">' +
            '<img src="' + esc(store.url(p.thumb)) + '" width="110" alt=""></a></div>';
        }).join('') + '<div class="clear"></div>');
      });
    }
  };

  PAGES.photo = function () {
    var id = parseInt(param('id'), 10);
    var photo = ui.byId(S.photos, id);
    if (!photo) { html($('#photo_box'), '<div class="empty">Такой фотографии нет.</div>'); return; }

    var siblings = S.photos.filter(function (p) { return p.album_id === photo.album_id; })
      .sort(function (a, b) { return a.created_at - b.created_at; });
    var index = siblings.findIndex(function (p) { return p.id === photo.id; });
    var prev = index > 0 ? siblings[index - 1] : null;
    var next = index < siblings.length - 1 ? siblings[index + 1] : null;
    var album = ui.byId(S.albums, photo.album_id);
    if (album) {
      var link = $('#photo_album');
      link.textContent = album.title;
      link.href = 'album.html?id=' + album.id;
    }

    draw();
    $('#photo_box').addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (!el || !owner) return;
      e.preventDefault();
      var act = el.dataset.act;
      if (act === 'like') {
        photo.liked = !photo.liked;
        photo.likes = Math.max(0, (photo.likes || 0) + (photo.liked ? 1 : -1));
        save(); draw();
      } else if (act === 'avatar') {
        S.user.avatar = photo.file;
        save();
        notice('Теперь это фотография страницы.');
      } else if (act === 'del') {
        if (!confirmed('Удалить фотографию?')) return;
        store.deleteFile(photo.file); store.deleteFile(photo.thumb);
        S.photos = S.photos.filter(function (p) { return p.id !== photo.id; });
        S.posts.forEach(function (p) {
          p.att = (p.att || []).filter(function (a) { return !(a.kind === 'photo' && a.id === photo.id); });
        });
        save();
        location.href = album ? 'album.html?id=' + album.id : 'photos.html';
      } else if (act === 'comment') {
        var area = $('#photo_comment');
        var text = area.value.trim();
        if (!text) return;
        photo.comments = photo.comments || [];
        photo.comments.push({ id: store.nextId('comment'), text: text, created_at: ui.now() });
        save(); draw();
      } else if (act === 'del-comment') {
        var cid = parseInt(el.dataset.cid, 10);
        photo.comments = (photo.comments || []).filter(function (c) { return c.id !== cid; });
        save(); draw();
      }
    });

    function draw() {
      store.preload([photo.file, S.user.avatar]).then(function () {
        var comments = photo.comments || [];
        html($('#photo_box'),
          '<div id="photo_view"><img src="' + esc(store.url(photo.file)) + '" alt=""></div>' +
          '<div class="photo_nav">' +
          '<span class="right">' +
          (prev ? '<a href="photo.html?id=' + prev.id + '">&larr; Предыдущая</a>' : '') +
          (prev && next ? ' &middot; ' : '') +
          (next ? '<a href="photo.html?id=' + next.id + '">Следующая &rarr;</a>' : '') + '</span>' +
          (owner ?
            '<a href="#" class="like_link' + (photo.liked ? ' liked' : '') + '" data-act="like">' +
            (photo.liked ? 'Мне не нравится' : 'Мне нравится') + (photo.likes ? ' (' + photo.likes + ')' : '') + '</a> ' +
            '<a href="#" data-act="avatar">Сделать фотографией страницы</a> ' +
            '<a href="#" data-act="del">Удалить</a>' :
            '<span class="gray">' + (photo.likes ? 'Нравится: ' + photo.likes : '') + '</span>') +
          '<div class="clear"></div></div>' +
          '<div class="block_head">Комментарии <span class="right">' + comments.length + '</span></div>' +
          '<div class="block_body">' +
          (comments.length ? comments.map(function (c) {
            return '<div class="reply"><div class="ava"><img src="' + esc(ui.avatar(S.user, true)) +
              '" width="32" height="32" alt=""></div><div class="body">' +
              '<span class="author">' + esc(ui.fullName(S.user)) + '</span>' +
              '<span class="date">' + ui.vkDate(c.created_at) + '</span>' +
              (owner ? ' <button class="link_btn gray" data-act="del-comment" data-cid="' + c.id + '">удалить</button>' : '') +
              '<div>' + ui.text2html(c.text) + '</div></div></div>';
          }).join('') : '<div class="gray">Комментариев пока нет.</div>') +
          (owner ? '<div style="padding-top:6px"><textarea class="text wide" id="photo_comment" ' +
            'placeholder="Ваш комментарий..." style="height:40px"></textarea>' +
            '<div style="padding-top:4px"><button class="button" data-act="comment">Отправить</button></div></div>' : '') +
          '</div>');
      });
    }
  };

  /* --- видео, музыка, документы ------------------------------------------ */

  PAGES.video = function () {
    mediaPage({
      list: function () { return S.videos; },
      input: '#video_files',
      box: '#video_list',
      empty: 'Видеозаписей пока нет.',
      render: function (v) {
        return '<div class="video_item"><a href="' + esc(store.url(v.file)) + '" target="_blank">' +
          '<video src="' + esc(store.url(v.file)) + '" preload="metadata" width="150" style="width:150px"></video>' +
          (v.duration ? '<span class="vdur">' + ui.duration(v.duration) + '</span>' : '') + '</a>' +
          '<div class="t">' + esc(v.title) + '</div>' +
          '<div class="c gray">' + ui.size(v.size) + ' &middot; ' + ui.vkDate(v.created_at) + '</div>' +
          (owner ? '<button class="link_btn gray small_act" data-del="' + v.id + '">удалить</button>' : '') +
          '</div>';
      },
      after: '<div class="clear"></div>',
      remove: function (id) {
        var item = ui.byId(S.videos, id);
        if (item) store.deleteFile(item.file);
        S.videos = S.videos.filter(function (v) { return v.id !== id; });
        S.posts.concat(S.notes).forEach(function (p) {
          p.att = (p.att || []).filter(function (a) { return !(a.kind === 'video' && a.id === id); });
        });
      },
    });
  };

  PAGES.audio = function () {
    mediaPage({
      list: function () { return S.audios; },
      input: '#audio_files',
      box: '#audio_list',
      empty: 'Аудиозаписей пока нет.',
      render: function (s) {
        return '<div class="audio_row">' +
          (owner ? '<span class="acts"><button class="link_btn gray small_act" data-del="' + s.id + '">удалить</button></span>' : '') +
          '<div class="att_audio_ttl"><b>' + esc(s.artist) + '</b> &ndash; ' + esc(s.title) +
          (s.duration ? ' <span class="gray small">' + ui.duration(s.duration) + '</span>' : '') + '</div>' +
          '<audio controls preload="none" src="' + esc(store.url(s.file)) + '"></audio></div>';
      },
      remove: function (id) {
        var item = ui.byId(S.audios, id);
        if (item) store.deleteFile(item.file);
        S.audios = S.audios.filter(function (a) { return a.id !== id; });
        S.posts.concat(S.notes).forEach(function (p) {
          p.att = (p.att || []).filter(function (a) { return !((a.kind === 'audio' || a.kind === 'voice') && a.id === id); });
        });
      },
    });
  };

  PAGES.docs = function () {
    mediaPage({
      list: function () { return S.docs; },
      input: '#doc_files',
      box: '#doc_list',
      empty: 'Документов пока нет.',
      render: function (d) {
        return '<div class="doc_row">' +
          (owner ? '<span class="acts"><button class="link_btn gray small_act" data-del="' + d.id + '">удалить</button></span>' : '') +
          '<a href="' + esc(store.url(d.file)) + '" download="' + esc(d.name) + '">' + esc(d.name) + '</a>' +
          '<div class="gray small">' + d.ext.toUpperCase() + ' &middot; ' + ui.size(d.size) +
          ' &middot; ' + ui.vkDate(d.created_at) + '</div></div>';
      },
      remove: function (id) {
        var item = ui.byId(S.docs, id);
        if (item) store.deleteFile(item.file);
        S.docs = S.docs.filter(function (d) { return d.id !== id; });
        S.posts.concat(S.notes).forEach(function (p) {
          p.att = (p.att || []).filter(function (a) { return !(a.kind === 'doc' && a.id === id); });
        });
      },
    });
  };

  function mediaPage(cfg) {
    if (owner) {
      var box = $('#upload_box');
      if (box) box.hidden = false;
      var input = $(cfg.input);
      if (input) input.addEventListener('change', function (e) {
        notice('Загружаю…');
        ui.ingest(e.target.files, {}).then(function (res) {
          save();
          if (res.skipped.length) fail('Не приняты: ' + res.skipped.join('; '));
          else notice('Готово.');
          e.target.value = '';
          draw();
        });
      });
    }
    draw();
    var listBox = $(cfg.box);
    listBox.addEventListener('click', function (e) {
      var el = e.target.closest('[data-del]');
      if (!el || !owner) return;
      if (!confirmed('Удалить?')) return;
      cfg.remove(parseInt(el.dataset.del, 10));
      save(); draw();
    });

    function draw() {
      var list = cfg.list().slice().sort(function (a, b) { return b.created_at - a.created_at; });
      var count = $(cfg.box + '_count') || $('#list_count');
      if (count) count.textContent = list.length;
      if (!list.length) { html(listBox, '<div class="empty" style="padding:10px">' + esc(cfg.empty) + '</div>'); return; }
      store.preload(list.map(function (i) { return i.file; })).then(function () {
        html(listBox, list.map(cfg.render).join('') + (cfg.after || ''));
      });
    }
  }

  /* --- группы ------------------------------------------------------------ */

  PAGES.groups = function () {
    if (owner) {
      $('#groups_actions').hidden = false;
      $('#group_add').addEventListener('click', function () {
        var name = prompt('Название группы:', '');
        if (!name || !name.trim()) return;
        S.groups.push({
          id: store.nextId('group'), name: name.trim().slice(0, 80),
          description: '', avatar: null, created_at: ui.now(),
        });
        save(); draw();
      });
    }
    draw();

    function draw() {
      var box = $('#group_list');
      $('#groups_count').textContent = S.groups.length;
      if (!S.groups.length) {
        html(box, '<div class="empty" style="padding:10px">Групп пока нет.</div>');
        return;
      }
      store.preload(S.groups.map(function (g) { return g.avatar; })).then(function () {
        html(box, S.groups.map(function (g) {
          var posts = S.posts.filter(function (p) { return p.group_id === g.id; }).length;
          return '<div class="group_row"><div class="ava"><a href="group.html?id=' + g.id + '">' +
            '<img src="' + esc(ui.groupAvatar(g)) + '" width="60" height="60" alt=""></a></div>' +
            '<div class="body"><div class="name"><a href="group.html?id=' + g.id + '">' + esc(g.name) + '</a></div>' +
            '<div class="gray">' + ui.pluralCount(posts, 'запись', 'записи', 'записей') + '</div>' +
            (g.description ? '<div>' + esc(g.description.slice(0, 140)) + '</div>' : '') +
            '</div><div class="clear"></div></div>';
        }).join(''));
      });
    }
  };

  PAGES.group = function () {
    var id = parseInt(param('id'), 10);
    var group = ui.byId(S.groups, id);
    if (!group) { html($('#profile_right'), '<div class="empty">Такой группы нет.</div>'); return; }
    document.title = group.name + ' | ВОнлайне';
    $('#group_title').textContent = group.name;

    store.preload([group.avatar]).then(function () {
      html($('#profile_left'),
        '<img class="pavatar" src="' + esc(ui.groupAvatar(group)) + '" width="200" alt="">' +
        (owner ? '<div class="profile_actions">' +
          '<a href="#" id="group_rename">Переименовать</a>' +
          '<a href="#" id="group_about">Описание</a>' +
          '<a href="#" id="group_ava">Загрузить аватар</a>' +
          '<a href="#" id="group_del">Удалить группу</a>' +
          '</div><input type="file" id="group_ava_file" accept="image/*" hidden>' : ''));

      html($('#profile_right'),
        '<div class="pname">' + esc(group.name) + '</div>' +
        '<div class="pstatus">' + esc(group.description || '') + '</div>' +
        '<div class="block" id="group_form_box"></div>' +
        '<div class="block"><div class="block_head">Стена <span class="right" id="group_count"></span></div>' +
        '<div class="block_body tight" id="group_wall"></div></div>');

      if (owner) {
        $('#group_rename').addEventListener('click', function (e) {
          e.preventDefault();
          var name = prompt('Название группы:', group.name);
          if (!name || !name.trim()) return;
          group.name = name.trim().slice(0, 80);
          save(); location.reload();
        });
        $('#group_about').addEventListener('click', function (e) {
          e.preventDefault();
          var about = prompt('Описание группы:', group.description || '');
          if (about === null) return;
          group.description = about.trim().slice(0, 500);
          save(); location.reload();
        });
        $('#group_ava').addEventListener('click', function (e) {
          e.preventDefault();
          $('#group_ava_file').click();
        });
        $('#group_ava_file').addEventListener('change', function (e) {
          var file = e.target.files[0];
          if (!file) return;
          ui.prepareImage(file).then(function (img) {
            var path = 'uploads/avatars/' + ui.rnd() + '.jpg';
            return store.putFile(path, img.blob).then(function () {
              if (group.avatar) store.deleteFile(group.avatar);
              group.avatar = path;
              save(); location.reload();
            });
          }).catch(function () { fail('Не получилось прочитать картинку.'); });
        });
        $('#group_del').addEventListener('click', function (e) {
          e.preventDefault();
          if (!confirmed('Удалить группу вместе с её записями?')) return;
          S.posts = S.posts.filter(function (p) { return p.group_id !== group.id; });
          if (group.avatar) store.deleteFile(group.avatar);
          S.groups = S.groups.filter(function (g) { return g.id !== group.id; });
          save();
          location.href = 'groups.html';
        });
      }

      wallForm($('#group_form_box'), {
        placeholder: 'Что нового в группе?',
        onSubmit: function (text, att) {
          S.posts.push({
            id: store.nextId('post'), group_id: group.id, text: text, att: att,
            likes: 0, liked: false, comments: [], pinned: false, created_at: ui.now(),
          });
        },
        after: draw,
      });
      draw();
      bindPostActions($('#group_wall'), draw);
    });

    function draw() {
      var list = postsOf(group.id);
      var c = $('#group_count');
      if (c) c.textContent = list.length;
      renderPosts($('#group_wall'), list, 'В группе пока пусто.');
    }
  };

  /* --- люди сети ---------------------------------------------------------- */

  PAGES.people = function () {
    var box = $('#people_list');
    if (!VO.rc.enabled) {
      html(box, '<div class="empty">Список участников показывает сеть RetroCore. ' +
        'Связь с сетью выключена в <b>js/config.js</b> — включите там <b>retrocore: true</b>, ' +
        'если сайт лежит в самой сети.</div>');
      return;
    }

    $('#people_form').addEventListener('submit', function (e) { e.preventDefault(); draw(); });
    $('#people_online').addEventListener('change', draw);
    draw();

    function draw() {
      var params = {};
      var q = $('#people_q').value.trim();
      if (q) params.q = q;
      if ($('#people_online').checked) params.online = true;
      html(box, '<div class="empty">Спрашиваю у сети…</div>');

      VO.rc.users(params).then(function (list) {
        $('#people_count').textContent = list.length;
        if (!list.length) {
          html(box, '<div class="empty">Никого не нашлось.</div>');
          return;
        }
        html(box, list.map(function (p) {
          var name = esc(p.title || p.username || '');
          var link = p.profile_url || VO.rc.profileUrl(p.username) || '#';
          return '<div class="people_row">' +
            '<div class="ava"><a href="' + esc(link) + '" rel="noopener" target="_blank">' +
            '<img src="' + esc(p.avatar_url || ui.PLACEHOLDER.user) + '" width="60" height="60" alt=""></a></div>' +
            '<div class="body"><div class="name">' +
            '<a href="' + esc(link) + '" rel="noopener" target="_blank">' + name + '</a>' +
            (p.status === 'online' ? ' <span class="online_dot" title="на сайте">&#9679;</span>' : '') +
            '</div>' +
            '<div class="info">' + esc(p.role_name || p.role || '') +
            (p.status_msg ? ' &middot; ' + esc(p.status_msg) : '') + '</div>' +
            '</div><div class="clear"></div></div>';
        }).join(''));
      });
    }
  };

  /* --- поиск ------------------------------------------------------------- */

  PAGES.search = function () {
    var input = $('#search_q');
    var q = (param('q') || '').trim();
    input.value = q;
    $('#search_form').addEventListener('submit', function (e) {
      e.preventDefault();
      location.href = 'search.html?q=' + encodeURIComponent(input.value.trim());
    });
    if (!q) { html($('#search_results'), '<div class="empty">Введите, что искать.</div>'); return; }

    var needle = q.toLowerCase().replace(/^#/, '');
    var found = [];
    var hit = function (text) { return String(text || '').toLowerCase().indexOf(needle) !== -1; };

    S.posts.forEach(function (p) {
      if (hit(p.text)) found.push({
        title: p.group_id ? 'Запись в группе' : 'Запись на стене',
        body: p.text, href: p.group_id ? 'group.html?id=' + p.group_id : 'index.html#post' + p.id,
        ts: p.created_at,
      });
      p.comments.forEach(function (c) {
        if (hit(c.text)) found.push({ title: 'Комментарий', body: c.text, href: 'index.html#post' + p.id, ts: c.created_at });
      });
    });
    S.notes.forEach(function (n) {
      if (hit(n.text)) found.push({ title: 'Заметка', body: n.text, href: 'im.html', ts: n.created_at });
    });
    S.photos.forEach(function (p) {
      if (hit(p.description)) found.push({ title: 'Фотография', body: p.description, href: 'photo.html?id=' + p.id, ts: p.created_at });
    });
    S.groups.forEach(function (g) {
      if (hit(g.name) || hit(g.description)) found.push({ title: 'Группа', body: g.name, href: 'group.html?id=' + g.id, ts: g.created_at });
    });
    S.docs.forEach(function (d) {
      if (hit(d.name)) found.push({ title: 'Документ', body: d.name, href: 'docs.html', ts: d.created_at });
    });
    S.audios.forEach(function (a) {
      if (hit(a.artist) || hit(a.title)) found.push({ title: 'Аудиозапись', body: a.artist + ' — ' + a.title, href: 'audio.html', ts: a.created_at });
    });
    S.videos.forEach(function (v) {
      if (hit(v.title)) found.push({ title: 'Видеозапись', body: v.title, href: 'video.html', ts: v.created_at });
    });

    found.sort(function (a, b) { return b.ts - a.ts; });
    $('#search_count').textContent = found.length;
    if (!found.length) {
      html($('#search_results'), '<div class="empty" style="padding:10px">Ничего не нашлось.</div>');
      return;
    }
    html($('#search_results'), found.map(function (f) {
      return '<div class="people_row"><div class="body" style="margin-left:0">' +
        '<div class="name"><a href="' + f.href + '">' + esc(f.title) + '</a>' +
        '<span class="date gray small"> ' + ui.vkDate(f.ts) + '</span></div>' +
        '<div class="gray">' + esc(String(f.body || '').slice(0, 160)) + '</div></div></div>';
    }).join(''));
  };

  /* --- настройки --------------------------------------------------------- */

  PAGES.settings = function () {
    var form = $('#profile_form');
    if (!owner) {
      html($('#settings_body'),
        '<div class="empty" style="padding:10px">Настройки открыты только владельцу страницы.' +
        '<div class="gray" style="padding-top:6px">Если это Ваша страница — нажмите «это моя страница» ' +
        'в самом низу, и правки заработают в этом браузере.</div></div>');
      return;
    }
    $('#settings_body').hidden = false;

    var u = S.user;
    $$('[data-field]', form).forEach(function (el) {
      el.value = u[el.dataset.field] == null ? '' : u[el.dataset.field];
    });

    store.preload([u.avatar]).then(function () {
      $('#settings_avatar').src = ui.avatar(u);
    });

    var ownerField = $('#owner_rc');
    if (ownerField) ownerField.value = (S.owner && S.owner.rc_username) || '';

    $('#avatar_file').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      ui.prepareImage(file).then(function (img) {
        var path = 'uploads/avatars/' + ui.rnd() + '.jpg';
        var thumb = 'uploads/avatars/' + ui.rnd() + '_s.jpg';
        return Promise.all([store.putFile(path, img.blob), store.putFile(thumb, img.thumb)]).then(function () {
          if (u.avatar) store.deleteFile(u.avatar);
          u.avatar = path;
          save();
          return store.preload([path]);
        });
      }).then(function () {
        $('#settings_avatar').src = ui.avatar(u);
        notice('Фотография обновлена.');
      }).catch(function () { fail('Не получилось прочитать картинку.'); });
    });

    $('#avatar_del').addEventListener('click', function () {
      if (!u.avatar) return;
      if (!confirmed('Удалить фотографию страницы?')) return;
      store.deleteFile(u.avatar);
      u.avatar = null;
      save();
      $('#settings_avatar').src = ui.avatar(u);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      $$('[data-field]', form).forEach(function (el) {
        u[el.dataset.field] = el.value.trim().slice(0, el.dataset.field === 'about' ? 2000 : 500);
      });
      if (ownerField) {
        S.owner = S.owner || {};
        S.owner.rc_username = ownerField.value.trim().slice(0, 40);
      }
      if (!u.first_name) u.first_name = 'Владислав';
      u.login = (u.login || 'me').replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'me';
      save();
      $$('.js_me_name').forEach(function (el) { el.textContent = ui.fullName(u); });
      notice('Сохранено.');
    });

    // -------- оформление
    var themeBox = $('#theme_list');
    html(themeBox, Object.keys(THEMES).map(function (key) {
      return '<label class="theme_option"><input type="radio" name="theme" value="' + key + '"' +
        (u.theme === key ? ' checked' : '') + '> <b>' + THEMES[key].title + '</b> ' +
        '<span class="gray">' + THEMES[key].hint + '</span></label>';
    }).join(''));
    themeBox.addEventListener('change', function (e) {
      if (e.target.name === 'theme') setTheme(e.target.value);
    });

    $$('.color_pick').forEach(function (input) {
      input.value = u.neon[input.dataset.key];
      input.addEventListener('input', function () {
        u.neon[input.dataset.key] = hex(input.value);
        $('#' + input.dataset.key + '_val').textContent = input.value;
        applyTheme();
      });
      input.addEventListener('change', function () { save(); });
    });

    html($('#presets'), PRESETS.map(function (p) {
      return '<button class="button button_small preset_btn" type="button" data-preset="' + p.id + '">' +
        '<span class="preset_dot" style="background:' + p.c1 + '"></span>' +
        '<span class="preset_dot" style="background:' + p.c2 + '"></span> ' + p.title + '</button> ';
    }).join(''));
    $('#presets').addEventListener('click', function (e) {
      var el = e.target.closest('[data-preset]');
      if (!el) return;
      var p = PRESETS.filter(function (x) { return x.id === el.dataset.preset; })[0];
      if (!p) return;
      u.neon = { c1: p.c1, c2: p.c2, bg: p.bg };
      u.theme = 'neon';
      save();
      $$('.color_pick').forEach(function (input) {
        input.value = u.neon[input.dataset.key];
        $('#' + input.dataset.key + '_val').textContent = input.value;
      });
      setTheme('neon');
      var radio = $('input[name=theme][value=neon]', themeBox);
      if (radio) radio.checked = true;
    });

    // -------- архив сайта
    $('#export_zip').addEventListener('click', exportZip);
    $('#export_json').addEventListener('click', function () {
      download(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), 'vonline-data.json');
    });
    $('#import_json').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      file.text().then(function (text) {
        var data = JSON.parse(text);
        S = store.normalize(data);
        window.VO.state = S;
        localStorage.setItem('vo.state', JSON.stringify(S));
        location.reload();
      }).catch(function () { fail('Это не похоже на файл с данными сайта.'); });
    });
    $('#wipe').addEventListener('click', function () {
      if (!confirmed('Стереть всё, что сохранено в этом браузере? Опубликованная версия сайта останется как есть.')) return;
      store.reset().then(function () { location.href = 'index.html'; });
    });

    updateUsage();
  };

  function updateUsage() {
    var box = $('#usage');
    if (!box) return;
    store.allFiles().then(function (files) {
      var bytes = files.reduce(function (n, f) { return n + (f.blob.size || 0); }, 0);
      var text = 'файлов в браузере: ' + files.length + ', ' + ui.size(bytes);
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(function (est) {
          box.textContent = text + ' (всего браузер разрешает около ' + ui.size(est.quota || 0) + ')';
        });
      } else box.textContent = text;
    });
  }

  /** Собирает архив со всеми файлами сайта и текущими данными. */
  function exportZip() {
    var btn = $('#export_zip');
    btn.disabled = true;
    var was = btn.textContent;
    btn.textContent = 'Собираю…';

    fetch('data/files.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        return Promise.all(list.map(function (name) {
          return fetch(name, { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
            .then(function (buf) { return buf ? { name: name, data: new Uint8Array(buf) } : null; })
            .catch(function () { return null; });
        }));
      })
      .then(function (siteFiles) {
        return store.allFiles().then(function (uploads) {
          var entries = siteFiles.filter(Boolean).filter(function (f) { return f.name !== 'data/site.json'; });
          entries.push({
            name: 'data/site.json',
            data: new TextEncoder().encode(JSON.stringify(S)),
          });
          var chain = Promise.resolve();
          uploads.forEach(function (f) {
            chain = chain.then(function () {
              return f.blob.arrayBuffer().then(function (buf) {
                entries.push({ name: f.path, data: new Uint8Array(buf) });
              });
            });
          });
          return chain.then(function () { return entries; });
        });
      })
      .then(function (entries) {
        var blob = VO.zip.build(entries);
        download(blob, 'vonline-site.zip');
        btn.disabled = false;
        btn.textContent = was;
        notice('Архив готов: ' + ui.size(blob.size) + '. Его и заливайте на хостинг.');
      })
      .catch(function (e) {
        btn.disabled = false;
        btn.textContent = was;
        fail('Не получилось собрать архив: ' + (e && e.message ? e.message : 'ошибка'));
      });
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  /* ------------------------------------------------------------------ старт */

  var viewer = null;   // кто открыл страницу, по данным сети

  function start() {
    store.load().then(function (loaded) {
      S = loaded;
      window.VO.state = S;
      owner = store.isOwner();
      // Сеть говорит, кто смотрит. Если это хозяин страницы — правка включается сама.
      return VO.rc.user().then(function (who) {
        viewer = who;
        var ownerName = String((S.owner && S.owner.rc_username) || '').toLowerCase();
        if (!owner && who && ownerName && String(who.username).toLowerCase() === ownerName) {
          store.setOwner(true);
          S = store.get();
          window.VO.state = S;
          owner = true;
        }
      });
    }).then(function () {
      if (!owner) {
        try {
          var guestTheme = localStorage.getItem('vo.theme');
          if (guestTheme && THEMES[guestTheme]) S.user.theme = guestTheme;
        } catch (e) {}
      }
      document.body.classList.toggle('is_owner', owner);
      applyTheme();
      renderChrome();
      var page = document.body.dataset.page;
      if (PAGES[page]) {
        try { PAGES[page](); } catch (e) {
          fail('Страница не собралась: ' + e.message);
          if (window.console) console.error(e);
        }
      }
      // Лента меню на телефоне — подкручиваем к текущему пункту.
      var menu = $('#left_menu');
      if (menu && menu.scrollWidth > menu.clientWidth + 1) {
        var sel = $('a.sel', menu);
        if (sel) menu.scrollLeft = Math.max(0, sel.offsetLeft - (menu.clientWidth - sel.offsetWidth) / 2);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
