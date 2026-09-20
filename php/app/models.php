<?php
/**
 * ВОнлайне — работа с данными: люди, дружбы, приватность, стена, беседы,
 * уведомления. Всё это обычный PHP поверх коллекций из db.php.
 */

const BRIEF_FIELDS = ['id', 'login', 'first_name', 'last_name', 'sex', 'avatar', 'city',
                      'status', 'last_seen', 'rc_avatar', 'rc_profile'];

/* ------------------------------------------------------------------- люди */

function get_user(?int $id): ?array
{
    return $id ? db_get('users', $id) : null;
}

function brief(?int $id): ?array
{
    $user = get_user($id);
    if (!$user) return null;
    $out = [];
    foreach (BRIEF_FIELDS as $field) $out[$field] = $user[$field] ?? null;
    return $out;
}

function user_by_login(string $login): ?array
{
    $needle = mb_strtolower(trim($login));
    if ($needle === '') return null;
    return db_find('users', fn($u) => mb_strtolower((string)$u['login']) === $needle);
}

function search_users(string $query, int $limit = 50): array
{
    $needle = trim($query);
    if ($needle === '') return [];
    $found = db_filter('users', fn($u) =>
        contains($u['first_name'], $needle) || contains($u['last_name'], $needle)
        || contains($u['first_name'] . ' ' . $u['last_name'], $needle) || contains($u['login'], $needle));
    usort($found, 'by_name');
    return array_slice($found, 0, $limit);
}

/* ----------------------------------------------------------------- друзья */

function friend_pair(int $fromId, int $toId): ?array
{
    return db_find('friendships', ['from_id' => $fromId, 'to_id' => $toId]);
}

function friend_status(int $meId, int $otherId): string
{
    if ($meId === $otherId) return 'self';
    $out = friend_pair($meId, $otherId);
    if ($out) return $out['status'] === 'accepted' ? 'friends' : 'out';
    $in = friend_pair($otherId, $meId);
    if ($in) return $in['status'] === 'accepted' ? 'friends' : 'in';
    return 'none';
}

function friend_ids(int $id): array
{
    $out = [];
    foreach (db_filter('friendships', fn($f) => $f['status'] === 'accepted'
        && ($f['from_id'] === $id || $f['to_id'] === $id)) as $f) {
        $out[] = $f['from_id'] === $id ? $f['to_id'] : $f['from_id'];
    }
    return $out;
}

function friend_list(int $id): array
{
    $out = array_values(array_filter(array_map('get_user', friend_ids($id))));
    usort($out, 'by_name');
    return $out;
}

function are_friends(int $a, int $b): bool
{
    return friend_status($a, $b) === 'friends';
}

function mutual_friends(int $aId, int $bId): array
{
    $mine = friend_ids($aId);
    $common = array_intersect(friend_ids($bId), $mine);
    return array_values(array_filter(array_map('get_user', $common)));
}

function incoming_requests(int $meId): array
{
    $rows = db_filter('friendships', ['to_id' => $meId, 'status' => 'pending']);
    usort($rows, fn($a, $b) => $b['created_at'] <=> $a['created_at']);
    return array_values(array_filter(array_map(fn($f) => get_user($f['from_id']), $rows)));
}

function outgoing_requests(int $meId): array
{
    $rows = db_filter('friendships', ['from_id' => $meId, 'status' => 'pending']);
    usort($rows, fn($a, $b) => $b['created_at'] <=> $a['created_at']);
    return array_values(array_filter(array_map(fn($f) => get_user($f['to_id']), $rows)));
}

/** Заявка в ответ на заявку сразу делает друзьями. */
function add_friend(int $meId, int $otherId): string
{
    if (friend_pair($otherId, $meId)) {
        db_update('friendships', ['from_id' => $otherId, 'to_id' => $meId], ['status' => 'accepted']);
        return 'friends';
    }
    if (!friend_pair($meId, $otherId)) {
        db_insert('friendships', ['from_id' => $meId, 'to_id' => $otherId,
            'status' => 'pending', 'created_at' => now()]);
    }
    return 'out';
}

