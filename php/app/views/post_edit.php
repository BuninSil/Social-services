<h1 class="page_title">Редактирование записи
  <span class="right"><a href="<?= e($back) ?>">Отмена</a></span></h1>
<div class="block"><div class="block_body">
  <form method="post" action="/post/<?= (int)$post['id'] ?>/edit">
    <?= csrf_field() ?>
    <input type="hidden" name="back" value="<?= e($back) ?>">
    <textarea class="text wide" name="text" style="height:120px"><?= e($post['text']) ?></textarea>
    <div style="padding-top:6px">
      <button class="button button_blue" type="submit">Сохранить</button>
    </div>
  </form>
  <?php if ($post['attachments']): ?>
    <div style="padding-top:8px"><div class="gray small">Вложения остаются как есть:</div>
      <?= attachments_html($post['attachments']) ?></div>
  <?php endif; ?>
</div></div>
