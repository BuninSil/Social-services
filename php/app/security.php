<?php
/** ВОнлайне — защита: токены форм, ограничение частоты, безопасные переходы. */

/** Токен на сессию. В каждой форме он обязателен. */
function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . e(csrf_token()) . '">';
}

/**
 * Любое изменяющее действие — только POST и только со своим токеном.
 * Иначе чужой сайт мог бы выполнить его от имени вошедшего человека.
 */
function csrf_check(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;

    $sent = (string)($_POST['_csrf'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (!hash_equals((string)($_SESSION['csrf'] ?? ''), $sent)) {
        http_response_code(403);
        render_error(403, 'Действие не подтверждено. Обновите страницу и попробуйте ещё раз.');
        exit;
    }
}

/**
 * Ограничение частоты: сколько раз можно сделать действие за окно.
 * Счётчики живут в файле — переживают перезапуск и общие для всех процессов.
 */
function rate_limit(string $action, int $windowSeconds, int $max): bool
{
    $file = db_dir() . '/ratelimit.json';
    $key = $action . '|' . client_ip();
    $now = time();

    $handle = fopen($file, 'c+');
    if (!$handle) return true;
    flock($handle, LOCK_EX);

    $raw = stream_get_contents($handle);
    $all = json_decode($raw ?: '[]', true);
    if (!is_array($all)) $all = [];

    // Заодно подчищаем протухшее, чтобы файл не рос бесконечно.
    foreach ($all as $k => $hits) {
        $all[$k] = array_values(array_filter($hits, fn($t) => $t > $now - 86400));
        if (!$all[$k]) unset($all[$k]);
    }

    $hits = array_values(array_filter($all[$key] ?? [], fn($t) => $t > $now - $windowSeconds));
    $allowed = count($hits) < $max;
    if ($allowed) $hits[] = $now;
    $all[$key] = $hits;

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($all));
    flock($handle, LOCK_UN);
    fclose($handle);

    return $allowed;
}

function client_ip(): string
{
    return (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

/** Переходим только внутрь сайта: чужой адрес в параметре — это ловушка. */
function safe_path(?string $path, string $fallback = '/'): string
{
    $path = (string)$path;
    if ($path === '' || $path[0] !== '/' || str_starts_with($path, '//')) return $fallback;
    if (str_contains($path, "\r") || str_contains($path, "\n")) return $fallback;
    return $path;
}

function back_to(string $fallback): string
{
    return safe_path($_POST['back'] ?? $_GET['back'] ?? null, $fallback);
}

function redirect(string $path): void
{
    header('Location: ' . $path);
    exit;
}

/** Заголовки, которые прикрывают самые обычные дыры. */
function security_headers(): void
{
    $rc = config('retrocore') ? ' ' . config('retrocore_base') : '';
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; "
        . "style-src 'self' 'unsafe-inline'; img-src 'self' data:$rc; media-src 'self' blob:; "
        . "connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; "
        . "form-action 'self'$rc");
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
    header('Permissions-Policy: geolocation=(), camera=(), microphone=(self), interest-cohort=()');
}
