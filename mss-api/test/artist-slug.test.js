import test from 'node:test';
import assert from 'node:assert/strict';
import { slugifyArtistName, isCanonicalArtistSlug } from '../artist-slug.js';
import { harness, response } from './harness.js';
import { memoryDb } from './memory-db.js';

test('artist names have one bounded deterministic lowercase ASCII slug', () => {
  assert.equal(slugifyArtistName('  Midnight Sound Syndicate  '), 'midnight-sound-syndicate');
  assert.equal(slugifyArtistName('Beyoncé & The MÜSIC!!!'), 'beyonce-the-music');
  assert.equal(slugifyArtistName('B\u1AB0A'), 'ba');
  assert.equal(slugifyArtistName('A---B___C'), 'a-b-c');
  assert.equal(slugifyArtistName(` ${'A'.repeat(120)} end `).length, 100);
  assert.equal(slugifyArtistName('東京'), '');
  for (const value of ['midnight-sound-syndicate', 'a', 'a1']) assert.equal(isCanonicalArtistSlug(value), true);
  for (const value of ['', '123', 'create', 'Midnight', '-artist', 'artist-', 'artist--name', 'é', 'a'.repeat(101)]) assert.equal(isCanonicalArtistSlug(value), false);
});

test('public artist lookup accepts canonical slugs and legacy numeric IDs', async () => {
  const db = memoryDb({ artists: [{ id: 7, name: 'Midnight Sound Syndicate', slug: 'midnight-sound-syndicate', is_disabled: false }] });
  const h = await harness({ getDb: async () => db });
  const route = h.route('get', '/api/artists/:id');
  assert.ok(route);
  for (const profile of ['midnight-sound-syndicate', '7']) {
    const res = response();
    await route.handlers.at(-1)({ params: { id: profile }, canViewDisabled: false }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.artist.slug, 'midnight-sound-syndicate');
    assert.equal(res.body.canonicalPath, '/artists/midnight-sound-syndicate');
  }
});

test('create and rename derive slugs and reject empty, numeric, reserved, or colliding name slugs', async () => {
  const db = memoryDb({ artists: [{ id: 1, name: 'Existing', slug: 'existing', user_id: 4 }] });
  const h = await harness({ getDb: async () => db });
  const create = h.route('post', '/api/artists').handlers.at(-1);
  let res = response();
  await create({ body: { name: 'New Artist', slug: 'client-forged' }, user: { role: 'admin' }, db, afterCommit: [] }, res);
  assert.equal(res.code, 400);
  res = response();
  await create({ body: { name: '東京' }, user: { role: 'admin' }, db, afterCommit: [] }, res);
  assert.equal(res.code, 400);
  for (const name of ['123', 'Create']) {
    res = response();
    await create({ body: { name }, user: { role: 'admin' }, db, afterCommit: [] }, res);
    assert.equal(res.code, 400);
  }
  res = response();
  await create({ body: { name: 'Existing!!!' }, user: { role: 'admin' }, db, afterCommit: [] }, res);
  assert.equal(res.code, 409);
  res = response();
  await create({ body: { name: 'New Artist' }, user: { role: 'admin' }, db, afterCommit: [] }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.artist.slug, 'new-artist');

  const update = h.route('put', '/api/artists/:id').handlers.at(-1);
  const current = db.state().artists.find(artist => artist.slug === 'new-artist');
  for (const name of ['123', 'Create']) {
    res = response();
    await update({ body: { name }, artist: { ...current }, user: { id: 4, role: 'admin' }, db, afterCommit: [] }, res);
    assert.equal(res.code, 400);
    assert.equal(db.state().artists.find(artist => artist.id === current.id).slug, 'new-artist');
  }
  res = response();
  await update({ body: { name: 'Renamed Artist' }, artist: { ...current }, user: { id: 4, role: 'admin' }, db, afterCommit: [] }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.artist.slug, 'renamed-artist');
});
