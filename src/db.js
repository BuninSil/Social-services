'use strict';

// Читаем .env до всего остального: настройки берутся из него.
require('./lib/env');

const path = require('path');
const store = require('./lib/store');

const DATA_DIR = process.env.VO_DATA_DIR || path.join(__dirname, '..', 'data');

/**
 * Что храним. Ключ — имя коллекции (и файла data/<имя>.json),
 * defaults — чем добиваются поля, которых не передали при создании.
 * Это замена «DEFAULT» из схемы: остальной код рассчитывает, что поля есть
 * всегда, а не иногда.
 */
const SCHEMA = {
  users: {
    defaults: {
      login: '', password_hash: '', first_name: '', last_name: '', sex: 'm',
      status: '', avatar: null, bday: '', city: '', hometown: '', relationship: '',
      politics: '', worldview: '', activity: '', interests: '', music: '', films: '',
      tv: '', books: '', games: '', quotes: '', about: '',
      wall_who: 'all', profile_who: 'all', photos_who: 'all', audio_who: 'all',
      friends_who: 'all', message_who: 'all',
      theme: 'vo', neon_c1: '#2fe0ff', neon_c2: '#ff4ecd', neon_bg: '#070b16',
      rc_id: null, rc_username: '', rc_avatar: '', rc_profile: '', rc_role: '', rc_only: 0,
      created_at: 0, last_seen: 0,
    },
  },
  friendships: { defaults: { from_id: 0, to_id: 0, status: 'pending', created_at: 0 } },
  groups: {
    defaults: {
      name: '', description: '', kind: 'group', avatar: null, creator_id: 0, created_at: 0,
    },
  },
  group_members: { defaults: { group_id: 0, user_id: 0, role: 'member', joined_at: 0 } },
  posts: {
    defaults: {
      owner_type: 'user', owner_id: 0, author_id: 0, text: '',
      created_at: 0, edited_at: null, pinned: 0, repost_of: null,
    },
  },
  comments: {
    defaults: {
      target_type: 'post', target_id: 0, author_id: 0, text: '',
      created_at: 0, edited_at: null, reply_to: null,
    },
  },
  likes: { defaults: { target_type: 'post', target_id: 0, user_id: 0, created_at: 0 } },
  albums: {
    defaults: { owner_type: 'user', owner_id: 0, title: '', description: '', created_at: 0 },
  },
  photos: {
    defaults: {
      album_id: null, owner_id: 0, file: '', thumb: '', description: '',
      width: 0, height: 0, size: 0, created_at: 0,
    },
  },
  videos: {
    defaults: {
      owner_id: 0, title: '', description: '', file: '', poster: null,
      duration: 0, size: 0, created_at: 0,
    },
  },
  audios: {
    defaults: { owner_id: 0, artist: '', title: '', file: '', duration: 0, size: 0, created_at: 0 },
  },
  docs: {
    defaults: { owner_id: 0, name: '', file: '', ext: '', size: 0, created_at: 0 },
  },
  attachments: {
    defaults: {
      parent_type: 'post', parent_id: 0, kind: 'photo', ref_id: null,
      file: null, meta: '{}', position: 0,
    },
  },
  conversations: {
    defaults: { kind: 'dm', title: '', avatar: null, creator_id: null, created_at: 0 },
  },
  conversation_members: {
    defaults: {
      conv_id: 0, user_id: 0, role: 'member', joined_at: 0, last_read_id: 0, left_at: null,
    },
  },
  messages: {
    defaults: {
      conv_id: 0, from_id: 0, text: '', kind: 'text',
      created_at: 0, edited_at: null, deleted_at: null,
    },
  },
  notifications: {
    defaults: {
      user_id: 0, kind: '', actor_id: null, target_type: '', target_id: 0,
      url: '', preview: '', is_read: 0, created_at: 0,
    },
  },
  blocks: { defaults: { user_id: 0, blocked_id: 0, created_at: 0 } },
  sessions: { defaults: { data: '', expires: 0 } },
};

const db = store.open(DATA_DIR, SCHEMA);

db.DATA_DIR = DATA_DIR;
db.SCHEMA = SCHEMA;

module.exports = db;