function remove_friend(int $meId, int $otherId): void
{
    db_remove('friendships', fn($f) =>
        ($f['from_id'] === $meId && $f['to_id'] === $otherId)
        || ($f['from_id'] === $otherId && $f['to_id'] === $meId));
}

/* ------------------------------------------- блокировки и приватность */

function has_blocked(int $meId, int $otherId): bool
{
    return db_has('blocks', ['user_id' => $meId, 'blocked_id' => $otherId]);
}

/** Блокировка в любую сторону — общение невозможно. */
function blocked_either(int $a, int $b): bool
{
    return $a !== $b && (has_blocked($a, $b) || has_blocked($b, $a));
}

function block_user(int $meId, int $otherId): void
{
    if ($meId === $otherId) return;
    if (!has_blocked($meId, $otherId)) {
        db_insert('blocks', ['user_id' => $meId, 'blocked_id' => $otherId, 'created_at' => now()]);
    }
    remove_friend($meId, $otherId);
}

function unblock_user(int $meId, int $otherId): void
{
    db_remove('blocks', ['user_id' => $meId, 'blocked_id' => $otherId]);
}

function block_list(int $meId): array
{
    $rows = db_filter('blocks', ['user_id' => $meId]);
    usort($rows, fn($a, $b) => $b['created_at'] <=> $a['created_at']);
    $out = [];
    foreach ($rows as $b) {
        $user = get_user($b['blocked_id']);
        if ($user) $out[] = $user + ['blocked_at' => $b['created_at']];
    }
    return $out;
}

/**
 * Приватность: 'all' — всем, 'friends' — друзьям, 'me' — только себе.
 * $section: profile | photos | audio | friends | message | wall
 */
function can_see(?int $viewerId, ?array $owner, string $section): bool
{
    if (!$owner) return false;
    if ($viewerId === $owner['id']) return true;
    if (!$viewerId) return false;
    if (blocked_either($viewerId, $owner['id'])) return false;

    $rule = $owner[$section . '_who'] ?? 'all';
    if ($rule === 'all') return true;
    if ($rule === 'friends') return are_friends($viewerId, $owner['id']);
    return false;
}

function can_post_on_wall(array $owner, ?int $viewerId): bool
{
    if (!$viewerId) return false;
    if ($owner['id'] === $viewerId) return true;
    if (blocked_either($viewerId, $owner['id'])) return false;
    if ($owner['wall_who'] === 'me') return false;
    if ($owner['wall_who'] === 'friends') return are_friends($viewerId, $owner['id']);
    return true;
}

function can_message(?int $viewerId, ?array $owner): bool
{
    return can_see($viewerId, $owner, 'message');
}

/* ----------------------------------------------------------------- группы */

function group_members_count(int $groupId): int
{
    return db_count('group_members', ['group_id' => $groupId]);
}

function is_group_member(int $groupId, int $userId): bool
{
    return db_has('group_members', ['group_id' => $groupId, 'user_id' => $userId]);
}

function is_group_admin(int $groupId, int $userId): bool
{
    $member = db_find('group_members', ['group_id' => $groupId, 'user_id' => $userId]);
    return $member !== null && $member['role'] === 'admin';
}

function group_members(int $groupId): array
{
    $out = [];
    foreach (db_filter('group_members', ['group_id' => $groupId]) as $m) {
        $user = get_user($m['user_id']);
        if ($user) $out[] = $user + ['role' => $m['role']];
    }
    usort($out, fn($a, $b) => (($b['role'] === 'admin') <=> ($a['role'] === 'admin')) ?: by_name($a, $b));
    return $out;
}

function group_member_ids(int $groupId): array
{
    return array_map(fn($m) => $m['user_id'], db_filter('group_members', ['group_id' => $groupId]));
}

