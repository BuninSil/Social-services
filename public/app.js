/* NEONHUB — SPA на ванильном JS: hash-роутинг, без сборки и зависимостей. */

const CHANNEL_LABELS = {
  all: 'Всё подряд', general: 'Общее', code: 'Код', design: 'Дизайн',
  music: 'Музыка', science: 'Наука', random: 'Флудилка',
};
const ACCENTS = ['cyan', 'magenta', 'violet', 'lime', 'amber', 'rose'];

const state = { me: null, stats: null, sort: 'hot', channel: 'all', query: '' };

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const view = $('#view');

// --- утилиты ----------------------------------------------------------------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const accentClass = (n) => `a${Number(n) || 0}`;

function timeAgo(iso) {
  const diff = (Date.now() - Date.parse(iso)) / 1000;
  if (diff < 60) return 'только что';
  const units = [[60, 'мин'], [24, 'ч'], [7, 'д'], [4.35, 'нед'], [12, 'мес']];
  let value = diff / 60, label = 'мин';
  for (const [step, next] of units.slice(1)) {
    if (value < step) break;
    value /= step; label = next;
  }
  return `${Math.floor(value)} ${label} назад`;
}

const plural = (n, forms) => {
  const mod100 = n % 100, mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
};

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: options.body ? { 'content-type': 'application/json' } : {},
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error || `Ошибка ${res.status}`);
  return payload;
}

function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind ? `toast--${kind}` : ''}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

const avatar = (user, size = '') => `
  <div class="avatar ${size ? `avatar--${size}` : ''} ${accentClass(user?.accent)}"
       title="${esc(user?.username || '')}">${esc((user?.username || '?')[0])}</div>`;

const icon = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.7-7.5-9.6A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 7.5 2.7C19.5 15.3 12 20 12 20z"/></svg>',
  reply: '<svg viewBox="0 0 24 24"><path d="M20 15a3 3 0 0 1-3 3H8l-4 3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6"/></svg>',
  ghost: '<svg viewBox="0 0 24 24"><path d="M5 20V10a7 7 0 0 1 14 0v10l-3-2-2 2-2-2-2 2-2-2z"/><path d="M9 10h.01M15 10h.01"/></svg>',
};

// --- шапка ------------------------------------------------------------------

function renderAuthSlot() {
  const slot = $('#auth-slot');
  if (state.me) {
    slot.innerHTML = `
      <button class="btn btn--primary ${accentClass(state.me.accent)}" data-act="compose">
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span>Написать</span>
      </button>
      <button class="leader" data-act="profile" style="width:auto;padding:3px 6px">
        ${avatar(state.me)}
      </button>
      <button class="icon-btn" data-act="logout" title="Выйти">
        <svg viewBox="0 0 24 24"><path d="M15 17l5-5-5-5M20 12H9M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6"/></svg>
      </button>`;
  } else {
    slot.innerHTML = `
      <button class="btn btn--ghost" data-act="login">Войти</button>
      <button class="btn btn--primary" data-act="register"><span>Регистрация</span></button>`;
  }
}

