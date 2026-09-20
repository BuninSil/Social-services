<?php /** @var string $mode @var ?string $error @var ?string $notice @var array $form @var string $next */ ?>
<div id="auth_page">
  <h1><?= e(config('title', 'ВОнлайне')) ?></h1>
  <div class="tagline">Своя социальная сеть. Всё хранится здесь, на этом сайте.</div>

  <?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>
  <?php if ($notice): ?><div class="notice"><?= e($notice) ?></div><?php endif; ?>

  <div id="auth_box">
    <div class="block">
      <div class="block_head"><?= $mode === 'register' ? 'Регистрация' : 'Вход на сайт' ?></div>
      <div class="block_body">
        <?php if (rc_enabled()): ?>
          <div style="padding-bottom:10px">
            <a class="button button_blue" style="display:block;text-align:center;padding:5px 0"
               href="/connect/start<?= $next ? '?next=' . urlencode($next) : '' ?>">Войти через RetroCore</a>
            <div class="gray small" style="padding-top:4px">
              Отдельная регистрация не нужна: страница заведётся сама по аккаунту сети.
            </div>
          </div>
          <div class="gray" style="padding-bottom:6px">или по логину и паролю:</div>
        <?php endif; ?>

        <?php if ($mode === 'register'): ?>
          <form method="post" action="/register">
            <?= csrf_field() ?>
            <div class="form_row"><div class="lbl">Имя</div>
              <input class="text wide" type="text" name="first_name" maxlength="30"
                     value="<?= e($form['first_name'] ?? '') ?>"></div>
            <div class="form_row"><div class="lbl">Фамилия</div>
              <input class="text wide" type="text" name="last_name" maxlength="30"
                     value="<?= e($form['last_name'] ?? '') ?>"></div>
            <div class="form_row"><div class="lbl">Логин (латиницей)</div>
              <input class="text wide" type="text" name="login" maxlength="20"
                     value="<?= e($form['login'] ?? '') ?>"></div>
            <div class="form_row"><div class="lbl">Пол</div>
              <select class="text" name="sex">
                <option value="m">мужской</option>
                <option value="f"<?= ($form['sex'] ?? '') === 'f' ? ' selected' : '' ?>>женский</option>
              </select></div>
            <div class="form_row"><div class="lbl">Пароль <span class="gray small">от <?= MIN_PASSWORD ?> символов</span></div>
              <input class="text wide" type="password" name="password"></div>
            <div class="form_row"><div class="lbl">Пароль ещё раз</div>
              <input class="text wide" type="password" name="password2"></div>
            <button class="button button_blue" type="submit">Зарегистрироваться</button>
            <div style="padding-top:8px"><a href="/login">Я уже зарегистрирован</a></div>
          </form>
        <?php else: ?>
          <form method="post" action="/login">
            <?= csrf_field() ?>
            <input type="hidden" name="next" value="<?= e($next) ?>">
            <div class="form_row"><div class="lbl">Логин</div>
              <input class="text wide" type="text" name="login" value="<?= e($form['login'] ?? '') ?>"></div>
            <div class="form_row"><div class="lbl">Пароль</div>
              <input class="text wide" type="password" name="password"></div>
            <button class="button button_blue" type="submit">Войти</button>
            <?php if (config('open_register', true)): ?>
              <div style="padding-top:8px"><a href="/register">Зарегистрироваться</a></div>
            <?php endif; ?>
          </form>
        <?php endif; ?>
      </div>
    </div>
  </div>

  <div id="auth_about">
    <b>Здесь можно:</b>
    <ul>
      <li>завести страницу с анкетой и статусом;</li>
      <li>добавлять друзей и смотреть общих;</li>
      <li>писать на стену и комментировать;</li>
      <li>переписываться в личных сообщениях и беседах;</li>
      <li>заливать фотографии в альбомы;</li>
      <li>держать свои аудиозаписи, видео и документы;</li>
      <li>создавать группы и читать новости.</li>
    </ul>
    <p style="padding-top:10px" class="gray">
      Записи, сообщения и файлы лежат на этом же сайте, в его папках.
    </p>
  </div>
  <div class="clear"></div>
</div>
