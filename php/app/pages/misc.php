<?php
/** Ответы, поиск, настройки, помощь, люди сети, переключение оформления. */

function page_notifications(): void
{
    $me = require_auth();
    $page = max(1, (int)($_GET['page'] ?? 1));
    $items = list_notifications((int)$me['id'], PER_PAGE + 1, ($page - 1) * PER_PAGE);
    $hasMore = count($items) > PER_PAGE;

    render('notifications', [
        'title' => 'Мои Ответы', 'nav' => 'notifications',
        'items' => array_slice($items, 0, PER_PAGE),
        'page' => $page,
        'pages' => $hasMore ? $page + 1 : $page,
    ]);
    // Отметка о прочтении — уже после показа, иначе счётчик мигает.
}

function page_notifications_read(): void
{
    $me = require_auth();
    mark_notifications_read((int)$me['id']);
    redirect(back_to('/notifications'));
}

function page_search(): void
{
    $me = require_auth();
    $q = trim_text($_GET['q'] ?? '', 100);
    $tab = in_array($_GET['tab'] ?? '', ['posts', 'groups'], true) ? $_GET['tab'] : 'people';

    $users = [];
    $statuses = [];
    if ($tab === 'people') {
        $users = $q === '' ? array_slice(db_all('users'), 0, 50) : search_users($q, 50);
        $users = array_values(array_filter($users, fn($u) => !blocked_either((int)$me['id'], (int)$u['id'])));
        foreach ($users as $u) $statuses[$u['id']] = friend_status((int)$me['id'], (int)$u['id']);
    }

    $groups = [];
    if ($tab === 'groups') {
        $groups = $q === '' ? db_all('groups')
            : db_filter('groups', fn($g) => contains($g['name'], $q) || contains($g['description'], $q));
        usort($groups, fn($a, $b) => strcoll_ru($a['name'], $b['name']));
        $groups = with_members(array_slice($groups, 0, 100));
    }

    render('search', [
        'title' => 'Поиск', 'nav' => 'search',
        'q' => $q, 'tab' => $tab,
        'users' => $users, 'statuses' => $statuses,
        'posts' => $tab === 'posts' && $q !== '' ? search_posts((int)$me['id'], $q, 50) : [],
        'groups' => $groups,
        'total' => db_count('users'),
        'searchQuery' => $q,
    ]);
}

function page_people(): void
{
    require_auth();
    if (!rc_enabled()) render_error(404, 'Связь с сетью RetroCore выключена.');
    render('people', ['title' => 'Люди сети', 'nav' => 'people', 'people' => rc_known_people()]);
}

function page_help(): void
{
    require_auth();
    render('help', ['title' => 'Помощь']);
}

/* --------------------------------------------------------------- настройки */

function show_settings(?string $error = null, ?string $notice = null): void
{
    $me = current_user();
    render('settings', [
        'title' => 'Мои Настройки', 'nav' => 'settings',
        'neon' => neon_colors($me),
        'error' => $error,
        'notice' => $notice ?? (isset($_GET['saved']) ? 'Сохранено.' : null),
    ]);
}

function page_settings(): void
{
    require_auth();
    show_settings();
}

function page_settings_save(): void
{
    $me = require_auth();

    $text = [
        'first_name' => 30, 'last_name' => 30, 'status' => 140, 'bday' => 10, 'city' => 60,
        'hometown' => 60, 'relationship' => 40, 'politics' => 40, 'worldview' => 60,
        'activity' => 500, 'interests' => 500, 'music' => 500, 'films' => 500, 'tv' => 500,
        'books' => 500, 'games' => 500, 'quotes' => 1000, 'about' => 2000,
    ];
    $values = [];
    foreach ($text as $field => $limit) {
        $values[$field] = trim_text($_POST[$field] ?? '', $limit);
    }
    $values['sex'] = ($_POST['sex'] ?? 'm') === 'f' ? 'f' : 'm';

    foreach (['profile_who' => ['all', 'friends'], 'wall_who' => ['all', 'friends', 'me'],
              'photos_who' => ['all', 'friends', 'me'], 'audio_who' => ['all', 'friends', 'me'],
              'friends_who' => ['all', 'friends', 'me'], 'message_who' => ['all', 'friends']] as $field => $allowed) {
        $value = (string)($_POST[$field] ?? 'all');
        $values[$field] = in_array($value, $allowed, true) ? $value : 'all';
    }

    if ($values['first_name'] === '') {
        show_settings('Имя не может быть пустым.');
    }
    if ($values['bday'] !== '' && !preg_match('~^\d{1,2}\.\d{1,2}(\.\d{4})?$~', $values['bday'])) {
        show_settings('День рождения — в формате ДД.ММ.ГГГГ.');
    }

    db_update('users', $me['id'], $values);
    redirect('/settings?saved=1');
}

