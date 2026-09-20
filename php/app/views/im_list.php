<h1 class="page_title">Мои Сообщения
  <span class="right"><a href="/im/new">Создать беседу</a> &middot; <a href="/im/search">Поиск по переписке</a></span></h1>
<div class="block">
  <div class="block_head">Диалоги и беседы <span class="right"><?= count($conversations) ?></span></div>
  <div class="block_body tight">
    <?php if (!$conversations): ?>
      <div class="empty" style="padding:10px">Переписки пока нет. Напишите кому-нибудь со страницы человека.</div>
    <?php endif; ?>
    <?php foreach ($conversations as $c): ?>
      <div class="dlg_row<?= $c['unread'] ? ' unread' : '' ?>">
        <?php if ($c['last']): ?><div class="date"><?= e(short_date((int)$c['last']['created_at'])) ?></div><?php endif; ?>
        <div class="ava">
          <a href="<?= $c['kind'] === 'dm' ? '/im/' . (int)$c['peer']['id'] : '/im/c' . (int)$c['id'] ?>">
            <img src="<?= $c['kind'] === 'dm' ? e(avatar_url($c['peer'])) : '/assets/img/chat_200.svg' ?>"
                 width="50" height="50" alt=""></a>
        </div>
        <div class="body">
          <div class="name">
            <a href="<?= $c['kind'] === 'dm' ? '/im/' . (int)$c['peer']['id'] : '/im/c' . (int)$c['id'] ?>"><?= e($c['title']) ?></a>
            <?php if ($c['kind'] !== 'dm'): ?>
              <span class="gray small">(беседа, <?= (int)$c['members_count'] ?>)</span>
            <?php endif; ?>
            <?php if ($c['unread']): ?><span class="dlg_cnt"><?= (int)$c['unread'] ?></span><?php endif; ?>
          </div>
          <div class="preview"><?= $c['last']
              ? e(mb_substr($c['last']['text'], 0, 90) ?: 'вложение')
              : '<span class="gray">пока пусто</span>' ?></div>
        </div>
        <div class="clear"></div>
      </div>
    <?php endforeach; ?>
  </div>
</div>
