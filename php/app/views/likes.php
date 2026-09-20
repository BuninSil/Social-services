<h1 class="page_title">Кому понравилось <span class="right"><?= count($users) ?></span></h1>
<div class="block"><div class="block_body tight">
  <?php if (!$users): ?><div class="empty" style="padding:10px">Пока никому.</div><?php endif; ?>
  <?php foreach ($users as $u): ?>
    <div class="people_row">
      <div class="ava"><a href="/id<?= (int)$u['id'] ?>">
        <img src="<?= e(avatar_url($u)) ?>" width="60" height="60" alt=""></a></div>
      <div class="body">
        <div class="name"><a href="/id<?= (int)$u['id'] ?>"><?= e(full_name($u)) ?></a></div>
        <div class="info"><?= e(last_seen($u)) ?></div>
      </div>
      <div class="clear"></div>
    </div>
  <?php endforeach; ?>
</div></div>
