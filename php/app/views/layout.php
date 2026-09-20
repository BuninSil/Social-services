<?php
/**
 * Общий каркас страницы: шапка, левое меню, подвал.
 * Внутрь подставляется $content — разметка конкретной страницы.
 *
 * @var string      $content
 * @var string      $title
 * @var string      $nav
 * @var array|null  $me
 * @var array       $counters
 * @var string      $theme
 */
$site = config('title', 'ВОнлайне');
$menu = [
    ['/id' . ($me['id'] ?? 0), 'profile', 'Моя Страница', 'ред.', 0],
    ['/feed', 'feed', 'Мои Новости', '', 0],
    ['/notifications', 'notifications', 'Мои Ответы', '', $counters['notifications']],
    ['/im', 'im', 'Мои Сообщения', '', $counters['messages']],
    ['/friends', 'friends', 'Мои Друзья', '', $counters['requests']],
    ['/photos', 'photos', 'Мои Фотографии', '', 0],
    ['/video', 'video', 'Мои Видеозаписи', '', 0],
    ['/audio', 'audio', 'Мои Аудиозаписи', '', 0],
    ['/docs', 'docs', 'Мои Документы', '', 0],
    ['/groups', 'groups', 'Мои Группы', '', 0],
    ['/search', 'search', 'Поиск', '', 0],
    ['/settings', 'settings', 'Мои Настройки', '', 0],
];
if (rc_enabled()) {
    array_splice($menu, 5, 0, [['/people', 'people', 'Люди сети', '', 0]]);
}
?><!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="<?= e(theme_bar_color($theme)) ?>">
<title><?= e($title ? $title . ' | ' . $site : $site) ?></title>
<link rel="stylesheet" href="/assets/css/<?= e(theme_file($theme)) ?>">
<link rel="stylesheet" href="/assets/css/mobile.css">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<?php if ($theme === 'neon'): $neon = neon_colors($me); ?>
<style>:root{--cyan:<?= e($neon['c1']) ?>;--pink:<?= e($neon['c2']) ?>;--bg:<?= e($neon['bg']) ?>;}</style>
<?php endif; ?>
</head>
<body<?= $me ? ' data-uid="' . (int)$me['id'] . '" data-csrf="' . e(csrf_token()) . '"' : '' ?>>

<div id="header">
  <div id="header_in">
    <a id="logo" href="<?= $me ? '/feed' : '/' ?>"><span class="logo_box">ВО</span><?= e($site) ?></a>
    <?php if ($me): ?>
      <form id="head_search" action="/search" method="get">
        <input class="head_q" type="text" name="q" value="<?= e($searchQuery ?? '') ?>"
               placeholder="поиск людей и записей">
      </form>
      <div id="head_nav">
        <a href="/id<?= (int)$me['id'] ?>"><?= e(full_name($me)) ?></a>
        <span class="sep">|</span>
        <a href="/settings">Мои Настройки</a>
        <span class="sep">|</span>
        <a href="/help">Помощь</a>
        <span class="sep">|</span>
        <form class="act theme_switch" method="post" action="/theme">
          <?= csrf_field() ?>
          <input type="hidden" name="back" value="<?= e($_SERVER['REQUEST_URI'] ?? '/') ?>">
          <button type="submit" class="link_btn theme_btn"
                  title="Оформление: <?= e(theme_title($theme)) ?>. Нажмите, чтобы сменить"><?= theme_icon($theme) ?></button>
        </form>
        <span class="sep">|</span>
        <form class="act" method="post" action="/logout">
          <?= csrf_field() ?>
          <button type="submit" class="link_btn head_exit">Выход</button>
        </form>
      </div>
    <?php else: ?>
      <div id="head_nav">
        <form class="act theme_switch" method="post" action="/theme">
          <?= csrf_field() ?>
          <button type="submit" class="link_btn theme_btn"
                  title="Оформление: <?= e(theme_title($theme)) ?>"><?= theme_icon($theme) ?></button>
        </form>
        <a href="/login">Вход</a>
      </div>
    <?php endif; ?>
    <div class="clear"></div>
  </div>
</div>

<div id="page">
<?php if ($me): ?>
  <div id="side">
    <ul id="left_menu">
      <?php foreach ($menu as [$href, $key, $label, $extra, $count]): ?>
        <li><a href="<?= e($href) ?>" data-nav="<?= e($key) ?>"<?= $key === $nav ? ' class="sel"' : '' ?>>
          <?php if ($count): ?><span class="cnt"><?= (int)$count ?></span><?php endif; ?><?= e($label) ?>
          <?php if ($extra): ?><span class="menu_edit"><?= e($extra) ?></span><?php endif; ?>
        </a></li>
      <?php endforeach; ?>
    </ul>
    <div class="side_note small">
      <?= rc_enabled() ? 'Вход через сеть RetroCore.' : 'Сеть для своих.' ?><br>Всё хранится здесь.
    </div>
  </div>
  <div id="content">
<?php else: ?>
  <div id="content_wide">
<?php endif; ?>

<?= $content ?>

  </div>
  <div class="clear"></div>
</div>

<div id="footer">
  <?= e($site) ?> &copy; <?= date('Y') ?> &middot; сеть для своих
  <span class="theme_pick">
    оформление: <?= e(theme_title($theme)) ?><?= $me ? ' &middot; <a href="/settings#theme">настроить</a>' : '' ?>
  </span>
  <span style="float:right">
    <a href="/help">Помощь</a> &middot;
    <a href="/search">Люди</a> &middot;
    <a href="/groups/all">Группы</a>
  </span>
</div>

<script src="/assets/js/vo.js"></script>
</body>
</html>
