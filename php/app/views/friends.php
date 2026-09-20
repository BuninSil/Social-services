<?php /** @var array $owner @var string $tab @var array $friends @var array $incoming @var array $outgoing */ ?>
<h1 class="page_title"><?= $isMe ? 'Мои друзья' : 'Друзья: ' . e(full_name($owner)) ?>
  <span class="right"><?= e(plural_count(count($friends), 'друг', 'друга', 'друзей')) ?></span>
</h1>

<?php if ($isMe): ?>
  <div class="tabs">
    <a href="/friends"<?= $tab === 'all' ? ' class="sel"' : '' ?>>Все друзья</a>
    <a href="/friends/requests"<?= $tab === 'requests' ? ' class="sel"' : '' ?>>Заявки в друзья<?=
      $incoming ? ' (' . count($incoming) . ')' : '' ?></a>
    <a href="/friends/out"<?= $tab === 'out' ? ' class="sel"' : '' ?>>Исходящие</a>
  </div>
<?php endif; ?>

<?php
$list = match ($tab) { 'requests' => $incoming, 'out' => $outgoing, default => $friends };
$empty = match ($tab) {
    'requests' => 'Заявок нет.',
    'out' => 'Исходящих заявок нет.',
    default => $isMe ? 'Список друзей пуст. <a href="/search">Найдите знакомых</a>.' : 'Друзей пока нет.',
};
?>
<div class="block"><div class="block_body tight">
  <?php if (!$list): ?><div class="empty" style="padding:10px"><?= $empty ?></div><?php endif; ?>
  <?php foreach ($list as $f): ?>
    <div class="people_row">
      <div class="acts">
        <?php if ($tab === 'requests'): ?>
          <?= act('/friends/add/' . (int)$f['id'], 'Принять', ['back' => '/friends/requests']) ?>
          <?= act('/friends/remove/' . (int)$f['id'], 'Отклонить', ['back' => '/friends/requests']) ?>
        <?php elseif ($tab === 'out'): ?>
          <?= act('/friends/remove/' . (int)$f['id'], 'Отменить', ['back' => '/friends/out']) ?>
        <?php else: ?>
          <a href="/im/<?= (int)$f['id'] ?>">Написать</a>
          <?php if ($isMe): ?>
            <?= act('/friends/remove/' . (int)$f['id'], 'Удалить',
                ['back' => '/friends', 'confirm' => 'Удалить из друзей?']) ?>
          <?php endif; ?>
        <?php endif; ?>
      </div>
      <div class="ava"><a href="/id<?= (int)$f['id'] ?>">
        <img src="<?= e(avatar_url($f)) ?>" width="60" height="60" alt=""></a></div>
      <div class="body">
        <div class="name"><a href="/id<?= (int)$f['id'] ?>"><?= e(full_name($f)) ?></a></div>
        <div class="info"><?= e(last_seen($f)) ?><?= $f['city'] !== '' ? ', ' . e($f['city']) : '' ?></div>
        <?php if ($f['status'] !== ''): ?><div class="gray"><?= e($f['status']) ?></div><?php endif; ?>
      </div>
      <div class="clear"></div>
    </div>
  <?php endforeach; ?>
</div></div>
