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

  const id = M.postsQ.insert.run({
    owner_type: opts.ownerType,
    owner_id: opts.ownerId,
    author_id: opts.authorId,
    text,
    repost_of: repostOf,
    created_at: now(),
  }).lastInsertRowid;

  M.saveAttachments('post', id, items);

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
    const source = M.postsQ.byId.get(repostOf);
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
    const member = M.db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
      .get(post.owner_id, user.id);
    return !!member && member.role === 'admin';
  }
  return false;
}

/** Полное удаление записи: комментарии, лайки, вложения и уведомления. */
function deletePost(postId) {
  const db = M.db;
  const drop = db.transaction(() => {
    db.prepare("DELETE FROM comments WHERE target_type = 'post' AND target_id = ?").run(postId);
    db.prepare("DELETE FROM likes WHERE target_type = 'post' AND target_id = ?").run(postId);
    db.prepare("DELETE FROM attachments WHERE parent_type = 'post' AND parent_id = ?").run(postId);
    db.prepare("DELETE FROM notifications WHERE target_type = 'post' AND target_id = ?").run(postId);
    db.prepare('UPDATE posts SET repost_of = NULL WHERE repost_of = ?').run(postId);
    db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
  });
  drop();
}

module.exports = { createPost, canEditPost, deletePost, WALL_ALBUM, MAX_TEXT };
