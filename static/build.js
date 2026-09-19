'use strict';

/**
 * Сборка статической версии ВОнлайне.
 *
 * Собирает папку dist/ и архив vonline-site.zip, который целиком заливается
 * в сеть RetroCore («Вариант А»: сайт, загруженный в сеть). Оформление берётся
 * из тех же файлов, что и у серверной версии, — разметка у них общая.
 *
 *   npm run static
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ZIP = path.join(ROOT, 'vonline-site.zip');

const YEAR = new Date().getFullYear();

/* ------------------------------------------------------------- страницы */

const MENU = [
  ['index.html', 'profile', 'Моя Страница', 'ред.'],
  ['feed.html', 'feed', 'Мои Новости', ''],
  ['notifications.html', 'notifications', 'Мои Ответы', ''],
  ['im.html', 'im', 'Мои Сообщения', ''],
  ['people.html', 'people', 'Люди сети', ''],
  ['photos.html', 'photos', 'Мои Фотографии', ''],
  ['video.html', 'video', 'Мои Видеозаписи', ''],
  ['audio.html', 'audio', 'Мои Аудиозаписи', ''],
  ['docs.html', 'docs', 'Мои Документы', ''],
  ['groups.html', 'groups', 'Мои Группы', ''],
  ['search.html', 'search', 'Поиск', ''],
  ['settings.html', 'settings', 'Мои Настройки', ''],
];

const notice = '<div id="page_notice" hidden></div>';

