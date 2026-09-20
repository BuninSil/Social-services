<?php /** @var array $conv @var array $messages @var array $members */ ?>
<h1 class="page_title"><?= e($conv['title']) ?>
  <span class="right"><a href="/im">Все диалоги</a></span></h1>
<?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>

<?php if ($conv['kind'] === 'dm' && $conv['peer']): ?>
  <div class="gray" style="padding-bottom:6px"><?= e(last_seen(get_user($conv['peer']['id'])) ?: '') ?></div>
<?php endif; ?>

<?php if ($conv['kind'] === 'chat'): ?>
  <div class="block" id="chat_settings"><div class="block_body">
    <div class="gray small" style="padding-bottom:4px">Участники:
      <?php foreach ($members as $m): ?>
        <a href="/id<?= (int)$m['id'] ?>"><?= e(full_name($m)) ?></a><?= $m['role'] === 'admin' ? ' (создатель)' : '' ?>,
      <?php endforeach; ?>
    </div>
    <?php if ($isAdmin): ?>
      <form class="inline_form" method="post" action="/im/c<?= (int)$conv['id'] ?>/title">
        <?= csrf_field() ?>
        <input class="text" type="text" name="title" size="24" maxlength="80" value="<?= e($conv['title']) ?>">
        <button class="button button_small" type="submit">Переименовать</button>
      </form>
      <form class="inline_form" method="post" action="/im/c<?= (int)$conv['id'] ?>/invite">
        <?= csrf_field() ?>
        <select class="text member_pick" name="user_id">
          <?php foreach ($canInvite as $f): ?>
            <option value="<?= (int)$f['id'] ?>"><?= e(full_name($f)) ?></option>
          <?php endforeach; ?>
        </select>
        <button class="button button_small" type="submit">Пригласить</button>
      </form>
    <?php endif; ?>
    <?= act('/im/c' . (int)$conv['id'] . '/leave', 'Покинуть беседу',
        ['back' => '/im', 'cls' => 'gray', 'confirm' => 'Выйти из беседы?']) ?>
  </div></div>
<?php endif; ?>

<div class="block">
  <div class="block_head">История переписки</div>
  <div id="chat" data-conv="<?= (int)$conv['id'] ?>" data-last="<?= (int)$lastId ?>">
    <?php if (!$messages): ?><div class="empty">Сообщений пока нет.</div><?php endif; ?>
    <?php foreach ($messages as $m): ?>
      <?php require __DIR__ . '/partials/message.php'; ?>
    <?php endforeach; ?>
  </div>
</div>

<div class="block">
  <div class="block_body">
    <form id="send_form" method="post" action="/im/c<?= (int)$conv['id'] ?>/send" enctype="multipart/form-data">
      <?= csrf_field() ?>
      <textarea class="text" name="text" placeholder="Введите сообщение... (Ctrl+Enter — отправить)"></textarea>
      <div class="sf_foot">
        <div class="attach_box">
          <span class="attach_label">Прикрепить:</span>
          <input type="file" name="files[]" multiple>
        </div>
        <button class="button button_blue" type="submit">Отправить</button>
      </div>
    </form>
  </div>
</div>
