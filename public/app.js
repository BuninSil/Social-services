/* NEONHUB · MLBB — SPA на ванильном JS: hash-роутинг, без сборки и зависимостей. */

const state = {
  me: null,
  meta: null,
  stats: null,
  sort: 'hot',
  channel: 'all',
  query: '',
  route: { name: 'feed', arg: null },
  page: { offset: 0, items: [], total: 0, hasMore: false },
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const view = $('#view');

// --- утилиты ----------------------------------------------------------------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const accentClass = (n) => `a${Number(n) || 0}`;

function timeAgo(iso) {
  const ms = Date.parse(iso);
  if (!isFinite(ms)) return 'недавно';
  const minutes = (Date.now() - ms) / 60000;
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${Math.floor(minutes)} мин назад`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)} ч назад`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)} д назад`;
  if (days < 30.4) return `${Math.floor(days / 7)} нед назад`;
  const months = days / 30.4;
  if (months < 12) return `${Math.floor(months)} мес назад`;
  return `${Math.floor(months / 12)} г назад`;
}

const clock = (iso) => {
  const d = new Date(iso);
  return isFinite(d) ? d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : '';
};

const plural = (n, forms) => {
  const m100 = n % 100, m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return forms[2];
  if (m10 === 1) return forms[0];
  if (m10 >= 2 && m10 <= 4) return forms[1];
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
  }, 2800);
}

const icon = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.7-7.5-9.6A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 7.5 2.7C19.5 15.3 12 20 12 20z"/></svg>',
  reply: '<svg viewBox="0 0 24 24"><path d="M20 15a3 3 0 0 1-3 3H8l-4 3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 4 3H6l4-3z"/><path d="M12 13v7"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4h13l-2 4 2 4H5"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6"/></svg>',
  ghost: '<svg viewBox="0 0 24 24"><path d="M5 20V10a7 7 0 0 1 14 0v10l-3-2-2 2-2-2-2 2-2-2z"/><path d="M9 10h.01M15 10h.01"/></svg>',
  feed: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 4l2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><path d="M3 6h18v12H3z"/><path d="M3 7l9 6 9-6"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M18 16V11a6 6 0 0 0-12 0v5l-2 3h16z"/><path d="M10 21h4"/></svg>',
  pencil: '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  block: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></svg>',
};

const avatar = (user, size = '') => `
  <div class="avatar ${size ? `avatar--${size}` : ''} ${accentClass(user?.accent)}"
       title="${esc(user?.username || '')}">${esc((user?.username || '?')[0])}</div>`;

const rankBadge = (user) => user?.rankName
  ? `<span class="rank" style="--rank:${esc(user.rankColor)}">${esc(user.rankName)}</span>` : '';

const roleBadge = (user) => {
  if (user?.banned) return '<span class="role-badge role-badge--banned">бан</span>';
  if (user?.role === 'admin') return '<span class="role-badge role-badge--admin">админ</span>';
  if (user?.role === 'moderator') return '<span class="role-badge role-badge--moderator">модер</span>';
  return '';
};

// --- шапка и колонки --------------------------------------------------------

function renderAuthSlot() {
  const slot = $('#auth-slot');
  if (!state.me) {
    slot.innerHTML = `
      <button class="btn btn--ghost" data-act="login">Войти</button>
      <button class="btn btn--primary" data-act="register">Регистрация</button>`;
    return;
  }
  const unread = state.me.unread || 0;
  const alerts = state.me.unreadNotifications || 0;
  slot.innerHTML = `
    <button class="btn btn--primary ${accentClass(state.me.accent)}" data-act="compose">
      <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span>Написать</span>
    </button>
    <button class="icon-btn" data-go="#/notifications" aria-label="Уведомления">
      ${icon.bell}${alerts ? `<span class="badge-dot">${alerts > 99 ? '99+' : alerts}</span>` : ''}
    </button>
    <button class="icon-btn" data-go="#/dm" aria-label="Сообщения">
      ${icon.mail}${unread ? `<span class="badge-dot">${unread > 99 ? '99+' : unread}</span>` : ''}
    </button>
    <button class="icon-btn" data-go="#/u/${encodeURIComponent(state.me.username)}"
            aria-label="Профиль" style="width:auto;padding:2px;border:0">${avatar(state.me)}</button>
    <button class="icon-btn topbar__logout" data-act="logout" aria-label="Выйти из аккаунта" title="Выйти">
      <svg viewBox="0 0 24 24"><path d="M15 17l5-5-5-5M20 12H9M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6"/></svg>
    </button>`;
}

function renderRails() {
  const staff = state.me && (state.me.role === 'admin' || state.me.role === 'moderator');
  const unread = state.me?.unread || 0;
  const nav = [
    ['#/', icon.feed, 'Лента', state.route.name === 'feed' && state.channel === 'all'],
    ...(state.me ? [['#/following', icon.star, 'Подписки', state.route.name === 'following']] : []),
    ...(state.me ? [['#/notifications', icon.bell, 'Уведомления', state.route.name === 'notifications', state.me.unreadNotifications || 0]] : []),
    ...(state.me ? [['#/dm', icon.mail, 'Сообщения', state.route.name === 'dm', unread]] : []),
    ...(state.me ? [['#/settings', icon.gear, 'Настройки', state.route.name === 'settings']] : []),
    ...(staff ? [['#/admin', icon.shield, 'Панель', state.route.name === 'admin']] : []),
  ];
  $('#navlist').innerHTML = nav.map(([href, ico, label, active, count]) => `
    <li><button class="navitem ${active ? 'is-active' : ''}" data-go="${href}">
      ${ico}<span>${label}</span>${count ? `<span class="navitem__count">${count}</span>` : ''}
    </button></li>`).join('');

  const s = state.stats;
  if (!s || !state.meta) return;

  const channels = [{ id: 'all', name: 'Всё подряд', posts: s.posts }, ...s.channels];
  $('#channel-list').innerHTML = channels.map((c, i) => `
    <li><button class="channel ${accentClass(i % 6)} ${state.channel === c.id && state.route.name === 'feed' ? 'is-active' : ''}"
                data-channel="${c.id}">
      <span class="channel__dot"></span>${esc(c.name)}<span class="channel__count">${c.posts}</span>
    </button></li>`).join('');

  $('#stats-grid').innerHTML = [
    [s.users, 'Игроков', 0], [s.posts, 'Постов', 2],
    [s.comments, 'Ответов', 1], [s.online, 'Онлайн', 3],
  ].map(([value, label, a]) => `
    <div class="stat ${accentClass(a)}">
      <div class="stat__value">${value}</div><div class="stat__label">${label}</div>
    </div>`).join('');

  $('#trending').innerHTML = s.trending.length
    ? s.trending.map((t) => `<button class="tag" data-tag="${esc(t.tag)}">#${esc(t.tag)}<b>${t.count}</b></button>`).join('')
    : '<p class="stat__label">пока пусто</p>';

  $('#top-heroes').innerHTML = s.topHeroes.length
    ? s.topHeroes.map((h) => `<button class="tag" data-tag="${esc(h.hero)}">${esc(h.hero)}<b>${h.n}</b></button>`).join('')
    : '<p class="stat__label">пока пусто</p>';

  $('#leaders').innerHTML = s.topPlayers.map((u) => `
    <li><button class="leader" data-user="${esc(u.username)}">
      ${avatar(u, 'sm')}<span class="leader__name">${esc(u.username)}</span>
      <span class="leader__karma">${u.karma} ♥</span>
    </button></li>`).join('');

  for (const b of document.querySelectorAll('#sort-switch button')) {
    b.classList.toggle('is-active', b.dataset.sort === state.sort);
  }
}

