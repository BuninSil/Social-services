<?php
/**
 * Завести страницу или сменить пароль из командной строки.
 *
 *   php tools/account.php vladislav "Владислав Бунин" мой-пароль
 *
 * Пригодится, когда регистрация на сайте закрыта (open_register => false)
 * или когда забыли пароль.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

mb_internal_encoding('UTF-8');
define('VO_ROOT', dirname(__DIR__));
define('VO_DATA_DIR', VO_ROOT . '/data');
define('VO_UPLOAD_DIR', VO_ROOT . '/uploads');

function config(string $key, $fallback = null)
{
    static $config = null;
    if ($config === null) $config = require VO_ROOT . '/app/config.php';
    return $config[$key] ?? $fallback;
}

require VO_ROOT . '/app/util.php';
require VO_ROOT . '/app/db.php';
require VO_ROOT . '/app/auth.php';
require VO_ROOT . '/app/models.php';

$login = $argv[1] ?? '';
$name = $argv[2] ?? '';
$password = $argv[3] ?? '';

if ($login === '' || $password === '') {
    echo PHP_EOL;
    echo '  php tools/account.php <логин> "<Имя Фамилия>" <пароль>' . PHP_EOL . PHP_EOL;
    echo '  Логин: латиница, цифры, точка и подчёркивание, от 3 до 20 символов.' . PHP_EOL . PHP_EOL;
    exit(1);
}

if (!preg_match(LOGIN_RE, $login)) {
    fwrite(STDERR, 'Логин не подходит: латиница, цифры, точка и подчёркивание, 3–20 символов.' . PHP_EOL);
    exit(1);
}
if ($problem = password_problem($password)) {
    fwrite(STDERR, $problem . PHP_EOL);
    exit(1);
}

$parts = preg_split('~\s+~u', trim($name ?: $login));
$first = mb_substr($parts[0], 0, 30);
$last = mb_substr(implode(' ', array_slice($parts, 1)), 0, 30);

$existing = user_by_login($login);

if ($existing) {
    db_update('users', $existing['id'], [
        'password_hash' => hash_password($password),
        'rc_only' => 0,
    ]);
    echo 'Пароль для «' . $existing['login'] . '» изменён (id' . $existing['id'] . ').' . PHP_EOL;
} else {
    $user = db_insert('users', [
        'login' => $login,
        'password_hash' => hash_password($password),
        'first_name' => $first,
        'last_name' => $last,
        'theme' => (string)config('theme', 'vo'),
        'created_at' => now(),
        'last_seen' => now(),
    ]);
    db_insert('albums', ['owner_type' => 'user', 'owner_id' => $user['id'],
        'title' => 'Фотографии со страницы', 'created_at' => now()]);
    echo 'Страница заведена: ' . trim($first . ' ' . $last) . ' — /' . $login
        . ' (id' . $user['id'] . ').' . PHP_EOL;
}
