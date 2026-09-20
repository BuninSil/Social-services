<?php
/**
 * ВОнлайне — вход через сеть RetroCore («Вариант Б» из её инструкции).
 *
 * Включается тумблером retrocore в app/config.php. Пока он выключен, сайт
 * живёт на своих логинах и наружу не ходит совсем.
 *
 * Как проходит вход:
 *   1. кнопка ведёт на /connect/authorize сети с client_id, адресом возврата и state;
 *   2. сеть возвращает человека на наш /connect/callback?code=…&state=…;
 *   3. код меняем на данные участника уже отсюда, с сервера — секрет наружу не уходит.
 *
 * Из сети берутся только профили (имя, аватарка, статус) и список людей.
 * Записи, сообщения, фотографии — всё своё, в папках этого сайта.
 */

function rc_enabled(): bool
{
    return (bool)config('retrocore')
        && config('retrocore_client_id') !== ''
        && config('retrocore_client_secret') !== ''
        && config('retrocore_redirect_uri') !== '';
}

function rc_base(): string
{
    return rtrim((string)config('retrocore_base'), '/');
}

function rc_authorize_url(string $state): string
{
    return rc_base() . '/connect/authorize?' . http_build_query([
        'client_id' => config('retrocore_client_id'),
        'redirect_uri' => config('retrocore_redirect_uri'),
        'state' => $state,
    ]);
}

function rc_new_state(): string
{
    return bin2hex(random_bytes(16));
}

/**
 * Меняет одноразовый код на участника. Всё пришедшее считаем чужими данными:
 * проверяем форму, режем управляющие символы, ссылки берём только на саму сеть.
 */
function rc_exchange(string $code): array
{
    $body = json_encode([
        'code' => $code,
        'redirect_uri' => config('retrocore_redirect_uri'),
    ], JSON_UNESCAPED_SLASHES);

    $raw = rc_post(rc_base() . '/api/connect/token', $body);
    $data = json_decode($raw, true);

    if (!is_array($data) || ($data['ok'] ?? false) !== true) {
        throw new RuntimeException((string)($data['error'] ?? 'сеть отклонила код'));
    }

    $user = $data['user'] ?? [];
    $id = (int)($user['id'] ?? 0);
    $username = trim((string)($user['username'] ?? ''));
    if (!$id || $username === '') throw new RuntimeException('сеть не прислала участника');
    if (!empty($user['blocked']) || !empty($user['deleted'])) {
        throw new RuntimeException('этот аккаунт в сети заблокирован');
    }

    return [
        'id' => $id,
        'username' => $username,
        'title' => trim_text($user['title'] ?? '', 60),
        'role' => trim_text($user['role_name'] ?? $user['role'] ?? '', 40),
        'status_msg' => trim_text($user['status_msg'] ?? '', 140),
        'avatar' => rc_same_origin($user['avatar_url'] ?? ''),
        'profile' => rc_same_origin($user['profile_url'] ?? ''),
    ];
}

/** Запрос к сети: сначала curl, если его нет — обычные потоки PHP. */
function rc_post(string $url, string $body): string
{
    $headers = [
        'Authorization: Bearer ' . config('retrocore_client_secret'),
        'Content-Type: application/json',
        'Accept: application/json',
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $answer = curl_exec($ch);
        $error = curl_error($ch);
        curl_close($ch);
        if ($answer === false) throw new RuntimeException('сеть недоступна: ' . $error);
        return (string)$answer;
    }

    $context = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => implode("\r\n", $headers),
        'content' => $body,
        'timeout' => 10,
        'ignore_errors' => true,
    ]]);
    $answer = @file_get_contents($url, false, $context);
    if ($answer === false) throw new RuntimeException('сеть недоступна');
    return (string)$answer;
}

/** Ссылки из ответа принимаем только на саму сеть — чужие адреса нам не нужны. */
function rc_same_origin(string $value): string
{
    $value = trim($value);
    if ($value === '') return '';
    $parts = parse_url($value);
    $base = parse_url(rc_base());
    if (!$parts || !$base) return '';
    if (empty($parts['scheme'])) {
        // Относительный путь — дополняем адресом сети.
        return rc_base() . '/' . ltrim($value, '/');
    }
    if (!in_array($parts['scheme'], ['http', 'https'], true)) return '';
    if (($parts['host'] ?? '') !== ($base['host'] ?? '')) return '';
    if ((int)($parts['port'] ?? 0) !== (int)($base['port'] ?? 0)) return '';
    return $value;
}

/** Первый вход заводит страницу, следующие — обновляют профиль из сети. */
function rc_upsert_user(array $rcUser): array
{
    $existing = db_find('users', ['rc_id' => $rcUser['id']]);
    if ($existing) {
        db_update('users', $existing['id'], [
            'rc_username' => $rcUser['username'],
            'rc_avatar' => $rcUser['avatar'],
            'rc_profile' => $rcUser['profile'],
            'rc_role' => $rcUser['role'],
            'last_seen' => now(),
        ]);
        return db_get('users', $existing['id']) + ['fresh' => false];
    }

    $login = rc_pick_login($rcUser);
    // Пароля у такой страницы нет: кладём случайный хеш, подобрать нельзя.
    $user = db_insert('users', [
        'login' => $login,
        'password_hash' => hash_password(bin2hex(random_bytes(32))),
        'first_name' => trim_text($rcUser['title'] ?: $rcUser['username'], 30),
        'status' => $rcUser['status_msg'],
        'created_at' => now(),
        'last_seen' => now(),
        'rc_id' => $rcUser['id'],
        'rc_username' => $rcUser['username'],
        'rc_avatar' => $rcUser['avatar'],
        'rc_profile' => $rcUser['profile'],
        'rc_role' => $rcUser['role'],
        'rc_only' => 1,
    ]);
    db_insert('albums', ['owner_type' => 'user', 'owner_id' => $user['id'],
        'title' => 'Фотографии со страницы', 'created_at' => now()]);

    return $user + ['fresh' => true];
}

function rc_pick_login(array $rcUser): string
{
    $base = preg_replace('~[^a-z0-9_.]~', '', mb_strtolower($rcUser['username']));
    if (!preg_match(LOGIN_RE, $base)) $base = 'rc' . $rcUser['id'];
    if (in_array($base, RESERVED_LOGINS, true)) $base .= $rcUser['id'];

    $login = mb_substr($base, 0, 20);
    $attempt = 0;
    while (user_by_login($login)) {
        $attempt++;
        $suffix = $attempt === 1 ? (string)$rcUser['id'] : $rcUser['id'] . '_' . $attempt;
        $login = mb_substr($base, 0, 20 - mb_strlen($suffix)) . $suffix;
        if ($attempt > 50) throw new RuntimeException('логин не подобрался');
    }
    return $login;
}

/**
 * Люди сети: те, кто хоть раз заходил сюда своим аккаунтом RetroCore.
 * Полный список участников сети отдаёт её собственный скрипт на странице —
 * серверного адреса для этого в инструкции сети не описано.
 */
function rc_known_people(int $limit = 200): array
{
    $rows = db_filter('users', fn($u) => !empty($u['rc_id']));
    usort($rows, fn($a, $b) => $b['last_seen'] <=> $a['last_seen']);
    return array_slice($rows, 0, $limit);
}