function groups_of_user(int $userId): array
{
    $out = [];
    foreach (db_filter('group_members', ['user_id' => $userId]) as $m) {
        $group = db_get('groups', $m['group_id']);
        if ($group) $out[] = $group;
    }
    usort($out, fn($a, $b) => strcoll_ru($a['name'], $b['name']));
    return $out;
}

function group_ids_of_user(int $userId): array
{
    return array_map(fn($m) => $m['group_id'], db_filter('group_members', ['user_id' => $userId]));
}

/* -------------------------------------------------------------- вложения */

/** $items: [['kind' => 'photo', 'ref_id' => 5], …] */
function save_attachments(string $parentType, int $parentId, array $items): void
{
    $position = 0;
    foreach ($items as $item) {
        db_insert('attachments', [
            'parent_type' => $parentType,
            'parent_id' => $parentId,
            'kind' => $item['kind'],
            'ref_id' => $item['ref_id'] ?? null,
            'file' => $item['file'] ?? null,
            'meta' => json_encode($item['meta'] ?? [], JSON_UNESCAPED_UNICODE),
            'position' => $position++,
        ]);
    }
}

function drop_attachments(string $parentType, int $parentId): void
{
    db_remove('attachments', ['parent_type' => $parentType, 'parent_id' => $parentId]);
}

/** Разворачивает вложения в объекты с данными фото/видео/аудио/документа. */
function load_attachments(string $parentType, int $parentId): array
{
    $rows = db_filter('attachments', ['parent_type' => $parentType, 'parent_id' => $parentId]);
    usort($rows, fn($a, $b) => ($a['position'] <=> $b['position']) ?: ($a['id'] <=> $b['id']));

    $out = [];
    foreach ($rows as $row) {
        $item = [
            'id' => $row['id'],
            'kind' => $row['kind'],
            'file' => $row['file'],
            'meta' => json_decode((string)$row['meta'], true) ?: [],
            'photo' => null, 'audio' => null, 'video' => null, 'doc' => null,
        ];
        if ($row['kind'] === 'photo') $item['photo'] = db_get('photos', $row['ref_id']);
        if ($row['kind'] === 'audio' || $row['kind'] === 'voice') $item['audio'] = db_get('audios', $row['ref_id']);
        if ($row['kind'] === 'video') $item['video'] = db_get('videos', $row['ref_id']);
        if ($row['kind'] === 'doc') $item['doc'] = db_get('docs', $row['ref_id']);

        $alive = match ($row['kind']) {
            'photo' => (bool)$item['photo'],
            'audio', 'voice' => (bool)$item['audio'],
            'video' => (bool)$item['video'],
            'doc' => (bool)$item['doc'],
            default => (bool)$item['file'],
        };
        if ($alive) $out[] = $item;
    }
    return $out;
}

/**
 * Принимает загруженные файлы: определяет тип, складывает в uploads/
 * и заводит записи в photos/videos/audios/docs.
 * Возвращает [вложения, что не приняли и почему].
 */
