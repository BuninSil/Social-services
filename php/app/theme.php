<?php
/** ВОнлайне — оформления. Пять тем, у неоновой цвета настраиваются. */

const THEMES = [
    'vo'     => ['title' => 'Светлая',      'hint' => 'оригинальный старый ВК',        'file' => 'vo.css',        'icon' => '☀', 'bar' => '#5e82a6'],
    'dark'   => ['title' => 'Тёмная',       'hint' => 'тот же вид в тёмных тонах',      'file' => 'vo-dark.css',   'icon' => '☾', 'bar' => '#2a3a4e'],
    'neon'   => ['title' => 'Неоновая',     'hint' => 'тёмная со свечением и своими цветами', 'file' => 'vo-neon.css', 'icon' => '✦', 'bar' => ''],
    'fresh'  => ['title' => 'Обновлённая',  'hint' => 'светлая с современной подачей',  'file' => 'vo-fresh.css',  'icon' => '☀', 'bar' => '#5181b8'],
    'modern' => ['title' => 'Современная',  'hint' => 'карточки и колонка пошире',      'file' => 'vo-modern.css', 'icon' => '☀', 'bar' => '#4680c2'],
];

/** Кнопка в шапке крутит три основных по кругу. */
const THEME_CYCLE = ['vo', 'dark', 'neon'];

const NEON_DEFAULTS = ['c1' => '#2fe0ff', 'c2' => '#ff4ecd', 'bg' => '#070b16'];

const NEON_PRESETS = [
    ['id' => 'cyber',  'title' => 'Киберпанк', 'c1' => '#2fe0ff', 'c2' => '#ff4ecd', 'bg' => '#070b16'],
    ['id' => 'acid',   'title' => 'Кислота',   'c1' => '#7cff3d', 'c2' => '#ffe600', 'bg' => '#06110a'],
    ['id' => 'sunset', 'title' => 'Закат',     'c1' => '#ff8a3d', 'c2' => '#ff3d77', 'bg' => '#130a12'],
    ['id' => 'ice',    'title' => 'Лёд',       'c1' => '#8fd8ff', 'c2' => '#c9a7ff', 'bg' => '#0a1020'],
    ['id' => 'matrix', 'title' => 'Матрица',   'c1' => '#39ff87', 'c2' => '#1fbf6b', 'bg' => '#040d07'],
];

function is_theme(?string $name): bool
{
    return $name !== null && isset(THEMES[$name]);
}

/** Тема: из адреса (разовый просмотр), из настроек человека или из сессии. */
function current_theme(?array $me): string
{
    $asked = $_GET['theme'] ?? null;
    if (is_theme($asked)) {
        $_SESSION['theme'] = $asked;
        return $asked;
    }
    if ($me && is_theme($me['theme'] ?? null)) return $me['theme'];
    if (is_theme($_SESSION['theme'] ?? null)) return $_SESSION['theme'];
    $default = config('theme', 'vo');
    return is_theme($default) ? $default : 'vo';
}

function next_theme(string $name): string
{
    $i = array_search($name, THEME_CYCLE, true);
    return $i === false ? THEME_CYCLE[0] : THEME_CYCLE[($i + 1) % count(THEME_CYCLE)];
}

function theme_file(string $name): string
{
    return THEMES[$name]['file'] ?? 'vo.css';
}

function theme_title(string $name): string
{
    return THEMES[$name]['title'] ?? 'Светлая';
}

function theme_icon(string $name): string
{
    return THEMES[$name]['icon'] ?? '☀';
}

/** Цвет системной строки браузера на телефоне — под цвет шапки. */
function theme_bar_color(string $name): string
{
    if ($name === 'neon') return neon_colors(current_user())['bg'];
    return THEMES[$name]['bar'] ?? '#5e82a6';
}

/** Цвета неоновой темы — строго #rrggbb: они уезжают прямо в разметку. */
function neon_colors(?array $user): array
{
    return [
        'c1' => hex_color($user['neon_c1'] ?? '', NEON_DEFAULTS['c1']),
        'c2' => hex_color($user['neon_c2'] ?? '', NEON_DEFAULTS['c2']),
        'bg' => hex_color($user['neon_bg'] ?? '', NEON_DEFAULTS['bg']),
    ];
}

function hex_color(?string $value, string $fallback): string
{
    return preg_match('~^#[0-9a-f]{6}$~i', (string)$value) ? strtolower($value) : $fallback;
}
