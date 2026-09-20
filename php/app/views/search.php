<h1 class="page_title">Поиск <span class="right"><?= e(plural_count((int)$total, 'человек', 'человека', 'человек')) ?> на сайте</span></h1>
<div class="block"><div class="block_body">
  <form method="get" action="/search">
    <input class="text" type="text" name="q" size="30" value="<?= e($q) ?>" placeholder="имя, логин или слово из записи">
    <input type="hidden" name="tab" value="<?= e($tab) ?>">
    <button class="button button_blue" type="submit">Найти</button>
  </form>
</div></div>

<div class="tabs">
  <a href="/search?q=<?= urlencode($q) ?>"<?= $tab === 'people' ? ' class="sel"' : '' ?>>Люди</a>
  <a href="/search?tab=posts&q=<?= urlencode($q) ?>"<?= $tab === 'posts' ? ' class="sel"' : '' ?>>Записи</a>
  <a href="/search?tab=groups&q=<?= urlencode($q) ?>"<?= $tab === 'groups' ? ' class="sel"' : '' ?>>Группы</a>
</div>

<?php if ($tab === 'people'): ?>
  <div class="block"><div class="block_body tight">
    <?php if (!$users): ?><div class="empty" style="padding:10px">Никого не нашлось.</div><?php endif; ?>
    <?php foreach ($users as $u): ?>
      <div class="people_row">
        <div class="acts">
          <?php if ($u['id'] !== $me['id']): ?>
            <a href="/im/<?= (int)$u['id'] ?>">Написать</a>
            <?php if ($statuses[$u['id']] === 'none'): ?>
              <?= act('/friends/add/' . (int)$u['id'], 'Добавить в друзья', ['back' => '/search?q=' . urlencode($q)]) ?>
            <?php elseif ($statuses[$u['id']] === 'friends'): ?>
              <span class="gray small">у Вас в друзьях</span>
            <?php elseif ($statuses[$u['id']] === 'out'): ?>
              <span class="gray small">заявка отправлена</span>
            <?php endif; ?>
          <?php endif; ?>
        </div>
        <div class="ava"><a href="/id<?= (int)$u['id'] ?>">
          <img src="<?= e(avatar_url($u)) ?>" width="60" height="60" alt=""></a></div>
        <div class="body">
          <div class="name"><a href="/id<?= (int)$u['id'] ?>"><?= e(full_name($u)) ?></a></div>
          <div class="info"><?= e(last_seen($u)) ?><?= $u['city'] !== '' ? ', ' . e($u['city']) : '' ?></div>
        </div>
        <div class="clear"></div>
      </div>
    <?php endforeach; ?>
  </div></div>

<?php elseif ($tab === 'posts'): ?>
  <div class="block"><div class="block_body tight">
    <?php if (!$posts): ?><div class="empty" style="padding:10px">Записей не нашлось.</div><?php endif; ?>
    <?php foreach ($posts as $post): ?>
      <?= post_html($post, ['show_owner' => true, 'back' => '/search?tab=posts&q=' . urlencode($q)]) ?>
    <?php endforeach; ?>
  </div></div>

<?php else: ?>
  <div class="block"><div class="block_body tight">
    <?php if (!$groups): ?><div class="empty" style="padding:10px">Групп не нашлось.</div><?php endif; ?>
    <?php foreach ($groups as $g): ?>
      <div class="group_row">
        <div class="ava"><a href="/club<?= (int)$g['id'] ?>">
          <img src="<?= e(group_avatar_url($g)) ?>" width="60" height="60" alt=""></a></div>
        <div class="body">
          <div class="name"><a href="/club<?= (int)$g['id'] ?>"><?= e($g['name']) ?></a></div>
          <div class="gray"><?= e(plural_count((int)$g['members'], 'участник', 'участника', 'участников')) ?></div>
        </div>
        <div class="clear"></div>
      </div>
    <?php endforeach; ?>
  </div></div>
<?php endif; ?>
