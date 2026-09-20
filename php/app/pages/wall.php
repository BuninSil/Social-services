<?php
/** Страница человека, стена, записи, лайки и комментарии. */

const PER_PAGE = 20;

function page_profile(string $id): void
{
    $me = require_auth();
    $user = get_user((int)$id);
    if (!$user) render_error(404, 'Такой страницы здесь нет.');

    if (!can_see($me['id'], $user, 'profile')) {
        render_error(403, 'Страница закрыта настройками приватности.');
    }

    $page = max(1, (int)($_GET['page'] ?? 1));
    $total = wall_count('user', $user['id']);
    $showPhotos = can_see($me['id'], $user, 'photos');
    $photos = [];
    if ($showPhotos) {
        $photos = db_filter('photos', ['owner_id' => $user['id']]);
        usort($photos, fn($a, $b) => $b['id'] <=> $a['id']);
        $photos = array_slice($photos, 0, 6);
    }

    render('profile', [
        'title' => full_name($user),
        'nav' => $user['id'] === $me['id'] ? 'profile' : '',
        'user' => $user,
        'status' => friend_status($me['id'], $user['id']),
        'canMessage' => can_message($me['id'], $user),
        'canPost' => can_post_on_wall($user, $me['id']),
        'iBlocked' => has_blocked($me['id'], $user['id']),
        'showFriends' => can_see($me['id'], $user, 'friends'),
        'friends' => can_see($me['id'], $user, 'friends') ? friend_list($user['id']) : [],
        'friendsCount' => count(friend_ids($user['id'])),
        'mutual' => $user['id'] === $me['id'] ? [] : mutual_friends($me['id'], $user['id']),
        'showPhotos' => $showPhotos,
        'photos' => $photos,
        'photosCount' => db_count('photos', ['owner_id' => $user['id']]),
        'videosCount' => db_count('videos', ['owner_id' => $user['id']]),
        'audioCount' => can_see($me['id'], $user, 'audio') ? db_count('audios', ['owner_id' => $user['id']]) : 0,
        'docsCount' => $user['id'] === $me['id'] ? db_count('docs', ['owner_id' => $user['id']]) : 0,
        'groupsCount' => count(group_ids_of_user($user['id'])),
        'posts' => wall_posts('user', $user['id'], $me['id'], PER_PAGE, ($page - 1) * PER_PAGE),
        'wallCount' => $total,
        'page' => $page,
        'pages' => max(1, (int)ceil($total / PER_PAGE)),
        'error' => $_GET['error'] ?? null,
    ]);
}

/** Короткий адрес вида /vladislav. */
function page_short_link(string $login): void
{
    $user = user_by_login($login);
    if (!$user) render_error(404, 'Такой страницы здесь нет.');
    redirect('/id' . $user['id']);
}

function page_wall_post(string $id): void
{
    $me = require_auth();
    $owner = get_user((int)$id);
    if (!$owner) render_error(404, 'Такой страницы здесь нет.');
    if (!can_post_on_wall($owner, $me['id'])) {
        render_error(403, 'На эту стену Вам писать нельзя.');
    }
    if (!rate_limit('post', 3600, 200)) render_error(429, 'Слишком много записей за час.');

    $result = create_post([
        'owner_type' => 'user', 'owner_id' => $owner['id'], 'author_id' => $me['id'],
        'text' => $_POST['text'] ?? '', 'files' => uploaded_files('files'),
    ]);
    redirect('/id' . $owner['id'] . ($result['errors'] ? '?error=' . urlencode(implode(' ', $result['errors'])) : ''));
}

function page_feed(): void
{
    $me = require_auth();
    $page = max(1, (int)($_GET['page'] ?? 1));
    $posts = feed_posts($me['id'], PER_PAGE + 1, ($page - 1) * PER_PAGE);
    $hasMore = count($posts) > PER_PAGE;

    render('feed', [
        'title' => 'Мои Новости', 'nav' => 'feed',
        'posts' => array_slice($posts, 0, PER_PAGE),
        'total' => count(feed_posts($me['id'], 1000)),
        'page' => $page,
        'pages' => $hasMore ? $page + 1 : $page,
        'error' => $_GET['error'] ?? null,
    ]);
}

