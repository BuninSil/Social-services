<h1 class="page_title">Мои Новости <span class="right"><?= (int)$total ?></span></h1>
<?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>
<?= wall_form_html('/feed') ?>
<div class="block">
  <div class="block_head">Последние записи</div>
  <div class="block_body tight">
    <?php if (!$posts): ?>
      <div class="empty" style="padding:10px">Пока пусто. Напишите первую запись или добавьте друзей.</div>
    <?php endif; ?>
    <?php foreach ($posts as $post): ?>
      <?= post_html($post, ['show_owner' => true, 'back' => '/feed']) ?>
    <?php endforeach; ?>
  </div>
  <?= pagination_html($page, $pages, '/feed') ?>
</div>
