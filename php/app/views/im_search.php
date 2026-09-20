<h1 class="page_title">Поиск по переписке <span class="right"><a href="/im">Все диалоги</a></span></h1>
<div class="block"><div class="block_body">
  <form method="get" action="/im/search">
    <input class="text" type="text" name="q" size="30" value="<?= e($q) ?>" placeholder="что ищем">
    <button class="button button_blue" type="submit">Найти</button>
  </form>
</div></div>
<div class="block"><div class="block_body tight">
  <?php if ($q !== '' && !$results): ?><div class="empty" style="padding:10px">Ничего не нашлось.</div><?php endif; ?>
  <?php foreach ($results as $r): ?>
    <div class="dlg_row">
      <div class="date"><?= e(short_date((int)$r['created_at'])) ?></div>
      <div class="body" style="margin-left:0">
        <div class="name"><a href="<?= e($r['url']) ?>"><?= e($r['conv_title']) ?></a></div>
        <div class="preview"><?= e(mb_substr($r['text'], 0, 160)) ?></div>
      </div>
      <div class="clear"></div>
    </div>
  <?php endforeach; ?>
</div></div>
