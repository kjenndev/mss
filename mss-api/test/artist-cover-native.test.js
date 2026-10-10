import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import knex from 'knex';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { harness } from './harness.js';
const database = process.env.MSS_REGISTRATION_TEST_DB;
test('cover clearing uses existing locked update and preserves gallery, portrait and shared file', { skip: !database, timeout: 60000 }, async t => {
  assert.match(database, /^mss_registration_test_[a-z0-9_]+$/);
  const db = knex({ client: 'pg', connection: { host: '/var/run/postgresql', user: 'postgres', database }, pool: { min: 0, max: 10 } });
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-cover-fixture-'));
  let server;
  try {
    await db.migrate.latest({ directory: new URL('../migrations', import.meta.url).pathname });
    const users = await db('users').insert(['owner', 'other', 'admin', 'ordinary'].map(username => ({ username, password: 'synthetic-not-a-password', role: username === 'admin' ? 'admin' : username === 'ordinary' ? 'user' : 'artist' }))).returning('*');
    for (const user of users) await db('sessions').insert({ token: user.username, user_id: user.id, expires_at: new Date(Date.now() + 3600000) });
    const [artist] = await db('artists').insert({ name: 'Synthetic artist', user_id: users[0].id, cover_photo: '/uploads/cover.webp', profile_picture: '/uploads/portrait.webp' }).returning('*');
    await db('artist_images').insert([{ artist_id: artist.id, filename: 'cover.webp' }, { artist_id: artist.id, filename: 'portrait.webp' }]);
    await db('uploads').insert({ filename: 'cover.webp', bytes: 9, user_id: users[0].id });
    fs.writeFileSync(path.join(uploads, 'cover.webp'), 'synthetic');
    const gallery = await db('artist_images').orderBy('id');
    const ledger = await db('uploads').orderBy('filename');
    const h = await harness({ getDb: async () => db, fs, process: { env: { UPLOADS_DIR: uploads } } });
    const app = express(); app.use(express.json());
    app.put('/api/artists/:id', ...h.route('put', '/api/artists/:id').handlers);
    app.use(h.app.middleware.flat().find(fn => typeof fn === 'function' && fn.length === 4));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const call = async token => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/artists/${artist.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ cover_photo: null }), signal: AbortSignal.timeout(10000) });
      return { status: response.status, body: await response.json() };
    };
    const preserved = async () => {
      assert.deepEqual(await db('artist_images').orderBy('id'), gallery);
      assert.deepEqual(await db('uploads').orderBy('filename'), ledger);
      assert.equal(fs.readFileSync(path.join(uploads, 'cover.webp'), 'utf8'), 'synthetic');
      assert.equal((await db('artists').where({ id: artist.id }).first()).profile_picture, artist.profile_picture);
    };
    for (const [token, status] of [[null, 401], ['other', 403], ['ordinary', 403], ['owner', 200], ['admin', 200]]) await t.test(`${token || 'guest'} receives ${status}`, async () => {
      await db('artists').where({ id: artist.id }).update({ cover_photo: artist.cover_photo });
      const before = await db('artists').where({ id: artist.id }).first();
      const result = await call(token); assert.equal(result.status, status);
      const after = await db('artists').where({ id: artist.id }).first();
      if (status === 200) { assert.equal(result.body.artist.cover_photo, null); assert.deepEqual(after, { ...before, cover_photo: null, updated_at: after.updated_at }); }
      else assert.deepEqual(after, before);
      await preserved();
    });
    await t.test('ordinary owners can clear enabled profiles but cannot manage hidden profiles', async () => {
      await db('artists').where({ id: artist.id }).update({ user_id: users[3].id, cover_photo: artist.cover_photo });
      assert.equal((await call('ordinary')).status, 200);
      await db('artists').where({ id: artist.id }).update({ cover_photo: artist.cover_photo, is_disabled: true });
      assert.equal((await call('ordinary')).status, 404);
      assert.equal((await db('artists').where({ id: artist.id }).first()).cover_photo, artist.cover_photo);
      assert.equal((await call('admin')).status, 200);
      await preserved();
    });
    for (const change of ['ownership', 'session', 'role']) await t.test(`revalidates ${change} after the mutation lock`, async () => {
      await db('artists').where({ id: artist.id }).update({ user_id: users[0].id, cover_photo: artist.cover_photo, is_disabled: false });
      const barrier = await db.transaction(); let pending;
      try {
        await barrier.raw('SELECT pg_advisory_xact_lock(1297306453)');
        pending = call(change === 'role' ? 'admin' : 'owner');
        let observed = false;
        for (let attempt = 0; attempt < 300; attempt++) {
          const waits = await db('pg_stat_activity').select('query').whereRaw('datname = current_database()').where({ wait_event_type: 'Lock' });
          if (waits.some(row => row.query.includes('pg_advisory_xact_lock(1297306453)'))) { observed = true; break; }
          await delay(10);
        }
        assert.ok(observed, 'observed real PostgreSQL mutation lock waiter');
        if (change === 'ownership') await barrier('artists').where({ id: artist.id }).update({ user_id: users[1].id });
        if (change === 'session') await barrier('sessions').where({ token: 'owner' }).del();
        if (change === 'role') await barrier('users').where({ id: users[2].id }).update({ role: 'user' });
        await barrier.commit(); assert.equal((await pending).status, change === 'session' ? 401 : 403);
        assert.equal((await db('artists').where({ id: artist.id }).first()).cover_photo, artist.cover_photo);
        await preserved();
      } finally { if (!barrier.isCompleted()) await barrier.rollback(); if (pending) await pending; }
      if (change === 'session') await db('sessions').insert({ token: 'owner', user_id: users[0].id, expires_at: new Date(Date.now() + 3600000) });
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.destroy(); fs.rmSync(uploads, { recursive: true, force: true });
    assert.equal(fs.existsSync(uploads), false);
  }
});
