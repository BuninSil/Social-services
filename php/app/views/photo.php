<h1 class="page_title">Фотография
  <span class="right"><a href="/id<?= (int)$owner['id'] ?>"><?= e(full_name($owner)) ?></a>
    <?php if ($album): ?> &middot; <a href="/album<?= (int)$owner['id'] ?>_<?= (int)$album['id'] ?>"><?= e($album['title']) ?></a><?php endif; ?>
  </span>
</h1>
<div class="block">
  <div id="photo_view"><img src="/uploads/<?= e($photo['file']) ?>" alt=""></div>
  <div class="photo_nav">
    <span class="right">
      <?php if ($prev): ?><a href="/photo<?= (int)$owner['id'] ?>_<?= (int)$prev ?>">&larr; Предыдущая</a><?php endif; ?>
      <?php if ($prev && $next): ?> &middot; <?php endif; ?>
      <?php if ($next): ?><a href="/photo<?= (int)$owner['id'] ?>_<?= (int)$next ?>">Следующая &rarr;</a><?php endif; ?>
    </span>
    <a href="#" class="like_link<?= $liked ? ' liked' : '' ?>" data-type="photo" data-id="<?= (int)$photo['id'] ?>"><?=
      ($liked ? 'Мне не нравится' : 'Мне нравится') . ($likes ? ' (' . (int)$likes . ')' : '') ?></a>
    <?php if ($isMe): ?>
      <?= act('/photo/' . (int)$photo['id'] . '/avatar', 'Сделать фотографией страницы',
          ['back' => '/photo' . (int)$owner['id'] . '_' . (int)$photo['id']]) ?>
      <?= act('/photo/' . (int)$photo['id'] . '/delete', 'Удалить', ['confirm' => 'Удалить фотографию?']) ?>
    <?php endif; ?>
    <div class="clear"></div>
  </div>
  <?php if ($photo['description'] !== ''): ?>
    <div class="block_body"><?= text2html($photo['description']) ?></div>
  <?php endif; ?>
  <div class="block_head">Комментарии <span class="right"><?= count($comments) ?></span></div>
  <div class="block_body">
    <?php if (!$comments): ?><div class="gray">Комментариев пока нет.</div><?php endif; ?>
    <?php foreach ($comments as $c): ?>
      <div class="reply">
        <div class="ava"><a href="/id<?= (int)$c['author']['id'] ?>">
          <img src="<?= e(avatar_url($c['author'])) ?>" width="32" height="32" alt=""></a></div>
        <div class="body">
          <a class="author" href="/id<?= (int)$c['author']['id'] ?>"><?= e(full_name($c['author'])) ?></a>
          <span class="date"><?= e(vk_date((int)$c['created_at'])) ?></span>
          <?php if ($c['author_id'] === $me['id'] || $isMe): ?>
            <?= act('/comment/' . (int)$c['id'] . '/delete', 'удалить',
                ['back' => '/photo' . (int)$owner['id'] . '_' . (int)$photo['id'], 'cls' => 'small_act gray']) ?>
          <?php endif; ?>
          <div><?= text2html($c['text']) ?></div>
        </div>
      </div>
    <?php endforeach; ?>
    <form method="post" action="/comment/photo/<?= (int)$photo['id'] ?>" style="padding-top:6px">
      <?= csrf_field() ?>
      <input type="hidden" name="back" value="/photo<?= (int)$owner['id'] ?>_<?= (int)$photo['id'] ?>">
      <textarea class="text wide" name="text" style="height:40px" placeholder="Ваш комментарий..."></textarea>
      <div style="padding-top:4px"><button class="button" type="submit">Отправить</button></div>
    </form>
  </div>
</div>
