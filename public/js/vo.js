/* ВОнлайне — клиентская часть. Ванильный JS, никаких сборщиков.
   Отвечает за: лайки, комментарии, живые сообщения, «печатает», статус в сети,
   уведомления и запись голосовых сообщений. */
(function () {
  'use strict';

  var body = document.body;
  var CSRF = body ? body.dataset.csrf || '' : '';
  var MY_ID = body ? body.dataset.uid || '' : '';

  function postJson(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF,
        'X-Requested-With': 'fetch',
      },
      body: JSON.stringify(data || {}),
    }).then(function (r) { return r.json(); });
  }

  /* ------------------------------------------------------- клики по странице */

  document.addEventListener('click', function (e) {
    var el = e.target;

    if (el.classList.contains('like_link')) {
      e.preventDefault();
      postJson('/like', { type: el.dataset.type, id: el.dataset.id }).then(function (res) {
        if (!res || res.error) return;
        el.classList.toggle('liked', res.liked);
        el.textContent = (res.liked ? 'Мне не нравится' : 'Мне нравится') +
          (res.count ? ' (' + res.count + ')' : '');
      });
      return;
    }

    if (el.classList.contains('reply_link')) {
      e.preventDefault();
      var form = document.getElementById('reply_form_' + el.dataset.id);
      if (!form) return;
      form.hidden = false;
      var area = form.querySelector('textarea');
      if (area) {
        if (el.dataset.mention && area.value.indexOf('@' + el.dataset.mention) === -1) {
          area.value = '@' + el.dataset.mention + ', ' + area.value;
        }
        area.focus();
      }
      return;
    }

    if (el.id === 'chat_settings_link') {
      e.preventDefault();
      var panel = document.getElementById('chat_settings');
      if (panel) panel.hidden = !panel.hidden;
      return;
    }

    if (el.dataset && el.dataset.confirm && !window.confirm(el.dataset.confirm)) {
      e.preventDefault();
    }
  });

  /* Живой предпросмотр цветов неоновой темы прямо в настройках. */
  document.addEventListener('input', function (e) {
    if (!e.target.classList || !e.target.classList.contains('color_pick')) return;
    var name = e.target.dataset.var;
    if (name) document.documentElement.style.setProperty(name, e.target.value);
    var label = e.target.parentNode.querySelector('.small');
    if (label) label.textContent = e.target.value;
  });

  /* Ctrl+Enter отправляет форму — как в старом ВК */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.target.tagName === 'TEXTAREA') {
      var form = e.target.form;
      if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
    }
  });

  if (!MY_ID) return;

  /* ------------------------------------------------------------------ чат */

  var chat = document.getElementById('chat');
  var convId = chat ? chat.dataset.conv : null;
  if (chat) chat.scrollTop = chat.scrollHeight;

  var typingLine = document.getElementById('typing_line');
  var typingTimer = null;
  var lastTypingSent = 0;

  function appendMessage(data) {
    var div = document.createElement('div');
    div.className = 'msg in';
    div.id = 'msg' + data.id;
    var attachNote = data.attachments ? '<div class="gray small">вложений: ' + data.attachments + '</div>' : '';
    div.innerHTML =
      '<div class="ava"><a href="/id' + data.from_id + '"><img src="' + data.avatar +
      '" width="32" height="32" alt=""></a></div>' +
      '<div class="body"><a class="author" href="/id' + data.from_id + '"></a>' +
      '<span class="date">только что</span><div class="mtext"></div>' + attachNote +
      '</div><div class="clear"></div>';
    div.querySelector('.author').textContent = data.author;
    div.querySelector('.mtext').innerHTML = data.html || '';
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    if (data.attachments) setTimeout(function () { location.reload(); }, 600);
  }

  /* ---------------------------------------------------------- соединение */

  var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  var socket = null;
  var retry = 1000;

  function connect() {
    socket = new WebSocket(proto + location.host + '/ws');

    socket.onopen = function () { retry = 1000; };

    socket.onmessage = function (ev) {
      var data;
      try { data = JSON.parse(ev.data); } catch (err) { return; }
      handle(data);
    };

    socket.onclose = function () {
      retry = Math.min(retry * 2, 30000);
      setTimeout(connect, retry);
    };
  }

  function handle(data) {
    if (data.kind === 'message') {
      if (convId && String(data.conv_id) === String(convId)) {
        appendMessage(data);
        postJson('/im/c' + convId + '/read', {});
      } else {
        setCounter('menu_messages', data.unread);
        notice(data.conv_title + ': ' + (data.text || 'вложение').slice(0, 60), '/im/c' + data.conv_id);
      }
    } else if (data.kind === 'notification') {
      setCounter('menu_notifications', data.count);
      notice(data.text, data.url);
    } else if (data.kind === 'typing') {
      if (convId && String(data.conv_id) === String(convId) && typingLine) {
        typingLine.textContent = data.name + ' печатает...';
        typingLine.hidden = false;
        clearTimeout(typingTimer);
        typingTimer = setTimeout(function () { typingLine.hidden = true; }, 3000);
      }
    } else if (data.kind === 'presence') {
      var state = document.getElementById('peer_state');
      if (state && String(state.dataset.peer) === String(data.user_id)) {
        state.textContent = data.online ? 'сейчас на сайте' : 'только что вышел из сети';
      }
    } else if (data.kind === 'message_deleted') {
      var gone = document.getElementById('msg' + data.id);
      if (gone) gone.remove();
    } else if (data.kind === 'message_edited') {
      var edited = document.getElementById('msg' + data.id);
      if (edited && edited.querySelector('.mtext')) edited.querySelector('.mtext').innerHTML = data.html;
    }
  }

  function setCounter(id, value) {
    var link = document.getElementById(id);
    if (!link) return;
    var badge = link.querySelector('.cnt');
    if (!value) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'cnt';
      link.insertBefore(badge, link.firstChild);
    }
    badge.textContent = String(value);
  }

  var titleBase = document.title;
  var noticeTimer = null;

  function notice(text, url) {
    document.title = '(!) ' + titleBase;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { document.title = titleBase; }, 10000);

    var bar = document.getElementById('live_notice');
    if (!bar) return;
    bar.textContent = text;
    if (url) {
      var link = document.createElement('a');
      link.href = url;
      link.textContent = 'открыть';
      bar.appendChild(link);
    }
    bar.hidden = false;
    setTimeout(function () { bar.hidden = true; }, 10000);
  }

  /* --------------------------------------------------------- «печатает...» */

  var sendForm = document.getElementById('send_form');
  if (sendForm && convId) {
    var area = sendForm.querySelector('textarea');
    if (area) {
      area.addEventListener('input', function () {
        var stamp = Date.now();
        if (stamp - lastTypingSent < 1500) return;
        lastTypingSent = stamp;
        if (socket && socket.readyState === 1) {
          socket.send(JSON.stringify({ kind: 'typing', conv_id: Number(convId) }));
        }
      });
    }
  }

  /* --------------------------------------------------- голосовые сообщения */

  var voiceBox = document.getElementById('voice_box');
  var voiceBtn = document.getElementById('voice_btn');
  var voiceState = document.getElementById('voice_state');
  var recorder = null;
  var chunks = [];
  var startedAt = 0;
  var tick = null;

  if (voiceBox && voiceBtn && navigator.mediaDevices && window.MediaRecorder) {
    voiceBox.hidden = false;

    voiceBtn.addEventListener('click', function () {
      if (recorder && recorder.state === 'recording') {
        recorder.stop();
        return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        recorder = new MediaRecorder(stream);
        chunks = [];
        startedAt = Date.now();

        recorder.ondataavailable = function (e) {
          if (e.data && e.data.size) chunks.push(e.data);
        };

        recorder.onstop = function () {
          clearInterval(tick);
          stream.getTracks().forEach(function (track) { track.stop(); });
          voiceBtn.textContent = 'Записать голосовое';
          voiceState.textContent = 'отправляю...';

          var seconds = Math.round((Date.now() - startedAt) / 1000);
          var blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          var form = new FormData();
          form.append('voice', blob, 'voice.webm');
          form.append('duration', String(seconds));
          form.append('_csrf', CSRF);

          fetch('/im/c' + convId + '/voice', { method: 'POST', body: form })
            .then(function (r) { return r.json(); })
            .then(function (res) {
              if (res && res.ok) location.reload();
              else voiceState.textContent = 'не получилось отправить';
            })
            .catch(function () { voiceState.textContent = 'не получилось отправить'; });
        };

        recorder.start();
        voiceBtn.textContent = 'Остановить и отправить';
        tick = setInterval(function () {
          var seconds = Math.round((Date.now() - startedAt) / 1000);
          voiceState.textContent = 'идёт запись: ' + seconds + ' с';
          if (seconds >= 300) recorder.stop();
        }, 500);
      }).catch(function () {
        voiceState.textContent = 'нет доступа к микрофону';
      });
    });
  }

  connect();
})();