function page_feed_post(): void
{
    $me = require_auth();
    if (!rate_limit('post', 3600, 200)) render_error(429, 'Слишком много записей за час.');
    $result = create_post([
        'owner_type' => 'user', 'owner_id' => $me['id'], 'author_id' => $me['id'],
        'text' => $_POST['text'] ?? '', 'files' => uploaded_files('files'),
    ]);
    redirect('/feed' . ($result['errors'] ? '?error=' . urlencode(implode(' ', $result['errors'])) : ''));
}

function page_post(string $id): void
{
    $me = require_auth();
    $row = db_get('posts', (int)$id);
    if (!$row) render_error(404, 'Записи больше нет.');
    if ($row['owner_type'] === 'user' && !can_see($me['id'], get_user($row['owner_id']), 'profile')) {
        render_error(403, 'Запись закрыта настройками приватности.');
    }
    render('post', [
        'title' => 'Запись',
        'post' => decorate_post($row, $me['id']),
        'back' => $row['owner_type'] === 'group' ? '/club' . $row['owner_id'] : '/id' . $row['owner_id'],
    ]);
}

function page_post_edit(string $id): void
{
    $me = require_auth();
    $row = db_get('posts', (int)$id);
    if (!$row) render_error(404, 'Записи больше нет.');
    if (!can_edit_post($row, $me)) render_error(403, 'Эту запись Вам не изменить.');

    render('post_edit', [
        'title' => 'Редактирование записи',
        'post' => decorate_post($row, $me['id']),
        'back' => back_to($row['owner_type'] === 'group' ? '/club' . $row['owner_id'] : '/id' . $row['owner_id']),
    ]);
}

function page_post_edit_save(string $id): void
{
    $me = require_auth();
    $row = db_get('posts', (int)$id);
    if (!$row) render_error(404, 'Записи больше нет.');
    if (!can_edit_post($row, $me)) render_error(403, 'Эту запись Вам не изменить.');

    $text = trim_text($_POST['text'] ?? '', 8000);
    $hasAttachments = db_count('attachments', ['parent_type' => 'post', 'parent_id' => $row['id']]) > 0;
    if ($text !== '' || $hasAttachments || $row['repost_of']) {
        db_update('posts', $row['id'], ['text' => $text, 'edited_at' => now()]);
    }
    redirect(back_to($row['owner_type'] === 'group' ? '/club' . $row['owner_id'] : '/id' . $row['owner_id']));
}

function page_post_delete(string $id): void
{
    $me = require_auth();
    $row = db_get('posts', (int)$id);
    if (!$row) render_error(404, 'Записи больше нет.');
    if (!can_edit_post($row, $me)) render_error(403, 'Эту запись Вам не удалить.');

    $fallback = $row['owner_type'] === 'group' ? '/club' . $row['owner_id'] : '/id' . $row['owner_id'];
    delete_post((int)$row['id']);
    redirect(back_to($fallback));
}

function page_post_pin(string $id): void
{
    $me = require_auth();
    $row = db_get('posts', (int)$id);
    if (!$row) render_error(404, 'Записи больше нет.');
    if (!can_edit_post($row, $me)) render_error(403, 'Эту запись Вам не закрепить.');

    if ($row['pinned']) db_update('posts', $row['id'], ['pinned' => 0]);
    else pin_post($row);

    redirect(back_to($row['owner_type'] === 'group' ? '/club' . $row['owner_id'] : '/id' . $row['owner_id']));
}

