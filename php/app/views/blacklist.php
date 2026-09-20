<h1 class="page_title">Чёрный список
  <span class="right"><a href="/settings">Вернуться в настройки</a></span></h1>
<div class="block"><div class="block_body tight">
  <?php if (!$blocked): ?>
    <div class="empty" style="padding:10px">Список пуст. Заблокировать можно со страницы человека.</div>
  <?php endif; ?>
  <?php foreach ($blocked as $b): ?>
    <div class="people_row">
      <div class="acts"><?= act('/unblock/' . (int)$b['id'], 'Разблокировать', ['back' => '/settings/blacklist']) ?></div>
      <div class="ava"><a href="/id<?= (int)$b['id'] ?>">
        <img src="<?= e(avatar_url($b)) ?>" width="60" height="60" alt=""></a></div>
      <div class="body">
        <div class="name"><a href="/id<?= (int)$b['id'] ?>"><?= e(full_name($b)) ?></a></div>
        <div class="info gray">в списке с <?= e(vk_date((int)$b['blocked_at'])) ?></div>
      </div>
      <div class="clear"></div>
    </div>
  <?php endforeach; ?>
</div></div>
