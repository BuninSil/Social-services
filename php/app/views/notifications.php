<h1 class="page_title">Мои Ответы
  <span class="right"><?= act('/notifications/read', 'Отметить всё прочитанным', ['back' => '/notifications']) ?></span></h1>
<div class="block"><div class="block_body tight">
  <?php if (!$items): ?><div class="empty" style="padding:10px">Пока ничего нет.</div><?php endif; ?>
  <?php
  $words = [
      'like_post' => 'оценил Вашу запись', 'like_photo' => 'оценил Вашу фотографию',
      'comment_post' => 'прокомментировал Вашу запись', 'comment_photo' => 'прокомментировал Вашу фотографию',
      'comment_video' => 'прокомментировал Вашу видеозапись',
      'wall_post' => 'написал на Вашей стене', 'repost' => 'рассказал друзьям о Вашей записи',
      'mention' => 'упомянул Вас', 'friend_add' => 'добавил Вас в друзья',
      'friend_request' => 'хочет добавить Вас в друзья', 'chat_invite' => 'пригласил Вас в беседу',
      'message' => 'написал Вам сообщение',
  ];
  ?>
  <?php foreach ($items as $n): ?>
    <div class="notif<?= $n['is_read'] ? '' : ' fresh' ?>">
      <div class="ava">
        <?php if ($n['actor']): ?>
          <a href="/id<?= (int)$n['actor']['id'] ?>">
            <img src="<?= e(avatar_url($n['actor'])) ?>" width="40" height="40" alt=""></a>
        <?php endif; ?>
      </div>
      <div class="body">
        <?php if ($n['actor']): ?>
          <a class="author" href="/id<?= (int)$n['actor']['id'] ?>"><?= e(full_name($n['actor'])) ?></a>
        <?php endif; ?>
        <?= e($words[$n['kind']] ?? 'что-то сделал') ?>
        <?php if ($n['url']): ?><a href="<?= e($n['url']) ?>">перейти</a><?php endif; ?>
        <span class="date"><?= e(vk_date((int)$n['created_at'])) ?></span>
        <?php if ($n['preview'] !== ''): ?>
          <div class="gray"><?= e(mb_substr($n['preview'], 0, 120)) ?></div>
        <?php endif; ?>
      </div>
      <div class="clear"></div>
    </div>
  <?php endforeach; ?>
</div>
<?= pagination_html($page, $pages, '/notifications') ?>
</div>