function attach_from_files(int $userId, array $files, string $albumTitle = 'Фотографии на стене'): array
{
    $items = [];
    $errors = [];

    foreach ($files as $file) {
        $name = clean_name($file['name']);
        $head = (string)file_get_contents($file['tmp'], false, null, 0, 32);
        $type = media_detect($head, $file['name']);

        if (!$type) {
            $errors[] = 'Файл «' . $name . '» неподдерживаемого типа.';
            continue;
        }
        if ($file['size'] > media_limit($type['kind'])) {
            $errors[] = 'Файл «' . $name . '» больше ' . human_size(media_limit($type['kind'])) . '.';
            continue;
        }

        try {
            if ($type['kind'] === 'image') {
                $saved = media_save_image($file['tmp'], 'photos', 1600, 180);
                $photo = db_insert('photos', [
                    'album_id' => album_for($userId, $albumTitle)['id'],
                    'owner_id' => $userId,
                    'file' => $saved['file'], 'thumb' => $saved['thumb'],
                    'width' => $saved['width'], 'height' => $saved['height'],
                    'size' => $saved['size'], 'created_at' => now(),
                ]);
                $items[] = ['kind' => 'photo', 'ref_id' => $photo['id']];
            } elseif ($type['kind'] === 'video') {
                $saved = media_store($file['tmp'], 'videos', $type['ext']);
                $video = db_insert('videos', [
                    'owner_id' => $userId,
                    'title' => trim_text(preg_replace('~\.[^.]+$~', '', $name), 80) ?: 'Видеозапись',
                    'file' => $saved['file'], 'size' => $saved['size'], 'created_at' => now(),
                ]);
                $items[] = ['kind' => 'video', 'ref_id' => $video['id']];
            } elseif ($type['kind'] === 'audio') {
                $saved = media_store($file['tmp'], 'audio', $type['ext']);
                $track = split_track($name);
                $audio = db_insert('audios', [
                    'owner_id' => $userId,
                    'artist' => trim_text($track['artist'], 80),
                    'title' => trim_text($track['title'], 80) ?: $name,
                    'file' => $saved['file'], 'size' => $saved['size'], 'created_at' => now(),
                ]);
                $items[] = ['kind' => 'audio', 'ref_id' => $audio['id']];
            } else {
                $saved = media_store($file['tmp'], 'docs', $type['ext']);
                $doc = db_insert('docs', [
                    'owner_id' => $userId, 'name' => $name, 'file' => $saved['file'],
                    'ext' => $type['ext'], 'size' => $saved['size'], 'created_at' => now(),
                ]);
                $items[] = ['kind' => 'doc', 'ref_id' => $doc['id']];
            }
        } catch (Throwable $e) {
            $errors[] = 'Файл «' . $name . '» не удалось обработать.';
        }
    }

    return [$items, $errors];
}

/** Альбом с таким названием или новый. */
function album_for(int $userId, string $title): array
{
    $found = db_find('albums', ['owner_type' => 'user', 'owner_id' => $userId, 'title' => $title]);
    if ($found) return $found;
    return db_insert('albums', ['owner_type' => 'user', 'owner_id' => $userId,
        'title' => $title, 'created_at' => now()]);
}

function default_album(int $userId): array
{
    $albums = db_filter('albums', ['owner_type' => 'user', 'owner_id' => $userId]);
    if ($albums) return $albums[0];
    return album_for($userId, 'Фотографии со страницы');
}

/* ------------------------------------------------------- лайки и комменты */

function like_count(string $type, int $id): int
{
    return db_count('likes', ['target_type' => $type, 'target_id' => $id]);
}

function liked_by(string $type, int $id, ?int $userId): bool
{
    return $userId && db_has('likes', ['target_type' => $type, 'target_id' => $id, 'user_id' => $userId]);
}

function like_users(string $type, int $id, int $limit = 100): array
{
    $rows = db_filter('likes', ['target_type' => $type, 'target_id' => $id]);
    usort($rows, fn($a, $b) => $b['created_at'] <=> $a['created_at']);
    $out = [];
    foreach (array_slice($rows, 0, $limit) as $like) {
        $user = get_user($like['user_id']);
        if ($user) $out[] = $user;
    }
    return $out;
}

function toggle_like(string $type, int $id, int $userId): array
{
    $where = ['target_type' => $type, 'target_id' => $id, 'user_id' => $userId];
    $had = db_has('likes', $where);
    if ($had) db_remove('likes', $where);
    else db_insert('likes', $where + ['created_at' => now()]);
    return ['count' => like_count($type, $id), 'liked' => !$had];
}

function list_comments(string $type, int $id): array
{
    $rows = db_filter('comments', ['target_type' => $type, 'target_id' => $id]);
    usort($rows, fn($a, $b) => $a['id'] <=> $b['id']);
    foreach ($rows as $i => $row) {
        $rows[$i]['author'] = brief($row['author_id']);
    }
    return $rows;
}

function count_comments(string $type, int $id): int
{
    return db_count('comments', ['target_type' => $type, 'target_id' => $id]);
}

