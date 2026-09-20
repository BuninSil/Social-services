<?php
/**
 * ВОнлайне — база данных.
 *
 * Никакого SQL и никакой отдельной службы: каждая коллекция — один файл
 * в папке data/. Внутри файла обычный JSON, но содержимое зашифровано
 * AES-256-GCM, поэтому открыть его и почитать чужую переписку, стащив файл
 * с хостинга, не выйдет — нужен ключ из data/secret.key.
 *
 * Файл выглядит так:
 *   {"v":1,"alg":"aes-256-gcm","iv":"…","tag":"…","data":"…"}
 *
 * Запись атомарная и под замком: сначала берём блокировку, перечитываем файл
 * с диска, вносим изменение, пишем во временный файл и переименовываем.
 * Поэтому два человека, пишущих одновременно, не затирают друг друга.
 */

const DB_COLLECTIONS = [
    'users' => [
        'login' => '', 'password_hash' => '', 'first_name' => '', 'last_name' => '', 'sex' => 'm',
        'status' => '', 'avatar' => null, 'bday' => '', 'city' => '', 'hometown' => '',
        'relationship' => '', 'politics' => '', 'worldview' => '', 'activity' => '', 'interests' => '',
        'music' => '', 'films' => '', 'tv' => '', 'books' => '', 'games' => '', 'quotes' => '', 'about' => '',
        'wall_who' => 'all', 'profile_who' => 'all', 'photos_who' => 'all', 'audio_who' => 'all',
        'friends_who' => 'all', 'message_who' => 'all',
        'theme' => '', 'neon_c1' => '#2fe0ff', 'neon_c2' => '#ff4ecd', 'neon_bg' => '#070b16',
        'rc_id' => null, 'rc_username' => '', 'rc_avatar' => '', 'rc_profile' => '', 'rc_role' => '',
        'rc_only' => 0, 'created_at' => 0, 'last_seen' => 0,
    ],
    'friendships' => ['from_id' => 0, 'to_id' => 0, 'status' => 'pending', 'created_at' => 0],
    'blocks'      => ['user_id' => 0, 'blocked_id' => 0, 'created_at' => 0],
    'groups'      => ['name' => '', 'description' => '', 'kind' => 'group', 'avatar' => null,
                      'creator_id' => 0, 'created_at' => 0],
    'group_members' => ['group_id' => 0, 'user_id' => 0, 'role' => 'member', 'joined_at' => 0],
    'posts' => ['owner_type' => 'user', 'owner_id' => 0, 'author_id' => 0, 'text' => '',
                'created_at' => 0, 'edited_at' => null, 'pinned' => 0, 'repost_of' => null],
    'comments' => ['target_type' => 'post', 'target_id' => 0, 'author_id' => 0, 'text' => '',
                   'created_at' => 0, 'edited_at' => null, 'reply_to' => null],
    'likes' => ['target_type' => 'post', 'target_id' => 0, 'user_id' => 0, 'created_at' => 0],
    'albums' => ['owner_type' => 'user', 'owner_id' => 0, 'title' => '', 'description' => '', 'created_at' => 0],
    'photos' => ['album_id' => null, 'owner_id' => 0, 'file' => '', 'thumb' => '', 'description' => '',
                 'width' => 0, 'height' => 0, 'size' => 0, 'created_at' => 0],
    'videos' => ['owner_id' => 0, 'title' => '', 'description' => '', 'file' => '', 'poster' => null,
                 'duration' => 0, 'size' => 0, 'created_at' => 0],
    'audios' => ['owner_id' => 0, 'artist' => '', 'title' => '', 'file' => '', 'duration' => 0,
                 'size' => 0, 'created_at' => 0],
    'docs' => ['owner_id' => 0, 'name' => '', 'file' => '', 'ext' => '', 'size' => 0, 'created_at' => 0],
    'attachments' => ['parent_type' => 'post', 'parent_id' => 0, 'kind' => 'photo', 'ref_id' => null,
                      'file' => null, 'meta' => '{}', 'position' => 0],
    'conversations' => ['kind' => 'dm', 'title' => '', 'avatar' => null, 'creator_id' => null, 'created_at' => 0],
    'conversation_members' => ['conv_id' => 0, 'user_id' => 0, 'role' => 'member', 'joined_at' => 0,
                               'last_read_id' => 0],
    'messages' => ['conv_id' => 0, 'from_id' => 0, 'text' => '', 'kind' => 'text',
                   'created_at' => 0, 'edited_at' => null, 'deleted_at' => null],
    'notifications' => ['user_id' => 0, 'kind' => '', 'actor_id' => null, 'target_type' => '',
                        'target_id' => 0, 'url' => '', 'preview' => '', 'is_read' => 0, 'created_at' => 0],
];

