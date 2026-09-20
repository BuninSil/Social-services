<h1 class="page_title">Новый альбом <span class="right"><a href="/photos">Все альбомы</a></span></h1>
<?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>
<div class="block"><div class="block_body">
  <form method="post" action="/albums/new">
    <?= csrf_field() ?>
    <div class="form_row"><div class="lbl">Название</div>
      <input class="text wide" type="text" name="title" maxlength="80"></div>
    <div class="form_row"><div class="lbl">Описание</div>
      <textarea class="text wide" name="description" style="height:50px" maxlength="500"></textarea></div>
    <button class="button button_blue" type="submit">Создать</button>
  </form>
</div></div>