const PAGES = [
  {
    file: 'index.html', page: 'index', nav: 'profile',
    title: 'Моя страница',
    desc: 'Личная страница в ВОнлайне: анкета, статус, стена с записями, фотографии, музыка и видео. Оформление старого ВКонтакте.',
    body: `
<div class="page_title"><span id="profile_name">Моя страница</span>
  <span class="right" id="profile_state"></span></div>
${notice}
<div id="profile_left"></div>
<div id="profile_right"></div>
<div class="clear"></div>`,
  },
  {
    file: 'feed.html', page: 'feed', nav: 'feed',
    title: 'Мои Новости',
    desc: 'Лента записей: всё, что написано на стене и в группах, в порядке от свежего к старому.',
    body: `
<div class="page_title">Мои Новости <span class="right" id="feed_count"></span></div>
${notice}
<div id="wall_form_box"></div>
<div class="block"><div class="block_head">Последние записи</div>
  <div class="block_body tight" id="feed_list"></div></div>`,
  },
  {
    file: 'im.html', page: 'im', nav: 'im', noindex: true,
    title: 'Мои Сообщения',
    desc: 'Заметки себе: ссылки, файлы и мысли, которые не хочется терять.',
    body: `
<div class="page_title">Мои Сообщения <span class="right">заметки себе</span></div>
${notice}
<div class="block"><div class="block_head">История</div><div id="chat"></div></div>
<div id="note_form_box"></div>`,
  },
  {
    file: 'notifications.html', page: 'notifications', nav: 'notifications',
    title: 'Мои Ответы',
    desc: 'Отметки «мне нравится» и комментарии к записям и фотографиям страницы.',
    body: `
<div class="page_title">Мои Ответы</div>
${notice}
<div class="block"><div class="block_body tight" id="notif_list"></div></div>`,
  },
  {
    file: 'people.html', page: 'people', nav: 'people',
    title: 'Люди сети',
    desc: 'Участники сети RetroCore: кто сейчас на сайте и ссылки на их профили в сети.',
    body: `
<div class="page_title">Люди сети <span class="right" id="people_count"></span></div>
${notice}
<div class="block"><div class="block_body">
  <form id="people_form">
    <input class="text" type="text" id="people_q" size="24" placeholder="имя в сети">
    <button class="button" type="submit">Найти</button>
    <label class="attach_label"><input type="checkbox" id="people_online"> только на сайте</label>
  </form>
</div></div>
<div class="block"><div class="block_body tight" id="people_list"></div></div>`,
  },
  {
    file: 'photos.html', page: 'photos', nav: 'photos',
    title: 'Мои Фотографии',
    desc: 'Фотоальбомы страницы: снимки с листанием, лайками и комментариями.',
    body: `
<div class="page_title">Мои фотографии</div>
${notice}
<div class="block" id="photos_actions" hidden><div class="block_body">
  <button class="button button_blue" type="button" id="album_add">Создать альбом</button>
  <span class="attach_label">Загрузить фотографии:</span>
  <input type="file" id="photo_files" accept="image/*" multiple>
</div></div>
<div class="block"><div class="block_head">Альбомы</div>
  <div class="block_body" id="albums"></div></div>`,
  },
  {
    file: 'album.html', page: 'album', nav: 'photos',
    title: 'Альбом',
    desc: 'Фотоальбом страницы в ВОнлайне.',
    body: `
<div class="page_title"><span id="album_title">Альбом</span>
  <span class="right"><a href="photos.html">Все альбомы</a></span></div>
${notice}
<div class="block" id="album_actions" hidden><div class="block_body">
  <span class="attach_label">Загрузить сюда:</span>
  <input type="file" id="album_files" accept="image/*" multiple>
  <button class="button" type="button" id="album_del">Удалить альбом</button>
</div></div>
<div class="block"><div class="block_head">Фотографии <span class="right" id="album_count">0</span></div>
  <div class="block_body" id="album_body"></div></div>`,
  },
  {
    file: 'photo.html', page: 'photo', nav: 'photos',
    title: 'Фотография',
    desc: 'Просмотр фотографии с листанием, отметкой «мне нравится» и комментариями.',
    body: `
<div class="page_title">Фотография
  <span class="right"><a id="photo_album" href="photos.html">Альбом</a></span></div>
${notice}
<div class="block" id="photo_box"></div>`,
  },
  {
    file: 'video.html', page: 'video', nav: 'video',
    title: 'Мои Видеозаписи',
    desc: 'Видеозаписи страницы со встроенным плеером.',
    body: `
<div class="page_title">Мои видеозаписи <span class="right" id="video_list_count"></span></div>
${notice}
<div class="block" id="upload_box" hidden><div class="block_head">Загрузить видео</div>
  <div class="block_body"><input type="file" id="video_files" accept="video/*" multiple>
    <div class="gray small">MP4 и WebM, до 256 МБ.</div></div></div>
<div class="block"><div class="block_head">Список</div>
  <div class="block_body" id="video_list"></div></div>`,
  },
  {
    file: 'audio.html', page: 'audio', nav: 'audio',
    title: 'Мои Аудиозаписи',
    desc: 'Музыка страницы: свои файлы с плеером, исполнитель и название разбираются из имени файла.',
    body: `
<div class="page_title">Мои аудиозаписи <span class="right" id="audio_list_count"></span></div>
${notice}
<div class="block" id="upload_box" hidden><div class="block_head">Загрузить музыку</div>
  <div class="block_body"><input type="file" id="audio_files" accept="audio/*" multiple>
    <div class="gray small">MP3, OGG, WAV, FLAC, M4A — до 30 МБ. Имя вида «Артист - Название» разберётся само.</div></div></div>
<div class="block"><div class="block_head">Список</div>
  <div class="block_body tight" id="audio_list"></div></div>`,
  },
  {
    file: 'docs.html', page: 'docs', nav: 'docs',
    title: 'Мои Документы',
    desc: 'Документы страницы: PDF, архивы и текстовые файлы — скачиваются под исходным именем.',
    body: `
<div class="page_title">Мои документы <span class="right" id="doc_list_count"></span></div>
${notice}
<div class="block" id="upload_box" hidden><div class="block_head">Загрузить документ</div>
  <div class="block_body"><input type="file" id="doc_files" multiple>
    <div class="gray small">PDF, архивы, текст — до 50 МБ.</div></div></div>
<div class="block"><div class="block_head">Список</div>
  <div class="block_body tight" id="doc_list"></div></div>`,
  },
  {
    file: 'groups.html', page: 'groups', nav: 'groups',
    title: 'Мои Группы',
    desc: 'Группы страницы: своя стена, описание и аватар у каждой.',
    body: `
<div class="page_title">Мои группы <span class="right" id="groups_count"></span></div>
${notice}
<div class="block" id="groups_actions" hidden><div class="block_body">
  <button class="button button_blue" type="button" id="group_add">Создать группу</button></div></div>
<div class="block"><div class="block_body tight" id="group_list"></div></div>`,
  },
  {
    file: 'group.html', page: 'group', nav: 'groups',
    title: 'Группа',
    desc: 'Страница группы в ВОнлайне: описание, аватар и стена с записями.',
    body: `
<div class="page_title"><span id="group_title">Группа</span>
  <span class="right"><a href="groups.html">Все группы</a></span></div>
${notice}
<div id="profile_left"></div>
<div id="profile_right"></div>
<div class="clear"></div>`,
  },
  {
    file: 'search.html', page: 'search', nav: 'search',
    title: 'Поиск',
    desc: 'Поиск по записям, заметкам, фотографиям, музыке и документам страницы.',
    body: `
<div class="page_title">Поиск <span class="right" id="search_count"></span></div>
${notice}
<div class="block"><div class="block_body">
  <form id="search_form">
    <input class="text" type="text" id="search_q" size="30" placeholder="что ищем">
    <button class="button button_blue" type="submit">Найти</button>
  </form>
</div></div>
<div class="block"><div class="block_body tight" id="search_results"></div></div>`,
  },
  {
    file: 'settings.html', page: 'settings', nav: 'settings', noindex: true,
    title: 'Мои Настройки',
    desc: 'Анкета, оформление, свои цвета неоновой темы и сборка архива сайта.',
    body: `
<div class="page_title">Мои Настройки
  <span class="right"><a href="index.html">Вернуться на страницу</a></span></div>
${notice}
<div id="settings_body" hidden>

  <div class="block"><div class="block_head">Фотография страницы</div><div class="block_body">
    <table class="form_table"><tr>
      <td style="width:120px"><img class="pavatar" id="settings_avatar" src="img/camera_200.svg" width="100" alt=""></td>
      <td><input type="file" id="avatar_file" accept="image/*">
        <div style="padding-top:6px">
          <button class="button" type="button" id="avatar_del">Удалить фотографию</button>
        </div></td>
    </tr></table>
  </div></div>

  <form class="block" id="profile_form">
    <div class="block_head">Основная информация</div>
    <div class="block_body"><table class="form_table">
      <tr><td class="label">Имя</td><td><input class="text" type="text" data-field="first_name" size="30" maxlength="30"></td></tr>
      <tr><td class="label">Фамилия</td><td><input class="text" type="text" data-field="last_name" size="30" maxlength="30"></td></tr>
      <tr><td class="label">Пол</td><td><select class="text" data-field="sex">
        <option value="m">мужской</option><option value="f">женский</option></select></td></tr>
      <tr><td class="label">Статус</td><td><input class="text wide" type="text" data-field="status" maxlength="140"></td></tr>
      <tr><td class="label">День рождения</td><td><input class="text" type="text" data-field="bday" size="14" maxlength="10">
        <span class="gray small">в формате ДД.ММ.ГГГГ</span></td></tr>
      <tr><td class="label">Город</td><td><input class="text" type="text" data-field="city" size="30" maxlength="60"></td></tr>
      <tr><td class="label">Родной город</td><td><input class="text" type="text" data-field="hometown" size="30" maxlength="60"></td></tr>
      <tr><td class="label">Семейное положение</td><td><select class="text" data-field="relationship">
        <option value=""></option><option>не женат</option><option>есть подруга</option><option>помолвлен</option>
        <option>женат</option><option>всё сложно</option><option>в активном поиске</option><option>влюблён</option>
      </select></td></tr>
      <tr><td class="label">Полит. взгляды</td><td><select class="text" data-field="politics">
        <option value=""></option><option>индифферентные</option><option>коммунистические</option>
        <option>социалистические</option><option>умеренные</option><option>либеральные</option>
        <option>консервативные</option><option>монархические</option><option>либертарианские</option>
      </select></td></tr>
      <tr><td class="label">Мировоззрение</td><td><input class="text" type="text" data-field="worldview" size="30" maxlength="60"></td></tr>
      <tr><td class="label">Короткий адрес</td><td><input class="text" type="text" data-field="login" size="20" maxlength="20">
        <span class="gray small">латиницей</span></td></tr>
      <tr><td class="label">Имя в сети RetroCore</td><td><input class="text" type="text" id="owner_rc" size="20" maxlength="40">
        <span class="gray small">чтобы сайт сам узнавал хозяина страницы</span></td></tr>

      <tr><td class="label" style="padding-top:14px"><b>Личная информация</b></td><td></td></tr>
      <tr><td class="label">Деятельность</td><td><textarea class="text wide" data-field="activity" style="height:36px" maxlength="500"></textarea></td></tr>
      <tr><td class="label">Интересы</td><td><textarea class="text wide" data-field="interests" style="height:36px" maxlength="500"></textarea></td></tr>
      <tr><td class="label">Любимая музыка</td><td><textarea class="text wide" data-field="music" style="height:36px" maxlength="500"></textarea></td></tr>
      <tr><td class="label">Любимые фильмы</td><td><textarea class="text wide" data-field="films" style="height:36px" maxlength="500"></textarea></td></tr>
      <tr><td class="label">Любимые телешоу</td><td><textarea class="text wide" data-field="tv" style="height:36px" maxlength="500"></textarea></td></tr>
      <tr><td class="label">Любимые книги</td><td><textarea class="text wide" data-field="books" style="height:36px" maxlength="500"></textarea></td></tr>
      <tr><td class="label">Любимые игры</td><td><textarea class="text wide" data-field="games" style="height:36px" maxlength="500"></textarea></td></tr>
      <tr><td class="label">Любимые цитаты</td><td><textarea class="text wide" data-field="quotes" style="height:50px" maxlength="1000"></textarea></td></tr>
      <tr><td class="label">О себе</td><td><textarea class="text wide" data-field="about" style="height:70px" maxlength="2000"></textarea></td></tr>

      <tr><td class="label"></td><td style="padding-top:10px">
        <button class="button button_blue" type="submit">Сохранить</button></td></tr>
    </table></div>
  </form>

  <div class="block" id="theme"><div class="block_head">Оформление</div><div class="block_body">
    <div class="form_row"><div class="lbl">Тема</div><div id="theme_list"></div></div>
    <div class="form_row"><div class="lbl">Цвета неоновой темы</div>
      <table class="form_table">
        <tr><td class="label">Основной акцент</td><td>
          <input type="color" class="color_pick" data-key="c1"> <span class="gray small" id="c1_val"></span></td></tr>
        <tr><td class="label">Второй акцент</td><td>
          <input type="color" class="color_pick" data-key="c2"> <span class="gray small" id="c2_val"></span></td></tr>
        <tr><td class="label">Фон</td><td>
          <input type="color" class="color_pick" data-key="bg"> <span class="gray small" id="bg_val"></span></td></tr>
      </table>
      <div class="gray small">Из этих трёх цветов считается вся палитра: подсветка, рамки, кнопки и ссылки.</div>
    </div>
    <div class="form_row"><div class="lbl">Готовые наборы</div><div id="presets"></div></div>
  </div></div>

  <div class="block"><div class="block_head">Архив сайта</div><div class="block_body">
    <div class="gray" style="padding-bottom:6px">
      Всё написанное и загруженное лежит в этом браузере. Чтобы это увидели остальные —
      соберите архив и залейте его в сеть вместо старого.
    </div>
    <button class="button button_blue" type="button" id="export_zip">Собрать архив сайта (ZIP)</button>
    <button class="button" type="button" id="export_json">Только данные (JSON)</button>
    <span class="attach_label">Загрузить данные:</span>
    <input type="file" id="import_json" accept="application/json,.json">
    <div class="gray small" id="usage" style="padding-top:6px"></div>
    <div style="padding-top:10px">
      <button class="button" type="button" id="wipe">Стереть всё из браузера</button>
    </div>
  </div></div>

</div>`,
  },
  {
    file: 'help.html', page: 'help', nav: '',
    title: 'Помощь',
    desc: 'Как устроена статическая версия ВОнлайне: где живут данные, как опубликовать изменения и чем она отличается от серверной.',
    body: `
<div class="page_title">Помощь</div>

<div class="block"><div class="block_head">Что это такое</div><div class="block_body">
  <p>ВОнлайне — страница в духе ВКонтакте конца нулевых: узкая колонка, серые полосы,
  анкета таблицей и стена внизу. Эта версия собрана из обычных файлов — HTML, CSS и JavaScript,
  без серверного кода, — поэтому её можно просто загрузить в сеть RetroCore.</p>
  <p>Работают: стена с записями, вложения (фото, видео, музыка, документы), «мне нравится»,
  комментарии, закрепление и правка записей, альбомы с просмотром и листанием, видеозаписи,
  аудиозаписи, документы, группы со своей стеной, заметки себе, поиск по странице,
  пять оформлений и свои цвета неоновой темы.</p>
</div></div>

<div class="block"><div class="block_head">Где живут данные</div><div class="block_body">
  <p>Сервера нет, поэтому записи и файлы хранятся прямо в браузере: тексты — в localStorage,
  файлы — в IndexedDB. Это значит две вещи.</p>
  <ul style="margin:6px 0 6px 18px">
    <li>Всё, что вы пишете и загружаете, видно только вам и только в этом браузере.</li>
    <li>Чтобы это увидели остальные, нужно собрать архив сайта в «Моих Настройках»
      и залить его в сеть вместо старого. После этого ваша страница станет такой для всех.</li>
  </ul>
  <p>Гость, открывший сайт, видит опубликованную версию и ничего в ней не меняет —
  у него просто нет такой возможности, править может только хозяин страницы.</p>
</div></div>

<div class="block"><div class="block_head">Про сеть RetroCore</div><div class="block_body">
  <p>Загруженный в сеть сайт знает, кто его открыл: сеть подключает свой скрипт,
  и страница здоровается по имени, а раздел «Люди сети» показывает участников
  со ссылками на их профили.</p>
  <p>Хозяин страницы определяется по имени в сети: если открыл он — появляются кнопки
  правки. На чужом компьютере можно включить правку вручную ссылкой в самом низу.</p>
</div></div>

<div class="block"><div class="block_head">Есть ещё серверная версия</div><div class="block_body">
  <p>У ВОнлайне есть полная версия на Node.js и SQLite: там настоящие друзья, личные
  сообщения с мгновенной доставкой, «печатает…», статус «в сети», уведомления и общая
  лента. Она запускается на своём компьютере и умеет пускать людей по аккаунту RetroCore
  одной кнопкой. Эта, статическая, — её младшая сестра для случая, когда держать сервер
  включённым не хочется.</p>
</div></div>`,
  },
];