function add_comment(string $type, int $id, int $authorId, string $text, ?int $replyTo = null): array
{
    return db_insert('comments', [
        'target_type' => $type, 'target_id' => $id, 'author_id' => $authorId,
        'text' => $text, 'reply_to' => $replyTo, 'created_at' => now(),
    ]);
}

/* ------------------------------------------------------------------ записи */

function repost_count(int $postId): int
{
    return db_count('posts', ['repost_of' => $postId]);
}

function owner_of(array $post): ?array
{
    return $post['owner_type'] === 'group' ? db_get('groups', $post['owner_id']) : brief($post['owner_id']);
}

/** Запись со всем обвесом: автор, владелец, вложения, лайки, комментарии. */
function decorate_post(array $row, ?int $meId, int $depth = 0): array
{
    $post = $row;
    $post['author'] = brief($row['author_id']);
    $post['owner'] = owner_of($row);
    $post['attachments'] = load_attachments('post', $row['id']);
    $post['likes'] = like_count('post', $row['id']);
    $post['liked'] = liked_by('post', $row['id'], $meId);
    $post['reposts'] = repost_count($row['id']);
    $post['comments'] = list_comments('post', $row['id']);
    $post['source'] = null;

    if ($row['repost_of'] && $depth < 1) {
        $source = db_get('posts', $row['repost_of']);
        if ($source) $post['source'] = decorate_post($source, $meId, $depth + 1);
    }
    return $post;
}

function decorate_posts(array $rows, ?int $meId): array
{
    return array_map(fn($row) => decorate_post($row, $meId), $rows);
}

function wall_posts(string $ownerType, int $ownerId, ?int $meId, int $limit, int $offset = 0): array
{
    $rows = db_filter('posts', ['owner_type' => $ownerType, 'owner_id' => $ownerId]);
    usort($rows, fn($a, $b) => (($b['pinned'] ? 1 : 0) <=> ($a['pinned'] ? 1 : 0)) ?: ($b['id'] <=> $a['id']));
    return decorate_posts(array_slice($rows, $offset, $limit), $meId);
}

function wall_count(string $ownerType, int $ownerId): int
{
    return db_count('posts', ['owner_type' => $ownerType, 'owner_id' => $ownerId]);
}

/** Лента: свои записи, стены друзей и группы, где я состою. */
function feed_posts(int $meId, int $limit, int $offset = 0): array
{
    $userIds = array_merge(friend_ids($meId), [$meId]);
    $groupIds = group_ids_of_user($meId);

    $rows = db_filter('posts', fn($p) =>
        ($p['owner_type'] === 'user' && in_array($p['owner_id'], $userIds, true))
        || ($p['owner_type'] === 'group' && in_array($p['owner_id'], $groupIds, true)));
    usort($rows, fn($a, $b) => $b['id'] <=> $a['id']);
    $rows = array_values(array_filter($rows, fn($p) => !blocked_either($meId, $p['author_id'])));

    return decorate_posts(array_slice($rows, $offset, $limit), $meId);
}

function search_posts(int $meId, string $query, int $limit = 50): array
{
    $needle = trim($query);
    if ($needle === '') return [];
    $rows = db_filter('posts', fn($p) => contains($p['text'], $needle));
    usort($rows, fn($a, $b) => $b['id'] <=> $a['id']);
    $rows = array_values(array_filter($rows, function ($p) use ($meId) {
        if (blocked_either($meId, $p['author_id'])) return false;
        if ($p['owner_type'] === 'user') return can_see($meId, get_user($p['owner_id']), 'profile');
        return true;
    }));
    return decorate_posts(array_slice($rows, 0, $limit), $meId);
}

function pin_post(array $post): void
{
    db_update('posts', fn($p) => $p['owner_type'] === $post['owner_type']
        && $p['owner_id'] === $post['owner_id'], ['pinned' => 0]);
    db_update('posts', $post['id'], ['pinned' => 1]);
}

