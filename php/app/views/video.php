<h1 class="page_title"><?= $isMe ? 'Мои видеозаписи' : 'Видеозаписи: ' . e(full_name($owner)) ?>
  <span class="right"><?= count($videos) ?></span></h1>
<?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>
<?php if ($isMe): ?>
  <div class="block">
    <div class="block_head">Загрузить видео</div>
    <div class="block_body">
      <form method="post" action="/video/upload" enctype="multipart/form-data">
        <?= csrf_field() ?>
        <table class="form_table">
          <tr><td class="label">Файл</td><td><input type="file" name="video" accept="video/*">
            <div class="gray small">MP4 и WebM, до <?= (int)config('limit_video', 256) ?> МБ.</div></td></tr>
          <tr><td class="label">Название</td><td>
            <input class="text wide" type="text" name="title" maxlength="120"></td></tr>
          <tr><td class="label"></td><td><button class="button button_blue" type="submit">Загрузить</button></td></tr>
        </table>
      </form>
    </div>
  </div>
<?php endif; ?>
<div class="block">
  <div class="block_head">Список</div>
  <div class="block_body">
    <?php if (!$videos): ?><div class="empty">Видеозаписей пока нет.</div><?php endif; ?>
    <?php foreach ($videos as $v): ?>
      <div class="video_item">
        <a href="/video<?= (int)$owner['id'] ?>_<?= (int)$v['id'] ?>">
          <img src="<?= $v['poster'] ? '/uploads/' . e($v['poster']) : '/assets/img/video_200.svg' ?>"
               width="150" height="110" alt="">
          <?php if ($v['duration']): ?><span class="vdur"><?= e(human_duration((int)$v['duration'])) ?></span><?php endif; ?>
        </a>
        <div class="t"><a href="/video<?= (int)$owner['id'] ?>_<?= (int)$v['id'] ?>"><?= e($v['title']) ?></a></div>
        <div class="c gray"><?= e(human_size((int)$v['size'])) ?> &middot; <?= e(vk_date((int)$v['created_at'])) ?></div>
        <?php if ($isMe): ?>
          <?= act('/video/' . (int)$v['id'] . '/delete', 'удалить',
              ['back' => '/video', 'cls' => 'small_act gray', 'confirm' => 'Удалить видеозапись?']) ?>
        <?php endif; ?>
      </div>
    <?php endforeach; ?>
    <div class="clear"></div>
  </div>
</div>