/* --------------------------------------------------------------------- ключ */

function db_dir(): string
{
    static $dir = null;
    if ($dir === null) {
        $dir = defined('VO_DATA_DIR') ? VO_DATA_DIR : dirname(__DIR__) . '/data';
        if (!is_dir($dir)) mkdir($dir, 0775, true);
    }
    return $dir;
}

/**
 * Ключ шифрования. Заводится сам при первом запуске и лежит рядом с базой.
 * Потеряете файл — данные не прочитать уже никому, включая вас.
 */
function db_key(): string
{
    static $key = null;
    if ($key !== null) return $key;

    $file = db_dir() . '/secret.key';
    if (is_file($file)) {
        $key = base64_decode(trim((string)file_get_contents($file)), true) ?: '';
        if (strlen($key) === 32) return $key;
    }
    $key = random_bytes(32);
    file_put_contents($file, base64_encode($key), LOCK_EX);
    @chmod($file, 0600);
    return $key;
}

function db_can_encrypt(): bool
{
    return function_exists('openssl_encrypt') && in_array('aes-256-gcm', openssl_get_cipher_methods(), true);
}

function db_encode(array $payload): string
{
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if (!db_can_encrypt()) {
        // Совсем старый хостинг без openssl: пишем как есть, но честно помечаем.
        return json_encode(['v' => 1, 'alg' => 'plain', 'data' => base64_encode($json)],
            JSON_UNESCAPED_SLASHES);
    }

    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($json, 'aes-256-gcm', db_key(), OPENSSL_RAW_DATA, $iv, $tag);
    return json_encode([
        'v' => 1,
        'alg' => 'aes-256-gcm',
        'iv' => base64_encode($iv),
        'tag' => base64_encode($tag),
        'data' => base64_encode($cipher),
    ], JSON_UNESCAPED_SLASHES);
}

function db_decode(string $raw): ?array
{
    $box = json_decode($raw, true);
    if (!is_array($box) || !isset($box['data'])) return null;

    if (($box['alg'] ?? '') === 'plain') {
        $json = base64_decode($box['data'], true);
    } else {
        if (!db_can_encrypt()) return null;
        $json = openssl_decrypt(
            base64_decode($box['data'], true),
            'aes-256-gcm',
            db_key(),
            OPENSSL_RAW_DATA,
            base64_decode($box['iv'] ?? '', true),
            base64_decode($box['tag'] ?? '', true)
        );
    }
    if ($json === false || $json === null) return null;

    $data = json_decode($json, true);
    return is_array($data) ? $data : null;
}

/* ------------------------------------------------------------------ чтение */

function db_file(string $name): string
{
    return db_dir() . '/' . $name . '.json';
}

/** Коллекция целиком: {seq, rows}. За один запрос читается один раз. */
function &db_load(string $name, bool $fresh = false): array
{
    static $cache = [];
    if ($fresh) unset($cache[$name]);
    if (isset($cache[$name])) return $cache[$name];

    $file = db_file($name);
    $data = null;
    if (is_file($file)) {
        $data = db_decode((string)file_get_contents($file));
        if ($data === null && is_file($file . '.bak')) {
            // Файл не читается — берём прошлую версию.
            $data = db_decode((string)file_get_contents($file . '.bak'));
        }
    }
    if (!is_array($data) || !isset($data['rows'])) $data = ['seq' => 0, 'rows' => []];
    $data['rows'] = array_values(array_filter($data['rows'], 'is_array'));

    $cache[$name] = $data;
    return $cache[$name];
}

/**
 * Изменение под замком: перечитываем файл с диска, применяем, сохраняем.
 * Так два одновременных запроса не затрут правки друг друга.
 */
