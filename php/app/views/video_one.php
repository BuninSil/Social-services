<h1 class="page_title"><?= e($video['title']) ?>
  <span class="right"><a href="/video/<?= (int)$owner['id'] ?>">Все видеозаписи</a></span></h1>
<div class="block">
  <div class="block_body">
    <div class="att_video"><video controls preload="metadata" src="/uploads/<?= e($video['file']) ?>"
      <?= $video['poster'] ? 'poster="/uploads/' . e($video['poster']) . '"' : '' ?> style="max-width:100%"></video></div>
    <div class="gray small"><?= e(human_size((int)$video['size'])) ?> &middot; <?= e(vk_date((int)$video['created_at'])) ?>
      &middot; <a href="/id<?= (int)$owner['id'] ?>"><?= e(full_name($owner)) ?></a></div>
    <?php if ($video['description'] !== ''): ?><div style="padding-top:6px"><?= text2html($video['description']) ?></div><?php endif; ?>
  </div>
  <div class="block_head">Комментарии <span class="right"><?= count($comments) ?></span></div>
  <div class="block_body">
    <?php if (!$comments): ?><div class="gray">Комментариев пока нет.</div><?php endif; ?>
    <?php foreach ($comments as $c): ?>
      <div class="reply">
        <div class="ava"><img src="<?= e(avatar_url($c['author'])) ?>" width="32" height="32" alt=""></div>
        <div class="body">
          <a class="author" href="/id<?= (int)$c['author']['id'] ?>"><?= e(full_name($c['author'])) ?></a>
          <span class="date"><?= e(vk_date((int)$c['created_at'])) ?></span>
          <div><?= text2html($c['text']) ?></div>
        </div>
      </div>
    <?php endforeach; ?>
    <form method="post" action="/comment/video/<?= (int)$video['id'] ?>" style="padding-top:6px">
      <?= csrf_field() ?>
      <input type="hidden" name="back" value="/video<?= (int)$owner['id'] ?>_<?= (int)$video['id'] ?>">
      <textarea class="text wide" name="text" style="height:40px" placeholder="Ваш комментарий..."></textarea>
      <div style="padding-top:4px"><button class="button" type="submit">Отправить</button></div>
    </form>
  </div>
</div>
