<h1 class="page_title"><?= $mode === 'all' ? 'Все группы' : ($isMe ? 'Мои группы' : 'Группы: ' . e(full_name($owner))) ?>
  <span class="right">
    <a href="/groups/all">Все группы</a>
    <?php if ($isMe): ?> &middot; <a href="/groups/new">Создать группу</a><?php endif; ?>
  </span>
</h1>
<div class="block"><div class="block_body tight">
  <?php if (!$groups): ?><div class="empty" style="padding:10px">Групп пока нет.</div><?php endif; ?>
  <?php foreach ($groups as $g): ?>
    <div class="group_row">
      <div class="ava"><a href="/club<?= (int)$g['id'] ?>">
        <img src="<?= e(group_avatar_url($g)) ?>" width="60" height="60" alt=""></a></div>
      <div class="body">
        <div class="name"><a href="/club<?= (int)$g['id'] ?>"><?= e($g['name']) ?></a></div>
        <div class="gray"><?= e(plural_count((int)$g['members'], 'участник', 'участника', 'участников')) ?></div>
        <?php if ($g['description'] !== ''): ?>
          <div><?= e(mb_substr($g['description'], 0, 140)) ?></div>
        <?php endif; ?>
      </div>
      <div class="clear"></div>
    </div>
  <?php endforeach; ?>
</div></div>
