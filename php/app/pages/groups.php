<?php
/** Группы: список, страница группы, настройки. */

function with_members(array $groups): array
{
    foreach ($groups as $i => $g) $groups[$i]['members'] = group_members_count((int)$g['id']);
    return $groups;
}

function page_groups(): void
{
    $me = require_auth();
    render('groups', ['title' => 'Мои группы', 'nav' => 'groups', 'mode' => 'my',
        'owner' => $me, 'isMe' => true, 'groups' => with_members(groups_of_user((int)$me['id']))]);
}

function page_groups_all(): void
{
    $me = require_auth();
    $groups = db_all('groups');
    usort($groups, fn($a, $b) => strcoll_ru($a['name'], $b['name']));
    render('groups', ['title' => 'Все группы', 'nav' => 'groups', 'mode' => 'all',
        'owner' => $me, 'isMe' => true, 'groups' => with_members($groups)]);
}

function page_groups_of(string $id): void
{
    $me = require_auth();
    $owner = get_user((int)$id);
    if (!$owner) render_error(404, 'Такой страницы здесь нет.');
    if (!can_see((int)$me['id'], $owner, 'profile')) render_error(403, 'Страница закрыта.');
    render('groups', ['title' => 'Группы: ' . full_name($owner), 'nav' => '', 'mode' => 'user',
        'owner' => $owner, 'isMe' => $owner['id'] === $me['id'],
        'groups' => with_members(groups_of_user((int)$owner['id']))]);
}

function page_group(string $id): void
{
    $me = require_auth();
    $group = db_get('groups', (int)$id);
    if (!$group) render_error(404, 'Такой группы здесь нет.');

    $page = max(1, (int)($_GET['page'] ?? 1));
    $total = wall_count('group', (int)$group['id']);
    $isMember = is_group_member((int)$group['id'], (int)$me['id']);

    render('group', [
        'title' => $group['name'], 'nav' => 'groups',
        'group' => $group,
        'members' => group_members((int)$group['id']),
        'isMember' => $isMember,
        'isAdmin' => is_group_admin((int)$group['id'], (int)$me['id']),
        'canPost' => $isMember || $group['kind'] === 'public',
        'posts' => wall_posts('group', (int)$group['id'], (int)$me['id'], PER_PAGE, ($page - 1) * PER_PAGE),
        'wallCount' => $total,
        'page' => $page,
        'pages' => max(1, (int)ceil($total / PER_PAGE)),
        'error' => $_GET['error'] ?? null,
    ]);
}

function page_group_new(): void
{
    require_auth();
    render('group_form', ['title' => 'Новая группа', 'nav' => 'groups', 'group' => null]);
}

function page_group_new_post(): void
{
    $me = require_auth();
    $name = trim_text($_POST['name'] ?? '', 80);
    if ($name === '') {
        render('group_form', ['title' => 'Новая группа', 'nav' => 'groups', 'group' => null,
            'error' => 'Укажите название группы.']);
    }

    $avatar = null;
    $files = uploaded_files('avatar', 1);
    if ($files) {
        try {
            $avatar = media_save_image($files[0]['tmp'], 'avatars', 400, 200, true)['file'];
        } catch (Throwable $e) {
            $avatar = null;
        }
    }

    $group = db_insert('groups', [
        'name' => $name,
        'description' => trim_text($_POST['description'] ?? '', 2000),
        'kind' => ($_POST['kind'] ?? '') === 'public' ? 'public' : 'group',
        'avatar' => $avatar,
        'creator_id' => $me['id'],
        'created_at' => now(),
    ]);
    db_insert('group_members', ['group_id' => $group['id'], 'user_id' => $me['id'],
        'role' => 'admin', 'joined_at' => now()]);

    redirect('/club' . $group['id']);
}

