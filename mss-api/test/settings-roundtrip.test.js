import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response } from './harness.js';
import { memoryDb } from './memory-db.js';

const socialKeys = ['social_twitch', 'social_instagram', 'social_facebook', 'social_twitter', 'social_youtube', 'social_tiktok', 'social_soundcloud', 'social_mixcloud', 'social_discord', 'social_bandcamp', 'social_spotify'];

test('settings batch inserts all supported absent social keys, updates existing values, and GET reads back null', async () => {
  const db = memoryDb({ system_settings: [
    { key: 'social_twitch', value: 'https://old.test', description: 'Existing description' },
    { key: 'unrelated', value: 'keep me', description: 'Unrelated setting' },
  ] });
  const h = await harness({ getDb: async () => db });
  const batch = h.route('post', '/api/settings/batch').handlers.at(-1);
  const res = response();
  const settings = socialKeys.map((key, index) => ({ key, value: key === 'social_twitch' ? null : `https://social.test/${index}` }));
  await batch({ body: { settings } }, res, error => { throw error; });
  assert.equal(res.code, 200);

  const read = response();
  await h.route('get', '/api/settings').handlers.at(-1)({}, read, error => { throw error; });
  assert.equal(read.body.settings.social_twitch, null);
  for (const [index, key] of socialKeys.entries()) assert.equal(read.body.settings[key], index === 0 ? null : `https://social.test/${index}`);
  assert.equal(read.body.settings.unrelated, 'keep me');
  assert.equal(db.state().system_settings.find(row => row.key === 'social_twitch').description, 'Existing description');
});

test('settings batch updates an existing unknown key but rejects creation of an unknown key without mutation', async () => {
  const db = memoryDb({ system_settings: [{ key: 'legacy_custom', value: 'old' }] });
  const h = await harness({ getDb: async () => db });
  let res = response();
  await h.route('post', '/api/settings/batch').handlers.at(-1)({ body: { settings: [{ key: 'legacy_custom', value: 'new' }] } }, res, error => { throw error; });
  assert.equal(res.code, 200);
  assert.equal(db.state().system_settings[0].value, 'new');
  const before = structuredClone(db.state());
  res = response();
  await h.route('post', '/api/settings/batch').handlers.at(-1)({ body: { settings: [{ key: 'arbitrary_new', value: 'no' }] } }, res, error => { throw error; });
  assert.equal(res.code, 400);
  assert.deepEqual(db.state(), before);
});

test('settings routes reject unsafe social URLs without any mutation', async () => {
  for (const [method, url, body] of [
    ['post', '/api/settings/batch', { settings: [{ key: 'social_discord', value: 'https://user:pass@example.com' }] }],
    ['post', '/api/settings/batch', { settings: [{ key: 'social_discord', value: 'https:\\example.com' }] }],
    ['put', '/api/settings/:key', { value: 'javascript:alert(1)' }],
  ]) {
    const db = memoryDb({ system_settings: [{ key: 'social_discord', value: 'https://discord.test/original' }] });
    const h = await harness({ getDb: async () => db });
    const res = response();
    await h.route(method, url).handlers.at(-1)({ body, params: { key: 'social_discord' } }, res, error => { throw error; });
    assert.equal(res.code, 400);
    assert.equal(db.state().system_settings[0].value, 'https://discord.test/original');
    assert.equal(db.operations.length, 0);
  }
});

test('settings batch rejects an unauthenticated request before mutation', async () => {
  const db = memoryDb({ system_settings: [] });
  const h = await harness({ getDb: async () => db });
  const res = response();
  res.set = res.vary = () => res;
  let continued = false;
  await h.route('post', '/api/settings/batch').handlers[0]({ headers: {}, body: { settings: [] } }, res, () => { continued = true; });
  assert.equal(res.code, 401);
  assert.equal(continued, false);
  assert.deepEqual(db.state().system_settings, []);
});

test('settings batch rejects a non-admin request before mutation', async () => {
  const db = memoryDb({ system_settings: [] });
  const h = await harness({ getDb: async () => db });
  const res = response();
  let continued = false;
  await h.route('post', '/api/settings/batch').handlers[1]({ user: { role: 'artist' }, body: { settings: [] } }, res, () => { continued = true; });
  assert.equal(res.code, 403);
  assert.equal(continued, false);
  assert.deepEqual(db.state().system_settings, []);
});


test('social URL schemes are case insensitive but malformed authority slashes are rejected', async () => {
  const db = memoryDb({ system_settings: [] });
  const h = await harness({ getDb: async () => db });
  const batch = h.route('post', '/api/settings/batch').handlers.at(-1);
  for (const [value, expected] of [['HTTPS://example.com/profile', 200], ['https:///example.com/profile', 400]]) {
    const res = response();
    await batch({ body: { settings: [{ key: 'social_youtube', value }] } }, res, error => { throw error; });
    assert.equal(res.code, expected);
  }
  assert.equal(db.state().system_settings[0].value, 'HTTPS://example.com/profile');
});
