<?php
/** ВОнлайне — сборка страниц из шаблонов. */

/** Рисует страницу: шаблон внутрь общего каркаса. */
function render(string $template, array $vars = []): void
{
    $me = current_user();
    $vars += [
        'title' => '',
        'nav' => '',
        'me' => $me,
        'counters' => menu_counters($me),
        'theme' => current_theme($me),
        'error' => null,
        'notice' => null,
    ];

    extract($vars, EXTR_SKIP);
    ob_start();
    require __DIR__ . '/views/' . $template . '.php';
    $content = ob_get_clean();

    require __DIR__ . '/views/layout.php';
    exit;
}

/** Страница ошибки в том же оформлении. */
function render_error(int $code, string $message): void
{
    http_response_code($code);
    render('error', ['title' => 'Ошибка ' . $code, 'code' => $code, 'message' => $message]);
}

function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Действие, меняющее состояние, — это всегда форма с токеном, а не ссылка:
 * по ссылке его мог бы выполнить чужой сайт от имени вошедшего человека.
 * Выглядит при этом как обычная ссылка.
 */
function act(string $url, string $label, array $opts = []): string
{
    $out = '<form class="act" method="post" action="' . e($url) . '">' . csrf_field();
    if (!empty($opts['back'])) {
        $out .= '<input type="hidden" name="back" value="' . e($opts['back']) . '">';
    }
    foreach ($opts['fields'] ?? [] as $name => $value) {
        $out .= '<input type="hidden" name="' . e($name) . '" value="' . e((string)$value) . '">';
    }
    $out .= '<button type="submit" class="link_btn' . (!empty($opts['cls']) ? ' ' . e($opts['cls']) : '') . '"';
    if (!empty($opts['confirm'])) $out .= ' data-confirm="' . e($opts['confirm']) . '"';
    $out .= '>' . e($label) . '</button></form>';
    return $out;
}

/** Вложения записи или сообщения. */
function attachments_html(array $attachments): string
{
    if (!$attachments) return '';
    ob_start();
    require __DIR__ . '/views/partials/attachments.php';
    return ob_get_clean();
}

/** Одна запись со всем обвесом. */
function post_html(array $post, array $opts = []): string
{
    $canDelete = $opts['can_delete'] ?? false;
    $showOwner = $opts['show_owner'] ?? false;
    $back = $opts['back'] ?? '/feed';
    $me = current_user();
    ob_start();
    require __DIR__ . '/views/partials/post.php';
    return ob_get_clean();
}

/** Форма записи на стену. */
function wall_form_html(string $action, string $placeholder = 'Что у Вас нового?'): string
{
    ob_start();
    require __DIR__ . '/views/partials/wallform.php';
    return ob_get_clean();
}

/** Страничная навигация. */
function pagination_html(int $page, int $pages, string $base): string
{
    if ($pages < 2) return '';
    $out = '<div class="pagination">';
    for ($i = 1; $i <= $pages; $i++) {
        $out .= $i === $page
            ? '<span class="cur">' . $i . '</span>'
            : '<a href="' . e($base) . (str_contains($base, '?') ? '&' : '?') . 'page=' . $i . '">' . $i . '</a>';
    }
    return $out . '</div>';
}
