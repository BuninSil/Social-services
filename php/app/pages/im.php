<?php
/** Личные сообщения и беседы. */

const IM_PAGE = 50;

function page_im_list(): void
{
    $me = require_auth();
    render('im_list', [
        'title' => 'Мои Сообщения', 'nav' => 'im',
        'conversations' => conversations_of((int)$me['id']),
    ]);
}

/** Открыть диалог с человеком: если его ещё нет — завести. */
function page_im_dm(string $userId): void
{
    $me = require_auth();
    $peer = get_user((int)$userId);
    if (!$peer) render_error(404, 'Такой страницы здесь нет.');
    if ($peer['id'] === $me['id']) render_error(400, 'Себе писать некуда — для этого есть заметки.');
    if (!can_message((int)$me['id'], $peer)) render_error(403, 'Этот человек не принимает сообщения.');

    $conv = dm_with((int)$me['id'], (int)$peer['id']);
    show_conversation($conv);
}

function page_im_chat(string $convId): void
{
    $me = require_auth();
    $conv = db_get('conversations', (int)$convId);
    if (!$conv || !is_conv_member((int)$conv['id'], (int)$me['id'])) {
        render_error(404, 'Такой беседы здесь нет.');
    }
    show_conversation($conv);
}

function show_conversation(array $conv): void
{
    $me = current_user();
    $view = conv_view($conv, (int)$me['id']);
    $messages = history((int)$conv['id'], IM_PAGE);

    if ($messages) {
        set_read((int)$conv['id'], (int)$me['id'], (int)end($messages)['id']);
    }

    $members = $conv['kind'] === 'chat' ? conv_members((int)$conv['id']) : [];
    $memberIds = array_column($members, 'id');
    $canInvite = array_values(array_filter(friend_list((int)$me['id']),
        fn($f) => !in_array($f['id'], $memberIds, true)));

    render('im_chat', [
        'title' => $view['title'], 'nav' => 'im',
        'conv' => $view,
        'messages' => $messages,
        'lastId' => $messages ? (int)end($messages)['id'] : 0,
        'members' => $members,
        'canInvite' => $canInvite,
        'isAdmin' => ($conv['kind'] === 'chat')
            && (conv_member((int)$conv['id'], (int)$me['id'])['role'] ?? '') === 'admin',
        'error' => $_GET['error'] ?? null,
    ]);
}

function page_im_send(string $convId): void
{
    $me = require_auth();
    $conv = db_get('conversations', (int)$convId);
    if (!$conv || !is_conv_member((int)$conv['id'], (int)$me['id'])) {
        render_error(404, 'Такой беседы здесь нет.');
    }
    if (!rate_limit('message', 3600, 600)) render_error(429, 'Слишком много сообщений за час.');

    // В личный диалог не пишем тому, кто запретил или заблокировал.
    if ($conv['kind'] === 'dm') {
        $peer = dm_peer((int)$conv['id'], (int)$me['id']);
        if ($peer && !can_message((int)$me['id'], get_user((int)$peer['id']))) {
            render_error(403, 'Этот человек больше не принимает сообщения.');
        }
    }

    $text = trim_text($_POST['text'] ?? '', 8000);
    [$items, $errors] = attach_from_files((int)$me['id'], uploaded_files('files'), 'Вложения из сообщений');

    if ($text === '' && !$items) {
        redirect('/im/c' . $conv['id'] . ($errors ? '?error=' . urlencode(implode(' ', $errors)) : ''));
    }

    $message = send_message((int)$conv['id'], (int)$me['id'], $text);
    save_attachments('message', (int)$message['id'], $items);
    set_read((int)$conv['id'], (int)$me['id'], (int)$message['id']);

    foreach (conv_member_ids((int)$conv['id']) as $uid) {
        if ($uid === $me['id']) continue;
        notify(['user_id' => $uid, 'kind' => 'message', 'actor_id' => $me['id'],
            'target_type' => 'conv', 'target_id' => $conv['id'],
            'url' => '/im/c' . $conv['id'], 'preview' => $text, 'unique' => true]);
    }

    redirect('/im/c' . $conv['id'] . ($errors ? '?error=' . urlencode(implode(' ', $errors)) : ''));
}

/**
 * Новые сообщения для открытой беседы — страница спрашивает их сама
 * раз в несколько секунд. Вебсокетов на обычном хостинге нет.
 */