function page_group_wall(string $id): void
{
    $me = require_auth();
    $group = db_get('groups', (int)$id);
    if (!$group) render_error(404, 'Такой группы здесь нет.');
    if (!is_group_member((int)$group['id'], (int)$me['id']) && $group['kind'] !== 'public') {
        render_error(403, 'Писать в эту группу могут только участники.');
    }
    if (!rate_limit('post', 3600, 200)) render_error(429, 'Слишком много записей за час.');

    $result = create_post([
        'owner_type' => 'group', 'owner_id' => (int)$group['id'], 'author_id' => (int)$me['id'],
        'text' => $_POST['text'] ?? '', 'files' => uploaded_files('files'),
    ]);
    redirect('/club' . $group['id'] . ($result['errors'] ? '?error=' . urlencode(implode(' ', $result['errors'])) : ''));
}

function page_group_join(string $id): void
{
    $me = require_auth();
    $group = db_get('groups', (int)$id);
    if (!$group) render_error(404, 'Такой группы здесь нет.');
    if (!is_group_member((int)$group['id'], (int)$me['id'])) {
        db_insert('group_members', ['group_id' => $group['id'], 'user_id' => $me['id'],
            'role' => 'member', 'joined_at' => now()]);
    }
    redirect('/club' . $group['id']);
}

function page_group_leave(string $id): void
{
    $me = require_auth();
    $group = db_get('groups', (int)$id);
    if ($group && !is_group_admin((int)$group['id'], (int)$me['id'])) {
        db_remove('group_members', ['group_id' => $group['id'], 'user_id' => $me['id']]);
    }
    redirect('/club' . (int)$id);
}

function page_group_edit(string $id): void
{
    $me = require_auth();
    $group = db_get('groups', (int)$id);
    if (!$group) render_error(404, 'Такой группы здесь нет.');
    if (!is_group_admin((int)$group['id'], (int)$me['id'])) {
        render_error(403, 'Настройки группы доступны только её создателю.');
    }
    render('group_form', ['title' => 'Настройки группы', 'nav' => 'groups', 'group' => $group]);
}

function page_group_edit_post(string $id): void
{
    $me = require_auth();
    $group = db_get('groups', (int)$id);
    if (!$group) render_error(404, 'Такой группы здесь нет.');
    if (!is_group_admin((int)$group['id'], (int)$me['id'])) {
        render_error(403, 'Настройки группы доступны только её создателю.');
    }

    $name = trim_text($_POST['name'] ?? '', 80);
    if ($name === '') {
        render('group_form', ['title' => 'Настройки группы', 'nav' => 'groups', 'group' => $group,
            'error' => 'Укажите название группы.']);
    }

    $patch = [
        'name' => $name,
        'description' => trim_text($_POST['description'] ?? '', 2000),
        'kind' => ($_POST['kind'] ?? '') === 'public' ? 'public' : 'group',
    ];

    $files = uploaded_files('avatar', 1);
    if ($files) {
        try {
            $saved = media_save_image($files[0]['tmp'], 'avatars', 400, 200, true);
            media_remove($group['avatar']);
            media_remove($group['avatar'] ? thumb_of($group['avatar']) : null);
            $patch['avatar'] = $saved['file'];
        } catch (Throwable $e) {
            // картинка не подошла — остальное всё равно сохраняем
        }
    }

    db_update('groups', $group['id'], $patch);
    redirect('/club' . $group['id']);
}

function page_group_delete(string $id): void
{
    $me = require_auth();
    $group = db_get('groups', (int)$id);
    if (!$group) render_error(404, 'Такой группы здесь нет.');
    if (!is_group_admin((int)$group['id'], (int)$me['id'])) {
        render_error(403, 'Удалить группу может только её создатель.');
    }

    foreach (db_filter('posts', ['owner_type' => 'group', 'owner_id' => $group['id']]) as $post) {
        delete_post((int)$post['id']);
    }
    media_remove($group['avatar']);
    media_remove($group['avatar'] ? thumb_of($group['avatar']) : null);
    db_remove('group_members', ['group_id' => $group['id']]);
    db_remove('groups', $group['id']);

    redirect('/groups');
}