function page_settings_avatar(): void
{
    $me = require_auth();
    $files = uploaded_files('avatar', 1);
    if (!$files) show_settings('Выберите картинку.');

    try {
        $saved = media_save_image($files[0]['tmp'], 'avatars', 400, 200, true);
    } catch (Throwable $e) {
        show_settings('Это не похоже на картинку.');
        return;
    }

    $old = $me['avatar'];
    db_update('users', $me['id'], ['avatar' => $saved['file']]);
    if ($old) {
        media_remove($old);
        media_remove(thumb_of($old));
    }
    redirect('/settings?saved=1');
}

function page_settings_avatar_delete(): void
{
    $me = require_auth();
    if ($me['avatar']) {
        media_remove($me['avatar']);
        media_remove(thumb_of($me['avatar']));
        db_update('users', $me['id'], ['avatar' => null]);
    }
    redirect('/settings');
}

function page_settings_password(): void
{
    $me = require_auth();
    if (!rate_limit('password', 3600, 20)) render_error(429, 'Слишком много попыток. Подождите час.');

    $password = (string)($_POST['password'] ?? '');

    // У страницы из RetroCore старого пароля нет — там лежит случайный хеш.
    if (!$me['rc_only'] && !verify_password((string)($_POST['old_password'] ?? ''), $me['password_hash'])) {
        show_settings('Старый пароль указан неверно.');
    }
    if ($problem = password_problem($password)) show_settings($problem);
    if ($password !== (string)($_POST['password2'] ?? '')) show_settings('Новые пароли не совпадают.');

    db_update('users', $me['id'], ['password_hash' => hash_password($password), 'rc_only' => 0]);
    drop_other_sessions((int)$me['id']);

    show_settings(null, 'Пароль изменён. Остальные сеансы завершены.');
}

function page_settings_theme(): void
{
    $me = require_auth();
    $theme = (string)($_POST['theme'] ?? 'vo');
    if (!is_theme($theme)) $theme = 'vo';

    $colors = [
        'neon_c1' => hex_color($_POST['neon_c1'] ?? '', NEON_DEFAULTS['c1']),
        'neon_c2' => hex_color($_POST['neon_c2'] ?? '', NEON_DEFAULTS['c2']),
        'neon_bg' => hex_color($_POST['neon_bg'] ?? '', NEON_DEFAULTS['bg']),
    ];

    $preset = (string)($_POST['preset'] ?? '');
    foreach (NEON_PRESETS as $p) {
        if ($p['id'] !== $preset) continue;
        $colors = ['neon_c1' => $p['c1'], 'neon_c2' => $p['c2'], 'neon_bg' => $p['bg']];
        $theme = 'neon';
    }

    db_update('users', $me['id'], ['theme' => $theme] + $colors);
    $_SESSION['theme'] = $theme;
    redirect(back_to('/settings') . '#theme');
}

/** Кнопка в шапке: светлая → тёмная → неоновая. */
function page_theme_cycle(): void
{
    $me = current_user();
    $next = next_theme(current_theme($me));
    $_SESSION['theme'] = $next;
    if ($me) db_update('users', $me['id'], ['theme' => $next]);
    redirect(back_to('/'));
}

function page_settings_delete(): void
{
    $me = require_auth();

    if (!$me['rc_only'] && !verify_password((string)($_POST['password'] ?? ''), $me['password_hash'])) {
        show_settings('Пароль указан неверно — страница на месте.');
    }

    $userId = (int)$me['id'];

    // Файлы с диска
    foreach (['photos', 'videos', 'audios', 'docs'] as $collection) {
        foreach (db_filter($collection, ['owner_id' => $userId]) as $row) {
            media_remove($row['file']);
            if (!empty($row['thumb'])) media_remove($row['thumb']);
            if (!empty($row['poster'])) media_remove($row['poster']);
        }
        db_remove($collection, ['owner_id' => $userId]);
    }
    if ($me['avatar']) {
        media_remove($me['avatar']);
        media_remove(thumb_of($me['avatar']));
    }

    // Всё, что цеплялось за страницу
    foreach (db_filter('posts', fn($p) => $p['author_id'] === $userId
        || ($p['owner_type'] === 'user' && $p['owner_id'] === $userId)) as $post) {
        delete_post((int)$post['id']);
    }
    db_remove('comments', ['author_id' => $userId]);
    db_remove('likes', ['user_id' => $userId]);
    db_remove('notifications', fn($n) => $n['user_id'] === $userId || $n['actor_id'] === $userId);
    db_remove('friendships', fn($f) => $f['from_id'] === $userId || $f['to_id'] === $userId);
    db_remove('blocks', fn($b) => $b['user_id'] === $userId || $b['blocked_id'] === $userId);
    db_remove('group_members', ['user_id' => $userId]);
    db_remove('conversation_members', ['user_id' => $userId]);
    db_remove('messages', ['from_id' => $userId]);
    db_remove('albums', ['owner_type' => 'user', 'owner_id' => $userId]);
    db_remove('users', $userId);

    logout();
    redirect('/');
}
