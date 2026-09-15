/* ВОнлайне — немного клиентского кода. В духе эпохи: ванильный JS, никаких сборщиков. */
(function () {
  'use strict';

  function post(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify(data || {}),
    }).then(function (r) { return r.json(); });
  }

  document.addEventListener('click', function (e) {
    var el = e.target;

    /* «Мне нравится» */
    if (el.classList.contains('like_link')) {
      e.preventDefault();
      post('/like', { type: el.dataset.type, id: el.dataset.id }).then(function (res) {
        if (res.error) return;
        el.classList.toggle('liked', res.liked);
        el.textContent = (res.liked ? 'Мне не нравится' : 'Мне нравится') +
          (res.count ? ' (' + res.count + ')' : '');
      });
      return;
    }

    /* Раскрыть форму комментария */
    if (el.classList.contains('reply_link')) {
      e.preventDefault();
      var form = document.getElementById('reply_form_' + el.dataset.id);
      if (form) {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
        var ta = form.querySelector('textarea');
        if (ta && form.style.display === 'block') ta.focus();
      }
      return;
    }

    /* Подтверждение удаления */
    if (el.dataset && el.dataset.confirm) {
      if (!window.confirm(el.dataset.confirm)) e.preventDefault();
    }
  });

  /* Ctrl+Enter отправляет форму — как в старом ВК */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.target.tagName === 'TEXTAREA') {
      var form = e.target.form;
      if (form) form.submit();
    }
  });

  /* Живые сообщения и счётчики */
  var body = document.body;
  if (!body || !body.dataset.uid) return;

  var chat = document.getElementById('chat');
  if (chat) chat.scrollTop = chat.scrollHeight;

  var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  var ws;
  var retry = 1000;

  function connect() {
    ws = new WebSocket(proto + location.host + '/ws');

    ws.onopen = function () { retry = 1000; };

    ws.onmessage = function (ev) {
      var data;
      try { data = JSON.parse(ev.data); } catch (err) { return; }

      if (data.kind === 'message') {
        var peer = chat && chat.dataset.peer;
        if (peer && String(data.from_id) === String(peer)) {
          appendMessage(data);
          post('/im/' + peer + '/read', {});
        } else {
          bumpCounter('menu_messages');
          notify(data.author + ': ' + data.text.slice(0, 60));
        }
      } else if (data.kind === 'friend_request') {
        bumpCounter('menu_requests');
        notify('Новая заявка в друзья: ' + data.author);
      }
    };

    ws.onclose = function () {
      retry = Math.min(retry * 2, 30000);
      setTimeout(connect, retry);
    };
  }

  function appendMessage(data) {
    var div = document.createElement('div');
    div.className = 'msg fresh';
    div.innerHTML = '<div class="ava"><img src="' + data.avatar + '" width="32" height="32" alt=""></div>' +
      '<div class="body"><a class="author" href="/id' + data.from_id + '">' + data.author + '</a>' +
      '<span class="date">только что</span><div>' + data.html + '</div></div><div class="clear"></div>';
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function bumpCounter(id) {
    var link = document.getElementById(id);
    if (!link) return;
    var cnt = link.querySelector('.cnt');
    if (!cnt) {
      cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = '0';
      link.insertBefore(cnt, link.firstChild);
    }
    cnt.textContent = String(parseInt(cnt.textContent, 10) + 1);
  }

  var titleBase = document.title;
  var notifyTimer = null;
  function notify(text) {
    document.title = '(!) ' + titleBase;
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(function () { document.title = titleBase; }, 8000);
    var bar = document.getElementById('live_notice');
    if (bar) {
      bar.textContent = text;
      bar.style.display = 'block';
      setTimeout(function () { bar.style.display = 'none'; }, 8000);
    }
  }

  connect();
})();