function page_im_updates(string $convId): void
{
    $me = require_auth();
    $conv = db_get('conversations', (int)$convId);
    if (!$conv || !is_conv_member((int)$conv['id'], (int)$me['id'])) json_out(['error' => 'нет доступа'], 403);

    $after = (int)($_GET['after'] ?? 0);
    $rows = db_filter('messages', fn($m) => $m['conv_id'] === (int)$conv['id']
        && !$m['deleted_at'] && $m['id'] > $after);
    usort($rows, fn($a, $b) => $a['id'] <=> $b['id']);
    $rows = array_slice($rows, 0, 50);

    $out = [];
    foreach ($rows as $row) {
        $m = decorate_message($row);
        ob_start();
        require VO_ROOT . '/app/views/partials/message.php';
        $out[] = ['id' => $m['id'], 'html' => ob_get_clean()];
    }
    if ($out) set_read((int)$conv['id'], (int)$me['id'], (int)end($out)['id']);

    json_out(['messages' => $out, 'unread' => unread_dialogs((int)$me['id'])]);
}

function page_message_delete(string $id): void
{
    $me = require_auth();
    $message = db_get('messages', (int)$id);
    if ($message && $message['from_id'] === $me['id']) {
        db_update('messages', $message['id'], ['deleted_at' => now()]);
    }
    redirect(back_to('/im'));
}

function page_im_new(): void
{
    $me = require_auth();
    render('im_new', [
        'title' => 'Новая беседа', 'nav' => 'im',
        'friends' => friend_list((int)$me['id']),
    ]);
}

function page_im_new_post(): void
{
    $me = require_auth();
    $title = trim_text($_POST['title'] ?? '', 80);
    $members = array_map('intval', (array)($_POST['members'] ?? []));
    $members = array_values(array_filter($members, fn($id) => are_friends((int)$me['id'], $id)));

    if (!$members) {
        render('im_new', [
            'title' => 'Новая беседа', 'nav' => 'im',
            'friends' => friend_list((int)$me['id']),
            'error' => 'Выберите, кого позвать в беседу.',
        ]);
    }

    $conv = create_chat((int)$me['id'], $title, $members);
    foreach ($members as $uid) {
        notify(['user_id' => $uid, 'kind' => 'chat_invite', 'actor_id' => $me['id'],
            'url' => '/im/c' . $conv['id'], 'preview' => $conv['title']]);
    }
    redirect('/im/c' . $conv['id']);
}

function page_im_leave(string $convId): void
{
    $me = require_auth();
    $conv = db_get('conversations', (int)$convId);
    if ($conv && $conv['kind'] === 'chat') {
        drop_conv_member((int)$conv['id'], (int)$me['id']);
    }
    redirect('/im');
}

function page_im_title(string $convId): void
{
    $me = require_auth();
    $conv = db_get('conversations', (int)$convId);
    $member = $conv ? conv_member((int)$conv['id'], (int)$me['id']) : null;
    $title = trim_text($_POST['title'] ?? '', 80);

    if ($conv && $conv['kind'] === 'chat' && $member && $member['role'] === 'admin' && $title !== '') {
        db_update('conversations', $conv['id'], ['title' => $title]);
    }
    redirect('/im/c' . (int)$convId);
}

function page_im_invite(string $convId): void
{
    $me = require_auth();
    $conv = db_get('conversations', (int)$convId);
    $member = $conv ? conv_member((int)$conv['id'], (int)$me['id']) : null;
    $userId = (int)($_POST['user_id'] ?? 0);

    if ($conv && $conv['kind'] === 'chat' && $member && $member['role'] === 'admin'
        && are_friends((int)$me['id'], $userId)) {
        add_conv_member((int)$conv['id'], $userId);
        notify(['user_id' => $userId, 'kind' => 'chat_invite', 'actor_id' => $me['id'],
            'url' => '/im/c' . $conv['id'], 'preview' => $conv['title']]);
    }
    redirect('/im/c' . (int)$convId);
}

function page_im_search(): void
{
    $me = require_auth();
    $q = trim_text($_GET['q'] ?? '', 100);
    $results = [];

    foreach (search_messages((int)$me['id'], $q) as $m) {
        $conv = db_get('conversations', $m['conv_id']);
        if (!$conv) continue;
        $view = conv_view($conv, (int)$me['id']);
        $results[] = [
            'text' => $m['text'],
            'created_at' => $m['created_at'],
            'conv_title' => $view['title'],
            'url' => '/im/c' . $conv['id'] . '#msg' . $m['id'],
        ];
    }

    render('im_search', ['title' => 'Поиск по переписке', 'nav' => 'im', 'q' => $q, 'results' => $results]);
}
