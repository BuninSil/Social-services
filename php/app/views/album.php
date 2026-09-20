<h1 class="page_title"><?= e($album['title']) ?>
  <span class="right">
    <a href="/photos/<?= (int)$owner['id'] ?>">Все альбомы</a>
    <?php if ($isMe): ?>
      &middot; <a href="/photos/upload?album=<?= (int)$album['id'] ?>">Загрузить сюда</a>
      &middot; <?= act('/album/' . (int)$album['id'] . '/delete', 'Удалить альбом',
          ['confirm' => 'Удалить альбом вместе с фотографиями?']) ?>
    <?php endif; ?>
  </span>
</h1>
<?php if ($album['description'] !== ''): ?>
  <div class="gray" style="margin-bottom:8px"><?= e($album['description']) ?></div>
<?php endif; ?>
<div class="block">
  <div class="block_head">Фотографии <span class="right"><?= count($photos) ?></span></div>
  <div class="block_body">
    <?php if (!$photos): ?><div class="empty">В альбоме пока нет фотографий.</div><?php endif; ?>
    <?php foreach ($photos as $p): ?>
      <div class="photo_item">
        <a href="/photo<?= (int)$owner['id'] ?>_<?= (int)$p['id'] ?>">
          <img src="/uploads/<?= e($p['thumb']) ?>" width="110" alt=""></a>
      </div>
    <?php endforeach; ?>
    <div class="clear"></div>
  </div>
</div>
