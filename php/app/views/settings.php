<h1 class="page_title">Мои Настройки
  <span class="right"><a href="/settings/blacklist">Чёрный список</a> &middot;
    <a href="/id<?= (int)$me['id'] ?>">Вернуться на страницу</a></span></h1>
<?php if ($error): ?><div class="error"><?= e($error) ?></div><?php endif; ?>
<?php if ($notice): ?><div class="notice"><?= e($notice) ?></div><?php endif; ?>

<div class="block">
  <div class="block_head">Фотография страницы</div>
  <div class="block_body">
    <form method="post" action="/settings/avatar" enctype="multipart/form-data">
      <?= csrf_field() ?>
      <table class="form_table"><tr>
        <td style="width:120px"><img class="pavatar" src="<?= e(avatar_url($me)) ?>" width="100" alt=""></td>
        <td><input type="file" name="avatar" accept="image/*">
          <div style="padding-top:6px"><button class="button button_blue" type="submit">Загрузить</button></div></td>
      </tr></table>
    </form>
    <?php if ($me['avatar']): ?>
      <div style="padding-top:6px">
        <?= act('/settings/avatar/delete', 'Удалить фотографию', ['confirm' => 'Удалить фотографию?']) ?>
      </div>
    <?php endif; ?>
  </div>
</div>

<div class="block">
  <div class="block_head">Основная информация</div>
  <div class="block_body">
    <form method="post" action="/settings">
      <?= csrf_field() ?>
      <table class="form_table">
        <tr><td class="label">Имя</td><td><input class="text" type="text" name="first_name" size="30" maxlength="30" value="<?= e($me['first_name']) ?>"></td></tr>
        <tr><td class="label">Фамилия</td><td><input class="text" type="text" name="last_name" size="30" maxlength="30" value="<?= e($me['last_name']) ?>"></td></tr>
        <tr><td class="label">Пол</td><td>
          <select class="text" name="sex">
            <option value="m"<?= $me['sex'] === 'm' ? ' selected' : '' ?>>мужской</option>
            <option value="f"<?= $me['sex'] === 'f' ? ' selected' : '' ?>>женский</option>
          </select></td></tr>
        <tr><td class="label">Статус</td><td><input class="text wide" type="text" name="status" maxlength="140" value="<?= e($me['status']) ?>"></td></tr>
        <tr><td class="label">День рождения</td><td><input class="text" type="text" name="bday" size="14" maxlength="10" value="<?= e($me['bday']) ?>">
          <span class="gray small">в формате ДД.ММ.ГГГГ</span></td></tr>
        <tr><td class="label">Город</td><td><input class="text" type="text" name="city" size="30" maxlength="60" value="<?= e($me['city']) ?>"></td></tr>
        <tr><td class="label">Родной город</td><td><input class="text" type="text" name="hometown" size="30" maxlength="60" value="<?= e($me['hometown']) ?>"></td></tr>
        <tr><td class="label">Семейное положение</td><td>
          <select class="text" name="relationship">
            <?php foreach (['', 'не женат', 'есть подруга', 'помолвлен', 'женат', 'всё сложно', 'в активном поиске', 'влюблён'] as $r): ?>
              <option value="<?= e($r) ?>"<?= $me['relationship'] === $r ? ' selected' : '' ?>><?= e($r ?: 'не указано') ?></option>
            <?php endforeach; ?>
          </select></td></tr>
        <tr><td class="label">Полит. взгляды</td><td>
          <select class="text" name="politics">
            <?php foreach (['', 'индифферентные', 'коммунистические', 'социалистические', 'умеренные',
                            'либеральные', 'консервативные', 'монархические', 'либертарианские'] as $r): ?>
              <option value="<?= e($r) ?>"<?= $me['politics'] === $r ? ' selected' : '' ?>><?= e($r ?: 'не указано') ?></option>
            <?php endforeach; ?>
          </select></td></tr>
        <tr><td class="label">Мировоззрение</td><td><input class="text" type="text" name="worldview" size="30" maxlength="60" value="<?= e($me['worldview']) ?>"></td></tr>

        <tr><td class="label" style="padding-top:14px"><b>Личная информация</b></td><td></td></tr>
        <?php foreach (['activity' => 'Деятельность', 'interests' => 'Интересы', 'music' => 'Любимая музыка',
                        'films' => 'Любимые фильмы', 'tv' => 'Любимые телешоу', 'books' => 'Любимые книги',
                        'games' => 'Любимые игры', 'quotes' => 'Любимые цитаты', 'about' => 'О себе'] as $field => $label): ?>
          <tr><td class="label"><?= e($label) ?></td><td>
            <textarea class="text wide" name="<?= e($field) ?>" style="height:<?= in_array($field, ['quotes', 'about']) ? 60 : 36 ?>px"
                      maxlength="2000"><?= e($me[$field]) ?></textarea></td></tr>
        <?php endforeach; ?>

        <tr><td class="label" style="padding-top:14px"><b>Приватность</b></td><td></td></tr>
        <?php
        $privacy = [
            'profile_who' => ['Мою страницу видят', ['all', 'friends']],
            'wall_who' => ['Писать на стену могут', ['all', 'friends', 'me']],
            'photos_who' => ['Фотографии видят', ['all', 'friends', 'me']],
            'audio_who' => ['Аудиозаписи видят', ['all', 'friends', 'me']],
            'friends_who' => ['Список друзей видят', ['all', 'friends', 'me']],
            'message_who' => ['Писать сообщения могут', ['all', 'friends']],
        ];
        $labels = ['all' => 'все участники', 'friends' => 'только друзья', 'me' => 'только я'];
        ?>
        <?php foreach ($privacy as $field => [$label, $options]): ?>
          <tr><td class="label"><?= e($label) ?></td><td>
            <select class="text" name="<?= e($field) ?>">
              <?php foreach ($options as $value): ?>
                <option value="<?= e($value) ?>"<?= $me[$field] === $value ? ' selected' : '' ?>><?= e($labels[$value]) ?></option>
              <?php endforeach; ?>
            </select></td></tr>
        <?php endforeach; ?>

        <tr><td class="label"></td><td style="padding-top:10px">
          <button class="button button_blue" type="submit">Сохранить</button></td></tr>
      </table>
    </form>
  </div>
