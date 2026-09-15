'use strict';

/** Путь к уменьшенной копии: photos/abc.jpg -> photos/thumb_abc.jpg */
function thumbOf(file) {
  return file.replace(/([^/]+)$/, 'thumb_$1');
}

/** size: 'full' | 'thumb'. Без своей фотографии отдаём серый силуэт, как раньше. */
function avatar(user, size) {
  if (!user || !user.avatar) return '/img/camera_200.svg';
  return '/uploads/' + (size === 'full' ? user.avatar : thumbOf(user.avatar));
}

function gavatar(group) {
  if (!group || !group.avatar) return '/img/group_200.svg';
  return '/uploads/' + group.avatar;
}

module.exports = { thumbOf, avatar, gavatar };