function renderRails() {
  const s = state.stats;
  if (!s) return;

  const counts = Object.fromEntries(s.channels.map((c) => [c.name, c.posts]));
  $('#channel-list').innerHTML = Object.entries(CHANNEL_LABELS).map(([key, label], i) => `
    <li><button class="channel ${accentClass(i % 6)} ${state.channel === key ? 'is-active' : ''}"
                data-channel="${key}">
      <span class="channel__dot"></span>${esc(label)}
      <span class="channel__count">${key === 'all' ? s.posts : counts[key] ?? 0}</span>
    </button></li>`).join('');

  $('#stats-grid').innerHTML = [
    ['users', s.users, 'Юзеров', 0], ['posts', s.posts, 'Постов', 2],
    ['comments', s.comments, 'Комментов', 1], ['online', s.online, 'Онлайн', 3],
  ].map(([, value, label, a]) => `
    <div class="stat ${accentClass(a)}">
      <div class="stat__value">${value}</div>
      <div class="stat__label">${label}</div>
    </div>`).join('');

  $('#trending').innerHTML = s.trending.length
    ? s.trending.map((t) => `<button class="tag" data-tag="${esc(t.tag)}">#${esc(t.tag)}<b>${t.count}</b></button>`).join('')
    : '<p class="stat__label">пока пусто</p>';

  $('#leaders').innerHTML = s.topUsers.map((u) => `
    <li><button class="leader" data-user="${esc(u.username)}">
      ${avatar(u, 'sm')}
      <span class="leader__name">${esc(u.username)}</span>
      <span class="leader__karma">${u.karma} ♥</span>
    </button></li>`).join('');

  for (const b of document.querySelectorAll('#sort-switch button')) {
    b.classList.toggle('is-active', b.dataset.sort === state.sort);
  }
}

// --- карточки ---------------------------------------------------------------