</div>

<div class="block" id="theme">
  <div class="block_head">Оформление</div>
  <div class="block_body">
    <form method="post" action="/settings/theme">
      <?= csrf_field() ?>
      <input type="hidden" name="back" value="/settings">
      <div class="form_row"><div class="lbl">Тема</div>
        <?php foreach (THEMES as $key => $t): ?>
          <label class="theme_option">
            <input type="radio" name="theme" value="<?= e($key) ?>"<?= $theme === $key ? ' checked' : '' ?>>
            <b><?= e($t['title']) ?></b> <span class="gray"><?= e($t['hint']) ?></span>
          </label>
        <?php endforeach; ?>
      </div>
      <div class="form_row" style="padding-top:8px">
        <div class="lbl">Цвета неоновой темы</div>
        <table class="form_table">
          <tr><td class="label">Основной акцент</td><td>
            <input type="color" class="color_pick" name="neon_c1" value="<?= e($neon['c1']) ?>" data-var="--cyan">
            <span class="gray small"><?= e($neon['c1']) ?></span></td></tr>
          <tr><td class="label">Второй акцент</td><td>
            <input type="color" class="color_pick" name="neon_c2" value="<?= e($neon['c2']) ?>" data-var="--pink">
            <span class="gray small"><?= e($neon['c2']) ?></span></td></tr>
          <tr><td class="label">Фон</td><td>
            <input type="color" class="color_pick" name="neon_bg" value="<?= e($neon['bg']) ?>" data-var="--bg">
            <span class="gray small"><?= e($neon['bg']) ?></span></td></tr>
        </table>
      </div>
      <div class="form_row"><div class="lbl">Готовые наборы</div>
        <?php foreach (NEON_PRESETS as $p): ?>
          <button class="button button_small preset_btn" type="submit" name="preset" value="<?= e($p['id']) ?>">
            <span class="preset_dot" style="background:<?= e($p['c1']) ?>"></span><span class="preset_dot"
              style="background:<?= e($p['c2']) ?>"></span> <?= e($p['title']) ?>
          </button>
        <?php endforeach; ?>
      </div>
      <div style="padding-top:8px"><button class="button button_blue" type="submit">Сохранить оформление</button></div>
    </form>
  </div>
