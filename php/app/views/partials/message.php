<?php /** @var array $m @var array $me */ ?>
<div class="msg" id="msg<?= (int)$m['id'] ?>">
  <div class="ava"><a href="/id<?= (int)$m['author']['id'] ?>">
    <img src="<?= e(avatar_url($m['author'])) ?>" width="36" height="36" alt=""></a></div>
  <div class="body">
    <?php if ($m['from_id'] === $me['id']): ?>
      <span class="msg_acts">
        <?= act('/message/' . (int)$m['id'] . '/delete', 'удалить',
            ['back' => $_SERVER['REQUEST_URI'] ?? '/im', 'cls' => 'small_act gray']) ?>
      </span>
    <?php endif; ?>
    <a class="author" href="/id<?= (int)$m['author']['id'] ?>"><?= e($m['author']['first_name']) ?></a>
    <span class="date"><?= e(vk_date((int)$m['created_at'])) ?></span>
    <?php if ($m['edited_at']): ?><span class="gray small">изменено</span><?php endif; ?>
    <?php if ($m['text'] !== ''): ?><div class="mtext"><?= text2html($m['text']) ?></div><?php endif; ?>
    <?= attachments_html($m['attachments']) ?>
  </div>
</div>