function postCard(post, index = 0) {
  const a = accentClass(post.author?.accent);
  return `
  <article class="card post ${a}" data-post="${post.id}" style="animation-delay:${Math.min(index * 45, 360)}ms">
    <header class="post__head">
      ${avatar(post.author)}
      <div>
        <span class="post__author" data-user="${esc(post.author?.username)}">${esc(post.author?.username || 'удалён')}</span>
        <span class="post__dot">·</span>
        <span class="post__time">${timeAgo(post.createdAt)}</span>
      </div>
      <button class="post__channel" data-channel="${post.channel}">${esc(CHANNEL_LABELS[post.channel] || post.channel)}</button>
    </header>

    <h3 class="post__title" data-open="${post.id}">${esc(post.title)}</h3>
    <p class="post__body post__body--clamp">${esc(post.body)}</p>
    ${post.tags.length ? `<div class="post__tags">${post.tags.map((t) =>
      `<button class="tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}

    <footer class="post__foot">
      <button class="action ${post.liked ? 'is-on' : ''}" data-like="${post.id}">
        ${icon.heart}<span>${post.likes}</span>
      </button>
      <button class="action" data-open="${post.id}">${icon.reply}<span>${post.commentCount}</span></button>
      ${post.mine ? `<button class="action action--danger" data-delete="${post.id}" style="margin-left:auto">${icon.trash}</button>` : ''}
    </footer>
  </article>`;
}

const emptyState = (title, text) => `
  <div class="card empty">${icon.ghost}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;

const composerBar = () => state.me ? `
  <div class="card composer ${accentClass(state.me.accent)}">
    ${avatar(state.me)}
    <button class="composer__trigger" data-act="compose">Что нового, ${esc(state.me.username)}?</button>
  </div>` : `
  <div class="card composer">
    <button class="composer__trigger" data-act="register">Заведи аккаунт, чтобы писать и комментировать →</button>
  </div>`;

// --- экраны -----------------------------------------------------------------

async function renderFeed() {
  view.innerHTML = composerBar() + '<div class="skeleton"></div><div class="skeleton"></div>';

  const params = new URLSearchParams({ sort: state.sort });
  if (state.channel !== 'all') params.set('channel', state.channel);
  if (state.query) params.set('q', state.query);

  const posts = await api(`/posts?${params}`);
  const title = state.query
    ? `Поиск: <em>${esc(state.query)}</em>`
    : state.channel === 'all' ? 'Лента' : `<em>${esc(CHANNEL_LABELS[state.channel])}</em>`;

  view.innerHTML = `
    <div class="content-head">
      <h1>${title}</h1>
      <span class="content-head__meta">${posts.length} ${plural(posts.length, ['пост', 'поста', 'постов'])}</span>
    </div>
    ${composerBar()}
    ${posts.length ? posts.map(postCard).join('')
      : emptyState('Тут пусто', state.query ? 'По запросу ничего не нашлось.' : 'Будь первым, кто напишет сюда.')}`;
}

async function renderPost(id) {
  view.innerHTML = '<div class="skeleton"></div>';
  let post;
  try { post = await api(`/posts/${id}`); }
  catch (err) { view.innerHTML = emptyState('Не найдено', err.message); return; }

  const a = accentClass(post.author?.accent);
  view.innerHTML = `
    <button class="back" data-act="back">${icon.back} назад в ленту</button>

    <article class="card ${a}" data-post="${post.id}">
      <header class="post__head">
        ${avatar(post.author)}
        <div>
          <span class="post__author" data-user="${esc(post.author?.username)}">${esc(post.author?.username || 'удалён')}</span>
          <span class="post__dot">·</span>
          <span class="post__time">${timeAgo(post.createdAt)}</span>
        </div>
        <button class="post__channel" data-channel="${post.channel}">${esc(CHANNEL_LABELS[post.channel] || post.channel)}</button>
      </header>

      <h1 class="thread__title">${esc(post.title)}</h1>
      <p class="thread__body">${esc(post.body)}</p>
      ${post.tags.length ? `<div class="post__tags">${post.tags.map((t) =>
        `<button class="tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}

      <footer class="post__foot">
        <button class="action ${post.liked ? 'is-on' : ''}" data-like="${post.id}">
          ${icon.heart}<span>${post.likes}</span>
        </button>
        <span class="action">${icon.reply}<span>${post.commentCount}</span></span>
        ${post.mine ? `<button class="action action--danger" data-delete="${post.id}" style="margin-left:auto">${icon.trash}</button>` : ''}
      </footer>
    </article>

    <div class="card">
      <h2 class="panel__title">${post.commentCount} ${plural(post.commentCount, ['ответ', 'ответа', 'ответов'])}</h2>
      <div id="comment-list">
        ${post.comments.length ? post.comments.map(commentRow).join('')
          : '<p class="empty" style="padding:22px">Пока тихо. Скажи что-нибудь.</p>'}
      </div>
      ${state.me ? `
        <form id="comment-form" style="margin-top:14px">
          <textarea class="textarea" name="body" placeholder="Твой ответ…" style="min-height:84px" required></textarea>
          <div class="form-foot">
            <span class="hint">Ctrl+Enter — отправить</span>
            <button class="btn btn--primary ${accentClass(state.me.accent)}" type="submit">Ответить</button>
          </div>
        </form>`
        : `<button class="btn btn--block" data-act="login" style="margin-top:14px">Войти, чтобы ответить</button>`}
    </div>`;
}

const commentRow = (c) => `
  <div class="comment ${accentClass(c.author?.accent)}" data-comment="${c.id}">
    ${avatar(c.author, 'sm')}
    <div style="flex:1;min-width:0">
      <span class="comment__name" data-user="${esc(c.author?.username)}">${esc(c.author?.username || 'удалён')}</span>
      <span class="post__dot">·</span>
      <span class="comment__time">${timeAgo(c.createdAt)}</span>
      ${c.mine ? `<button class="action action--danger" data-delete-comment="${c.id}"
         style="float:right;padding:2px 7px">${icon.trash}</button>` : ''}
      <p class="comment__body">${esc(c.body)}</p>
    </div>
  </div>`;

async function renderProfile(username) {
  view.innerHTML = '<div class="skeleton"></div>';
  let user, posts;
  try {
    [user, posts] = await Promise.all([
      api(`/users/${encodeURIComponent(username)}`),
      api(`/posts?author=${encodeURIComponent(username)}&sort=new`),
    ]);
  } catch (err) { view.innerHTML = emptyState('Нет такого юзера', err.message); return; }

  const mine = state.me?.id === user.id;
  view.innerHTML = `
    <button class="back" data-act="back">${icon.back} назад в ленту</button>

    <section class="card profile ${accentClass(user.accent)}">
      ${avatar(user, 'lg')}
      <div style="flex:1;min-width:0">
        <h1 class="profile__name">${esc(user.username)}</h1>
        <p class="profile__bio">${esc(user.bio || 'Без описания — и так всё понятно.')}</p>
        <div class="profile__stats">
          <div class="profile__stat"><b>${user.posts}</b><span>постов</span></div>
          <div class="profile__stat"><b>${user.comments}</b><span>ответов</span></div>
          <div class="profile__stat"><b>${user.karma}</b><span>карма</span></div>
        </div>
      </div>
      ${mine ? '<button class="btn btn--sm" data-act="edit-profile">Изменить</button>' : ''}
    </section>

    <div class="content-head"><h1 style="font-size:17px">Посты</h1></div>
    ${posts.length ? posts.map(postCard).join('') : emptyState('Постов нет', 'Автор пока молчит.')}`;
}

// --- модалки ----------------------------------------------------------------

const modal = $('#modal');

function openModal(title, html) {
  $('#modal-title').innerHTML = title;
  $('#modal-body').innerHTML = html;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#modal-body').querySelector('input, textarea')?.focus(), 60);
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
}

function openAuth(mode = 'login') {
  openModal('Добро пожаловать в <em>NEONHUB</em>', `
    <div class="tabs">
      <button data-tab="login" class="${mode === 'login' ? 'is-active' : ''}">Вход</button>
      <button data-tab="register" class="${mode === 'register' ? 'is-active' : ''}">Регистрация</button>
    </div>
    <form id="auth-form" data-mode="${mode}">
      <div class="form-error" hidden></div>
      <div class="field">
        <label for="au">Ник</label>
        <input class="input" id="au" name="username" placeholder="neon" autocomplete="username" required>
      </div>
      <div class="field">
        <label for="ap">Пароль</label>
        <input class="input" id="ap" name="password" type="password" placeholder="минимум 6 символов"
               autocomplete="current-password" required>
      </div>
      <div class="field" data-only="register" ${mode === 'login' ? 'hidden' : ''}>
        <label for="ab">О себе</label>
        <input class="input" id="ab" name="bio" placeholder="пара слов, необязательно">
      </div>
      <button class="btn btn--primary btn--block" type="submit" style="margin-top:4px">
        ${mode === 'login' ? 'Войти' : 'Создать аккаунт'}
      </button>
      <p class="hint" style="margin-top:12px;text-align:center;font-size:11.5px;color:var(--text-faint)">
        Демо-доступ: <code>neon</code> / <code>demo1234</code>
      </p>
    </form>`);
}

function openComposer() {
  if (!state.me) return openAuth('login');
  openModal('Новый <em>пост</em>', `
    <form id="post-form">
      <div class="form-error" hidden></div>
      <div class="field">
        <label for="pt">Заголовок</label>
        <input class="input" id="pt" name="title" placeholder="О чём речь?" maxlength="120" required>
      </div>
      <div class="field">
        <label for="pb">Текст</label>
        <textarea class="textarea" id="pb" name="body" placeholder="Разверни мысль…" maxlength="4000" required></textarea>
      </div>
      <div class="form-row">
        <div class="field">
          <label for="pc">Раздел</label>
          <select class="select" id="pc" name="channel">
            ${Object.entries(CHANNEL_LABELS).filter(([k]) => k !== 'all')
              .map(([k, v]) => `<option value="${k}" ${k === state.channel ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="pg">Теги</label>
          <input class="input" id="pg" name="tags" placeholder="css, ui, perf">
        </div>
      </div>
      <div class="form-foot">
        <span class="hint">до 5 тегов · Ctrl+Enter</span>
        <button class="btn" type="button" data-close>Отмена</button>
        <button class="btn btn--primary ${accentClass(state.me.accent)}" type="submit">Опубликовать</button>
      </div>
    </form>`);
}

function openProfileEditor() {
  openModal('Настройки <em>профиля</em>', `
    <form id="profile-form">
      <div class="form-error" hidden></div>
      <div class="field">
        <label for="eb">О себе</label>
        <textarea class="textarea" id="eb" name="bio" maxlength="160"
                  style="min-height:74px">${esc(state.me.bio || '')}</textarea>
      </div>
      <div class="field">
        <label>Неоновый акцент</label>
        <div class="accent-picker">
          ${ACCENTS.map((_, i) => `<button type="button" class="${accentClass(i)} ${state.me.accent === i ? 'is-active' : ''}"
             data-accent="${i}" aria-label="Акцент ${i + 1}"></button>`).join('')}
        </div>
      </div>
      <div class="form-foot">
        <button class="btn" type="button" data-close>Отмена</button>
        <button class="btn btn--primary" type="submit">Сохранить</button>
      </div>
    </form>`);
}

/** Держим счётчики ответов в синхроне без перерисовки треда. */
function bumpCommentCount(total) {
  const heading = $('#comment-list')?.previousElementSibling;
  if (heading) heading.textContent = `${total} ${plural(total, ['ответ', 'ответа', 'ответов'])}`;
  const badge = $('.post__foot .action:nth-child(2) span');
  if (badge) badge.textContent = total;
}

const showFormError = (form, message) => {
  const box = $('.form-error', form);
  box.textContent = message;
  box.hidden = false;
};

// --- роутер -----------------------------------------------------------------

async function router() {
  const hash = location.hash.slice(1) || '/';
  const [path, rawQuery] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(rawQuery || '');

  state.query = params.get('q') || '';
  $('#search-input').value = state.query;
  if (params.get('sort')) state.sort = params.get('sort');

  $('#rail-left').classList.remove('is-open');
  window.scrollTo({ top: 0, behavior: 'instant' });

  try {
    if (parts[0] === 'p' && parts[1]) { await renderPost(parts[1]); }
    else if (parts[0] === 'u' && parts[1]) { await renderProfile(parts[1]); }
    else {
      state.channel = parts[0] === 'c' && parts[1] ? parts[1] : 'all';
      await renderFeed();
    }
  } catch (err) {
    view.innerHTML = emptyState('Что-то сломалось', err.message);
  }
  renderRails();
}

const go = (hash) => { location.hash = hash; };

function feedHash({ channel = state.channel, sort = state.sort, q = state.query } = {}) {
  const params = new URLSearchParams();
  if (sort !== 'hot') params.set('sort', sort);
  if (q) params.set('q', q);
  const base = channel && channel !== 'all' ? `/c/${channel}` : '/';
  const qs = params.toString();
  return `#${base}${qs ? `?${qs}` : ''}`;
}

async function refreshStats() {
  try { state.stats = await api('/stats'); renderRails(); } catch { /* витрина не критична */ }
}

// --- события ----------------------------------------------------------------

document.addEventListener('click', async (event) => {
  const near = (selector) => event.target.closest(selector);

  if (near('[data-close]') || event.target.classList.contains('modal__backdrop')) return closeModal();

  const tab = near('[data-tab]');
  if (tab) return openAuth(tab.dataset.tab);

  const accent = near('[data-accent]');
  if (accent) {
    for (const b of accent.parentElement.children) b.classList.remove('is-active');
    accent.classList.add('is-active');
    accent.closest('form').dataset.accent = accent.dataset.accent;
    return;
  }

  const act = near('[data-act]')?.dataset.act;
  if (act === 'login') return openAuth('login');
  if (act === 'register') return openAuth('register');
  if (act === 'compose') return openComposer();
  if (act === 'edit-profile') return openProfileEditor();
  if (act === 'back') return history.length > 1 ? history.back() : go(feedHash({ channel: 'all' }));
  if (act === 'profile') return go(`#/u/${state.me.username}`);
  if (act === 'logout') {
    await api('/auth/logout', { method: 'POST' });
    state.me = null;
    renderAuthSlot();
    toast('Вышли. До скорого.');
    return router();
  }

  const channel = near('[data-channel]')?.dataset.channel;
  if (channel) return go(feedHash({ channel, q: '' }));

  const tag = near('[data-tag]')?.dataset.tag;
  if (tag) return go(feedHash({ channel: 'all', q: tag }));

  const user = near('[data-user]')?.dataset.user;
  if (user) return go(`#/u/${encodeURIComponent(user)}`);

  const sort = near('[data-sort]')?.dataset.sort;
  if (sort) { state.sort = sort; return go(feedHash({ sort })); }

  const open = near('[data-open]')?.dataset.open;
  if (open) return go(`#/p/${open}`);

  const like = near('[data-like]');
  if (like) {
    if (!state.me) return openAuth('login');
    try {
      const result = await api(`/posts/${like.dataset.like}/like`, { method: 'POST' });
      like.classList.toggle('is-on', result.liked);
      like.classList.add('action--pulse');
      setTimeout(() => like.classList.remove('action--pulse'), 420);
      $('span', like).textContent = result.likes;
      refreshStats();
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  const del = near('[data-delete]');
  if (del) {
    if (!confirm('Удалить пост вместе с обсуждением?')) return;
    try {
      await api(`/posts/${del.dataset.delete}`, { method: 'DELETE' });
      toast('Пост удалён');
      if (location.hash.startsWith('#/p/')) go(feedHash({ channel: 'all' })); else router();
      refreshStats();
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  const delComment = near('[data-delete-comment]');
  if (delComment) {
    try {
      await api(`/comments/${delComment.dataset.deleteComment}`, { method: 'DELETE' });
      delComment.closest('[data-comment]').remove();
      toast('Комментарий удалён');
      refreshStats();
    } catch (err) { toast(err.message, 'error'); }
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));

  if (form.id === 'auth-form') {
    try {
      state.me = await api(`/auth/${form.dataset.mode}`, { method: 'POST', body: values });
      closeModal();
      renderAuthSlot();
      toast(`Привет, ${state.me.username}`);
      router();
      refreshStats();
    } catch (err) { showFormError(form, err.message); }
    return;
  }

  if (form.id === 'post-form') {
    try {
      const post = await api('/posts', { method: 'POST', body: values });
      closeModal();
      toast('Опубликовано');
      go(`#/p/${post.id}`);
      refreshStats();
    } catch (err) { showFormError(form, err.message); }
    return;
  }

  if (form.id === 'profile-form') {
    try {
      const accent = form.dataset.accent ?? state.me.accent;
      state.me = await api('/me', { method: 'PATCH', body: { bio: values.bio, accent } });
      closeModal();
      renderAuthSlot();
      toast('Профиль обновлён');
      router();
    } catch (err) { showFormError(form, err.message); }
    return;
  }

  if (form.id === 'comment-form') {
    const postId = location.hash.split('/')[2];
    try {
      const comment = await api(`/posts/${postId}/comments`, { method: 'POST', body: values });
      const list = $('#comment-list');
      if ($('.empty', list)) list.innerHTML = '';
      list.insertAdjacentHTML('beforeend', commentRow(comment));
      form.reset();
      bumpCommentCount(list.children.length);
      refreshStats();
    } catch (err) { toast(err.message, 'error'); }
  }

  if (form.id === 'search-form') {
    go(feedHash({ channel: 'all', q: $('#search-input').value.trim() }));
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { closeModal(); $('#rail-left').classList.remove('is-open'); }
  if (event.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
    event.preventDefault();
    $('#search-input').focus();
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    document.activeElement.closest('form')?.requestSubmit();
  }
});

$('#menu-toggle').addEventListener('click', () => $('#rail-left').classList.toggle('is-open'));
window.addEventListener('hashchange', router);

(async function boot() {
  try { state.me = await api('/me'); } catch { state.me = null; }
  renderAuthSlot();
  await Promise.all([router(), refreshStats()]);
  setInterval(refreshStats, 30000);
})();
