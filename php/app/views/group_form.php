<h1 class="page_title"><?= $group ? 'Настройки группы' : 'Новая группа' ?>
  <span class="right"><a href="/groups">Мои группы</a></span></h1>
<?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>
<div class="block"><div class="block_body">
  <form method="post" action="<?= $group ? '/club' . (int)$group['id'] . '/edit' : '/groups/new' ?>"
        enctype="multipart/form-data">
    <?= csrf_field() ?>
    <div class="form_row"><div class="lbl">Название</div>
      <input class="text wide" type="text" name="name" maxlength="80" value="<?= e($group['name'] ?? '') ?>"></div>
    <div class="form_row"><div class="lbl">Описание</div>
      <textarea class="text wide" name="description" style="height:60px" maxlength="2000"><?= e($group['description'] ?? '') ?></textarea></div>
    <div class="form_row"><div class="lbl">Картинка</div>
      <input type="file" name="avatar" accept="image/*"></div>
    <button class="button button_blue" type="submit"><?= $group ? 'Сохранить' : 'Создать группу' ?></button>
  </form>
</div></div>