const NOT_FOUND = {
  file: '404.html', page: '404', nav: '',
  title: 'Страница не найдена',
  desc: 'Такой страницы в ВОнлайне нет.',
  body: `
<div class="page_title">Страница не найдена</div>
<div class="block"><div class="block_body">
  <p>Такой страницы здесь нет. Возможно, адрес набран с ошибкой или запись удалили.</p>
  <p style="padding-top:8px"><a class="button button_blue" href="index.html">На мою страницу</a></p>
</div></div>`,
};

/* --------------------------------------------------------------- разметка */

function menuHtml(nav) {
  return '<ul id="left_menu">\n' + MENU.map(([file, key, title, extra]) => {
    const sel = key === nav ? ' sel' : '';
    const edit = extra ? '<span class="menu_edit">' + extra + '</span>' : '';
    return '  <li><a href="' + file + '" data-nav="' + key + '" class="' + sel.trim() + '">' +
      title + edit + '</a></li>';
  }).join('\n') + '\n</ul>';
}

function layout(page) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#5e82a6">
<meta name="description" content="${page.desc}">
${page.noindex ? '<meta name="robots" content="noindex">\n' : ''}<title>${page.title} | ВОнлайне</title>
<link id="theme_css" rel="stylesheet" href="css/vo.css">
<link rel="stylesheet" href="css/mobile.css">
<link rel="stylesheet" href="css/static.css">
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
</head>
<body data-page="${page.page}" data-nav="${page.nav}">

