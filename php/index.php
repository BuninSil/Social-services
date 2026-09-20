<?php
/**
 * ВОнлайне — точка входа. Все адреса приходят сюда.
 *
 * Сервер: обычный PHP, ничего ставить не нужно.
 * База: файлы в data/, зашифрованные, без SQL.
 */

declare(strict_types=1);

mb_internal_encoding('UTF-8');
date_default_timezone_set(@date_default_timezone_get() ?: 'Europe/Moscow');

define('VO_ROOT', __DIR__);
define('VO_DATA_DIR', __DIR__ . '/data');
define('VO_UPLOAD_DIR', __DIR__ . '/uploads');

/** Настройки из app/config.php с запасным значением. */
function config(string $key, $fallback = null)
{
    static $config = null;
    if ($config === null) $config = require VO_ROOT . '/app/config.php';
    return $config[$key] ?? $fallback;
}

require __DIR__ . '/app/util.php';
require __DIR__ . '/app/db.php';
require __DIR__ . '/app/theme.php';
require __DIR__ . '/app/security.php';
require __DIR__ . '/app/auth.php';
require __DIR__ . '/app/media.php';
require __DIR__ . '/app/models.php';
require __DIR__ . '/app/retrocore.php';
require __DIR__ . '/app/view.php';

foreach (glob(__DIR__ . '/app/pages/*.php') ?: [] as $page) require $page;

start_session();
security_headers();
csrf_check();

/* ------------------------------------------------------------- маршруты */

