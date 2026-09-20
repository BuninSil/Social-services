<?php
/** Фотографии: альбомы, загрузка, просмотр. */

function album_list(int $userId): array
{
    default_album($userId);
    $albums = db_filter('albums', ['owner_type' => 'user', 'owner_id' => $userId]);
    usort($albums, fn($a, $b) => $a['id'] <=> $b['id']);

    foreach ($albums as $i => $a) {
        $inside = photos_of((int)$a['id']);
        $albums[$i]['count'] = count($inside);
        $albums[$i]['cover'] = $inside ? $inside[0]['thumb'] : null;
    }
    return $albums;
}

function photos_of(int $albumId): array
{
    $photos = db_filter('photos', ['album_id' => $albumId]);
    usort($photos, fn($a, $b) => $b['id'] <=> $a['id']);
    return $photos;
}

function ensure_can_see_photos(array $owner): void
{
    $me = current_user();
    if (!can_see($me['id'], $owner, 'photos')) {
        render_error(403, 'Фотографии этого человека скрыты.');
    }
}

function page_photos(): void
{
    $me = require_auth();
    render('albums', ['title' => 'Мои фотографии', 'nav' => 'photos',
        'owner' => $me, 'isMe' => true, 'albums' => album_list((int)$me['id'])]);
}

function page_photos_of(string $id): void
{
    $me = require_auth();
    $owner = get_user((int)$id);
    if (!$owner) render_error(404, 'Такой страницы здесь нет.');
    ensure_can_see_photos($owner);
    render('albums', ['title' => 'Фотографии: ' . full_name($owner), 'nav' => '',
        'owner' => $owner, 'isMe' => $owner['id'] === $me['id'], 'albums' => album_list((int)$owner['id'])]);
}

function page_album(string $ownerId, string $albumId): void
{
    $me = require_auth();
    $owner = get_user((int)$ownerId);
    $album = db_get('albums', (int)$albumId);
    if (!$owner || !$album || $album['owner_id'] !== $owner['id']) render_error(404, 'Альбома здесь нет.');
    ensure_can_see_photos($owner);

    render('album', ['title' => $album['title'], 'nav' => 'photos',
        'owner' => $owner, 'isMe' => $owner['id'] === $me['id'],
        'album' => $album, 'photos' => photos_of((int)$album['id'])]);
}

function page_album_new(): void
{
    require_auth();
    render('album_new', ['title' => 'Новый альбом', 'nav' => 'photos']);
}

function page_album_new_post(): void
{
    $me = require_auth();
    $title = trim_text($_POST['title'] ?? '', 80);
    if ($title === '') {
        render('album_new', ['title' => 'Новый альбом', 'nav' => 'photos', 'error' => 'Укажите название альбома.']);
    }
    $album = db_insert('albums', ['owner_type' => 'user', 'owner_id' => $me['id'], 'title' => $title,
        'description' => trim_text($_POST['description'] ?? '', 500), 'created_at' => now()]);
    redirect('/album' . $me['id'] . '_' . $album['id']);
}

function page_album_delete(string $id): void
{
    $me = require_auth();
    $album = db_get('albums', (int)$id);
    if (!$album) render_error(404, 'Альбома здесь нет.');
    if ($album['owner_id'] !== $me['id']) render_error(403, 'Это не Ваш альбом.');

    foreach (photos_of((int)$album['id']) as $photo) drop_photo($photo);
    db_remove('albums', $album['id']);
    redirect('/photos');
}

function drop_photo(array $photo): void
{
    media_remove($photo['file']);
    media_remove($photo['thumb']);
    db_remove('comments', ['target_type' => 'photo', 'target_id' => $photo['id']]);
    db_remove('likes', ['target_type' => 'photo', 'target_id' => $photo['id']]);
    db_remove('attachments', ['kind' => 'photo', 'ref_id' => $photo['id']]);
    db_remove('photos', $photo['id']);
}

function page_photo_upload(): void
{
    $me = require_auth();
    render('photo_upload', ['title' => 'Загрузка фотографий', 'nav' => 'photos',
        'albums' => album_list((int)$me['id']),
        'selected' => (int)($_GET['album'] ?? 0) ?: (int)default_album((int)$me['id'])['id']]);
}

