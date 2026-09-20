<?php
/**
 * ВОнлайне — приём файлов.
 *
 * Тип определяется по содержимому, а не по тому, что сказал браузер: иначе
 * «картинка» с html или php внутри уехала бы на хостинг под видом фотографии.
 * SVG не принимаем совсем — это документ со скриптами.
 */

const MEDIA_TYPES = [
    // подпись в начале файла => [вид, расширение]
    "\xFF\xD8\xFF"                 => ['image', 'jpg'],
    "\x89PNG\r\n\x1a\n"            => ['image', 'png'],
    'GIF87a'                       => ['image', 'gif'],
    'GIF89a'                       => ['image', 'gif'],
    "\x1A\x45\xDF\xA3"             => ['video', 'webm'],
    'OggS'                         => ['audio', 'ogg'],
    'ID3'                          => ['audio', 'mp3'],
    'fLaC'                         => ['audio', 'flac'],
    '%PDF'                         => ['doc', 'pdf'],
    "PK\x03\x04"                   => ['doc', 'zip'],
    'Rar!'                         => ['doc', 'rar'],
    "7z\xBC\xAF\x27\x1C"           => ['doc', '7z'],
    "\x1F\x8B"                     => ['doc', 'gz'],
];

function upload_dir(): string
{
    $dir = defined('VO_UPLOAD_DIR') ? VO_UPLOAD_DIR : dirname(__DIR__) . '/uploads';
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    return $dir;
}

/** Определяет вид файла по первым байтам. Ничего не узнали — не принимаем. */
function media_detect(string $head, string $name = ''): ?array
{
    foreach (MEDIA_TYPES as $magic => [$kind, $ext]) {
        if (str_starts_with($head, $magic)) {
            return ['kind' => $kind, 'ext' => $ext];
        }
    }
    // RIFF бывает и картинкой, и звуком — смотрим дальше.
    if (str_starts_with($head, 'RIFF') && strlen($head) >= 12) {
        $form = substr($head, 8, 4);
        if ($form === 'WEBP') return ['kind' => 'image', 'ext' => 'webp'];
        if ($form === 'WAVE') return ['kind' => 'audio', 'ext' => 'wav'];
    }
    // MP4 и родня: коробка ftyp начинается с четвёртого байта.
    if (strlen($head) >= 12 && substr($head, 4, 4) === 'ftyp') {
        $brand = substr($head, 8, 4);
        if (in_array($brand, ['M4A ', 'M4B ', 'mp42'], true) && str_ends_with(mb_strtolower($name), '.m4a')) {
            return ['kind' => 'audio', 'ext' => 'm4a'];
        }
        return ['kind' => 'video', 'ext' => 'mp4'];
    }
    // MP3 без тега ID3.
    if (strlen($head) >= 2 && $head[0] === "\xFF" && (ord($head[1]) & 0xE0) === 0xE0) {
        return ['kind' => 'audio', 'ext' => 'mp3'];
    }
    // Обычный текст — только если это правда текст и расширение спокойное.
    $ext = mb_strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (in_array($ext, ['txt', 'md', 'csv', 'log', 'ini', 'srt'], true)
        && mb_check_encoding($head, 'UTF-8')
        && !preg_match('~<\?php|<script|<html~i', $head)) {
        return ['kind' => 'doc', 'ext' => $ext];
    }
    return null;
}

function media_limit(string $kind): int
{
    $mb = match ($kind) {
        'image' => (int)config('limit_image', 12),
        'audio' => (int)config('limit_audio', 30),
        'video' => (int)config('limit_video', 256),
        default => (int)config('limit_doc', 50),
    };
    return $mb * 1048576;
}

function random_name(string $ext): string
{
    return bin2hex(random_bytes(12)) . '.' . $ext;
}

/** Имя файла приходит от человека — чистим перед показом и хранением. */
function clean_name(string $name): string
{
    $name = preg_replace('~[\\\\/]+~', '', $name);
    $name = preg_replace('~[^\p{L}\p{N} ._()\[\]#+\-]~u', '', $name) ?? '';
    $name = trim_text($name, 120);
    return $name !== '' ? $name : 'файл';
}

/** «Артист - Название» из имени файла, если оно так оформлено. */
function split_track(string $name): array
{
    $base = preg_replace('~\.[^.]+$~', '', $name);
    $parts = preg_split('~\s+[-–—]\s+~u', $base, 2);
    if (count($parts) === 2) return ['artist' => $parts[0], 'title' => $parts[1]];
    return ['artist' => 'Неизвестен', 'title' => $base];
}

/** Кладёт файл как есть. Возвращает путь вида photos/ab12.jpg. */
function media_store(string $tmpPath, string $sub, string $ext): array
{
    $dir = upload_dir() . '/' . $sub;
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    $name = random_name($ext);
    if (!@copy($tmpPath, $dir . '/' . $name)) {
        throw new RuntimeException('файл не сохранился');
    }
    @chmod($dir . '/' . $name, 0644);
    return ['file' => $sub . '/' . $name, 'size' => (int)filesize($dir . '/' . $name)];
}

/**
 * Картинка: большая копия и миниатюра. Если модуля gd нет или он не осилил
 * формат, кладём как есть — сайт от этого не ломается.
 */