function can_edit_post(?array $post, ?array $user): bool
{
    if (!$post || !$user) return false;
    if ($post['author_id'] === $user['id']) return true;
    if ($post['owner_type'] === 'user' && $post['owner_id'] === $user['id']) return true;
    if ($post['owner_type'] === 'group') return is_group_admin($post['owner_id'], $user['id']);
    return false;
}

/** Создаёт запись вместе с вложениями и уведомлениями. */
function create_post(array $opts): array
{
    $text = trim_text($opts['text'] ?? '', 8000);
    [$items, $errors] = attach_from_files($opts['author_id'], $opts['files'] ?? []);
    $repostOf = $opts['repost_of'] ?? null;

    if ($text === '' && !$items && !$repostOf) return ['id' => null, 'errors' => $errors];

    $post = db_insert('posts', [
        'owner_type' => $opts['owner_type'],
        'owner_id' => $opts['owner_id'],
        'author_id' => $opts['author_id'],
        'text' => $text,
        'repost_of' => $repostOf,
        'created_at' => now(),
    ]);
    save_attachments('post', $post['id'], $items);

    $url = ($opts['owner_type'] === 'group' ? '/club' : '/id') . $opts['owner_id'] . '#post' . $post['id'];

    if ($opts['owner_type'] === 'user' && $opts['owner_id'] !== $opts['author_id']) {
        notify(['user_id' => $opts['owner_id'], 'kind' => 'wall_post', 'actor_id' => $opts['author_id'],
            'target_type' => 'post', 'target_id' => $post['id'], 'url' => $url, 'preview' => $text]);
    }
    if ($repostOf) {
        $source = db_get('posts', $repostOf);
        if ($source) {
            notify(['user_id' => $source['author_id'], 'kind' => 'repost', 'actor_id' => $opts['author_id'],
                'target_type' => 'post', 'target_id' => $post['id'], 'url' => $url,
                'preview' => $source['text']]);
        }
    }
    notify_mentions($text, $opts['author_id'], $url);

    return ['id' => $post['id'], 'errors' => $errors];
}

/** Удаление записи со всем, что к ней цеплялось. */
function delete_post(int $postId): void
{
    db_remove('comments', ['target_type' => 'post', 'target_id' => $postId]);
    db_remove('likes', ['target_type' => 'post', 'target_id' => $postId]);
    db_remove('attachments', ['parent_type' => 'post', 'parent_id' => $postId]);
    db_remove('notifications', ['target_type' => 'post', 'target_id' => $postId]);
    db_update('posts', fn($p) => $p['repost_of'] === $postId, ['repost_of' => null]);
    db_remove('posts', $postId);
}

/* ------------------------------------------------------------ уведомления */

function unread_notifications(int $userId): int
{
    return db_count('notifications', ['user_id' => $userId, 'is_read' => 0]);
}

function list_notifications(int $userId, int $limit, int $offset = 0): array
{
    $rows = db_filter('notifications', ['user_id' => $userId]);
    usort($rows, fn($a, $b) => $b['id'] <=> $a['id']);
    $rows = array_slice($rows, $offset, $limit);
    foreach ($rows as $i => $row) {
        $rows[$i]['actor'] = $row['actor_id'] ? brief($row['actor_id']) : null;
    }
    return $rows;
}

function mark_notifications_read(int $userId): void
{
    db_update('notifications', fn($n) => $n['user_id'] === $userId && !$n['is_read'], ['is_read' => 1]);
}

/** Себе не уведомляем, заблокированным тоже. */
function notify(array $opts): void
{
    $userId = (int)($opts['user_id'] ?? 0);
    $actorId = (int)($opts['actor_id'] ?? 0);
    if (!$userId || $userId === $actorId) return;
    if (blocked_either($userId, $actorId)) return;

    if (!empty($opts['unique'])) {
        drop_notification($userId, $opts['kind'], $actorId, $opts['target_type'] ?? '', $opts['target_id'] ?? 0);
    }
    db_insert('notifications', [
        'user_id' => $userId, 'kind' => $opts['kind'], 'actor_id' => $actorId ?: null,
        'target_type' => $opts['target_type'] ?? '', 'target_id' => (int)($opts['target_id'] ?? 0),
        'url' => $opts['url'] ?? '', 'preview' => trim_text($opts['preview'] ?? '', 200),
        'is_read' => 0, 'created_at' => now(),
    ]);
}

