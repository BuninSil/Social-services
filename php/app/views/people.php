<h1 class="page_title">Люди сети <span class="right"><?= count($people) ?></span></h1>
<div class="block"><div class="block_body">
  <div class="gray">Участники сети RetroCore, которые уже заходили сюда своим аккаунтом.</div>
</div></div>
<div class="block"><div class="block_body tight">
  <?php if (!$people): ?><div class="empty" style="padding:10px">Пока никого.</div><?php endif; ?>
  <?php foreach ($people as $u): ?>
    <div class="people_row">
      <div class="acts"><a href="/im/<?= (int)$u['id'] ?>">Написать</a></div>
      <div class="ava"><a href="/id<?= (int)$u['id'] ?>">
        <img src="<?= e(avatar_url($u)) ?>" width="60" height="60" alt=""></a></div>
      <div class="body">
        <div class="name"><a href="/id<?= (int)$u['id'] ?>"><?= e(full_name($u)) ?></a>
          <?php if ($u['rc_role'] !== ''): ?><span class="gray small"> <?= e($u['rc_role']) ?></span><?php endif; ?>
        </div>
        <div class="info"><?= e(last_seen($u)) ?>
          <?php if ($u['rc_profile'] !== ''): ?>
            &middot; <a href="<?= e($u['rc_profile']) ?>" rel="noopener" target="_blank">профиль в сети</a>
          <?php endif; ?>
        </div>
      </div>
      <div class="clear"></div>
    </div>
  <?php endforeach; ?>
</div></div>