// --- карточки ---------------------------------------------------------------

function postCard(post, index = 0) {
  return `
  <article class="card post ${accentClass(post.author?.accent)} ${post.pinned ? 'is-pinned' : ''}"
           style="animation-delay:${Math.min(index * 45, 320)}ms">
    ${postHead(post)}
    <button class="post__title" data-open="${post.id}">${post.pinned ? '📌 ' : ''}${esc(post.title)}</button>
    <p class="post__body post__body--clamp">${esc(post.body)}</p>
    ${postMarks(post)}
    ${postFoot(post)}
  </article>`;
}

const postHead = (post) => `
  <header class="post__head">
    ${avatar(post.author)}
    <div class="post__who">
      <div class="post__byline">
        <button class="post__author" data-user="${esc(post.author?.username)}">${esc(post.author?.username)}</button>
        ${roleBadge(post.author)}
      </div>
      <div class="post__byline">
        ${rankBadge(post.author)}
        <span class="post__time">${timeAgo(post.createdAt)}</span>
        ${post.editedAt ? '<span class="post__edited">изменено</span>' : ''}
      </div>
    </div>
    <button class="post__channel" data-channel="${esc(post.channel)}">${esc(post.channelName)}</button>
  </header>`;

function postMarks(post) {
  const marks = [];
  if (post.featName) marks.push(`<span class="feat">${esc(post.featName)}</span>`);
  if (post.hero) marks.push(`<button class="chip chip--hero" data-tag="${esc(post.hero)}">${esc(post.hero)}</button>`);
  if (post.lfgLane) {
    const lane = state.meta?.lanes?.[post.lfgLane];
    marks.push(`<span class="chip chip--lane">нужен: ${esc(lane?.name || post.lfgLane)}</span>`);
  }
  if (post.lfgRankName) marks.push(`<span class="chip">от ${esc(post.lfgRankName)}</span>`);
  post.tags.forEach((t) => marks.push(`<button class="tag" data-tag="${esc(t)}">#${esc(t)}</button>`));
  return marks.length ? `<div class="post__marks">${marks.join('')}</div>` : '';
}

const staffNow = () => state.me && (state.me.role === 'admin' || state.me.role === 'moderator');

const postFoot = (post, full = false) => `
  <footer class="post__foot">
    <button class="action ${post.liked ? 'is-on' : ''}" data-like="${post.id}">
      ${icon.heart}<span>${post.likes}</span>
    </button>
    ${full
      ? `<span class="action">${icon.reply}<span>${post.commentCount}</span></span>`
      : `<button class="action" data-open="${post.id}">${icon.reply}<span>${post.commentCount}</span></button>`}
    ${state.me && !post.mine ? `<button class="action" data-report-post="${post.id}" aria-label="Пожаловаться">${icon.flag}</button>` : ''}
    ${staffNow() ? `<button class="action action--gold ${post.pinned ? 'is-on' : ''}" data-pin="${post.id}" aria-label="Закрепить">${icon.pin}</button>` : ''}
    ${post.mine ? `<button class="action" data-edit-post="${post.id}" aria-label="Править" style="margin-left:auto">${icon.pencil}</button>` : ''}
    ${post.canModerate ? `<button class="action action--danger" data-delete-post="${post.id}" aria-label="Удалить" ${post.mine ? '' : 'style="margin-left:auto"'}>${icon.trash}</button>` : ''}
  </footer>`;

const commentRow = (c) => `
  <div class="comment ${accentClass(c.author?.accent)}" data-comment="${c.id}">
    ${avatar(c.author, 'sm')}
    <div style="flex:1;min-width:0">
      <div class="post__byline">
        <button class="comment__name" data-user="${esc(c.author?.username)}">${esc(c.author?.username)}</button>
        ${roleBadge(c.author)}${rankBadge(c.author)}
        <span class="comment__time">${timeAgo(c.createdAt)}</span>
        ${c.editedAt ? '<span class="post__edited">изменено</span>' : ''}
        ${c.mine ? `<button class="action" data-edit-comment="${c.id}"
           aria-label="Править ответ" style="margin-left:auto;padding:2px 7px">${icon.pencil}</button>` : ''}
        ${c.canModerate ? `<button class="action action--danger" data-delete-comment="${c.id}"
           aria-label="Удалить ответ" ${c.mine ? 'style="padding:2px 7px"' : 'style="margin-left:auto;padding:2px 7px"'}>${icon.trash}</button>` : ''}
      </div>
      <p class="comment__body">${esc(c.body)}</p>
    </div>
  </div>`;

