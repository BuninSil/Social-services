<?php
/** Друзья, заявки и чёрный список. */

function render_friends(array $owner, string $tab): void
{
    $me = current_user();
    $isMe = $owner['id'] === $me['id'];
    if (!$isMe && !can_see($me['id'], $owner, 'friends')) {
        render_error(403, 'Список друзей доступен только друзьям.');
    }
    render('friends', [
        'title' => $isMe ? 'Мои друзья' : 'Друзья: ' . full_name($owner),
        'nav' => $isMe ? 'friends' : '',
        'owner' => $owner,
        'isMe' => $isMe,
        'tab' => $tab,
        'friends' => friend_list((int)$owner['id']),
        'incoming' => $isMe ? incoming_requests((int)$me['id']) : [],
        'outgoing' => $isMe ? outgoing_requests((int)$me['id']) : [],
    ]);
}

function page_friends(): void
{
    render_friends(require_auth(), 'all');
}

function page_friends_requests(): void
{
    render_friends(require_auth(), 'requests');
}

function page_friends_out(): void
{
    render_friends(require_auth(), 'out');
}

function page_friends_of(string $id): void
{
    require_auth();
    $owner = get_user((int)$id);
    if (!$owner) render_error(404, 'Такой страницы здесь нет.');
    render_friends($owner, 'all');
}

function page_friend_add(string $id): void
{
    $me = require_auth();
    $other = get_user((int)$id);
    if (!$other || $other['id'] === $me['id']) render_error(404, 'Такой страницы здесь нет.');

    $back = back_to('/id' . $other['id']);
    if (blocked_either((int)$me['id'], (int)$other['id'])) redirect($back);

    $status = add_friend((int)$me['id'], (int)$other['id']);
    notify([
        'user_id' => $other['id'],
        'kind' => $status === 'friends' ? 'friend_add' : 'friend_request',
        'actor_id' => $me['id'],
        'url' => '/id' . $me['id'],
        'unique' => true,
    ]);
    redirect($back);
}

function page_friend_remove(string $id): void
{
    $me = require_auth();
    remove_friend((int)$me['id'], (int)$id);
    redirect(back_to('/friends'));
}

function page_block(string $id): void
{
    $me = require_auth();
    block_user((int)$me['id'], (int)$id);
    redirect(back_to('/id' . (int)$id));
}

function page_unblock(string $id): void
{
    $me = require_auth();
    unblock_user((int)$me['id'], (int)$id);
    redirect(back_to('/settings/blacklist'));
}

function page_blacklist(): void
{
    $me = require_auth();
    render('blacklist', [
        'title' => 'Чёрный список', 'nav' => 'settings',
        'blocked' => block_list((int)$me['id']),
    ]);
}
