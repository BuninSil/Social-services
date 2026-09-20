/* ВОнлайне — клиентская часть. Ванильный JS, ничего не собирается.
   Отвечает за лайки без перезагрузки, комментарии, подтверждения,
   Ctrl+Enter, подгрузку новых сообщений и живой выбор цветов. */
(function () {
  'use strict';

  var body = document.body;
  var CSRF = body ? body.dataset.csrf || '' : '';

  /* ---------------------------------------------------------- клики */

  document.addEventListener('click', function (e) {
    var el = e.target;

    // Лайк: отправляем и меняем надпись на месте.
    if (el.classList.contains('like_link')) {
      e.preventDefault();
      var data = new URLSearchParams();
      data.set('_csrf', CSRF);
      data.set('type', el.dataset.type);
      data.set('id', el.dataset.id);

      fetch('/like', {
        method: 'POST',
        headers: { 'X-Requested-With': 'fetch', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: data.toString(),
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (!res || res.error) return;
        el.classList.toggle('liked', res.liked);
        el.textContent = (res.liked ? 'Мне не нравится' : 'Мне нравится') +
          (res.count ? ' (' + res.count + ')' : '');
      }).catch(function () { /* не вышло — не страшно */ });
      return;
    }

    // Форма комментария разворачивается по ссылке.
    if (el.classList.contains('reply_link')) {
      e.preventDefault();
      var form = document.getElementById(el.dataset.target);
      if (!form) return;
      form.hidden = !form.hidden;
      if (!form.hidden) {
        var area = form.querySelector('textarea');
        if (area) area.focus();
      }
      return;
    }

    // Опасные действия переспрашивают.
    var confirmable = el.closest('[data-confirm]');
    if (confirmable && !window.confirm(confirmable.dataset.confirm)) {
      e.preventDefault();
    }
  });

  /* ------------------------------------------------- Ctrl+Enter в формах */

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    var area = e.target;
    if (!area || area.tagName !== 'TEXTAREA') return;
    var form = area.closest('form');
    if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
  });

  /* ------------------------------------------- новые сообщения в беседе */

  var chat = document.getElementById('chat');
  if (chat && chat.dataset.conv) {
    chat.scrollTop = chat.scrollHeight;
    var last = parseInt(chat.dataset.last, 10) || 0;
    var timer = setInterval(function () {
      if (document.hidden) return;
      fetch('/im/c' + chat.dataset.conv + '/updates?after=' + last, {
        headers: { 'X-Requested-With': 'fetch' },
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (res) {
        if (!res || !res.messages || !res.messages.length) return;
        var atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 60;
        res.messages.forEach(function (m) {
          if (m.id <= last) return;
          chat.insertAdjacentHTML('beforeend', m.html);
          last = m.id;
        });
        var empty = chat.querySelector('.empty');
        if (empty) empty.remove();
        if (atBottom) chat.scrollTop = chat.scrollHeight;
      }).catch(function () { clearInterval(timer); });
    }, 5000);
  }

  /* ------------------------------------------------ цвета неоновой темы */

  var pickers = document.querySelectorAll('.color_pick');
  if (pickers.length) {
    pickers.forEach(function (input) {
      input.addEventListener('input', function () {
        document.documentElement.style.setProperty(input.dataset.var, input.value);
        var label = input.parentNode.querySelector('.gray');
        if (label) label.textContent = input.value;
      });
    });
  }

  /* -------------------------------------------- лента меню на телефоне */

  var menu = document.getElementById('left_menu');
  if (menu && menu.scrollWidth > menu.clientWidth + 1) {
    var current = menu.querySelector('a.sel');
    if (current) {
      menu.scrollLeft = Math.max(0, current.offsetLeft - (menu.clientWidth - current.offsetWidth) / 2);
    }
  }
})();