const emptyState = (title, text) =>
  `<div class="card empty">${icon.ghost}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;

const composerBar = () => state.me ? `
  <div class="card composer ${accentClass(state.me.accent)}">
    ${avatar(state.me)}
    <button class="composer__trigger" data-act="compose">Что нового в мете, ${esc(state.me.username)}?</button>
  </div>` : `
  <div class="card composer">
    <button class="composer__trigger" data-act="register">Заведи аккаунт, чтобы писать и звать в каточку →</button>
  </div>`;

const backButton = (label = 'назад в ленту') =>
  `<button class="back" data-act="back">${icon.back} ${label}</button>`;

// --- экраны -----------------------------------------------------------------

async function renderFeed() {
  view.innerHTML = composerBar() + '<div class="skeleton"></div><div class="skeleton"></div>';

  const params = new URLSearchParams({ sort: state.sort });
  if (state.channel !== 'all') params.set('channel', state.channel);
  if (state.query) params.set('q', state.query);
  if (state.route.name === 'following') params.set('feed', 'following');

  params.set('limit', '30');
  params.set('offset', String(state.page.offset));

  const page = await api(`/posts?${params}`);
  const posts = state.page.offset > 0 ? [...state.page.items, ...page.items] : page.items;
  state.page = { offset: state.page.offset, items: posts, total: page.total, hasMore: page.hasMore };

  const channelName = state.stats?.channels.find((c) => c.id === state.channel)?.name;
  const people = state.query ? await api(`/users?q=${encodeURIComponent(state.query)}`).catch(() => []) : [];

  let heading = 'Лента';
  if (state.route.name === 'following') heading = '<em>Подписки</em>';
  else if (state.query) heading = `Поиск: <em>${esc(state.query)}</em>`;
  else if (state.channel !== 'all') heading = `<em>${esc(channelName || state.channel)}</em>`;

  view.innerHTML = `
    <div class="content-head"><h1>${heading}</h1>
      <span class="content-head__meta">${page.total} ${plural(page.total, ['пост', 'поста', 'постов'])}</span>
    </div>
    ${composerBar()}
    ${people.length ? `
      <section class="card">
        <h2 class="panel__title">Игроки по запросу</h2>
        <ul class="leaders">${people.map((u) => `
          <li><button class="leader" data-user="${esc(u.username)}">
            ${avatar(u, 'sm')}<span class="leader__name">${esc(u.username)}</span>
            ${rankBadge(u)}<span class="leader__karma">${u.karma} ♥</span>
          </button></li>`).join('')}</ul>
      </section>` : ''}
    ${posts.length ? posts.map(postCard).join('')
      : emptyState(
          state.route.name === 'following' ? 'В подписках пусто' : 'Здесь пока тихо',
          state.route.name === 'following'
            ? 'Подпишись на игроков — их посты будут собираться здесь.'
            : 'Напиши первый пост: разбор меты, гайд или зов в каточку.')}
    ${page.hasMore ? `<button class="btn btn--block" id="load-more">Показать ещё
      (осталось ${page.total - posts.length})</button>` : ''}`;
}

async function renderPost(id) {
  view.innerHTML = '<div class="skeleton"></div>';
  let post;
  try { post = await api(`/posts/${id}`); }
  catch (err) { view.innerHTML = backButton() + emptyState('Пост не найден', err.message); return; }

  view.innerHTML = `
    ${backButton()}
    <article class="card ${accentClass(post.author?.accent)}">
      ${postHead(post)}
      <h1 class="thread__title">${post.pinned ? '📌 ' : ''}${esc(post.title)}</h1>
      <p class="thread__body">${esc(post.body)}</p>
      ${postMarks(post)}
      ${postFoot(post, true)}
    </article>

    <section class="card">
      <h2 class="panel__title">${post.commentCount} ${plural(post.commentCount, ['ответ', 'ответа', 'ответов'])}</h2>
      <div id="comment-list">
        ${post.comments.length ? post.comments.map(commentRow).join('')
          : '<p class="empty" style="padding:20px 0">Пока тихо. Скажи что-нибудь.</p>'}
      </div>
      ${state.me ? `
        <form id="comment-form" style="margin-top:12px">
          <textarea class="textarea" id="comment-body" name="body" placeholder="Твой ответ…"
                    style="min-height:84px" maxlength="1500" required></textarea>
          <div class="form-foot"><span class="hint">Ctrl+Enter — отправить</span>
            <button class="btn btn--primary ${accentClass(state.me.accent)}" type="submit">Ответить</button>
          </div>
        </form>`
        : '<button class="btn btn--block" data-act="login" style="margin-top:12px">Войти, чтобы ответить</button>'}
    </section>`;
}

async function renderProfile(username) {
  view.innerHTML = '<div class="skeleton"></div>';
  let user, posts;
  try {
    [user, posts] = await Promise.all([
      api(`/users/${encodeURIComponent(username)}`),
      api(`/posts?author=${encodeURIComponent(username)}&sort=new`),
    ]);
  } catch (err) { view.innerHTML = backButton() + emptyState('Игрок не найден', err.message); return; }

  const marks = [
    rankBadge(user),
    user.hero ? `<span class="chip chip--hero">мейн: ${esc(user.hero)}</span>` : '',
    user.laneName ? `<span class="chip chip--lane">${esc(user.laneName)}</span>` : '',
    user.gameId ? `<span class="chip">${esc(user.gameId)}</span>` : '',
    roleBadge(user),
  ].filter(Boolean).join('');

  view.innerHTML = `
    ${backButton()}
    <section class="card profile ${accentClass(user.accent)}">
      ${avatar(user, 'lg')}
      <div style="flex:1;min-width:220px">
        <h1 class="profile__name">${esc(user.username)}</h1>
        ${user.status ? `<p class="profile__status">«${esc(user.status)}»</p>` : ''}
        ${user.bio ? `<p class="profile__bio">${esc(user.bio)}</p>` : ''}
        <div class="profile__marks">${marks}</div>
        ${user.winRate ? `
          <div class="winrate">
            <div class="winrate__bar"><div class="winrate__fill" style="width:${user.winRate}%"></div></div>
            <div class="winrate__label">винрейт ${user.winRate}%</div>
          </div>` : ''}
        <div class="profile__stats">
          <div class="profile__stat"><b>${user.posts}</b><span>постов</span></div>
          <div class="profile__stat"><b>${user.comments}</b><span>ответов</span></div>
          <div class="profile__stat"><b>${user.karma}</b><span>карма</span></div>
          <div class="profile__stat"><b>${user.followers}</b><span>подписчиков</span></div>
          <div class="profile__stat"><b>${user.following}</b><span>подписок</span></div>
        </div>
        <div class="profile__actions">
          ${user.isMe
            ? '<button class="btn btn--sm" data-go="#/settings">Настроить профиль</button>'
            : state.me ? `
              <button class="btn btn--sm ${user.followed ? '' : 'btn--primary'}" data-follow="${esc(user.username)}">
                ${user.followed ? 'Отписаться' : 'Подписаться'}
              </button>
              <button class="btn btn--sm" data-go="#/dm/${encodeURIComponent(user.username)}">Написать</button>
              <button class="btn btn--sm" data-report-user="${user.id}">Пожаловаться</button>
              <button class="btn btn--sm btn--danger" data-block="${esc(user.username)}">Заблокировать</button>`
            : '<button class="btn btn--sm btn--primary" data-act="login">Войти, чтобы подписаться</button>'}
        </div>
      </div>
    </section>

    <div class="content-head"><h1 style="font-size:17px">Посты</h1></div>
    ${posts.length ? posts.map(postCard).join('') : emptyState('Постов нет', 'Игрок пока молчит.')}`;
}

async function renderNotifications() {
  if (!state.me) { view.innerHTML = emptyState('Нужно войти', 'Уведомления только для своих.'); return; }
  view.innerHTML = '<div class="skeleton"></div>';
  const items = await api('/notifications');

  const word = { like: 'оценил пост', comment: 'ответил в посте', follow: 'подписался на тебя', mention: 'упомянул тебя' };
  view.innerHTML = `
    <div class="content-head"><h1><em>Уведомления</em></h1>
      <span class="content-head__meta">${items.length}</span>
    </div>
    <section class="card">
      ${items.length ? `<div class="dialogs">${items.map((n) => `
        <button class="dialog ${n.read ? '' : 'is-unread'} ${accentClass(n.actor.accent)}"
                ${n.postId ? `data-open="${n.postId}"` : `data-user="${esc(n.actor.username)}"`}>
          ${avatar(n.actor)}
          <div class="dialog__main">
            <div class="post__byline">
              <span class="dialog__name">${esc(n.actor.username)}</span>
              <span style="color:var(--text-dim);font-size:13px">${word[n.kind] || n.kind}</span>
            </div>
            <div class="dialog__last">${esc(n.postTitle || n.preview || '')}</div>
          </div>
          <div class="dialog__meta"><span class="dialog__time">${timeAgo(n.createdAt)}</span></div>
        </button>`).join('')}</div>`
        : '<p class="empty">Пока пусто. Лайки, ответы и подписки будут появляться здесь.</p>'}
    </section>`;

  if (items.some((n) => !n.read)) {
    await api('/notifications/read', { method: 'POST' });
    state.me.unreadNotifications = 0;
    renderAuthSlot();
    renderRails();
  }
}

async function renderDialogs() {
  if (!state.me) { view.innerHTML = emptyState('Нужно войти', 'Личные сообщения доступны только своим.'); return; }
  view.innerHTML = '<div class="skeleton"></div>';
  const dialogs = await api('/messages');

  view.innerHTML = `
    <div class="content-head"><h1><em>Сообщения</em></h1>
      <span class="content-head__meta">${dialogs.length} ${plural(dialogs.length, ['диалог', 'диалога', 'диалогов'])}</span>
    </div>
    <section class="card">
      ${dialogs.length ? `<div class="dialogs">${dialogs.map((d) => `
        <button class="dialog ${d.unread ? 'is-unread' : ''} ${accentClass(d.user.accent)}"
                data-go="#/dm/${encodeURIComponent(d.user.username)}">
          ${avatar(d.user)}
          <div class="dialog__main">
            <div class="post__byline">
              <span class="dialog__name">${esc(d.user.username)}</span>${rankBadge(d.user)}
            </div>
            <div class="dialog__last">${esc(d.lastMessage || '')}</div>
          </div>
          <div class="dialog__meta">
            <span class="dialog__time">${timeAgo(d.lastAt)}</span>
            ${d.unread ? `<span class="badge-dot" style="position:static">${d.unread}</span>` : ''}
          </div>
        </button>`).join('')}</div>`
        : '<p class="empty">Диалогов пока нет. Зайди в профиль игрока и напиши первым.</p>'}
    </section>`;
}

async function renderChat(username) {
  if (!state.me) { view.innerHTML = emptyState('Нужно войти', 'Личные сообщения доступны только своим.'); return; }
  view.innerHTML = '<div class="skeleton"></div>';
  let data;
  try { data = await api(`/messages/${encodeURIComponent(username)}`); }
  catch (err) { view.innerHTML = backButton('к диалогам') + emptyState('Не открылось', err.message); return; }

  view.innerHTML = `
    <button class="back" data-go="#/dm">${icon.back} к диалогам</button>
    <section class="card ${accentClass(data.user.accent)}">
      <header class="post__head" style="margin-bottom:14px">
        ${avatar(data.user)}
        <div class="post__who">
          <div class="post__byline">
            <button class="post__author" data-user="${esc(data.user.username)}">${esc(data.user.username)}</button>
            ${roleBadge(data.user)}
          </div>
          <div class="post__byline">${rankBadge(data.user)}
            ${data.user.hero ? `<span class="chip chip--hero">${esc(data.user.hero)}</span>` : ''}
          </div>
        </div>
      </header>

      <div class="chat" id="chat">
        ${data.messages.length ? data.messages.map((m) => `
          <div class="bubble ${m.mine ? 'bubble--mine' : ''}">${esc(m.body)}
            <span class="bubble__time">${clock(m.createdAt)}</span>
          </div>`).join('')
          : '<p class="empty" style="padding:24px 0">Переписки ещё не было. Напиши первым.</p>'}
      </div>

      <form class="chat-form" id="chat-form" data-user="${esc(data.user.username)}">
        <textarea class="textarea" id="chat-body" name="body" placeholder="Сообщение…" maxlength="2000" required></textarea>
        <button class="btn btn--primary ${accentClass(state.me.accent)}" type="submit">→</button>
      </form>
    </section>`;

  const chat = $('#chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function renderSettings() {
  if (!state.me) { view.innerHTML = emptyState('Нужно войти', 'Настройки доступны только своим.'); return; }
  const me = state.me;
  const { heroes = [], lanes = {}, ranks = [] } = state.meta || {};

  const heroOptions = ['<option value="">— не выбран —</option>', ...heroes.map((h) =>
    `<option value="${esc(h.name)}" ${h.name === me.hero ? 'selected' : ''}>${esc(h.name)}</option>`)].join('');
  const laneOptions = Object.entries(lanes).map(([id, l]) =>
    `<option value="${id}" ${id === me.lane ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  const rankOptions = ranks.map((r) =>
    `<option value="${r.id}" ${r.id === me.rankId ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  const swatches = Array.from({ length: 6 }, (_, i) =>
    `<button type="button" class="${accentClass(i)} ${me.accent === i ? 'is-active' : ''}"
             data-accent="${i}" aria-label="Акцент ${i + 1}"></button>`).join('');

  view.innerHTML = `
    <div class="content-head"><h1><em>Настройки</em> профиля</h1></div>

    <section class="card">
      <form id="profile-form" data-accent="${me.accent}">
        <div class="form-error" hidden></div>
        <div class="field">
          <label for="set-status">Статус под ником</label>
          <input class="input" id="set-status" name="status" maxlength="60"
                 placeholder="например: роум, который реально роумит" value="${esc(me.status || '')}">
        </div>
        <div class="field">
          <label for="set-bio">О себе</label>
          <textarea class="textarea" id="set-bio" name="bio" maxlength="200" style="min-height:76px">${esc(me.bio || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="field"><label for="set-hero">Мейн-герой</label>
            <select class="select" id="set-hero" name="hero">${heroOptions}</select></div>
          <div class="field"><label for="set-lane">Основная линия</label>
            <select class="select" id="set-lane" name="lane">${laneOptions}</select></div>
        </div>
        <div class="form-row">
          <div class="field"><label for="set-rank">Ранг</label>
            <select class="select" id="set-rank" name="rankId">${rankOptions}</select></div>
          <div class="field"><label for="set-gameid">ID в игре</label>
            <input class="input" id="set-gameid" name="gameId" maxlength="24"
                   placeholder="ID 128840291 (RU)" value="${esc(me.gameId || '')}"></div>
        </div>
        <div class="field">
          <label for="set-wr">Винрейт: <span id="wr-value">${me.winRate || 0}</span>%</label>
          <input class="range" type="range" id="set-wr" name="winRate" min="0" max="100" value="${me.winRate || 0}">
        </div>
        <div class="field">
          <label>Неоновый акцент</label>
          <div class="accent-picker">${swatches}</div>
        </div>
        <div class="form-foot">
          <span class="hint">видно всем в профиле и под постами</span>
          <button class="btn btn--primary" type="submit">Сохранить</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2 class="panel__title">Аккаунт</h2>
      <div class="account-row">
        <div class="table__user ${accentClass(me.accent)}">
          ${avatar(me)}
          <div>
            <div style="font-weight:600">${esc(me.username)}</div>
            <div class="field__hint">${esc(me.role === 'admin' ? 'админ'
              : me.role === 'moderator' ? 'модератор' : 'игрок')} · с ${new Date(me.createdAt).toLocaleDateString('ru')}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" data-act="logout-all" title="Разлогинит и телефон, и компьютер">
            Выйти отовсюду
          </button>
          <button class="btn btn--danger" data-act="logout">
            <svg viewBox="0 0 24 24"><path d="M15 17l5-5-5-5M20 12H9M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6"/></svg>
            Выйти
          </button>
        </div>
      </div>
    </section>

    <section class="card">
      <h2 class="panel__title">Опасная зона</h2>
      <div class="account-row">
        <div>
          <div style="font-weight:600">Удалить аккаунт</div>
          <div class="field__hint">Вместе с постами, ответами и перепиской. Без возврата.</div>
        </div>
        <button class="btn btn--danger" data-act="delete-account">Удалить</button>
      </div>
    </section>

    <section class="card">
      <h2 class="panel__title">Смена пароля</h2>
      <form id="password-form">
        <div class="form-error" hidden></div>
        <div class="form-row">
          <div class="field"><label for="pw-current">Текущий</label>
            <input class="input" id="pw-current" name="current" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="pw-next">Новый</label>
            <input class="input" id="pw-next" name="next" type="password" autocomplete="new-password" required></div>
        </div>
        <div class="form-foot">
          <span class="hint">после смены придётся войти заново</span>
          <button class="btn btn--danger" type="submit">Сменить пароль</button>
        </div>
      </form>
    </section>`;
}

async function renderAdmin() {
  view.innerHTML = '<div class="skeleton"></div>';
  let data;
  try { data = await api('/admin'); }
  catch (err) { view.innerHTML = emptyState('Доступа нет', err.message); return; }

  const isAdmin = state.me?.role === 'admin';
  const tiles = [
    [data.counts.users, 'Игроков', 0], [data.counts.banned, 'В бане', 5],
    [data.counts.posts, 'Постов', 2], [data.counts.comments, 'Ответов', 1],
    [data.counts.messages, 'Сообщений', 4], [data.counts.openReports, 'Жалоб', 3],
  ];

  view.innerHTML = `
    <div class="content-head"><h1><em>Панель</em> модерации</h1>
      <span class="content-head__meta">${esc(state.me.role === 'admin' ? 'админ' : 'модератор')}</span>
    </div>

    <section class="card">
      <h2 class="panel__title">Сводка</h2>
      <div class="admin-grid">
        ${tiles.map(([value, label, a]) => `
          <div class="stat ${accentClass(a)}">
            <div class="stat__value">${value}</div><div class="stat__label">${label}</div>
          </div>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2 class="panel__title">Жалобы${data.reports.length ? ` · ${data.reports.length}` : ''}</h2>
      ${data.reports.length ? data.reports.map((r) => `
        <div class="report">
          <div class="report__body">
            <div class="report__target">${esc(r.targetType)} #${r.targetId} · от ${esc(r.reporter)} · ${timeAgo(r.createdAt)}</div>
            <p style="font-size:13.5px;margin-top:3px">${esc(r.reason)}</p>
          </div>
          <div class="table__actions">
            ${r.targetType === 'post' ? `<button class="btn btn--sm" data-open="${r.targetId}">Открыть</button>` : ''}
            <button class="btn btn--sm" data-resolve="${r.id}">Закрыть</button>
          </div>
        </div>`).join('')
        : '<p class="empty" style="padding:18px 0">Жалоб нет. Сообщество ведёт себя прилично.</p>'}
    </section>

    <section class="card">
      <h2 class="panel__title">Игроки</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Игрок</th><th>Ранг</th><th>Роль</th><th>Постов</th><th></th></tr></thead>
        <tbody>
          ${data.users.map((u) => `
            <tr>
              <td><div class="table__user ${accentClass(u.accent)}">
                ${avatar(u, 'sm')}
                <button class="post__author" data-user="${esc(u.username)}">${esc(u.username)}</button>
                ${u.banned ? '<span class="role-badge role-badge--banned">бан</span>' : ''}
              </div></td>
              <td>${rankBadge(u)}</td>
              <td>${roleBadge(u) || '<span class="chip">игрок</span>'}</td>
              <td style="font-family:var(--mono)">${u.posts}</td>
              <td><div class="table__actions">
                ${isAdmin && !u.isMe ? `
                  <select class="select" style="width:auto;padding:5px 9px;font-size:12px"
                          data-role-for="${u.id}">
                    ${['user', 'moderator', 'admin'].map((r) =>
                      `<option value="${r}" ${u.role === r ? 'selected' : ''}>${
                        { user: 'игрок', moderator: 'модер', admin: 'админ' }[r]}</option>`).join('')}
                  </select>` : ''}
                ${!u.isMe && u.role !== 'admin'
                  ? (u.banned
                      ? `<button class="btn btn--sm" data-unban="${u.id}">Разбанить</button>`
                      : `<button class="btn btn--sm btn--danger" data-ban="${u.id}">Забанить</button>`)
                  : ''}
              </div></td>
            </tr>`).join('')}
        </tbody>
      </table></div>
    </section>`;
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
  const { heroes = [], lanes = {}, ranks = [] } = state.meta || {};
  const extra = mode === 'register' ? `
    <div class="form-row">
      <div class="field"><label for="auth-hero">Мейн-герой</label>
        <select class="select" id="auth-hero" name="hero">
          <option value="">— позже —</option>
          ${heroes.map((h) => `<option value="${esc(h.name)}">${esc(h.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label for="auth-lane">Линия</label>
        <select class="select" id="auth-lane" name="lane">
          ${Object.entries(lanes).map(([id, l]) => `<option value="${id}">${esc(l.name)}</option>`).join('')}
        </select></div>
    </div>
    <div class="field"><label for="auth-rank">Ранг</label>
      <select class="select" id="auth-rank" name="rankId">
        ${ranks.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}
      </select></div>` : '';

  openModal(mode === 'login' ? 'С возвращением в <em>NEONHUB</em>' : 'Новый <em>аккаунт</em>', `
    <div class="tabs">
      <button data-tab="login" class="${mode === 'login' ? 'is-active' : ''}">Вход</button>
      <button data-tab="register" class="${mode === 'register' ? 'is-active' : ''}">Регистрация</button>
    </div>
    <form id="auth-form" data-mode="${mode}">
      <div class="form-error" hidden></div>
      <div class="field"><label for="auth-user">Ник</label>
        <input class="input" id="auth-user" name="username" maxlength="24" placeholder="Savage"
               autocomplete="username" required></div>
      <div class="field"><label for="auth-pass">Пароль</label>
        <input class="input" id="auth-pass" name="password" type="password" placeholder="минимум 6 символов"
               autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required></div>
      ${extra}
      <button class="btn btn--primary btn--block" type="submit" style="margin-top:6px">
        ${mode === 'login' ? 'Войти' : 'Создать аккаунт'}
      </button>
      <p style="margin-top:12px;text-align:center;font-size:11.5px;color:var(--text-faint)">
        Демо: <code>Savage</code> / <code>demo1234</code> — это админ
      </p>
    </form>`);
}

function openComposer() {
  if (!state.me) return openAuth('login');
  const { heroes = [], lanes = {}, ranks = [], feats = {}, channels = {} } = state.meta || {};

  openModal('Новый <em>пост</em>', `
    <form id="post-form">
      <div class="form-error" hidden></div>
      <div class="field"><label for="post-title">Заголовок</label>
        <input class="input" id="post-title" name="title" maxlength="120" placeholder="О чём речь?" required></div>
      <div class="field"><label for="post-body">Текст</label>
        <textarea class="textarea" id="post-body" name="body" maxlength="5000"
                  placeholder="Разбор, гайд, хайлайт или зов в каточку…" required></textarea></div>
      <div class="form-row">
        <div class="field"><label for="post-channel">Раздел</label>
          <select class="select" id="post-channel" name="channel">
            ${Object.entries(channels).map(([id, name]) =>
              `<option value="${id}" ${id === state.channel ? 'selected' : ''}>${esc(name)}</option>`).join('')}
          </select></div>
        <div class="field"><label for="post-hero">Герой</label>
          <select class="select" id="post-hero" name="hero">
            <option value="">— без героя —</option>
            ${heroes.map((h) => `<option value="${esc(h.name)}">${esc(h.name)}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="post-feat">Отметка</label>
          <select class="select" id="post-feat" name="feat">
            <option value="">— без отметки —</option>
            ${Object.entries(feats).map(([id, f]) => `<option value="${id}">${esc(f.name)} · ${esc(f.hint)}</option>`).join('')}
          </select></div>
        <div class="field"><label for="post-tags">Теги</label>
          <input class="input" id="post-tags" name="tags" placeholder="мета, драфт, гайд"></div>
      </div>
      <div class="form-row" id="lfg-fields" hidden>
        <div class="field"><label for="post-lfg-lane">Кого ищешь</label>
          <select class="select" id="post-lfg-lane" name="lfgLane">
            ${Object.entries(lanes).map(([id, l]) => `<option value="${id}">${esc(l.name)}</option>`).join('')}
          </select></div>
        <div class="field"><label for="post-lfg-rank">Ранг от</label>
          <select class="select" id="post-lfg-rank" name="lfgRank">
            ${ranks.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-foot"><span class="hint">до 5 тегов · Ctrl+Enter</span>
        <button class="btn" type="button" data-close>Отмена</button>
        <button class="btn btn--primary ${accentClass(state.me.accent)}" type="submit">Опубликовать</button>
      </div>
    </form>`);

  const sync = () => { $('#lfg-fields').hidden = $('#post-channel').value !== 'lfg'; };
  $('#post-channel').addEventListener('change', sync);
  sync();
}

function openEditor(post) {
  const { heroes = [], feats = {} } = state.meta || {};
  openModal('Правка <em>поста</em>', `
    <form id="edit-post-form" data-id="${post.id}">
      <div class="form-error" hidden></div>
      <div class="field"><label for="edit-title">Заголовок</label>
        <input class="input" id="edit-title" name="title" maxlength="120" required
               value="${esc(post.title)}"></div>
      <div class="field"><label for="edit-body">Текст</label>
        <textarea class="textarea" id="edit-body" name="body" maxlength="5000" required>${esc(post.body)}</textarea></div>
      <div class="form-row">
        <div class="field"><label for="edit-hero">Герой</label>
          <select class="select" id="edit-hero" name="hero">
            <option value="">— без героя —</option>
            ${heroes.map((h) => `<option value="${esc(h.name)}" ${h.name === post.hero ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
          </select></div>
        <div class="field"><label for="edit-tags">Теги</label>
          <input class="input" id="edit-tags" name="tags" value="${esc(post.tags.join(', '))}"></div>
      </div>
      <div class="field"><label for="edit-feat">Отметка</label>
        <select class="select" id="edit-feat" name="feat">
          <option value="">— без отметки —</option>
          ${Object.entries(feats).map(([id, f]) => `<option value="${id}" ${id === post.feat ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
        </select></div>
      <div class="form-foot"><span class="hint">под постом появится пометка «изменено»</span>
        <button class="btn" type="button" data-close>Отмена</button>
        <button class="btn btn--primary" type="submit">Сохранить</button>
      </div>
    </form>`);
}

function openCommentEditor(id, current) {
  openModal('Правка <em>ответа</em>', `
    <form id="edit-comment-form" data-id="${id}">
      <div class="form-error" hidden></div>
      <div class="field"><label for="edit-comment-body">Текст</label>
        <textarea class="textarea" id="edit-comment-body" name="body" maxlength="1500" required>${esc(current)}</textarea></div>
      <div class="form-foot">
        <button class="btn" type="button" data-close>Отмена</button>
        <button class="btn btn--primary" type="submit">Сохранить</button>
      </div>
    </form>`);
}

function openDeleteAccount() {
  openModal('Удаление <em>аккаунта</em>', `
    <form id="delete-account-form">
      <div class="form-error" hidden></div>
      <p class="modal__lead">Уйдут посты, ответы, лайки и вся переписка. Это навсегда,
        восстановить нечем — резервных копий и почты для восстановления тут нет.</p>
      <div class="field"><label for="del-pass">Подтверди паролем</label>
        <input class="input" id="del-pass" name="password" type="password" autocomplete="current-password" required></div>
      <div class="form-foot">
        <button class="btn" type="button" data-close>Отмена</button>
        <button class="btn btn--danger" type="submit">Удалить навсегда</button>
      </div>
    </form>`);
}

function openReport(targetType, targetId) {
  if (!state.me) return openAuth('login');
  openModal('Пожаловаться', `
    <form id="report-form" data-type="${targetType}" data-id="${targetId}">
      <div class="form-error" hidden></div>
      <p class="modal__lead">Жалоба уйдёт модераторам. Опиши, что не так — без этого разбираться сложно.</p>
      <div class="field"><label for="report-reason">Причина</label>
        <textarea class="textarea" id="report-reason" name="reason" maxlength="300" style="min-height:80px" required></textarea></div>
      <div class="form-foot">
        <button class="btn" type="button" data-close>Отмена</button>
        <button class="btn btn--danger" type="submit">Отправить</button>
      </div>
    </form>`);
}

function openBan(userId) {
  openModal('Блокировка <em>аккаунта</em>', `
    <form id="ban-form" data-id="${userId}">
      <div class="form-error" hidden></div>
      <p class="modal__lead">Игрока разлогинит немедленно, войти он не сможет до разбана.</p>
      <div class="field"><label for="ban-reason">Причина</label>
        <input class="input" id="ban-reason" name="reason" maxlength="200" placeholder="токсичность в комментариях" required></div>
      <div class="form-foot">
        <button class="btn" type="button" data-close>Отмена</button>
        <button class="btn btn--danger" type="submit">Забанить</button>
      </div>
    </form>`);
}

const showFormError = (form, message) => {
  const box = $('.form-error', form);
  if (!box) return toast(message, 'error');
  box.textContent = message;
  box.hidden = false;
};

// --- роутер -----------------------------------------------------------------

function parseRoute() {
  const hash = location.hash.slice(1) || '/';
  const [path, rawQuery] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(rawQuery || '');

  state.query = params.get('q') || '';
  $('#search-input').value = state.query;
  if (params.get('sort')) state.sort = params.get('sort');

  if (parts[0] === 'p') return { name: 'post', arg: parts[1] };
  if (parts[0] === 'u') return { name: 'profile', arg: decodeURIComponent(parts[1] || '') };
  if (parts[0] === 'dm') return parts[1]
    ? { name: 'chat', arg: decodeURIComponent(parts[1]) }
    : { name: 'dm', arg: null };
  if (parts[0] === 'notifications') return { name: 'notifications', arg: null };
  if (parts[0] === 'settings') return { name: 'settings', arg: null };
  if (parts[0] === 'admin') return { name: 'admin', arg: null };
  if (parts[0] === 'following') return { name: 'following', arg: null };
  if (parts[0] === 'c') { state.channel = parts[1] || 'all'; return { name: 'feed', arg: null }; }
  state.channel = 'all';
  return { name: 'feed', arg: null };
}

async function router() {
  const previous = `${state.route.name}:${state.route.arg}:${state.channel}:${state.query}:${state.sort}`;
  state.route = parseRoute();
  const current = `${state.route.name}:${state.route.arg}:${state.channel}:${state.query}:${state.sort}`;
  if (previous !== current) state.page = { offset: 0, items: [], total: 0, hasMore: false };
  $('#rail-left').classList.remove('is-open');
  window.scrollTo({ top: 0, behavior: 'instant' });

  try {
    switch (state.route.name) {
      case 'post': await renderPost(state.route.arg); break;
      case 'profile': await renderProfile(state.route.arg); break;
      case 'notifications': await renderNotifications(); break;
      case 'dm': await renderDialogs(); break;
      case 'chat': await renderChat(state.route.arg); break;
      case 'settings': renderSettings(); break;
      case 'admin': await renderAdmin(); break;
      default: await renderFeed();
    }
  } catch (err) {
    view.innerHTML = emptyState('Что-то сломалось', err.message);
  }

  if (state.me?.banned) {
    view.insertAdjacentHTML('afterbegin',
      `<div class="ban-banner">Аккаунт заблокирован: ${esc(state.me.banReason || 'без указания причины')}. Писать и комментировать нельзя.</div>`);
  }
  renderAuthSlot();
  renderRails();
}

const go = (hash) => { if (location.hash === hash) router(); else location.hash = hash; };

function feedHash({ channel = state.channel, sort = state.sort, q = state.query } = {}) {
  const params = new URLSearchParams();
  if (sort !== 'hot') params.set('sort', sort);
  if (q) params.set('q', q);
  const base = channel && channel !== 'all' ? `/c/${channel}` : '/';
  const qs = params.toString();
  return `#${base}${qs ? `?${qs}` : ''}`;
}

async function refreshMe() {
  try { state.me = await api('/me'); } catch { state.me = null; }
  renderAuthSlot();
  renderRails();
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

  const goNode = near('[data-go]');
  if (goNode) return go(goNode.dataset.go);

  const act = near('[data-act]')?.dataset.act;
  if (act === 'login') return openAuth('login');
  if (act === 'register') return openAuth('register');
  if (act === 'compose') return openComposer();
  if (act === 'back') return history.length > 1 ? history.back() : go(feedHash({ channel: 'all' }));
  if (act === 'delete-account') return openDeleteAccount();
  if (act === 'logout-all') {
    if (!confirm('Выйти на всех устройствах? Придётся входить заново везде.')) return;
    await api('/auth/logout-all', { method: 'POST' });
    state.me = null;
    toast('Сессии сброшены везде');
    return go('#/');
  }
  if (act === 'logout') {
    if (!confirm('Выйти из аккаунта?')) return;
    await api('/auth/logout', { method: 'POST' });
    state.me = null;
    toast('Вышли. До скорого.');
    return go('#/');
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

  if (near('#load-more')) {
    state.page.offset += 30;
    return renderFeed();
  }

  const editPost = near('[data-edit-post]');
  if (editPost) {
    try {
      const post = await api(`/posts/${editPost.dataset.editPost}`);
      return openEditor(post);
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  const editComment = near('[data-edit-comment]');
  if (editComment) {
    const node = editComment.closest('[data-comment]');
    const current = $('.comment__body', node)?.textContent || '';
    return openCommentEditor(editComment.dataset.editComment, current);
  }

  const block = near('[data-block]');
  if (block) {
    if (!confirm('Заблокировать игрока? Переписка и подписки между вами оборвутся.')) return;
    try {
      const result = await api(`/users/${encodeURIComponent(block.dataset.block)}/block`, { method: 'POST' });
      toast(result.blocked ? 'Игрок заблокирован' : 'Блокировка снята');
      router();
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  const pin = near('[data-pin]');
  if (pin) {
    try {
      const result = await api(`/posts/${pin.dataset.pin}/pin`, { method: 'POST' });
      toast(result.pinned ? 'Пост закреплён' : 'Пост откреплён');
      router();
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  const follow = near('[data-follow]');
  if (follow) {
    try {
      const result = await api(`/users/${encodeURIComponent(follow.dataset.follow)}/follow`, { method: 'POST' });
      toast(result.followed ? 'Подписка оформлена' : 'Отписались');
      router();
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  const delPost = near('[data-delete-post]');
  if (delPost) {
    if (!confirm('Удалить пост вместе с обсуждением?')) return;
    try {
      await api(`/posts/${delPost.dataset.deletePost}`, { method: 'DELETE' });
      toast('Пост удалён');
      if (state.route.name === 'post') go(feedHash({ channel: 'all' })); else router();
      refreshStats();
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  const delComment = near('[data-delete-comment]');
  if (delComment) {
    try {
      await api(`/comments/${delComment.dataset.deleteComment}`, { method: 'DELETE' });
      delComment.closest('[data-comment]').remove();
      toast('Ответ удалён');
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  const reportPost = near('[data-report-post]');
  if (reportPost) return openReport('post', reportPost.dataset.reportPost);
  const reportUser = near('[data-report-user]');
  if (reportUser) return openReport('user', reportUser.dataset.reportUser);

  const ban = near('[data-ban]');
  if (ban) return openBan(ban.dataset.ban);

  const unban = near('[data-unban]');
  if (unban) {
    try {
      await api('/admin/ban', { method: 'POST', body: { userId: Number(unban.dataset.unban), banned: false } });
      toast('Игрок разбанен');
      router();
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  const resolve = near('[data-resolve]');
  if (resolve) {
    try {
      await api('/admin/resolve', { method: 'POST', body: { reportId: Number(resolve.dataset.resolve) } });
      toast('Жалоба закрыта');
      router();
    } catch (err) { toast(err.message, 'error'); }
  }
});

document.addEventListener('change', async (event) => {
  const roleSelect = event.target.closest('[data-role-for]');
  if (roleSelect) {
    try {
      const user = await api('/admin/role', {
        method: 'POST',
        body: { userId: Number(roleSelect.dataset.roleFor), role: roleSelect.value },
      });
      toast(`${user.username} → ${user.role}`);
      router();
    } catch (err) { toast(err.message, 'error'); router(); }
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'set-wr') $('#wr-value').textContent = event.target.value;
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));

  if (form.id === 'auth-form') {
    try {
      state.me = await api(`/auth/${form.dataset.mode}`, { method: 'POST', body: values });
      closeModal();
      toast(`Привет, ${state.me.username}`);
      await refreshMe();
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

  if (form.id === 'comment-form') {
    try {
      const comment = await api(`/posts/${state.route.arg}/comments`, { method: 'POST', body: values });
      const list = $('#comment-list');
      if ($('.empty', list)) list.innerHTML = '';
      list.insertAdjacentHTML('beforeend', commentRow(comment));
      form.reset();
      const heading = list.previousElementSibling;
      const total = list.children.length;
      if (heading) heading.textContent = `${total} ${plural(total, ['ответ', 'ответа', 'ответов'])}`;
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  if (form.id === 'chat-form') {
    const body = values.body?.trim();
    if (!body) return;
    try {
      await api(`/messages/${encodeURIComponent(form.dataset.user)}`, { method: 'POST', body: { body } });
      form.reset();
      await renderChat(form.dataset.user);
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  if (form.id === 'profile-form') {
    try {
      state.me = {
        ...await api('/me', { method: 'PATCH', body: { ...values, accent: Number(form.dataset.accent) } }),
        unread: state.me.unread,
      };
      toast('Профиль обновлён');
      renderAuthSlot();
    } catch (err) { showFormError(form, err.message); }
    return;
  }

  if (form.id === 'password-form') {
    try {
      await api('/me/password', { method: 'POST', body: values });
      state.me = null;
      toast('Пароль сменён — войди заново');
      go('#/');
      openAuth('login');
    } catch (err) { showFormError(form, err.message); }
    return;
  }

  if (form.id === 'edit-post-form') {
    try {
      await api(`/posts/${form.dataset.id}`, { method: 'PATCH', body: values });
      closeModal();
      toast('Пост обновлён');
      router();
    } catch (err) { showFormError(form, err.message); }
    return;
  }

  if (form.id === 'edit-comment-form') {
    try {
      await api(`/comments/${form.dataset.id}`, { method: 'PATCH', body: values });
      closeModal();
      toast('Ответ обновлён');
      router();
    } catch (err) { showFormError(form, err.message); }
    return;
  }

  if (form.id === 'delete-account-form') {
    try {
      await api('/me', { method: 'DELETE', body: values });
      state.me = null;
      closeModal();
      toast('Аккаунт удалён');
      go('#/');
    } catch (err) { showFormError(form, err.message); }
    return;
  }

  if (form.id === 'report-form') {
    try {
      await api('/reports', {
        method: 'POST',
        body: { targetType: form.dataset.type, targetId: Number(form.dataset.id), reason: values.reason },
      });
      closeModal();
      toast('Жалоба отправлена модераторам');
    } catch (err) { showFormError(form, err.message); }
    return;
  }

  if (form.id === 'ban-form') {
    try {
      await api('/admin/ban', {
        method: 'POST',
        body: { userId: Number(form.dataset.id), banned: true, reason: values.reason },
      });
      closeModal();
      toast('Игрок забанен');
      router();
    } catch (err) { showFormError(form, err.message); }
    return;
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
$('#compose-fab').addEventListener('click', openComposer);
window.addEventListener('hashchange', router);

(async function boot() {
  try { state.meta = await api('/meta'); } catch { /* без справочника формы будут беднее */ }
  await refreshMe();
  await Promise.all([router(), refreshStats()]);
  setInterval(refreshMe, 25000);   // непрочитанные в шапке
  setInterval(refreshStats, 45000);
})();