function page_post_repost(string $id): void
{
    $me = require_auth();
    $row = db_get('posts', (int)$id);
    if (!$row) render_error(404, 'Записи больше нет.');
    if ($row['owner_type'] === 'user' && !can_see($me['id'], get_user($row['owner_id']), 'profile')) {
        render_error(403, 'Эту запись нельзя пересказать.');
    }

    create_post([
        'owner_type' => 'user', 'owner_id' => $me['id'], 'author_id' => $me['id'],
        'text' => trim_text($_POST['text'] ?? '', 8000),
        'repost_of' => (int)($row['repost_of'] ?: $row['id']),
    ]);
    redirect(back_to('/id' . $me['id']));
}

/* ------------------------------------------------------ лайки и комментарии */

function page_like(): void
{
    $me = require_auth();
    $type = (string)($_POST['type'] ?? 'post');
    $id = (int)($_POST['id'] ?? 0);
    if (!in_array($type, ['post', 'photo', 'video'], true) || !$id) json_out(['error' => 'не то'], 400);

    $target = db_get($type === 'post' ? 'posts' : ($type === 'photo' ? 'photos' : 'videos'), $id);
    if (!$target) json_out(['error' => 'нет такого'], 404);

    $result = toggle_like($type, $id, (int)$me['id']);
    $authorId = (int)($target['author_id'] ?? $target['owner_id'] ?? 0);

    if ($result['liked']) {
        notify(['user_id' => $authorId, 'kind' => 'like_' . $type, 'actor_id' => $me['id'],
            'target_type' => $type, 'target_id' => $id, 'unique' => true,
            'url' => like_url($type, $target), 'preview' => mb_substr((string)($target['text'] ?? ''), 0, 100)]);
    } else {
        drop_notification($authorId, 'like_' . $type, (int)$me['id'], $type, $id);
    }

    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'fetch') json_out($result);
    redirect(back_to('/feed'));
}

function like_url(string $type, array $target): string
{
    return match ($type) {
        'photo' => '/photo' . $target['owner_id'] . '_' . $target['id'],
        'video' => '/video' . $target['owner_id'] . '_' . $target['id'],
        default => ($target['owner_type'] === 'group' ? '/club' : '/id') . $target['owner_id'] . '#post' . $target['id'],
    };
}

function page_likes(string $type, string $id): void
{
    require_auth();
    render('likes', ['title' => 'Кому понравилось', 'users' => like_users($type, (int)$id)]);
}

function page_comment_add(string $type, string $id): void
{
    $me = require_auth();
    $targetId = (int)$id;
    $text = trim_text($_POST['text'] ?? '', 4000);
    $back = back_to('/feed');
    if ($text === '') redirect($back);
    if (!rate_limit('comment', 3600, 400)) render_error(429, 'Слишком много комментариев за час.');

    $collection = match ($type) { 'post' => 'posts', 'photo' => 'photos', default => 'videos' };
    $target = db_get($collection, $targetId);
    if (!$target) render_error(404, 'Комментировать нечего.');

    add_comment($type, $targetId, (int)$me['id'], $text);

    $authorId = (int)($target['author_id'] ?? $target['owner_id'] ?? 0);
    $url = like_url($type, $target);
    notify(['user_id' => $authorId, 'kind' => 'comment_' . $type, 'actor_id' => $me['id'],
        'target_type' => $type, 'target_id' => $targetId, 'url' => $url, 'preview' => $text]);
    notify_mentions($text, (int)$me['id'], $url);

    redirect($back);
}

function page_comment_delete(string $id): void
{
    $me = require_auth();
    $comment = db_get('comments', (int)$id);
    if (!$comment) redirect(back_to('/feed'));

    $allowed = $comment['author_id'] === $me['id'];
    if (!$allowed && $comment['target_type'] === 'post') {
        $allowed = can_edit_post(db_get('posts', $comment['target_id']), $me);
    }
    if (!$allowed && $comment['target_type'] === 'photo') {
        $photo = db_get('photos', $comment['target_id']);
        $allowed = $photo && $photo['owner_id'] === $me['id'];
    }
    if ($allowed) db_remove('comments', $comment['id']);

    redirect(back_to('/feed'));
}
