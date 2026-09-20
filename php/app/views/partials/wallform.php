<?php /** @var string $action @var string $placeholder */ ?>
<div class="block wall_form">
  <div class="block_body">
    <form method="post" action="<?= e($action) ?>" enctype="multipart/form-data">
      <?= csrf_field() ?>
      <textarea class="text" name="text" placeholder="<?= e($placeholder) ?>"></textarea>
      <div class="wf_foot">
        <div class="attach_box">
          <span class="attach_label">Прикрепить:</span>
          <input type="file" name="files[]" multiple>
          <div class="gray small">фото, видео, музыка, документы — до 10 файлов</div>
        </div>
        <button class="button button_blue" type="submit">Отправить</button>
      </div>
    </form>
  </div>
</div>
