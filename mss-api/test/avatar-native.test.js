import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import multer from 'multer';
import knex from 'knex';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { setTimeout as delay } from 'node:timers/promises';
import { decodeImage } from '../uploads.js';
import { harness } from './harness.js';

const database = process.env.MSS_REGISTRATION_TEST_DB;
test('native account avatars', { skip: !database, timeout: 60000 }, async t => {
  assert.match(database, /^mss_registration_test_[a-z0-9_]+$/);
  const db = knex({ client: 'pg', connection: { host: '/var/run/postgresql', user: 'postgres', database }, pool: { min: 0, max: 10 } });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-avatar-qa-'));
  let server;
  try {
    const migrations = new URL('../migrations', import.meta.url).pathname;
    for (const name of fs.readdirSync(migrations).filter(name => name.endsWith('.js') && name !== '20261003020000_user_profile_picture.js').sort()) {
      await db.migrate.up({ directory: migrations, name });
    }
    const [legacy] = await db('users').insert({ username: 'AvatarMigrationLegacy', password: 'unchanged-hash', role: 'user' }).returning('*');
    await db.migrate.latest({ directory: migrations });
    assert.deepEqual(await db('users').where({ id: legacy.id }).first(), { ...legacy, profile_picture: null });
    const h = await harness({ getDb: async () => db, multer, fs, decodeImage, uuidv4: () => crypto.randomUUID(),
      process: { env: { UPLOADS_DIR: directory } }, verifyPassword: async (p, h) => h === 'hash:' + p });
    const app = express(); app.use(express.json());
    for (const [method, url] of [['post', '/api/auth/me/avatar'], ['delete', '/api/auth/me/avatar'], ['get', '/api/auth/me'], ['put', '/api/auth/me'], ['post', '/api/auth/login'], ['get', '/api/comments'], ['post', '/api/comments'], ['delete', '/api/users/:id'], ['put', '/api/settings/:key'], ['post', '/api/artists/:id/upload']]) {
      const route = h.route(method, url); if (route) app[method](url, ...route.handlers);
    }
    app.use(h.app.middleware.flat().find(f => typeof f === 'function' && f.length === 4));
    app.use((req, res) => res.status(404).json({ error: 'Route missing' }));
    server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    const call = async (method, url, token, body) => {
      const form = body instanceof FormData;
      const r = await fetch(`http://127.0.0.1:${server.address().port}${url}`, { method,
        headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(!form && body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: form ? body : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
      return { status: r.status, body: await r.json() };
    };
    const user = async (role = 'user') => {
      const [row] = await db('users').insert({ username: crypto.randomUUID(), role, password: 'hash:Valid123' }).returning('*');
      const token = crypto.randomUUID(); await db('sessions').insert({ token, user_id: row.id, expires_at: new Date(Date.now() + 3600000) });
      return { ...row, token };
    };
    const png = await sharp({ create: { width: 3, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
    const form = (bytes = png, fields = {}, type = 'image/png') => {
      const data = new FormData(); data.append('image', new Blob([bytes], { type }), 'avatar.png');
      for (const [key, value] of Object.entries(fields)) data.append(key, String(value));
      return data;
    };
    const upload = (u, body = form()) => call('POST', '/api/auth/me/avatar', u?.token, body);
    const getUser = id => db('users').where({ id }).first();
    const fileExists = url => fs.existsSync(path.join(directory, path.basename(url)));
    const files = () => fs.readdirSync(directory).filter(x => x !== '.staging').sort();
    const waitLock = async pattern => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const rows = await db('pg_stat_activity').select('query', 'wait_event').whereRaw('datname = current_database()').where({ wait_event_type: 'Lock' });
        const row = rows.find(r => pattern.test(r.query));
        if (row) { t.diagnostic(`Observed ${row.wait_event}: ${row.query}`); return; }
        await delay(10);
      }
      assert.fail('Expected lock wait ' + pattern);
    };
    await t.test('all roles upload own avatar, replace and idempotently remove with quota/file readback', async () => {
      for (const role of ['user', 'artist', 'admin']) {
        const u = await user(role);
        const first = await upload(u);
        assert.equal(first.status, 200, JSON.stringify(first));
        assert.match(first.body.user.profile_picture, /^\/uploads\/[a-f0-9-]+\.webp$/);
        assert.equal(first.body.user.id, u.id); assert.equal(first.body.user.password, undefined);
        assert.equal((await getUser(u.id)).profile_picture, first.body.user.profile_picture);
        assert.equal((await call('GET', '/api/auth/me', u.token)).body.user.profile_picture, first.body.user.profile_picture);
        assert.equal((await call('POST', '/api/auth/login', null, { username: u.username, password: 'Valid123' })).body.user.profile_picture, first.body.user.profile_picture);
        const second = await upload(u);
        assert.equal(second.status, 200); assert.notEqual(second.body.user.profile_picture, first.body.user.profile_picture);
        assert.equal(fileExists(first.body.user.profile_picture), false); assert.equal(fileExists(second.body.user.profile_picture), true);
        const clean = await sharp(path.join(directory, path.basename(second.body.user.profile_picture))).metadata();
        assert.equal(clean.format, 'webp'); assert.equal(clean.exif, undefined);
        assert.equal((await db('uploads').where({ user_id: u.id })).length, 1);
        const removed = await call('DELETE', '/api/auth/me/avatar', u.token);
        assert.equal(removed.status, 200); assert.equal(removed.body.user.profile_picture, null);
        assert.equal(fileExists(second.body.user.profile_picture), false);
        assert.equal((await db('uploads').where({ user_id: u.id })).length, 0);
        assert.equal((await call('DELETE', '/api/auth/me/avatar', u.token)).status, 200);
      }
      assert.deepEqual(files(), []);
    });
    await t.test('unauthorized, ownership spoofing, URL fields, malformed/oversized/animated images fail without files', async () => {
      const u = await user(), other = await user();
      assert.equal((await upload(null)).status, 401);
      assert.equal((await call('DELETE', '/api/auth/me/avatar')).status, 401);
      assert.equal((await upload(u, form(png, { user_id: other.id }))).status, 400);
      assert.equal((await call('PUT', '/api/auth/me', u.token, { profile_picture: 'https://example.com/x.png' })).status, 400);
      assert.equal((await upload(u, new FormData())).status, 400);
      for (const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'), Buffer.from('not an image')]) {
        assert.equal((await upload(u, form(bytes))).status, 415);
      }
      assert.equal((await upload(u, form(Buffer.alloc(5 * 1024 * 1024 + 1)))).status, 413);
      const oversized = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: 'red' } }).png().toBuffer();
      assert.equal((await upload(u, form(oversized))).status, 415);
      const animated = await sharp(Buffer.concat([Buffer.alloc(2 * 2 * 3, 255), Buffer.alloc(2 * 2 * 3, 0)]), { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
      assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
      assert.equal((await upload(u, form(animated, {}, 'image/webp'))).status, 415);
      assert.equal((await getUser(other.id)).profile_picture, null); assert.equal((await getUser(u.id)).profile_picture, null);
      assert.deepEqual(files(), []); assert.equal((await db('uploads')).length, 0);
    });
    await t.test('comments expose current account avatar only, preserving historical author name and null legacy authors', async () => {
      const u = await user(); const [artist] = await db('artists').insert({ name: 'Avatar comments', slug: 'avatar-comments' }).returning('*');
      const avatar = (await upload(u)).body.user.profile_picture;
      const forged = await call('POST', '/api/comments', u.token, { artist_id: artist.id, content: 'hello', author_profile_picture: 'evil', author_name: 'spoof' });
      assert.equal(forged.status, 400);
      const created = await call('POST', '/api/comments', u.token, { artist_id: artist.id, content: 'hello' });
      assert.equal(created.status, 201); assert.equal(created.body.comment.author_profile_picture, avatar);
      const name = created.body.comment.author_name;
      await db('comments').insert({ artist_id: artist.id, content: 'legacy', author_name: 'Historical' });
      await db('users').where({ id: u.id }).update({ username: 'ChangedName', email: 'private@example.com' });
      const next = (await upload(u)).body.user.profile_picture;
      let reads = 0; const count = q => { if (/^select/i.test(q.sql)) reads++; }; db.on('query', count);
      const listed = await call('GET', '/api/comments?artist_id=' + artist.id);
      db.off('query', count);
      assert.equal(listed.status, 200); assert.ok(reads <= 2, `bounded queries: ${reads}`);
      assert.equal(listed.body.comments[0].author_profile_picture, next); assert.equal(listed.body.comments[0].author_name, name);
      assert.equal(listed.body.comments[1].author_profile_picture, null);
      for (const row of listed.body.comments) for (const key of ['password', 'email', 'email_verified_at', 'role', 'is_disabled', 'token']) assert.equal(row[key], undefined);
      await call('DELETE', '/api/auth/me/avatar', u.token);
      assert.equal((await call('GET', '/api/comments?artist_id=' + artist.id)).body.comments[0].author_profile_picture, null);
    });
    await t.test('SQLSTATE rollback preserves previous avatar, quota and files; storage quotas deny atomically', async () => {
      const u = await user(); const avatar = (await upload(u)).body.user.profile_picture;
      const beforeFiles = files(), ledger = await db('uploads').orderBy('filename');
      await db.raw(`CREATE FUNCTION qa_avatar_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.id = ${Number(u.id)} THEN RAISE EXCEPTION 'synthetic avatar failure' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$`);
      await db.raw('CREATE TRIGGER qa_avatar_failure BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION qa_avatar_failure()');
      try {
        assert.equal((await upload(u)).status, 400);
        assert.equal((await call('DELETE', '/api/auth/me/avatar', u.token)).status, 400);
        assert.equal((await getUser(u.id)).profile_picture, avatar);
        assert.deepEqual(files(), beforeFiles); assert.deepEqual(await db('uploads').orderBy('filename'), ledger);
        assert.deepEqual(fs.readdirSync(path.join(directory, '.staging')), []);
      } finally { await db.raw('DROP TRIGGER qa_avatar_failure ON users'); await db.raw('DROP FUNCTION qa_avatar_failure()'); }
      await db('uploads').insert({ filename: 'synthetic-quota.webp', user_id: u.id, bytes: 100 * 1024 * 1024 });
      assert.equal((await upload(u)).status, 413); assert.equal((await getUser(u.id)).profile_picture, avatar); assert.deepEqual(files(), beforeFiles);
      await db('uploads').where({ filename: 'synthetic-quota.webp' }).del();
      await call('DELETE', '/api/auth/me/avatar', u.token);
    });
    await t.test('commit-time SQLSTATE failures compensate already published files and preserve the old avatar', async () => {
      const u = await user(); const avatar = (await upload(u)).body.user.profile_picture;
      const beforeFiles = files(), ledger = await db('uploads').orderBy('filename');
      for (const [code, expected] of [['23514', 400], ['23503', 409], ['23505', 409]]) {
        await db.raw(`CREATE FUNCTION qa_avatar_commit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.id = ${Number(u.id)} THEN RAISE EXCEPTION 'synthetic commit failure' USING ERRCODE = '${code}'; END IF; RETURN NEW; END $$`);
        await db.raw('CREATE CONSTRAINT TRIGGER qa_avatar_commit_failure AFTER UPDATE ON users DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION qa_avatar_commit_failure()');
        try {
          assert.equal((await upload(u)).status, expected);
          assert.equal((await getUser(u.id)).profile_picture, avatar);
          assert.deepEqual(files(), beforeFiles); assert.deepEqual(await db('uploads').orderBy('filename'), ledger);
          assert.deepEqual(fs.readdirSync(path.join(directory, '.staging')), []);
        } finally { await db.raw('DROP TRIGGER qa_avatar_commit_failure ON users'); await db.raw('DROP FUNCTION qa_avatar_commit_failure()'); }
      }
      await call('DELETE', '/api/auth/me/avatar', u.token);
    });
    await t.test('actual JPEG and WebP are accepted by decoded type, independent of the supplied MIME', async () => {
      const u = await user();
      for (const bytes of [await sharp(png).jpeg().withMetadata().toBuffer(), await sharp(png).webp().toBuffer()]) {
        const result = await upload(u, form(bytes, {}, 'application/octet-stream'));
        assert.equal(result.status, 200);
        const meta = await sharp(path.join(directory, path.basename(result.body.user.profile_picture))).metadata();
        assert.equal(meta.format, 'webp'); assert.equal(meta.exif, undefined); assert.equal(meta.icc, undefined);
      }
      assert.equal((await upload(u, form(await sharp(png).gif().toBuffer()))).status, 415);
      const avatar = (await getUser(u.id)).profile_picture;
      assert.equal((await call('PUT', '/api/auth/me', u.token, { display_name: 'Keeps avatar' })).body.user.profile_picture, avatar);
      await call('DELETE', '/api/auth/me/avatar', u.token);
    });
    await t.test('concurrent replace then remove serialize, with no stale upload or quota leak', async () => {
      const u = await user(); const initial = (await upload(u)).body.user.profile_picture;
      const barrier = await db.transaction(); let replacement, removal;
      try {
        await barrier('users').where({ id: u.id }).forUpdate().first();
        replacement = upload(u); await waitLock(/select .*from "users".*for update/i);
        removal = call('DELETE', '/api/auth/me/avatar', u.token); await waitLock(/pg_advisory_xact_lock/);
        await barrier.commit();
        const results = await Promise.all([replacement, removal]);
        assert.deepEqual(results.map(r => r.status), [200, 200]);
        assert.equal((await getUser(u.id)).profile_picture, null);
        assert.equal(fileExists(initial), false); assert.equal(fileExists(results[0].body.user.profile_picture), false);
        assert.equal((await db('uploads').where({ user_id: u.id })).length, 0);
      } finally { if (!barrier.isCompleted()) await barrier.rollback(); await Promise.allSettled([replacement, removal].filter(Boolean)); }
    });
    await t.test('revoked session while waiting for user lock cannot upload or remove', async () => {
      for (const method of ['POST', 'DELETE']) {
        const u = await user(); const avatar = (await upload(u)).body.user.profile_picture;
        const beforeFiles = files(), ledger = await db('uploads').orderBy('filename');
        const barrier = await db.transaction(); let pending;
        try {
          await barrier('users').where({ id: u.id }).forUpdate().first();
          await barrier('sessions').where({ token: u.token }).del();
          pending = call(method, '/api/auth/me/avatar', u.token, method === 'POST' ? form() : undefined);
          await waitLock(/select .*from "users".*for update/i);
          await barrier.commit(); assert.equal((await pending).status, 401);
          assert.equal((await getUser(u.id)).profile_picture, avatar); assert.deepEqual(files(), beforeFiles);
          assert.deepEqual(await db('uploads').orderBy('filename'), ledger);
        } finally { if (!barrier.isCompleted()) await barrier.rollback(); await Promise.allSettled([pending].filter(Boolean)); }
      }
    });
    await t.test('artist upload is independent, and shared settings retain until their final removal', async () => {
      const u = await user('artist'), admin = await user('admin');
      const [artist] = await db('artists').insert({ name: 'Separate portraits', slug: 'separate-portraits', user_id: u.id }).returning('*');
      const gallery = await call('POST', '/api/artists/' + artist.id + '/upload', u.token, form());
      assert.equal(gallery.status, 200);
      const artistBefore = await db('artists').where({ id: artist.id }).first();
      const avatar = (await upload(u)).body.user.profile_picture;
      assert.deepEqual(await db('artists').where({ id: artist.id }).first(), artistBefore);
      await db('system_settings').insert({ key: 'qa_avatar_cover', value: avatar });
      assert.equal((await call('DELETE', '/api/auth/me/avatar', u.token)).status, 200); assert.equal(fileExists(avatar), true);
      assert.equal((await call('PUT', '/api/settings/qa_avatar_cover', admin.token, { value: null })).status, 200);
      assert.equal(fileExists(avatar), false); assert.equal(fileExists(artistBefore.profile_picture), true);
    });
    await t.test('account deletion reclaims avatar unless another current reference retains it', async () => {
      const admin = await user('admin'), u = await user(), other = await user();
      const avatar = (await upload(u)).body.user.profile_picture;
      await db('users').where({ id: other.id }).update({ profile_picture: avatar });
      assert.equal((await call('DELETE', '/api/users/' + u.id, admin.token)).status, 200);
      assert.equal(fileExists(avatar), true); assert.ok(await db('uploads').where({ filename: path.basename(avatar) }).first());
      assert.equal((await call('DELETE', '/api/auth/me/avatar', other.token)).status, 200);
      assert.equal(fileExists(avatar), false); assert.equal(await db('uploads').where({ filename: path.basename(avatar) }).first(), undefined);
      const lone = await user(); const loneAvatar = (await upload(lone)).body.user.profile_picture;
      assert.equal((await call('DELETE', '/api/users/' + lone.id, admin.token)).status, 200);
      assert.equal(fileExists(loneAvatar), false);
    });
  } finally {
    if (server) { const port = server.address().port; await new Promise(r => server.close(r)); await assert.rejects(fetch(`http://127.0.0.1:${port}/`)); t.diagnostic('Disposable HTTP port closed'); }
    await db.destroy(); fs.rmSync(directory, { recursive: true, force: true }); assert.equal(fs.existsSync(directory), false); t.diagnostic('Disposable uploads removed');
  }
});
