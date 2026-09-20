<h1 class="page_title"><?= $isMe ? 'Мои фотографии' : 'Фотографии: ' . e(full_name($owner)) ?>
  <?php if ($isMe): ?><span class="right">
    <a href="/photos/upload">Загрузить фотографии</a> &middot; <a href="/albums/new">Создать альбом</a>
  </span><?php endif; ?>
</h1>
<div class="block">
  <div class="block_head">Альбомы <span class="right"><?= count($albums) ?></span></div>
  <div class="block_body">
    <?php if (!$albums): ?><div class="empty">Альбомов пока нет.</div><?php endif; ?>
    <?php foreach ($albums as $a): ?>
      <div class="album_item">
        <a href="/album<?= (int)$owner['id'] ?>_<?= (int)$a['id'] ?>">
          <img src="<?= $a['cover'] ? '/uploads/' . e($a['cover']) : '/assets/img/camera_200.svg' ?>"
               width="140" height="105" alt=""></a>
        <div class="t"><a href="/album<?= (int)$owner['id'] ?>_<?= (int)$a['id'] ?>"><?= e($a['title']) ?></a></div>
        <div class="c"><?= e(plural_count((int)$a['count'], 'фотография', 'фотографии', 'фотографий')) ?></div>
      </div>
    <?php endforeach; ?>
    <div class="clear"></div>
  </div>
</div>
