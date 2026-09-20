<?php
/** Страницы входа, регистрации и входа через сеть RetroCore. */

function page_home(): void
{
    if (current_user()) redirect('/feed');
    page_login();
}

function page_login(): void
{
    if (current_user()) redirect('/feed');
    render('auth', [
        'title' => 'Вход', 'mode' => 'login', 'form' => [],
        'next' => safe_path($_GET['next'] ?? null, ''),
    ]);
}

function page_login_post(): void
{
    $login = trim_text($_POST['login'] ?? '', 20);
    $password = (string)($_POST['password'] ?? '');
    $next = safe_path($_POST['next'] ?? null, '/feed');

    $fail = fn(string $error) => render('auth', [
        'title' => 'Вход', 'mode' => 'login', 'error' => $error,
        'form' => ['login' => $login], 'next' => $next,
    ]);

    if (!rate_limit('login', 900, 20)) {
        $fail('Слишком много попыток входа. Попробуйте через четверть часа.');
    }

    $user = user_by_login($login);
    // Проверяем пароль даже для несуществующего логина: иначе по скорости
    // ответа видно, какие логины заняты.
    $hash = $user['password_hash'] ?? '$2y$10$usqI4hVFpUtYmFCLWzpBN.hm1dkUIfXi5oQpXgIgwCbLR1yHTrSia';
    $ok = verify_password($password, $hash) && $user !== null;

    if (!$ok) $fail('Неверный логин или пароль.');

    login_as((int)$user['id']);
    redirect($next === '/login' ? '/feed' : $next);
}

function page_register(): void
{
    if (current_user()) redirect('/feed');
    if (!config('open_register', true)) {
        render_error(403, 'Регистрация на этом сайте закрыта.');
    }
    render('auth', ['title' => 'Регистрация', 'mode' => 'register', 'form' => [], 'next' => '']);
}

function page_register_post(): void
{
    if (!config('open_register', true)) {
        render_error(403, 'Регистрация на этом сайте закрыта.');
    }

    $form = [
        'first_name' => trim_text($_POST['first_name'] ?? '', 30),
        'last_name' => trim_text($_POST['last_name'] ?? '', 30),
        'login' => trim_text($_POST['login'] ?? '', 20),
        'sex' => ($_POST['sex'] ?? 'm') === 'f' ? 'f' : 'm',
    ];
    $password = (string)($_POST['password'] ?? '');

    $fail = fn(string $error) => render('auth', [
        'title' => 'Регистрация', 'mode' => 'register', 'error' => $error, 'form' => $form, 'next' => '',
    ]);

    if (!rate_limit('register', 3600, 10)) $fail('Слишком много регистраций с этого адреса. Подождите час.');
    if ($form['first_name'] === '' || $form['last_name'] === '') $fail('Укажите имя и фамилию.');
    if (!preg_match(LOGIN_RE, $form['login'])) {
        $fail('Логин: латиница, цифры, точка и подчёркивание, от 3 до 20 символов.');
    }
    if (in_array(mb_strtolower($form['login']), RESERVED_LOGINS, true)) {
        $fail('Этот логин занят системой, выберите другой.');
    }
    if ($problem = password_problem($password)) $fail($problem);
    if ($password !== (string)($_POST['password2'] ?? '')) $fail('Пароли не совпадают.');
    if (user_by_login($form['login'])) $fail('Такой логин уже занят.');

    $user = db_insert('users', $form + [
        'password_hash' => hash_password($password),
        'theme' => (string)config('theme', 'vo'),
        'created_at' => now(),
        'last_seen' => now(),
    ]);
    db_insert('albums', ['owner_type' => 'user', 'owner_id' => $user['id'],
        'title' => 'Фотографии со страницы', 'created_at' => now()]);

    login_as((int)$user['id']);
    redirect('/settings');
}

function page_logout(): void
{
    logout();
    redirect('/');
}

/* --------------------------------------------------------- сеть RetroCore */

function page_connect_start(): void
{
    if (current_user()) redirect('/feed');
    if (!rc_enabled()) render_error(404, 'Вход через RetroCore на этом сайте не настроен.');
    if (!rate_limit('connect', 600, 30)) render_error(429, 'Слишком много попыток. Подождите немного.');

    $state = rc_new_state();
    $_SESSION['rc_state'] = $state;
    $_SESSION['rc_next'] = safe_path($_GET['next'] ?? null, '/feed');
    $_SESSION['rc_at'] = time();

    redirect(rc_authorize_url($state));
}

function page_connect_callback(): void
{
    if (!rc_enabled()) render_error(404, 'Вход через RetroCore на этом сайте не настроен.');
    if (current_user()) redirect('/feed');

    $state = (string)($_SESSION['rc_state'] ?? '');
    $next = safe_path($_SESSION['rc_next'] ?? null, '/feed');
    $at = (int)($_SESSION['rc_at'] ?? 0);
    // state одноразовый: второй раз тот же код не пройдёт.
    unset($_SESSION['rc_state'], $_SESSION['rc_next'], $_SESSION['rc_at']);

    $problem = fn(string $text) => render_error(400, 'Вход через RetroCore не удался: ' . $text);

    if (!empty($_GET['error'])) $problem('сеть отказала во входе');
    if ($state === '' || !hash_equals($state, (string)($_GET['state'] ?? ''))) {
        $problem('адрес возврата не совпал с началом входа. Начните заново со страницы входа');
    }
    if (time() - $at > 600) $problem('вход слишком долго ждал, начните заново');

    $code = (string)($_GET['code'] ?? '');
    if ($code === '' || strlen($code) > 512) $problem('сеть не прислала код');

    try {
        $rcUser = rc_exchange($code);
        $user = rc_upsert_user($rcUser);
    } catch (Throwable $e) {
        error_log('[retrocore] ' . $e->getMessage());
        $problem($e->getMessage());
        return;
    }

    login_as((int)$user['id']);
    redirect(!empty($user['fresh']) ? '/settings' : $next);
}