function db_mutate(string $name, callable $change)
{
    $lock = fopen(db_dir() . '/' . $name . '.lock', 'c');
    if ($lock) flock($lock, LOCK_EX);

    try {
        $data = db_load($name, true);
        $result = $change($data);          // $data передаётся по значению, возвращаем изменённое
        db_write($name, $data);
        return $result;
    } finally {
        if ($lock) {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}

function db_write(string $name, array $data): void
{
    $file = db_file($name);
    $tmp = $file . '.tmp';
    file_put_contents($tmp, db_encode($data), LOCK_EX);
    if (is_file($file)) @rename($file, $file . '.bak');
    rename($tmp, $file);
    @chmod($file, 0640);

    // Кэш этого запроса держим в согласии с диском.
    $cached = &db_load($name);
    $cached = $data;
}

/* ------------------------------------------------------------------ выборки */

/** Условие: id, массив «поле => значение» или своя функция. */
function db_matcher($where): callable
{
    if ($where === null) return fn($row) => true;
    if (is_callable($where)) return $where;
    if (is_int($where) || is_string($where)) return fn($row) => ($row['id'] ?? null) === $where;

    return function ($row) use ($where) {
        foreach ($where as $key => $want) {
            $has = $row[$key] ?? null;
            if (is_array($want)) {
                if (!in_array($has, $want, true)) return false;
            } elseif ($has !== $want) {
                return false;
            }
        }
        return true;
    };
}

function db_all(string $name): array
{
    $data = db_load($name);
    return $data['rows'];
}

function db_get(string $name, $id): ?array
{
    if ($id === null || $id === '') return null;
    foreach (db_load($name)['rows'] as $row) {
        if (($row['id'] ?? null) === $id) return $row;
    }
    return null;
}

function db_find(string $name, $where): ?array
{
    $test = db_matcher($where);
    foreach (db_load($name)['rows'] as $row) {
        if ($test($row)) return $row;
    }
    return null;
}

function db_filter(string $name, $where): array
{
    $test = db_matcher($where);
    $out = [];
    foreach (db_load($name)['rows'] as $row) {
        if ($test($row)) $out[] = $row;
    }
    return $out;
}

function db_count(string $name, $where = null): int
{
    if ($where === null) return count(db_load($name)['rows']);
    return count(db_filter($name, $where));
}

function db_has(string $name, $where): bool
{
    return db_find($name, $where) !== null;
}

/* ------------------------------------------------------------------- запись */

function db_insert(string $name, array $values): array
{
    $defaults = DB_COLLECTIONS[$name] ?? [];
    return db_mutate($name, function (array &$data) use ($values, $defaults) {
        $row = array_merge($defaults, $values);
        if (!isset($row['id'])) {
            $data['seq'] = (int)$data['seq'] + 1;
            $row['id'] = $data['seq'];
        } elseif (is_int($row['id']) && $row['id'] > (int)$data['seq']) {
            $data['seq'] = $row['id'];
        }
        $data['rows'][] = $row;
        return $row;
    });
}

function db_update(string $name, $where, array $patch): int
{
    $single = is_int($where) || is_string($where);
    return db_mutate($name, function (array &$data) use ($where, $patch, $single) {
        $test = db_matcher($where);
        $changed = 0;
        foreach ($data['rows'] as $i => $row) {
            if (!$test($row)) continue;
            $data['rows'][$i] = array_merge($row, $patch);
            $changed++;
            if ($single) break;
        }
        return $changed;
    });
}

/** Есть — меняем, нет — заводим. */
function db_upsert(string $name, array $where, array $values): array
{
    $defaults = DB_COLLECTIONS[$name] ?? [];
    return db_mutate($name, function (array &$data) use ($where, $values, $defaults) {
        $test = db_matcher($where);
        foreach ($data['rows'] as $i => $row) {
            if (!$test($row)) continue;
            $data['rows'][$i] = array_merge($row, $values);
            return $data['rows'][$i];
        }
        $row = array_merge($defaults, $where, $values);
        if (!isset($row['id'])) {
            $data['seq'] = (int)$data['seq'] + 1;
            $row['id'] = $data['seq'];
        }
        $data['rows'][] = $row;
        return $row;
    });
}

function db_remove(string $name, $where): int
{
    return db_mutate($name, function (array &$data) use ($where) {
        $test = db_matcher($where);
        $kept = [];
        $removed = 0;
        foreach ($data['rows'] as $row) {
            if ($test($row)) {
                $removed++;
                continue;
            }
            $kept[] = $row;
        }
        $data['rows'] = $kept;
        return $removed;
    });
}

/** Сколько чего лежит — для страницы состояния и проверок. */
function db_stats(): array
{
    $out = [];
    foreach (array_keys(DB_COLLECTIONS) as $name) $out[$name] = db_count($name);
    return $out;
}