function drop_notification(int $userId, string $kind, ?int $actorId, string $targetType, int $targetId): void
{
    db_remove('notifications', ['user_id' => $userId, 'kind' => $kind, 'actor_id' => $actorId,
        'target_type' => $targetType, 'target_id' => $targetId]);
}

/** @упоминания в тексте — каждому по уведомлению. */
function notify_mentions(string $text, int $actorId, string $url): void
{
    foreach (mentions($text) as $login) {
        $user = user_by_login($login);
        if ($user) {
            notify(['user_id' => $user['id'], 'kind' => 'mention', 'actor_id' => $actorId,
                'url' => $url, 'preview' => $text, 'unique' => true]);
        }
    }
}

/* ------------------------------------------------------ беседы и сообщения */

function conv_member(int $convId, int $userId): ?array
{
    return db_find('conversation_members', ['conv_id' => $convId, 'user_id' => $userId]);
}

function is_conv_member(int $convId, int $userId): bool
{
    return conv_member($convId, $userId) !== null;
}

function conv_member_ids(int $convId): array
{
    return array_map(fn($m) => $m['user_id'], db_filter('conversation_members', ['conv_id' => $convId]));
}

function conv_members(int $convId): array
{
    $out = [];
    foreach (db_filter('conversation_members', ['conv_id' => $convId]) as $m) {
        $user = get_user($m['user_id']);
        if ($user) $out[] = $user + ['role' => $m['role'], 'last_read_id' => $m['last_read_id']];
    }
    usort($out, fn($a, $b) => (($b['role'] === 'admin') <=> ($a['role'] === 'admin'))
        ?: strcoll_ru($a['first_name'], $b['first_name']));
    return $out;
}

function add_conv_member(int $convId, int $userId, string $role = 'member'): void
{
    if (conv_member($convId, $userId)) return;
    db_insert('conversation_members', ['conv_id' => $convId, 'user_id' => $userId,
        'role' => $role, 'joined_at' => now(), 'last_read_id' => 0]);
}

function drop_conv_member(int $convId, int $userId): void
{
    db_remove('conversation_members', ['conv_id' => $convId, 'user_id' => $userId]);
}

/** Отметку «прочитано» двигаем только вперёд. */
function set_read(int $convId, int $userId, int $messageId): void
{
    $member = conv_member($convId, $userId);
    if (!$member || $member['last_read_id'] >= $messageId) return;
    db_update('conversation_members', ['conv_id' => $convId, 'user_id' => $userId],
        ['last_read_id' => $messageId]);
}

function last_message(int $convId): ?array
{
    $rows = db_filter('messages', fn($m) => $m['conv_id'] === $convId && !$m['deleted_at']);
    if (!$rows) return null;
    usort($rows, fn($a, $b) => $b['id'] <=> $a['id']);
    return $rows[0];
}

function unread_count(int $convId, int $meId): int
{
    $member = conv_member($convId, $meId);
    if (!$member) return 0;
    return db_count('messages', fn($m) => $m['conv_id'] === $convId && !$m['deleted_at']
        && $m['from_id'] !== $meId && $m['id'] > $member['last_read_id']);
}

function send_message(int $convId, int $fromId, string $text): array
{
    return db_insert('messages', ['conv_id' => $convId, 'from_id' => $fromId,
        'text' => $text, 'kind' => 'text', 'created_at' => now()]);
}