<div id="header">
  <div id="header_in">
    <a id="logo" href="index.html"><span class="logo_box">ВО</span>ВОнлайне</a>
    <form id="head_search" action="search.html" method="get">
      <input class="head_q" type="text" name="q" placeholder="поиск по странице">
    </form>
    <div id="head_nav">
      <a href="index.html" class="js_me_name">ВОнлайне</a>
      <span class="sep">|</span>
      <a href="settings.html">Мои Настройки</a>
      <span class="sep">|</span>
      <a href="help.html">Помощь</a>
      <span class="sep">|</span>
      <button type="button" class="link_btn theme_btn" id="theme_btn" title="Сменить оформление">☀</button>
    </div>
    <div class="clear"></div>
  </div>
</div>

<div id="page">
  <div id="side">
${menuHtml(page.nav)}
    <div class="side_note small">Сеть RetroCore.<br>Страница живёт в браузере.</div>
  </div>
  <div id="content">
${page.body}
  </div>
  <div class="clear"></div>
</div>

<div id="footer">
  ВОнлайне &copy; ${YEAR} &middot; сеть для своих
  <span class="theme_pick">оформление: <span id="theme_name">Светлая</span></span>
  <span id="mode_line" style="float:right"></span>
</div>

<script src="/connect.js"></script>
<script src="js/retrocore.js"></script>
<script src="js/store.js"></script>
<script src="js/ui.js"></script>
<script src="js/zip.js"></script>
<script src="js/app.js"></script>
</body>
</html>
`;
}

/* ----------------------------------------------------------------- сборка */

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function seedState() {
  const ts = Math.floor(Date.now() / 1000);
  return {
    v: 1,
    owner: { rc_username: 'buninsil' },
    user: {
      first_name: 'Владислав', last_name: '', login: 'buninsil', sex: 'm',
      status: '', bday: '', city: '', hometown: '', relationship: '', politics: '',
      worldview: '', activity: '', interests: '', music: '', films: '', tv: '',
      books: '', games: '', quotes: '', about: '',
      avatar: null, theme: 'vo',
      neon: { c1: '#2fe0ff', c2: '#ff4ecd', bg: '#070b16' },
      created_at: ts,
    },
    posts: [],
    albums: [{ id: 1, title: 'Фотографии со страницы', description: '', created_at: ts }],
    photos: [], videos: [], audios: [], docs: [], groups: [], notes: [],
    seq: { post: 0, album: 1, photo: 0, video: 0, audio: 0, doc: 0, group: 0, note: 0, comment: 0 },
  };
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // страницы
  for (const page of PAGES.concat([NOT_FOUND])) {
    fs.writeFileSync(path.join(DIST, page.file), layout(page));
  }

  // оформление берём то же самое, что у серверной версии
  for (const name of ['vo.css', 'vo-dark.css', 'vo-neon.css', 'vo-fresh.css', 'vo-modern.css', 'mobile.css']) {
    copy(path.join(ROOT, 'public', 'css', name), path.join(DIST, 'css', name));
  }
  copy(path.join(__dirname, 'css', 'static.css'), path.join(DIST, 'css', 'static.css'));

  for (const name of fs.readdirSync(path.join(ROOT, 'public', 'img'))) {
    copy(path.join(ROOT, 'public', 'img', name), path.join(DIST, 'img', name));
  }

  for (const name of fs.readdirSync(path.join(__dirname, 'js'))) {
    copy(path.join(__dirname, 'js', name), path.join(DIST, 'js', name));
  }

  fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'data', 'site.json'), JSON.stringify(seedState(), null, 1));

  // Список файлов сайта нужен самой странице: из него собирается архив,
  // когда хозяин выгружает свою версию обратно в сеть.
  const files = [];
  (function walk(dir, prefix) {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const rel = prefix ? prefix + '/' + name : name;
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else if (!rel.startsWith('uploads/')) files.push(rel);
    }
  })(DIST, '');
  files.push('data/files.json');
  fs.writeFileSync(path.join(DIST, 'data', 'files.json'), JSON.stringify(files.sort(), null, 1));

  // архив: index.html обязан лежать в корне
  fs.rmSync(ZIP, { force: true });
  execFileSync('zip', ['-r', '-q', ZIP, '.'], { cwd: DIST });

  const size = fs.statSync(ZIP).size;
  console.log('Собрано: ' + files.length + ' файлов в dist/');
  console.log('Архив:   ' + path.relative(ROOT, ZIP) + ' (' + Math.round(size / 1024) + ' КБ)');
  console.log('Заливать в сеть целиком: index.html лежит в корне архива.');
}

build();
