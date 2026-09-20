<h1 class="page_title">Загрузка фотографий <span class="right"><a href="/photos">Все альбомы</a></span></h1>
<?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>
<div class="block"><div class="block_body">
  <form method="post" action="/photos/upload" enctype="multipart/form-data">
    <?= csrf_field() ?>
    <table class="form_table">
      <tr><td class="label">Альбом</td><td>
        <select class="text" name="album_id">
          <?php foreach ($albums as $a): ?>
            <option value="<?= (int)$a['id'] ?>"<?= $a['id'] === $selected ? ' selected' : '' ?>><?= e($a['title']) ?></option>
          <?php endforeach; ?>
        </select></td></tr>
      <tr><td class="label">Файлы</td><td>
        <input type="file" name="photos[]" accept="image/*" multiple>
        <div class="gray small">Можно выбрать несколько. До <?= (int)config('limit_image', 12) ?> МБ каждая: JPEG, PNG, GIF, WebP.</div>
      </td></tr>
      <tr><td class="label">Описание</td><td>
        <input class="text wide" type="text" name="description" maxlength="300"></td></tr>
      <tr><td class="label"></td><td>
        <button class="button button_blue" type="submit">Загрузить</button>
        <a class="button" href="/photos">Отмена</a></td></tr>
    </table>
  </form>
</div></div>