function search_messages(int $meId, string $query, int $limit = 60): array
{
    $needle = trim($query);
    if ($needle === '') return [];
    $mine = array_map(fn($m) => $m['conv_id'], db_filter('conversation_members', ['user_id' => $meId]));
    $rows = db_filter('messages', fn($m) => !$m['deleted_at']
        && in_array($m['conv_id'], $mine, true) && contains($m['text'], $needle));
    usort($rows, fn($a, $b) => $b['id'] <=> $a['id']);
    return array_slice($rows, 0, $limit);
}

/** Личный диалог двоих: находим существующий или заводим новый. */
function dm_with(int $aId, int $bId): array
{
    foreach (db_filter('conversation_members', ['user_id' => $aId]) as $m) {
        $conv = db_get('conversations', $m['conv_id']);
        if ($conv && $conv['kind'] === 'dm' && is_conv_member($conv['id'], $bId)) return $conv;
    }
    $conv = db_insert('conversations', ['kind' => 'dm', 'creator_id' => $aId, 'created_at' => now()]);
    add_conv_member($conv['id'], $aId);
    add_conv_member($conv['id'], $bId);
    return $conv;
}

function create_chat(int $creatorId, string $title, array $memberIds): array
{
    $conv = db_insert('conversations', ['kind' => 'chat', 'title' => trim_text($title, 80) ?: 'Беседа',
        'creator_id' => $creatorId, 'created_at' => now()]);
    add_conv_member($conv['id'], $creatorId, 'admin');
    foreach ($memberIds as $uid) {
        if ($uid !== $creatorId) add_conv_member($conv['id'], (int)$uid);
    }
    return $conv;
}

function dm_peer(int $convId, int $meId): ?array
{
    $other = db_find('conversation_members', fn($m) => $m['conv_id'] === $convId && $m['user_id'] !== $meId);
    return $other ? brief($other['user_id']) : null;
}

/** Беседа так, как её видит конкретный человек. */
function conv_view(array $conv, int $meId): array
{
    $view = $conv;
    if ($conv['kind'] === 'dm') {
        $view['peer'] = dm_peer($conv['id'], $meId);
        $view['title'] = $view['peer'] ? full_name($view['peer']) : 'Удалённая страница';
    } else {
        $view['peer'] = null;
        $view['members_count'] = count(conv_member_ids($conv['id']));
    }
    $view['last'] = last_message($conv['id']);
    $view['unread'] = unread_count($conv['id'], $meId);
    return $view;
}

function conversations_of(int $meId): array
{
    $out = [];
    foreach (db_filter('conversation_members', ['user_id' => $meId]) as $m) {
        $conv = db_get('conversations', $m['conv_id']);
        if (!$conv) continue;
        $view = conv_view($conv, $meId);
        if ($view['kind'] === 'dm' && !$view['peer']) continue;
        $out[] = $view;
    }
    usort($out, fn($a, $b) => (($b['last']['id'] ?? 0) <=> ($a['last']['id'] ?? 0)));
    return $out;
}

function unread_dialogs(int $meId): int
{
    return count(array_filter(conversations_of($meId), fn($c) => $c['unread'] > 0));
}

function decorate_message(array $row): array
{
    $row['author'] = brief($row['from_id']);
    $row['attachments'] = load_attachments('message', $row['id']);
    return $row;
}

function history(int $convId, int $limit, int $offset = 0): array
{
    $rows = db_filter('messages', fn($m) => $m['conv_id'] === $convId && !$m['deleted_at']);
    usort($rows, fn($a, $b) => $b['id'] <=> $a['id']);
    $rows = array_reverse(array_slice($rows, $offset, $limit));
    return array_map('decorate_message', $rows);
}

/** Счётчики для левого меню. */
function menu_counters(?array $me): array
{
    if (!$me) return ['messages' => 0, 'requests' => 0, 'notifications' => 0];
    return [
        'messages' => unread_dialogs($me['id']),
        'requests' => db_count('friendships', ['to_id' => $me['id'], 'status' => 'pending']),
        'notifications' => unread_notifications($me['id']),
    ];
}
