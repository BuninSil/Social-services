<h1 class="page_title"><?= $isMe ? 'Мои аудиозаписи' : 'Аудиозаписи: ' . e(full_name($owner)) ?>
  <span class="right"><?= count($audios) ?></span></h1>
<?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>
<?php if ($isMe): ?>
  <div class="block">
    <div class="block_head">Загрузить музыку</div>
    <div class="block_body">
      <form method="post" action="/audio/upload" enctype="multipart/form-data">
        <?= csrf_field() ?>
        <table class="form_table">
          <tr><td class="label">Файл</td><td><input type="file" name="audio" accept="audio/*">
            <div class="gray small">MP3, OGG, WAV, FLAC, M4A — до <?= (int)config('limit_audio', 30) ?> МБ.
              Имя вида «Артист - Название» разберётся само.</div></td></tr>
          <tr><td class="label">Исполнитель</td><td><input class="text" type="text" name="artist" size="30" maxlength="80"></td></tr>
          <tr><td class="label">Название</td><td><input class="text" type="text" name="title" size="30" maxlength="80"></td></tr>
          <tr><td class="label"></td><td><button class="button button_blue" type="submit">Загрузить</button></td></tr>
        </table>
      </form>
    </div>
  </div>
<?php endif; ?>
<div class="block">
  <div class="block_head">Список</div>
  <div class="block_body tight">
    <?php if (!$audios): ?><div class="empty" style="padding:10px">Аудиозаписей пока нет.</div><?php endif; ?>
    <?php foreach ($audios as $s): ?>
      <div class="audio_row">
        <?php if ($isMe): ?>
          <span class="acts"><?= act('/audio/' . (int)$s['id'] . '/delete', 'удалить',
              ['back' => '/audio', 'cls' => 'small_act gray', 'confirm' => 'Удалить аудиозапись?']) ?></span>
        <?php endif; ?>
        <div class="att_audio_ttl"><b><?= e($s['artist']) ?></b> &ndash; <?= e($s['title']) ?></div>
        <audio controls preload="none" src="/uploads/<?= e($s['file']) ?>"></audio>
      </div>
    <?php endforeach; ?>
  </div>
</div>
