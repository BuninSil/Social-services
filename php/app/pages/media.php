<?php
/** Видеозаписи, аудиозаписи и документы. */

function page_video(): void
{
    $me = require_auth();
    show_video_list($me);
}

function page_video_of(string $id): void
{
    $me = require_auth();
    $owner = get_user((int)$id);
    if (!$owner) render_error(404, 'Такой страницы здесь нет.');
    if (!can_see((int)$me['id'], $owner, 'profile')) render_error(403, 'Страница закрыта.');
    show_video_list($owner);
}

function show_video_list(array $owner, ?string $error = null): void
{
    $me = current_user();
    $videos = db_filter('videos', ['owner_id' => $owner['id']]);
    usort($videos, fn($a, $b) => $b['id'] <=> $a['id']);
    render('video', [
        'title' => $owner['id'] === $me['id'] ? 'Мои видеозаписи' : 'Видеозаписи: ' . full_name($owner),
        'nav' => $owner['id'] === $me['id'] ? 'video' : '',
        'owner' => $owner, 'isMe' => $owner['id'] === $me['id'], 'videos' => $videos, 'error' => $error,
    ]);
}

function page_video_upload(): void
{
    $me = require_auth();
    if (!rate_limit('upload', 3600, 300)) render_error(429, 'Слишком много загрузок за час.');

    $files = uploaded_files('video', 1);
    if (!$files) show_video_list($me, 'Выберите файл с видео.');

    $file = $files[0];
    $head = (string)file_get_contents($file['tmp'], false, null, 0, 32);
    $type = media_detect($head, $file['name']);
    if (!$type || $type['kind'] !== 'video') show_video_list($me, 'Это не видеофайл. Подойдут MP4 и WebM.');
    if ($file['size'] > media_limit('video')) {
        show_video_list($me, 'Файл больше ' . human_size(media_limit('video')) . '.');
    }

    $saved = media_store($file['tmp'], 'videos', $type['ext']);
    db_insert('videos', [
        'owner_id' => $me['id'],
        'title' => trim_text($_POST['title'] ?? '', 120) ?: (preg_replace('~\.[^.]+$~', '', clean_name($file['name'])) ?: 'Видеозапись'),
        'description' => trim_text($_POST['description'] ?? '', 1000),
        'file' => $saved['file'], 'size' => $saved['size'], 'created_at' => now(),
    ]);
    redirect('/video');
}

function page_video_one(string $ownerId, string $videoId): void
{
    $me = require_auth();
    $owner = get_user((int)$ownerId);
    $video = db_get('videos', (int)$videoId);
    if (!$owner || !$video || $video['owner_id'] !== $owner['id']) render_error(404, 'Видеозаписи здесь нет.');
    if (!can_see((int)$me['id'], $owner, 'profile')) render_error(403, 'Страница закрыта.');

    render('video_one', [
        'title' => $video['title'], 'nav' => $owner['id'] === $me['id'] ? 'video' : '',
        'owner' => $owner, 'video' => $video,
        'comments' => list_comments('video', (int)$video['id']),
    ]);
}

function page_video_delete(string $id): void
{
    $me = require_auth();
    $video = db_get('videos', (int)$id);
    if ($video && $video['owner_id'] === $me['id']) {
        media_remove($video['file']);
        media_remove($video['poster']);
        db_remove('attachments', ['kind' => 'video', 'ref_id' => $video['id']]);
        db_remove('comments', ['target_type' => 'video', 'target_id' => $video['id']]);
        db_remove('likes', ['target_type' => 'video', 'target_id' => $video['id']]);
        db_remove('videos', $video['id']);
    }
    redirect(back_to('/video'));
}

/* ------------------------------------------------------------- музыка */

function page_audio(): void
{
    $me = require_auth();
    show_audio_list($me);
}

function page_audio_of(string $id): void
{
    $me = require_auth();
    $owner = get_user((int)$id);
    if (!$owner) render_error(404, 'Такой страницы здесь нет.');
    if (!can_see((int)$me['id'], $owner, 'audio')) render_error(403, 'Аудиозаписи скрыты настройками.');
    show_audio_list($owner);
}

function show_audio_list(array $owner, ?string $error = null): void
{
    $me = current_user();
    $audios = db_filter('audios', ['owner_id' => $owner['id']]);
    usort($audios, fn($a, $b) => $b['id'] <=> $a['id']);
    render('audio', [
        'title' => $owner['id'] === $me['id'] ? 'Мои аудиозаписи' : 'Аудиозаписи: ' . full_name($owner),
        'nav' => $owner['id'] === $me['id'] ? 'audio' : '',
        'owner' => $owner, 'isMe' => $owner['id'] === $me['id'], 'audios' => $audios, 'error' => $error,
    ]);
}

