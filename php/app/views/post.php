<h1 class="page_title">Запись <span class="right"><a href="<?= e($back) ?>">Вернуться</a></span></h1>
<div class="block"><div class="block_body tight">
  <?= post_html($post, ['show_owner' => true, 'back' => '/post/' . (int)$post['id']]) ?>
</div></div>
