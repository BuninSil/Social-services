<div class="page_title"><?= e($group['name']) ?>
  <span class="right"><?= e(plural_count(count($members), 'участник', 'участника', 'участников')) ?></span>
</div>
<?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>

<div id="profile_left">
  <img class="pavatar" src="<?= e(group_avatar_url($group)) ?>" width="200" alt="">
  <div class="profile_actions">
    <?php if ($isMember): ?>
      <?= act('/club' . (int)$group['id'] . '/leave', 'Покинуть группу', ['back' => '/club' . $group['id']]) ?>
    <?php else: ?>
      <?= act('/club' . (int)$group['id'] . '/join', 'Вступить в группу', ['back' => '/club' . $group['id']]) ?>
    <?php endif; ?>
    <?php if ($isAdmin): ?>
      <a href="/club<?= (int)$group['id'] ?>/edit">Редактировать</a>
      <?= act('/club' . (int)$group['id'] . '/delete', 'Удалить группу',
          ['confirm' => 'Удалить группу вместе со всеми записями?', 'cls' => 'gray']) ?>
    <?php endif; ?>
  </div>

  <div class="block" style="margin-top:10px">
    <div class="block_head">Участники <span class="right"><?= count($members) ?></span></div>
    <div class="block_body">
      <?php foreach (array_slice($members, 0, 9) as $m): ?>
        <div class="friend_mini">
          <a href="/id<?= (int)$m['id'] ?>"><img src="<?= e(avatar_url($m)) ?>" width="60" height="60" alt=""></a>
          <a class="nm small" href="/id<?= (int)$m['id'] ?>"><?= e($m['first_name']) ?></a>
        </div>
      <?php endforeach; ?>
      <div class="clear"></div>
    </div>
  </div>
</div>

<div id="profile_right">
  <div class="pname"><?= e($group['name']) ?></div>
  <div class="pstatus"><?= e($group['description']) ?></div>

  <?php if ($canPost): ?><?= wall_form_html('/club' . (int)$group['id'] . '/wall', 'Что нового в группе?') ?><?php endif; ?>

  <div class="block">
    <div class="block_head">Стена <span class="right"><?= (int)$wallCount ?></span></div>
    <div class="block_body tight">
      <?php if (!$posts): ?><div class="empty" style="padding:10px">В группе пока пусто.</div><?php endif; ?>
      <?php foreach ($posts as $post): ?>
        <?= post_html($post, ['can_delete' => $isAdmin, 'show_owner' => false, 'back' => '/club' . $group['id']]) ?>
      <?php endforeach; ?>
    </div>
    <?= pagination_html($page, $pages, '/club' . (int)$group['id']) ?>
  </div>
</div>
<div class="clear"></div>
