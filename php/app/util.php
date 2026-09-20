<?php
/** ВОнлайне — мелочи, которые нужны везде: даты, склонения, экранирование. */

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL  = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа',
                      'сентября', 'октября', 'ноября', 'декабря'];

function now(): int
{
    return time();
}

/** Любой текст от человека попадает в разметку только через это. */
function e(?string $text): string
{
    return htmlspecialchars((string)$text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Обрезаем по символам, а не по байтам: иначе русские слова рвутся пополам. */
function trim_text($value, int $limit): string
{
    $text = trim(preg_replace('/[\x00-\x08\x0b\x0c\x0e-\x1f]/u', '', (string)$value) ?? '');
    return mb_substr($text, 0, $limit, 'UTF-8');
}

/** Склонение: plural(5, 'друг', 'друга', 'друзей') → 'друзей'. */
function plural(int $n, string $one, string $few, string $many): string
{
    $mod10 = $n % 10;
    $mod100 = $n % 100;
    if ($mod10 === 1 && $mod100 !== 11) return $one;
    if ($mod10 >= 2 && $mod10 <= 4 && ($mod100 < 10 || $mod100 >= 20)) return $few;
    return $many;
}

function plural_count(int $n, string $one, string $few, string $many): string
{
    return $n . ' ' . plural($n, $one, $few, $many);
}

/** Дата в духе старого ВКонтакте: «сегодня в 14:03», «12 мар в 9:15». */
function vk_date(int $ts): string
{
    $time = date('G:i', $ts);
    if (date('Y-m-d', $ts) === date('Y-m-d')) return 'сегодня в ' . $time;
    if (date('Y-m-d', $ts) === date('Y-m-d', time() - 86400)) return 'вчера в ' . $time;
    $day = (int)date('j', $ts);
    $month = MONTHS_SHORT[(int)date('n', $ts) - 1];
    if (date('Y', $ts) === date('Y')) return "$day $month в $time";
    return $day . ' ' . $month . ' ' . date('Y', $ts) . ' в ' . $time;
}

/** Короткая дата для списка бесед: «14:03», «12 мар». */
function short_date(int $ts): string
{
    if (date('Y-m-d', $ts) === date('Y-m-d')) return date('G:i', $ts);
    if (date('Y', $ts) === date('Y')) return (int)date('j', $ts) . ' ' . MONTHS_SHORT[(int)date('n', $ts) - 1];
    return date('d.m.Y', $ts);
}

/** «Был на сайте»: «сейчас на сайте», «был 12 мар в 9:15». */
function last_seen(array $user): string
{
    if (empty($user['last_seen'])) return '';
    if (now() - $user['last_seen'] < 300) return 'сейчас на сайте';
    return (($user['sex'] ?? 'm') === 'f' ? 'была ' : 'был ') . vk_date($user['last_seen']);
}

/** «10.10.1984» → «10 октября 1984 (41 год)». */
function format_bday(string $bday): string
{
    if ($bday === '') return '';
    $parts = explode('.', $bday);
    $day = (int)($parts[0] ?? 0);
    $month = (int)($parts[1] ?? 0);
    if (!$day || $month < 1 || $month > 12) return $bday;

    $out = $day . ' ' . MONTHS_FULL[$month - 1];
    $year = isset($parts[2]) ? (int)$parts[2] : 0;
    if ($year) {
        $out .= ' ' . $year;
        $age = (int)date('Y') - $year;
        if ((int)date('n') < $month || ((int)date('n') === $month && (int)date('j') < $day)) $age--;
        if ($age >= 0 && $age < 130) $out .= ' (' . plural_count($age, 'год', 'года', 'лет') . ')';
    }
    return $out;
}

function human_size(int $bytes): string
{
    if ($bytes >= 1073741824) return round($bytes / 1073741824, 1) . ' ГБ';
    if ($bytes >= 1048576) return round($bytes / 1048576, 1) . ' МБ';
    if ($bytes >= 1024) return round($bytes / 1024) . ' КБ';
    return $bytes . ' Б';
}

function human_duration(int $seconds): string
{
    if ($seconds <= 0) return '';
    return floor($seconds / 60) . ':' . str_pad((string)($seconds % 60), 2, '0', STR_PAD_LEFT);
}

function full_name(?array $user): string
{
    if (!$user) return 'Удалённая страница';
    return trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
}

/**
 * Текст записи в разметку: экранируем, разбираем переносы, ссылки,
 * #хештеги и @упоминания.
 */
function text2html(?string $text): string
{
    $out = e($text);
    $out = preg_replace_callback('~(https?://[^\s<]+)~u', function ($m) {
        $url = rtrim($m[1], '.,;:)');
        return '<a href="' . $url . '" rel="nofollow noopener" target="_blank">' . $url . '</a>';
    }, $out);
    $out = preg_replace('~(^|\s)#([\w\p{Cyrillic}]{2,30})~u', '$1<a href="/search?q=%23$2">#$2</a>', $out);
    $out = preg_replace('~(^|\s)@([a-z0-9_.]{3,20})~ui', '$1<a href="/$2">@$2</a>', $out);
    return nl2br($out, false);
}

/** Логины из текста — для уведомлений об упоминании. */
function mentions(string $text): array
{
    preg_match_all('~(?:^|\s)@([a-z0-9_.]{3,20})~ui', $text, $m);
    return array_values(array_unique(array_map('mb_strtolower', $m[1] ?? [])));
}

/** Сравнение имён по-русски. */
function by_name(array $a, array $b): int
{
    $left = ($a['last_name'] ?? '') . ' ' . ($a['first_name'] ?? '');
    $right = ($b['last_name'] ?? '') . ' ' . ($b['first_name'] ?? '');
    return strcoll_ru($left, $right);
}

function strcoll_ru(string $a, string $b): int
{
    static $collator = null;
    if ($collator === null && class_exists('Collator')) {
        $collator = new Collator('ru_RU');
    }
    if ($collator) return $collator->compare($a, $b) ?: 0;
    return strcmp(mb_strtolower($a), mb_strtolower($b));
}

/** Поиск по подстроке без учёта регистра. */
function contains(?string $haystack, string $needle): bool
{
    if ($needle === '') return false;
    return mb_stripos((string)$haystack, $needle, 0, 'UTF-8') !== false;
}