function media_save_image(string $tmpPath, string $sub, int $maxWidth, int $thumbSize, bool $square = false): array
{
    $head = (string)file_get_contents($tmpPath, false, null, 0, 32);
    $type = media_detect($head);
    if (!$type || $type['kind'] !== 'image') throw new RuntimeException('это не картинка');

    $dir = upload_dir() . '/' . $sub;
    if (!is_dir($dir)) mkdir($dir, 0775, true);

    $canResize = config('resize_images', true) && function_exists('imagecreatetruecolor')
        && $type['ext'] !== 'gif';   // анимацию не трогаем

    if (!$canResize) {
        $name = random_name($type['ext']);
        copy($tmpPath, $dir . '/' . $name);
        copy($tmpPath, $dir . '/thumb_' . $name);
        $size = getimagesize($dir . '/' . $name) ?: [0, 0];
        return [
            'file' => $sub . '/' . $name, 'thumb' => $sub . '/thumb_' . $name,
            'width' => (int)$size[0], 'height' => (int)$size[1],
            'size' => (int)filesize($dir . '/' . $name),
        ];
    }

    $source = @imagecreatefromstring((string)file_get_contents($tmpPath));
    if (!$source) throw new RuntimeException('картинка не читается');

    $name = random_name('jpg');
    $big = image_resized($source, $maxWidth, false);
    imagejpeg($big, $dir . '/' . $name, 88);
    $width = imagesx($big);
    $height = imagesy($big);
    imagedestroy($big);

    $thumb = image_resized($source, $thumbSize, $square);
    imagejpeg($thumb, $dir . '/thumb_' . $name, 85);
    imagedestroy($thumb);
    imagedestroy($source);

    @chmod($dir . '/' . $name, 0644);
    @chmod($dir . '/thumb_' . $name, 0644);

    return [
        'file' => $sub . '/' . $name,
        'thumb' => $sub . '/thumb_' . $name,
        'width' => $width,
        'height' => $height,
        'size' => (int)filesize($dir . '/' . $name),
    ];
}

/** Уменьшение: вписываем в квадрат или обрезаем по центру. */
function image_resized(GdImage $source, int $max, bool $square): GdImage
{
    $w = imagesx($source);
    $h = imagesy($source);

    if ($square) {
        $side = min($w, $h);
        $canvas = imagecreatetruecolor($max, $max);
        imagefill($canvas, 0, 0, imagecolorallocate($canvas, 255, 255, 255));
        imagecopyresampled($canvas, $source, 0, 0,
            (int)(($w - $side) / 2), (int)(($h - $side) / 2), $max, $max, $side, $side);
        return $canvas;
    }

    $scale = min(1, $max / max($w, $h));
    $tw = max(1, (int)round($w * $scale));
    $th = max(1, (int)round($h * $scale));
    $canvas = imagecreatetruecolor($tw, $th);
    imagefill($canvas, 0, 0, imagecolorallocate($canvas, 255, 255, 255));
    imagecopyresampled($canvas, $source, 0, 0, 0, 0, $tw, $th, $w, $h);
    return $canvas;
}

function media_remove(?string $relative): void
{
    if (!$relative) return;
    $path = upload_dir() . '/' . $relative;
    $real = realpath($path);
    $base = realpath(upload_dir());
    if ($real && $base && str_starts_with($real, $base)) @unlink($real);
}

function thumb_of(string $file): string
{
    return preg_replace('~([^/]+)$~', 'thumb_$1', $file);
}

/** Аватар: своя фотография, картинка из сети RetroCore или серый силуэт. */
function avatar_url(?array $user, string $size = 'thumb'): string
{
    if (!$user) return '/assets/img/camera_200.svg';
    if (!empty($user['avatar'])) {
        return '/uploads/' . ($size === 'full' ? $user['avatar'] : thumb_of($user['avatar']));
    }
    if (!empty($user['rc_avatar'])) return $user['rc_avatar'];
    return '/assets/img/camera_200.svg';
}

function group_avatar_url(?array $group): string
{
    if ($group && !empty($group['avatar'])) return '/uploads/' . $group['avatar'];
    return '/assets/img/group_200.svg';
}

/**
 * Разбирает $_FILES одного поля в список файлов вида
 * ['name' => …, 'tmp' => …, 'size' => …], сколько бы их ни прислали.
 */
function uploaded_files(string $field, int $limit = 10): array
{
    if (empty($_FILES[$field])) return [];
    $raw = $_FILES[$field];
    $out = [];

    if (is_array($raw['name'])) {
        foreach ($raw['name'] as $i => $name) {
            if (($raw['error'][$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) continue;
            $out[] = ['name' => (string)$name, 'tmp' => $raw['tmp_name'][$i], 'size' => (int)$raw['size'][$i]];
            if (count($out) >= $limit) break;
        }
    } elseif (($raw['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
        $out[] = ['name' => (string)$raw['name'], 'tmp' => $raw['tmp_name'], 'size' => (int)$raw['size']];
    }

    return array_values(array_filter($out, fn($f) => is_uploaded_file($f['tmp']) || is_file($f['tmp'])));
}
