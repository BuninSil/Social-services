<h1 class="page_title">Новая беседа <span class="right"><a href="/im">Все диалоги</a></span></h1>
<?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>
<div class="block"><div class="block_body">
  <form method="post" action="/im/new">
    <?= csrf_field() ?>
    <div class="form_row"><div class="lbl">Название</div>
      <input class="text wide" type="text" name="title" maxlength="80" placeholder="Например: Сходка в пятницу"></div>
    <div class="form_row"><div class="lbl">Кого зовём</div>
      <?php if (!$friends): ?>
        <div class="gray">Сначала добавьте друзей — беседа собирается из них.</div>
      <?php endif; ?>
      <?php foreach ($friends as $f): ?>
        <label class="member_pick">
          <input type="checkbox" name="members[]" value="<?= (int)$f['id'] ?>">
          <img src="<?= e(avatar_url($f)) ?>" width="24" height="24" alt=""><?= e(full_name($f)) ?>
        </label>
      <?php endforeach; ?>
    </div>
    <button class="button button_blue" type="submit">Создать беседу</button>
  </form>
</div></div>
