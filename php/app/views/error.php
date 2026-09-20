<?php /** @var int $code @var string $message */ ?>
<h1 class="page_title">Ошибка <?= (int)$code ?></h1>
<div class="block"><div class="block_body">
  <p><?= e($message) ?></p>
  <p style="padding-top:8px"><a class="button button_blue" href="/">На главную</a></p>
</div></div>
