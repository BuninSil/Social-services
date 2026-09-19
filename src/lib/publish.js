'use strict';

const M = require('./models');
const attach = require('./attach');
const notify = require('./notify');
const { now, trim } = require('./util');

const WALL_ALBUM = 'Фотографии на стене';
const MAX_TEXT = 8000;

/**
 * Создаёт запись на стене (своей, чужой или групповой) вместе с вложениями.
 * Возвращает { id, errors } — ошибки по файлам, которые не приняли.
 */
async function createPost(opts) {
  const text = trim(opts.text, MAX_TEXT);
  const { items, errors } = await attach.fromFiles(opts.authorId, opts.files, WALL_ALBUM);

  const repostOf = opts.repostOf || null;
  if (!text && !items.length && !repostOf) return { id: null, errors };

  const { id } = M.db.posts.insert({
    owner_type: opts.ownerType,
    owner_id: opts.ownerId,
    author_id: opts.authorId,
    text,
    repost_of: repostOf,
    created_at: now(),
  });

  M.saveAttachments('post', id, items);
  // Написанное человеком сбрасываем на диск сразу, не дожидаясь таймера.
  M.db.save();

  const url = (opts.ownerType === 'group' ? '/club' : '/id') + opts.ownerId + '#post' + id;

  // Хозяину стены — уведомление о чужой записи.
  if (opts.ownerType === 'user' && opts.ownerId !== opts.authorId) {
    notify.push({
      userId: opts.ownerId,
      kind: 'wall_post',
      actorId: opts.authorId,
      targetType: 'post',
      targetId: id,
      url,
      preview: text,
    });
  }

  // Автору исходной записи — уведомление о репосте.
  if (repostOf) {
    const source = M.db.posts.get(repostOf);
    if (source) {
      notify.push({
        userId: source.author_id,
        kind: 'repost',
        actorId: opts.authorId,
        targetType: 'post',
        targetId: id,
        url,
        preview: source.text,
      });
    }
  }

  notify.pushMentions(text, opts.authorId, url, text);

  return { id, errors };
}

/** Кто может редактировать или удалять запись. */
function canEditPost(post, user) {
  if (!post || !user) return false;
  if (post.author_id === user.id) return true;
  if (post.owner_type === 'user' && post.owner_id === user.id) return true;
  if (post.owner_type === 'group') {
    const member = M.db.group_members.find({ group_id: post.owner_id, user_id: user.id });
    return !!member && member.role === 'admin';
  }
  return false;
}

/** Полное удаление записи: комментарии, лайки, вложения и уведомления. */
function deletePost(postId) {
  const db = M.db;
  db.comments.remove({ target_type: 'post', target_id: postId });
  db.likes.remove({ target_type: 'post', target_id: postId });
  db.attachments.remove({ parent_type: 'post', parent_id: postId });
  db.notifications.remove({ target_type: 'post', target_id: postId });
  // Репосты не удаляем вместе с исходной записью — просто обрываем связь.
  db.posts.update((p) => p.repost_of === postId, { repost_of: null });
  db.posts.remove(postId);
  db.save();
}

module.exports = { createPost, canEditPost, deletePost, WALL_ALBUM, MAX_TEXT };