$path = '/' . trim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '', '/');
// Хостинг без mod_rewrite: адрес приезжает как /index.php?p=/feed
if (isset($_GET['p']) && ($path === '/index.php' || $path === '/')) {
    $path = '/' . trim((string)$_GET['p'], '/');
}
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$routes = [
    ['GET',  '~^/$~',                              'page_home'],
    ['GET',  '~^/login$~',                         'page_login'],
    ['POST', '~^/login$~',                         'page_login_post'],
    ['GET',  '~^/register$~',                      'page_register'],
    ['POST', '~^/register$~',                      'page_register_post'],
    ['POST', '~^/logout$~',                        'page_logout'],
    ['GET',  '~^/connect/start$~',                 'page_connect_start'],
    ['GET',  '~^/connect/callback$~',              'page_connect_callback'],

    ['GET',  '~^/feed$~',                          'page_feed'],
    ['POST', '~^/feed$~',                          'page_feed_post'],
    ['GET',  '~^/id(\d+)$~',                       'page_profile'],
    ['POST', '~^/id(\d+)/wall$~',                  'page_wall_post'],

    ['GET',  '~^/post/(\d+)$~',                    'page_post'],
    ['GET',  '~^/post/(\d+)/edit$~',               'page_post_edit'],
    ['POST', '~^/post/(\d+)/edit$~',               'page_post_edit_save'],
    ['POST', '~^/post/(\d+)/delete$~',             'page_post_delete'],
    ['POST', '~^/post/(\d+)/pin$~',                'page_post_pin'],
    ['POST', '~^/post/(\d+)/repost$~',             'page_post_repost'],
    ['POST', '~^/like$~',                          'page_like'],
    ['GET',  '~^/likes/(post|photo|video)/(\d+)$~', 'page_likes'],
    ['POST', '~^/comment/(post|photo|video)/(\d+)$~', 'page_comment_add'],
    ['POST', '~^/comment/(\d+)/delete$~',          'page_comment_delete'],

    ['GET',  '~^/friends$~',                       'page_friends'],
    ['GET',  '~^/friends/requests$~',              'page_friends_requests'],
    ['GET',  '~^/friends/out$~',                   'page_friends_out'],
    ['GET',  '~^/friends/(\d+)$~',                 'page_friends_of'],
    ['POST', '~^/friends/add/(\d+)$~',             'page_friend_add'],
    ['POST', '~^/friends/remove/(\d+)$~',          'page_friend_remove'],
    ['POST', '~^/block/(\d+)$~',                   'page_block'],
    ['POST', '~^/unblock/(\d+)$~',                 'page_unblock'],
    ['GET',  '~^/settings/blacklist$~',            'page_blacklist'],

    ['GET',  '~^/im$~',                            'page_im_list'],
    ['GET',  '~^/im/new$~',                        'page_im_new'],
    ['POST', '~^/im/new$~',                        'page_im_new_post'],
    ['GET',  '~^/im/search$~',                     'page_im_search'],
    ['GET',  '~^/im/(\d+)$~',                      'page_im_dm'],
    ['GET',  '~^/im/c(\d+)$~',                     'page_im_chat'],
    ['GET',  '~^/im/c(\d+)/updates$~',             'page_im_updates'],
    ['POST', '~^/im/c(\d+)/send$~',                'page_im_send'],
    ['POST', '~^/im/c(\d+)/leave$~',               'page_im_leave'],
    ['POST', '~^/im/c(\d+)/title$~',               'page_im_title'],
    ['POST', '~^/im/c(\d+)/invite$~',              'page_im_invite'],
    ['POST', '~^/message/(\d+)/delete$~',          'page_message_delete'],

    ['GET',  '~^/photos$~',                        'page_photos'],
    ['GET',  '~^/photos/upload$~',                 'page_photo_upload'],
    ['POST', '~^/photos/upload$~',                 'page_photo_upload_post'],
    ['GET',  '~^/photos/(\d+)$~',                  'page_photos_of'],
    ['GET',  '~^/albums/new$~',                    'page_album_new'],
    ['POST', '~^/albums/new$~',                    'page_album_new_post'],
    ['GET',  '~^/album(\d+)_(\d+)$~',              'page_album'],
    ['POST', '~^/album/(\d+)/delete$~',            'page_album_delete'],
    ['GET',  '~^/photo(\d+)_(\d+)$~',              'page_photo'],
    ['POST', '~^/photo/(\d+)/delete$~',            'page_photo_delete'],
    ['POST', '~^/photo/(\d+)/avatar$~',            'page_photo_avatar'],

    ['GET',  '~^/video$~',                         'page_video'],
    ['GET',  '~^/video/(\d+)$~',                   'page_video_of'],
    ['POST', '~^/video/upload$~',                  'page_video_upload'],
    ['GET',  '~^/video(\d+)_(\d+)$~',              'page_video_one'],
    ['POST', '~^/video/(\d+)/delete$~',            'page_video_delete'],

    ['GET',  '~^/audio$~',                         'page_audio'],
    ['GET',  '~^/audio/(\d+)$~',                   'page_audio_of'],
    ['POST', '~^/audio/upload$~',                  'page_audio_upload'],
    ['POST', '~^/audio/(\d+)/delete$~',            'page_audio_delete'],

    ['GET',  '~^/docs$~',                          'page_docs'],
    ['POST', '~^/docs/upload$~',                   'page_docs_upload'],
    ['POST', '~^/docs/(\d+)/delete$~',             'page_doc_delete'],
    ['GET',  '~^/doc(\d+)_(\d+)$~',                'page_doc_download'],

    ['GET',  '~^/groups$~',                        'page_groups'],
    ['GET',  '~^/groups/all$~',                    'page_groups_all'],
    ['GET',  '~^/groups/new$~',                    'page_group_new'],
    ['POST', '~^/groups/new$~',                    'page_group_new_post'],
    ['GET',  '~^/groups/(\d+)$~',                  'page_groups_of'],
    ['GET',  '~^/club(\d+)$~',                     'page_group'],
    ['POST', '~^/club(\d+)/wall$~',                'page_group_wall'],
    ['POST', '~^/club(\d+)/join$~',                'page_group_join'],
    ['POST', '~^/club(\d+)/leave$~',               'page_group_leave'],
    ['GET',  '~^/club(\d+)/edit$~',                'page_group_edit'],
    ['POST', '~^/club(\d+)/edit$~',                'page_group_edit_post'],
    ['POST', '~^/club(\d+)/delete$~',              'page_group_delete'],

    ['GET',  '~^/notifications$~',                 'page_notifications'],
    ['POST', '~^/notifications/read$~',            'page_notifications_read'],
    ['GET',  '~^/search$~',                        'page_search'],
    ['GET',  '~^/people$~',                        'page_people'],
    ['GET',  '~^/help$~',                          'page_help'],
    ['GET',  '~^/settings$~',                      'page_settings'],
    ['POST', '~^/settings$~',                      'page_settings_save'],
    ['POST', '~^/settings/avatar$~',               'page_settings_avatar'],
    ['POST', '~^/settings/avatar/delete$~',        'page_settings_avatar_delete'],
    ['POST', '~^/settings/password$~',             'page_settings_password'],
    ['POST', '~^/settings/theme$~',                'page_settings_theme'],
    ['POST', '~^/settings/delete$~',               'page_settings_delete'],
    ['POST', '~^/theme$~',                         'page_theme_cycle'],

    // Короткий адрес /vladislav — всегда последним, чтобы не перехватывал своё.
    ['GET',  '~^/([a-z0-9_.]{3,20})$~i',           'page_short_link'],
];

try {
    foreach ($routes as [$verb, $pattern, $handler]) {
        if ($verb !== $method) continue;
        if (!preg_match($pattern, $path, $m)) continue;
        $handler(...array_slice($m, 1));
        exit;
    }
    render_error(404, 'Такой страницы здесь нет.');
} catch (Throwable $e) {
    error_log('[вонлайне] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) http_response_code(500);
    render_error(500, 'Что-то сломалось. Попробуйте ещё раз.');
}
