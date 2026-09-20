<?php
/** Роутер для встроенного сервера PHP: отдаём файлы, остальное — в index.php. */
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . $path;
if ($path !== '/' && is_file($file)) {
    // Папки с данными и кодом наружу не отдаём — как это делает .htaccess.
    if (preg_match('~^/(data|app|tools)/~', $path)) { http_response_code(404); echo 'нет'; return true; }
    return false;
}
require __DIR__ . '/index.php';
return true;