function page_audio_upload(): void
{
    $me = require_auth();
    if (!rate_limit('upload', 3600, 300)) render_error(429, 'Слишком много загрузок за час.');

    $files = uploaded_files('audio', 1);
    if (!$files) show_audio_list($me, 'Выберите аудиофайл.');

    $file = $files[0];
    $head = (string)file_get_contents($file['tmp'], false, null, 0, 32);
    $type = media_detect($head, $file['name']);
    if (!$type || $type['kind'] !== 'audio') {
        show_audio_list($me, 'Это не аудиофайл. Подойдут MP3, OGG, WAV, FLAC, M4A.');
    }
    if ($file['size'] > media_limit('audio')) {
        show_audio_list($me, 'Файл больше ' . human_size(media_limit('audio')) . '.');
    }

    $saved = media_store($file['tmp'], 'audio', $type['ext']);
    $track = split_track(clean_name($file['name']));
    db_insert('audios', [
        'owner_id' => $me['id'],
        'artist' => trim_text($_POST['artist'] ?? '', 80) ?: $track['artist'],
        'title' => trim_text($_POST['title'] ?? '', 80) ?: $track['title'],
        'file' => $saved['file'], 'size' => $saved['size'], 'created_at' => now(),
    ]);
    redirect('/audio');
}

function page_audio_delete(string $id): void
{
    $me = require_auth();
    $audio = db_get('audios', (int)$id);
    if ($audio && $audio['owner_id'] === $me['id']) {
        media_remove($audio['file']);
        db_remove('attachments', fn($a) => in_array($a['kind'], ['audio', 'voice'], true)
            && $a['ref_id'] === $audio['id']);
        db_remove('audios', $audio['id']);
    }
    redirect(back_to('/audio'));
}

/* ---------------------------------------------------------- документы */

function page_docs(?string $error = null): void
{
    $me = require_auth();
    $docs = db_filter('docs', ['owner_id' => $me['id']]);
    usort($docs, fn($a, $b) => $b['id'] <=> $a['id']);
    render('docs', ['title' => 'Мои документы', 'nav' => 'docs', 'docs' => $docs, 'error' => $error]);
}

function page_docs_upload(): void
{
    $me = require_auth();
    if (!rate_limit('upload', 3600, 300)) render_error(429, 'Слишком много загрузок за час.');

    $files = uploaded_files('doc', 1);
    if (!$files) page_docs('Выберите файл.');

    $file = $files[0];
    $head = (string)file_get_contents($file['tmp'], false, null, 0, 32);
    $type = media_detect($head, $file['name']);
    if (!$type) page_docs('Такой тип файла сайт не принимает.');
    if ($file['size'] > media_limit($type['kind'])) {
        page_docs('Файл больше ' . human_size(media_limit($type['kind'])) . '.');
    }

    $saved = media_store($file['tmp'], 'docs', $type['ext']);
    db_insert('docs', [
        'owner_id' => $me['id'], 'name' => clean_name($file['name']),
        'file' => $saved['file'], 'ext' => $type['ext'], 'size' => $saved['size'], 'created_at' => now(),
    ]);
    redirect('/docs');
}

function page_doc_delete(string $id): void
{
    $me = require_auth();
    $doc = db_get('docs', (int)$id);
    if ($doc && $doc['owner_id'] === $me['id']) {
        media_remove($doc['file']);
        db_remove('attachments', ['kind' => 'doc', 'ref_id' => $doc['id']]);
        db_remove('docs', $doc['id']);
    }
    redirect(back_to('/docs'));
}

/**
 * Документы отдаём через PHP и всегда вложением: так их не выполнит
 * ни сервер, ни браузер, даже если внутри что-то исполняемое.
 */
function page_doc_download(string $ownerId, string $docId): void
{
    $me = require_auth();
    $doc = db_get('docs', (int)$docId);
    if (!$doc || $doc['owner_id'] !== (int)$ownerId) render_error(404, 'Документа здесь нет.');

    $owner = get_user((int)$ownerId);
    $shared = db_has('attachments', ['kind' => 'doc', 'ref_id' => $doc['id']]);
    if ($doc['owner_id'] !== $me['id'] && !$shared && !can_see((int)$me['id'], $owner, 'profile')) {
        render_error(403, 'Документ недоступен.');
    }

    $path = upload_dir() . '/' . $doc['file'];
    if (!is_file($path)) render_error(404, 'Файл потерялся.');

    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: attachment; filename="' . preg_replace('~["\r\n]~', '', $doc['name']) . '"');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}