</div>

<?php if (!empty($me['rc_id'])): ?>
<div class="block">
  <div class="block_head">Аккаунт сети RetroCore</div>
  <div class="block_body">
    <table class="form_table">
      <tr><td class="label">В сети</td><td><b><?= e($me['rc_username']) ?></b>
        <?php if ($me['rc_role'] !== ''): ?><span class="gray"><?= e($me['rc_role']) ?></span><?php endif; ?></td></tr>
      <?php if ($me['rc_profile'] !== ''): ?>
        <tr><td class="label">Профиль</td><td>
          <a href="<?= e($me['rc_profile']) ?>" rel="noopener" target="_blank"><?= e($me['rc_profile']) ?></a></td></tr>
      <?php endif; ?>
      <tr><td class="label">Вход</td><td class="gray"><?= $me['rc_only']
          ? 'по кнопке «Войти через RetroCore» — пароля у страницы нет'
          : 'и через сеть, и по своему паролю' ?></td></tr>
    </table>
    <div class="gray small" style="padding-top:4px">
      Имя, анкета и всё остальное здесь — ваши, из сети они не перезаписываются.
      Пока своя фотография не загружена, показывается аватарка из RetroCore.
    </div>
  </div>
</div>
<?php endif; ?>

<div class="block">
  <div class="block_head"><?= $me['rc_only'] ? 'Свой пароль' : 'Смена пароля' ?></div>
  <div class="block_body">
    <?php if ($me['rc_only']): ?>
      <div class="gray" style="padding-bottom:6px">
        Страница заведена через RetroCore, пароля у неё нет. Его можно завести —
        тогда получится входить и обычным способом.
      </div>
    <?php endif; ?>
    <form method="post" action="/settings/password">
      <?= csrf_field() ?>
      <table class="form_table">
        <?php if (!$me['rc_only']): ?>
          <tr><td class="label">Старый пароль</td><td><input class="text" type="password" name="old_password" size="24"></td></tr>
        <?php endif; ?>
        <tr><td class="label">Новый пароль</td><td><input class="text" type="password" name="password" size="24">
          <span class="gray small">не короче <?= MIN_PASSWORD ?> символов</span></td></tr>
        <tr><td class="label">Ещё раз</td><td><input class="text" type="password" name="password2" size="24"></td></tr>
        <tr><td class="label"></td><td>
          <button class="button" type="submit"><?= $me['rc_only'] ? 'Завести пароль' : 'Изменить пароль' ?></button>
          <span class="gray small">остальные сеансы будут завершены</span></td></tr>
      </table>
    </form>
  </div>
</div>

<div class="block">
  <div class="block_head">Удаление страницы</div>
  <div class="block_body">
    <form method="post" action="/settings/delete">
      <?= csrf_field() ?>
      <div class="gray" style="padding-bottom:6px">
        Удалятся записи, фотографии, видео, музыка и документы. Отменить будет нельзя.
      </div>
      <?php if (!$me['rc_only']): ?>
        <input class="text" type="password" name="password" size="24" placeholder="текущий пароль">
      <?php endif; ?>
      <button class="button" type="submit" data-confirm="Точно удалить страницу со всем содержимым?">Удалить страницу</button>
    </form>
  </div>
</div>