function page_photo_upload_post(): void
{
    $me = require_auth();
    if (!rate_limit('upload', 3600, 300)) render_error(429, 'Слишком много загрузок за час.');

    $files = uploaded_files('photos', 20);
    $fail = fn(string $error) => render('photo_upload', [
        'title' => 'Загрузка фотографий', 'nav' => 'photos', 'error' => $error,
        'albums' => album_list((int)$me['id']),
        'selected' => (int)($_POST['album_id'] ?? 0) ?: (int)default_album((int)$me['id'])['id'],
    ]);

    if (!$files) $fail('Выберите хотя бы один файл с картинкой.');

    $album = db_get('albums', (int)($_POST['album_id'] ?? 0));
    if (!$album || $album['owner_id'] !== $me['id']) $album = default_album((int)$me['id']);
    $description = trim_text($_POST['description'] ?? '', 300);

    $added = 0;
    foreach ($files as $file) {
        $head = (string)file_get_contents($file['tmp'], false, null, 0, 32);
        $type = media_detect($head, $file['name']);
        if (!$type || $type['kind'] !== 'image') continue;
        if ($file['size'] > media_limit('image')) continue;

        try {
            $saved = media_save_image($file['tmp'], 'photos', 1600, 180);
        } catch (Throwable $e) {
            continue;
        }
        db_insert('photos', [
            'album_id' => $album['id'], 'owner_id' => $me['id'],
            'file' => $saved['file'], 'thumb' => $saved['thumb'], 'description' => $description,
            'width' => $saved['width'], 'height' => $saved['height'], 'size' => $saved['size'],
            'created_at' => now(),
        ]);
        $added++;
    }

    if (!$added) $fail('Ни один файл не оказался картинкой.');
    redirect('/album' . $me['id'] . '_' . $album['id']);
}

function page_photo(string $ownerId, string $photoId): void
{
    $me = require_auth();
    $owner = get_user((int)$ownerId);
    $photo = db_get('photos', (int)$photoId);
    if (!$owner || !$photo || $photo['owner_id'] !== $owner['id']) render_error(404, 'Фотографии здесь нет.');
    ensure_can_see_photos($owner);

    $siblings = $photo['album_id'] ? photos_of((int)$photo['album_id']) : [$photo];
    $ids = array_column($siblings, 'id');
    $index = array_search($photo['id'], $ids, true);

    render('photo', [
        'title' => 'Фотография', 'nav' => 'photos',
        'owner' => $owner, 'isMe' => $owner['id'] === $me['id'], 'photo' => $photo,
        'album' => $photo['album_id'] ? db_get('albums', (int)$photo['album_id']) : null,
        'prev' => $index > 0 ? $ids[$index - 1] : null,
        'next' => ($index !== false && $index < count($ids) - 1) ? $ids[$index + 1] : null,
        'likes' => like_count('photo', (int)$photo['id']),
        'liked' => liked_by('photo', (int)$photo['id'], (int)$me['id']),
        'comments' => list_comments('photo', (int)$photo['id']),
    ]);
}

function page_photo_delete(string $id): void
{
    $me = require_auth();
    $photo = db_get('photos', (int)$id);
    if (!$photo) render_error(404, 'Фотографии здесь нет.');
    if ($photo['owner_id'] !== $me['id']) render_error(403, 'Это не Ваша фотография.');

    $fallback = $photo['album_id'] ? '/album' . $me['id'] . '_' . $photo['album_id'] : '/photos';
    drop_photo($photo);
    redirect(back_to($fallback));
}

function page_photo_avatar(string $id): void
{
    $me = require_auth();
    $photo = db_get('photos', (int)$id);
    if (!$photo) render_error(404, 'Фотографии здесь нет.');
    if ($photo['owner_id'] !== $me['id']) render_error(403, 'Это не Ваша фотография.');

    db_update('users', $me['id'], ['avatar' => $photo['file']]);
    redirect(back_to('/id' . $me['id']));
}
