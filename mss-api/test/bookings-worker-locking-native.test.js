import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import knex from 'knex';
import { harness } from './harness.js';
import { createBookingsRouter } from '../bookings.js';
import { encryptKey } from '../email-settings.js';

const url = process.env.MSS_BOOKINGS_TEST_URL;
test('booking claims coexist with account mutations', { skip: !url, timeout: 30000 }, async t => {
  assert.match(url, /bookings_test\?host=.*mss-bookings-qa\/backend\/pg-/);
  const db = knex({ client: 'pg', connection: url, pool: { min: 0, max: 12 } });
  const env = { EMAIL_SETTINGS_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'), EMAIL_VERIFIED_SENDER_DOMAIN: 'example.com' };
  let now = Date.now(), transport = async () => {}, server;
  const options = { getDb: async () => db, env, now: () => now, sendMail: m => transport(m) };
  const router = createBookingsRouter(options), other = createBookingsRouter(options);
  const sqlErrors = [];
  db.on('query-error', e => sqlErrors.push(e.code));
  const waitLock = async pattern => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await db('pg_stat_activity').select('query').whereRaw('datname = current_database()').where({ wait_event_type: 'Lock' });
      if (rows.some(r => pattern.test(r.query))) return;
      await new Promise(r => setTimeout(r, 5));
    }
    assert.fail('Expected PostgreSQL lock wait: ' + pattern);
  };
  try {
    await db.migrate.latest({ directory: new URL('../migrations', import.meta.url).pathname });
    await db.raw('TRUNCATE bookings, users CASCADE');
    await db('booking_rate_limits').del();
    const users = await db('users').insert([
      { username: 'lower', password: 'fixture', role: 'admin', email: 'lower@example.com' },
      { username: 'higher', password: 'fixture', role: 'admin', email: 'higher@example.com' },
    ]).returning('*');
    assert.ok(users[1].id > users[0].id);
    await db('sessions').insert({ token: 'review', user_id: users[1].id, expires_at: new Date(now + 86400000) });
    await db('private_email_settings').where({ id: 1 }).update({ enabled: true, from_email: 'sender@example.com', from_name: 'MSS', reply_to: 'support@example.com', public_url: 'https://example.com', api_key_encrypted: encryptKey('fixture', env) });
    const h = await harness({ getDb: async () => db });
    const app = express(); app.use(express.json()); app.use(router);
    app.put('/api/users/:id', ...h.route('put', '/api/users/:id').handlers);
    app.use(h.app.middleware.flat().find(f => typeof f === 'function' && f.length === 4));
    server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    const call = async (path, body, auth = false, method = 'POST') => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer review' } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      return { status: r.status, body: await r.json() };
    };
    const booking = async () => {
      const submission_id = crypto.randomUUID();
      assert.equal((await call('/api/bookings', { submission_id, venue_name: 'Venue', contact_name: 'Person', email: submission_id + '@example.com', phone: '123', message: 'Review', services: [] })).status, 201);
      return db('bookings').where({ submission_id }).first();
    };
    await t.test('higher-ID actor demotes lower-ID target while actual dispatcher claims: both commit without deadlock', async () => {
      const b = await booking(), emails = [];
      transport = async m => emails.push(m.email);
      const barrier = await db.transaction();
      let edit, work;
      try {
        // Pause the real account endpoint after its advisory and actor-user locks,
        // at session revalidation, before it takes the lower-ID target lock.
        await barrier('sessions').where({ token: 'review' }).forUpdate().first();
        edit = call('/api/users/' + users[0].id, { role: 'user' }, true, 'PUT');
        await waitLock(/select .*from "sessions".*for update/i);
        work = router.dispatchNotifications(b.id).then(() => ({ ok: true }), e => ({ code: e.code }));
        // Old code waits on higher-ID user after locking lower-ID FOR SHARE.
        // Fixed code waits on the mutation advisory BEFORE taking any user lock.
        await waitLock(/users.*for share|pg_advisory_xact_lock\(1297306453\)/i);
        await barrier.commit();
        const [account, dispatcher] = await Promise.all([edit, work]);
        t.diagnostic(JSON.stringify({ account: account.status, dispatcher, sqlErrors }));
        assert.equal(account.status, 200, JSON.stringify(account));
        assert.deepEqual(dispatcher, { ok: true });
        assert.deepEqual(sqlErrors, [], 'neither transaction may be a deadlock victim');
        assert.equal((await db('users').where({ id: users[0].id }).first()).role, 'user');
        assert.deepEqual(emails, [users[1].email]);
        const rows = await db('booking_notifications').where({ booking_id: b.id });
        assert.equal(rows.find(r => r.email === users[0].email).status, 'unavailable');
        assert.equal(rows.find(r => r.email === users[1].email).status, 'sent');
      } finally {
        if (!barrier.isCompleted()) await barrier.rollback();
        await Promise.allSettled([edit, work].filter(Boolean));
        await db('users').where({ id: users[0].id }).update({ role: 'admin' });
      }
    });
    await t.test('stale failed completion cannot overwrite a newer successful lease', async () => {
      const b = await booking();
      await db('booking_notifications').where({ booking_id: b.id, email: users[1].email }).del();
      let rejectFirst, started, count = 0;
      const gate = new Promise(r => { started = r; });
      transport = async () => { if (++count === 1) { started(); return new Promise((_, reject) => { rejectFirst = reject; }); } };
      const first = router.dispatchNotifications(b.id);
      await gate; now += 60001;
      try { await other.dispatchNotifications(b.id); }
      finally { rejectFirst(Error('stale failure')); await first; }
      const row = await db('booking_notifications').where({ booking_id: b.id }).first();
      assert.equal(row.status, 'sent'); assert.equal(row.attempts, 2);
    });
    await t.test('queued authorized retry followed by requester demotion sends only to remaining admin', async () => {
      const b = await booking();
      assert.equal((await call(`/api/admin/bookings/${b.id}/retry-notifications`, {}, true)).status, 200);
      await db('users').where({ id: users[1].id }).update({ role: 'user' });
      const emails = []; transport = async m => emails.push(m.email);
      await router.dispatchNotifications(b.id);
      assert.deepEqual(emails, [users[0].email]);
      assert.equal((await call(`/api/admin/bookings/${b.id}/retry-notifications`, {}, true)).status, 403);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
    await db.destroy();
  }
});
