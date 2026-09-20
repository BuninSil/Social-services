<?php /** @var array $user @var array $me @var string $status @var array $posts */ ?>
<div class="page_title"><?= e(full_name($user)) ?>
  <span class="right"><?= e(last_seen($user) ?: '') ?></span>
</div>
<?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>

<div id="profile_left">
  <img class="pavatar" src="<?= e(avatar_url($user, 'full')) ?>" width="200" alt="">
  <div class="profile_actions">
    <?php if ($status === 'self'): ?>
      <a href="/settings">Редактировать страницу</a>
      <a href="/photos/upload">Загрузить фотографию</a>
      <a href="/video">Загрузить видео</a>
    <?php else: ?>
      <?php if ($canMessage): ?><a href="/im/<?= (int)$user['id'] ?>">Отправить сообщение</a><?php endif; ?>
      <?php if ($status === 'friends'): ?>
        <?= act('/friends/remove/' . (int)$user['id'], 'Удалить из друзей',
            ['back' => '/id' . $user['id'], 'confirm' => 'Удалить из друзей?']) ?>
      <?php elseif ($status === 'out'): ?>
        <span class="gray">Заявка отправлена</span>
        <?= act('/friends/remove/' . (int)$user['id'], 'Отменить заявку', ['back' => '/id' . $user['id']]) ?>
      <?php elseif ($status === 'in'): ?>
        <?= act('/friends/add/' . (int)$user['id'], 'Принять в друзья', ['back' => '/id' . $user['id']]) ?>
      <?php else: ?>
        <?= act('/friends/add/' . (int)$user['id'], 'Добавить в друзья', ['back' => '/id' . $user['id']]) ?>
      <?php endif; ?>
      <?php if ($iBlocked): ?>
        <?= act('/unblock/' . (int)$user['id'], 'Убрать из чёрного списка', ['back' => '/id' . $user['id']]) ?>
      <?php else: ?>
        <?= act('/block/' . (int)$user['id'], 'Заблокировать',
            ['back' => '/id' . $user['id'], 'cls' => 'gray', 'confirm' => 'Заблокировать этого человека?']) ?>
      <?php endif; ?>
    <?php endif; ?>
  </div>

  <?php if ($showFriends && $friends): ?>
    <div class="block" style="margin-top:10px">
      <div class="block_head">Друзья <span class="right"><a href="/friends/<?= (int)$user['id'] ?>"><?= (int)$friendsCount ?></a></span></div>
      <div class="block_body">
        <?php foreach (array_slice($friends, 0, 6) as $f): ?>
          <div class="friend_mini">
            <a href="/id<?= (int)$f['id'] ?>"><img src="<?= e(avatar_url($f)) ?>" width="60" height="60" alt=""></a>
            <a class="nm small" href="/id<?= (int)$f['id'] ?>"><?= e($f['first_name']) ?></a>
          </div>
        <?php endforeach; ?>
        <div class="clear"></div>
      </div>
    </div>
  <?php endif; ?>

  <?php if ($mutual): ?>
    <div class="block"><div class="block_head">Общие друзья <span class="right"><?= count($mutual) ?></span></div>
      <div class="block_body">
        <?php foreach (array_slice($mutual, 0, 6) as $f): ?>
          <div class="friend_mini">
            <a href="/id<?= (int)$f['id'] ?>"><img src="<?= e(avatar_url($f)) ?>" width="60" height="60" alt=""></a>
            <a class="nm small" href="/id<?= (int)$f['id'] ?>"><?= e($f['first_name']) ?></a>
          </div>
        <?php endforeach; ?>
        <div class="clear"></div>
      </div>
    </div>
  <?php endif; ?>

  <?php if ($showPhotos && $photos): ?>
    <div class="block"><div class="block_head">Фотографии
      <span class="right"><a href="/photos/<?= (int)$user['id'] ?>"><?= (int)$photosCount ?></a></span></div>
      <div class="block_body">
        <?php foreach ($photos as $p): ?>
          <div class="photo_item"><a href="/photo<?= (int)$user['id'] ?>_<?= (int)$p['id'] ?>">
            <img src="/uploads/<?= e($p['thumb']) ?>" width="55" height="55" alt=""></a></div>
        <?php endforeach; ?>
        <div class="clear"></div>
      </div>
    </div>
  <?php endif; ?>
</div>

