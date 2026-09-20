<h1 class="page_title">Мои документы <span class="right"><?= count($docs) ?></span></h1>
<?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>
<div class="block">
  <div class="block_head">Загрузить документ</div>
  <div class="block_body">
    <form method="post" action="/docs/upload" enctype="multipart/form-data">
      <?= csrf_field() ?>
      <input type="file" name="doc">
      <button class="button button_blue" type="submit">Загрузить</button>
      <div class="gray small" style="padding-top:4px">
        PDF, архивы и текстовые файлы — до <?= (int)config('limit_doc', 50) ?> МБ.
      </div>
    </form>
  </div>
</div>
<div class="block">
  <div class="block_head">Список</div>
  <div class="block_body tight">
    <?php if (!$docs): ?><div class="empty" style="padding:10px">Документов пока нет.</div><?php endif; ?>
    <?php foreach ($docs as $d): ?>
      <div class="doc_row">
        <span class="acts"><?= act('/docs/' . (int)$d['id'] . '/delete', 'удалить',
            ['back' => '/docs', 'cls' => 'small_act gray', 'confirm' => 'Удалить документ?']) ?></span>
        <a href="/doc<?= (int)$d['owner_id'] ?>_<?= (int)$d['id'] ?>"><?= e($d['name']) ?></a>
        <div class="gray small"><?= e(mb_strtoupper($d['ext'])) ?> &middot; <?= e(human_size((int)$d['size'])) ?>
          &middot; <?= e(vk_date((int)$d['created_at'])) ?></div>
      </div>
    <?php endforeach; ?>
  </div>
</div>
