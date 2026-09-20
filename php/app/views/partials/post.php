<?php /** @var array $post @var bool $canDelete @var bool $showOwner @var string $back @var array|null $me */ ?>
<div class="post<?= $post['pinned'] ? ' pinned' : '' ?>" id="post<?= (int)$post['id'] ?>">
  <div class="ava">
    <a href="/id<?= (int)$post['author']['id'] ?>">
      <img src="<?= e(avatar_url($post['author'])) ?>" width="50" height="50" alt=""></a>
  </div>
  <div class="body">
    <div class="phead">
      <a class="author" href="/id<?= (int)$post['author']['id'] ?>"><?= e(full_name($post['author'])) ?></a>
      <?php if ($showOwner && $post['owner'] && ($post['owner_type'] === 'group' || $post['owner_id'] !== $post['author_id'])): ?>
        <span class="to">&rarr;</span>
        <?php if ($post['owner_type'] === 'group'): ?>
          <a href="/club<?= (int)$post['owner']['id'] ?>"><?= e($post['owner']['name']) ?></a>
        <?php else: ?>
          <a href="/id<?= (int)$post['owner']['id'] ?>"><?= e(full_name($post['owner'])) ?></a>
        <?php endif; ?>
      <?php endif; ?>
      <a class="date" href="/post/<?= (int)$post['id'] ?>"><?= e(vk_date((int)$post['created_at'])) ?></a>
      <?php if ($post['edited_at']): ?><span class="pin_mark">изменено</span><?php endif; ?>
      <?php if ($post['pinned']): ?><span class="pin_mark">закреплено</span><?php endif; ?>
    </div>

    <?php if ($post['text'] !== ''): ?><div class="ptext"><?= text2html($post['text']) ?></div><?php endif; ?>

    <?php if ($post['source']): $src = $post['source']; ?>
      <div class="repost">
        <div class="rhead">
          <img src="<?= e(avatar_url($src['author'])) ?>" width="24" height="24" alt="">
          <a class="author" href="/id<?= (int)$src['author']['id'] ?>"><?= e(full_name($src['author'])) ?></a>
          <span class="date"><?= e(vk_date((int)$src['created_at'])) ?></span>
        </div>
        <div class="ptext"><?= text2html($src['text']) ?></div>
        <?= attachments_html($src['attachments']) ?>
      </div>
    <?php endif; ?>

    <?= attachments_html($post['attachments']) ?>

    <div class="pactions">
      <?php if ($me): ?>
        <a href="#" class="like_link<?= $post['liked'] ? ' liked' : '' ?>" data-type="post" data-id="<?= (int)$post['id'] ?>"><?=
          ($post['liked'] ? 'Мне не нравится' : 'Мне нравится') . ($post['likes'] ? ' (' . (int)$post['likes'] . ')' : '') ?></a>
        <a href="#" class="reply_link" data-target="reply<?= (int)$post['id'] ?>">Комментировать<?=
          $post['comments'] ? ' (' . count($post['comments']) . ')' : '' ?></a>
        <?= act('/post/' . (int)$post['id'] . '/repost', 'Рассказать друзьям'
            . ($post['reposts'] ? ' (' . (int)$post['reposts'] . ')' : ''), ['back' => $back]) ?>
        <?php if ($post['likes']): ?><a href="/likes/post/<?= (int)$post['id'] ?>">кто оценил</a><?php endif; ?>
        <?php if (can_edit_post($post, $me)): ?>
          <a href="/post/<?= (int)$post['id'] ?>/edit">Редактировать</a>
          <?= act('/post/' . (int)$post['id'] . '/pin', $post['pinned'] ? 'Открепить' : 'Закрепить', ['back' => $back]) ?>
        <?php endif; ?>
        <?php if ($canDelete || can_edit_post($post, $me)): ?>
          <?= act('/post/' . (int)$post['id'] . '/delete', 'Удалить',
              ['back' => $back, 'confirm' => 'Удалить запись?']) ?>
        <?php endif; ?>
      <?php else: ?>
        <span class="gray"><?= $post['likes'] ? 'Нравится: ' . (int)$post['likes'] : '' ?></span>
      <?php endif; ?>
    </div>
  </div>

  <?php if ($post['comments']): ?>
    <div class="replies">
      <?php foreach ($post['comments'] as $c): ?>
        <div class="reply" id="comment<?= (int)$c['id'] ?>">
          <div class="ava"><a href="/id<?= (int)$c['author']['id'] ?>">
            <img src="<?= e(avatar_url($c['author'])) ?>" width="32" height="32" alt=""></a></div>
          <div class="body">
            <a class="author" href="/id<?= (int)$c['author']['id'] ?>"><?= e(full_name($c['author'])) ?></a>
            <span class="date"><?= e(vk_date((int)$c['created_at'])) ?></span>
            <?php if ($me && ($c['author_id'] === $me['id'] || can_edit_post($post, $me))): ?>
              <?= act('/comment/' . (int)$c['id'] . '/delete', 'удалить',
                  ['back' => $back, 'cls' => 'small_act gray', 'confirm' => 'Удалить комментарий?']) ?>
            <?php endif; ?>
            <div class="text"><?= text2html($c['text']) ?></div>
          </div>
        </div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>

  <?php if ($me): ?>
    <form class="reply_form" id="reply<?= (int)$post['id'] ?>" method="post"
          action="/comment/post/<?= (int)$post['id'] ?>" hidden>
      <?= csrf_field() ?>
      <input type="hidden" name="back" value="<?= e($back) ?>">
      <textarea class="text" name="text" placeholder="Ваш комментарий..."></textarea>
      <div style="padding-top:4px"><button class="button button_small" type="submit">Отправить</button></div>
    </form>
  <?php endif; ?>
</div>