<div id="profile_right">
  <div class="pname"><?= e(full_name($user)) ?></div>
  <div class="pstatus">
    <?php if ($user['status'] !== ''): ?><?= e($user['status']) ?>
    <?php elseif ($status === 'self'): ?><span class="gray">Здесь может быть Ваш статус.</span><?php endif; ?>
    <?php if ($status === 'self'): ?> <a class="edit_status" href="/settings">изменить</a><?php endif; ?>
  </div>

  <div class="block">
    <div class="block_head">Основная информация</div>
    <div class="block_body">
      <table class="pinfo">
        <tr><td class="label">Был на сайте:</td><td><?= e(last_seen($user) ?: '—') ?></td></tr>
        <?php
        $rows = [
            'День рождения:' => format_bday($user['bday']),
            'Город:' => $user['city'],
            'Родной город:' => $user['hometown'],
            'Семейное положение:' => $user['relationship'],
            'Полит. взгляды:' => $user['politics'],
            'Мировоззрение:' => $user['worldview'],
        ];
        foreach ($rows as $label => $value):
            if ($value === '') continue; ?>
          <tr><td class="label"><?= e($label) ?></td><td><?= e($value) ?></td></tr>
        <?php endforeach; ?>
        <tr><td class="label">Короткий адрес:</td><td class="gray">/<?= e($user['login']) ?></td></tr>
        <?php if (!empty($user['rc_profile'])): ?>
          <tr><td class="label">В сети RetroCore:</td>
            <td><a href="<?= e($user['rc_profile']) ?>" rel="noopener" target="_blank"><?= e($user['rc_username']) ?></a></td></tr>
        <?php endif; ?>

        <?php
        $personal = [
            'Деятельность:' => 'activity', 'Интересы:' => 'interests', 'Любимая музыка:' => 'music',
            'Любимые фильмы:' => 'films', 'Любимые телешоу:' => 'tv', 'Любимые книги:' => 'books',
            'Любимые игры:' => 'games', 'Любимые цитаты:' => 'quotes', 'О себе:' => 'about',
        ];
        $hasPersonal = false;
        foreach ($personal as $field) { if ($user[$field] !== '') { $hasPersonal = true; break; } }
        ?>
        <?php if ($hasPersonal): ?>
          <tr class="section"><td colspan="2">Личная информация</td></tr>
          <?php foreach ($personal as $label => $field): if ($user[$field] === '') continue; ?>
            <tr><td class="label"><?= e($label) ?></td><td><?= text2html($user[$field]) ?></td></tr>
          <?php endforeach; ?>
        <?php endif; ?>
      </table>

      <div class="counters">
        <a href="/friends/<?= (int)$user['id'] ?>"><b><?= (int)$friendsCount ?></b> <?= plural((int)$friendsCount, 'друг', 'друга', 'друзей') ?></a>
        <a href="/photos/<?= (int)$user['id'] ?>"><b><?= (int)$photosCount ?></b> <?= plural((int)$photosCount, 'фотография', 'фотографии', 'фотографий') ?></a>
        <a href="/video/<?= (int)$user['id'] ?>"><b><?= (int)$videosCount ?></b> <?= plural((int)$videosCount, 'видеозапись', 'видеозаписи', 'видеозаписей') ?></a>
        <a href="/audio/<?= (int)$user['id'] ?>"><b><?= (int)$audioCount ?></b> <?= plural((int)$audioCount, 'аудиозапись', 'аудиозаписи', 'аудиозаписей') ?></a>
        <a href="/groups/<?= (int)$user['id'] ?>"><b><?= (int)$groupsCount ?></b> <?= plural((int)$groupsCount, 'группа', 'группы', 'групп') ?></a>
        <?php if ($status === 'self'): ?>
          <a href="/docs"><b><?= (int)$docsCount ?></b> <?= plural((int)$docsCount, 'документ', 'документа', 'документов') ?></a>
        <?php endif; ?>
      </div>
    </div>
  </div>

  <?php if ($canPost): ?><?= wall_form_html('/id' . (int)$user['id'] . '/wall') ?><?php endif; ?>

  <div class="block">
    <div class="block_head">Стена <span class="right"><?= (int)$wallCount ?></span></div>
    <div class="block_body tight">
      <?php if (!$posts): ?><div class="empty" style="padding:10px">Записей пока нет.</div><?php endif; ?>
      <?php foreach ($posts as $post): ?>
        <?= post_html($post, ['can_delete' => $me && ($me['id'] === $user['id'] || $me['id'] === $post['author_id']),
            'show_owner' => false, 'back' => '/id' . $user['id']]) ?>
      <?php endforeach; ?>
    </div>
    <?= pagination_html($page, $pages, '/id' . (int)$user['id']) ?>
  </div>
</div>
<div class="clear"></div>
