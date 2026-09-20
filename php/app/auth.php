<?php
/** ВОнлайне — вход, пароли и текущий человек. */

const MIN_PASSWORD = 8;
const LOGIN_RE = '~^[a-z0-9_.]{3,20}$~i';

/** Адреса, которые занимает сам сайт: логинами их отдавать нельзя. */
const RESERVED_LOGINS = [
    'id', 'im', 'feed', 'login', 'logout', 'register', 'settings', 'search', 'help', 'friends',
    'photos', 'photo', 'album', 'albums', 'audio', 'video', 'docs', 'doc', 'club', 'groups',
    'group', 'post', 'wall', 'comment', 'like', 'likes', 'notifications', 'admin', 'api',
    'uploads', 'assets', 'css', 'js', 'img', 'message', 'block', 'unblock', 'connect', 'data',
];

/** Пароль хранится хешем, который умеет сам PHP (сейчас это bcrypt/argon). */
function hash_password(string $password): string
{
    return password_hash($password, PASSWORD_DEFAULT);
}

function verify_password(string $password, string $stored): bool
{
    return $stored !== '' && password_verify($password, $stored);
}

/** Простые пароли отклоняем сразу. */
function password_problem(string $password): ?string
{
    if (mb_strlen($password) < MIN_PASSWORD) return 'Пароль короче ' . MIN_PASSWORD . ' символов.';
    $weak = ['password', 'пароль', '12345678', '123456789', 'qwerty123', 'qwertyui', '11111111', 'vonline'];
    if (in_array(mb_strtolower($password), $weak, true)) return 'Такой пароль подберут за секунду.';
    if (preg_match('~^(.)\1+$~u', $password)) return 'Пароль из одного символа — не пароль.';
    return null;
}

/** Сессии держим в папке сайта, чтобы всё хозяйство лежало в одном месте. */
function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;

    $dir = db_dir() . '/sessions';
    if (!is_dir($dir)) mkdir($dir, 0770, true);

    session_name('vo_sid');
    session_save_path($dir);
    session_set_cookie_params([
        'lifetime' => 30 * 86400,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => !empty($_SERVER['HTTPS']),
    ]);
    session_start();
}

/** Текущий человек или null. Заодно отмечаем, что он сейчас на сайте. */
function current_user(): ?array
{
    static $user = null;
    static $loaded = false;
    if ($loaded) return $user;
    $loaded = true;

    $id = $_SESSION['user_id'] ?? null;
    if (!$id) return null;

    $user = db_get('users', (int)$id);
    if (!$user) {
        unset($_SESSION['user_id']);
        return null;
    }
    // Чаще раза в минуту дёргать базу незачем.
    if (now() - (int)$user['last_seen'] > 60) {
        db_update('users', $user['id'], ['last_seen' => now()]);
        $user['last_seen'] = now();
    }
    return $user;
}

function require_auth(): array
{
    $user = current_user();
    if (!$user) {
        $next = safe_path($_SERVER['REQUEST_URI'] ?? '/', '/');
        redirect('/login?next=' . urlencode($next));
    }
    return $user;
}

/** Вход: новая сессия, чтобы нельзя было подсунуть чужой идентификатор. */
function login_as(int $userId): void
{
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    unset($_SESSION['csrf']);
}

function logout(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

/** Завершает все прочие сеансы этого человека — после смены пароля. */
function drop_other_sessions(int $userId): void
{
    $dir = db_dir() . '/sessions';
    $current = session_id();
    foreach (glob($dir . '/sess_*') ?: [] as $file) {
        if (basename($file) === 'sess_' . $current) continue;
        $raw = (string)file_get_contents($file);
        if (preg_match('~user_id\|i:(\d+);~', $raw, $m) && (int)$m[1] === $userId) {
            @unlink($file);
        }
    }
}
