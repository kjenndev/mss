import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import knex from 'knex';
import { createBookingsRouter } from '../bookings.js';
import { encryptKey } from '../email-settings.js';
const url = process.env.MSS_BOOKINGS_TEST_URL;
test('durable asynchronous booking dispatcher', { skip: !url, timeout: 60000 }, async t => {
  assert.match(url, /bookings_test\?host=.*mss-bookings-qa\/backend\/pg-/);
  const db = knex({ client: 'pg', connection: url, pool: { min: 0, max: 12 } });
  const env = { EMAIL_SETTINGS_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'), EMAIL_VERIFIED_SENDER_DOMAIN: 'example.com' };
  let now = Date.now(), sent = [], release, transport = async m => { sent.push(m); };
  const timers = new Set();
  const schedule = fn => { timers.add(fn); return fn; };
  const cancel = fn => timers.delete(fn);
  const options = { getDb: async () => db, env, now: () => now, schedule, cancel, sendMail: m => transport(m) };
  let router, server;
  const tick = async () => { const tasks = [...timers]; timers.clear(); await Promise.all(tasks.map(fn => fn())); };
  const input = () => ({ submission_id: crypto.randomUUID(), venue_name: 'Venue', contact_name: 'Person', email: crypto.randomUUID() + '@example.com', phone: '123', message: 'Event', services: [] });
  const call = async (path, body, auth = false, forwarded = '198.51.100.1') => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwarded, ...(auth ? { Authorization: 'Bearer admin' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(2000) });
    return { status: r.status, body: await r.json() };
  };
  try {
    await db.migrate.latest({ directory: new URL('../migrations', import.meta.url).pathname });
    await db.raw('TRUNCATE bookings, users CASCADE');
    await db('booking_rate_limits').del();
    const users = await db('users').insert(Array.from({ length: 23 }, (_, i) => ({ username: 'worker' + i, role: 'admin', password: 'synthetic', email: `worker${i}@example.com` }))).returning('*');
    await db('sessions').insert({ token: 'admin', user_id: users[0].id, expires_at: new Date(now + 86400000) });
    await db('private_email_settings').where({ id: 1 }).update({ enabled: true, from_email: 'sender@example.com', from_name: 'MSS', reply_to: 'support@example.com', public_url: 'https://example.com', api_key_encrypted: encryptKey('synthetic', env) });
    router = createBookingsRouter(options);
    const app = express(); app.use(express.json()); app.use(router);
    server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    await t.test('public receipt does not await provider and all 23 administrators drain automatically', async () => {
      transport = m => new Promise(resolve => { sent.push(m); release = resolve; });
      const r = await call('/api/bookings', input());
      assert.equal(r.status, 201);
      assert.equal(sent.length, 0, 'HTTP does not perform provider IO');
      assert.equal(typeof router.startNotifications, 'function');
      router.startNotifications();
      const working = tick();
      while (!release) await new Promise(r => setTimeout(r, 5));
      const booking = await db('bookings').first();
      const retry = await call(`/api/admin/bookings/${booking.id}/retry-notifications`, {}, true);
      assert.equal(retry.status, 200);
      assert.equal(retry.body.notification.status, 'pending');
      transport = async m => { sent.push(m); };
      release(); await working;
      for (let i = 0; i < 5; i++) await tick();
      assert.equal(sent.length, 23);
      assert.equal(new Set(sent.map(m => m.idempotencyKey)).size, 23);
      assert.equal((await db('booking_notifications').where({ status: 'sent' })).length, 23);
    });
    await t.test('loopback shared proxy admits distinct emails while persistent account and global limits remain', async () => {
      await db('booking_rate_limits').del();
      for (let i = 0; i < 11; i++) assert.equal((await call('/api/bookings', { ...input(), website: 'honeypot' }, false, `198.51.100.${i}`)).status, 201);
      const b = { ...input(), website: 'honeypot' };
      for (let i = 0; i < 5; i++) assert.equal((await call('/api/bookings', b)).status, 201);
      assert.equal((await call('/api/bookings', b)).status, 429);
      await db('booking_rate_limits').where({ key: crypto.createHash('sha256').update('global').digest('hex') }).update({ count: 200 });
      assert.equal((await call('/api/bookings', { ...input(), website: 'honeypot' })).status, 429);
      await db('booking_rate_limits').del();
    });
    await t.test('direct peer retains ten-request budget despite spoofed forwarding headers', async () => {
      await db('booking_rate_limits').del();
      const original = server;
      const app = express(); app.use(express.json());
      app.use((req, res, next) => { Object.defineProperty(req.socket, 'remoteAddress', { value: '198.51.100.50', configurable: true }); next(); });
      app.use(createBookingsRouter(options));
      server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
      try {
        for (let i = 0; i < 10; i++) assert.equal((await call('/api/bookings', { ...input(), website: 'honeypot' }, false, `198.51.100.${i}`)).status, 201);
        assert.equal((await call('/api/bookings', { ...input(), website: 'honeypot' }, false, '127.0.0.1')).status, 429);
      } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); server = original; await db('booking_rate_limits').del(); }
    });
    await t.test('startup recovers pending and expired leases; independent dispatchers and retries do not duplicate', async () => {
      await router.stopNotifications();
      await call('/api/bookings', input());
      const pending = await db('booking_notifications').where({ status: 'pending' });
      await db('booking_notifications').where({ id: pending[0].id }).update({ status: 'sending', attempts: 1, first_attempt_at: new Date(now), lease_until: new Date(now - 1) });
      const other = createBookingsRouter(options);
      const count = sent.length;
      router.startNotifications(); other.startNotifications();
      try {
        await Promise.all([tick(), call(`/api/admin/bookings/${pending[0].booking_id}/retry-notifications`, {}, true)]);
        for (let i = 0; i < 5; i++) await tick();
        assert.equal(sent.length - count, 23);
        assert.equal(new Set(sent.map(m => m.idempotencyKey)).size, sent.length);
      } finally { await other.stopNotifications(); }
    });
    await t.test('failures back off durably, preserve frozen identity and stop at three attempts or 23 hours', async () => {
      transport = async m => { sent.push(m); throw Error('private provider failure'); };
      await call('/api/bookings', input());
      await tick(); await tick();
      const rows = await db('booking_notifications').where({ status: 'failed' });
      assert.equal(rows.length, 23); assert.ok(rows.every(r => r.attempts === 1));
      const count = sent.length;
      const waiting = await call(`/api/admin/bookings/${rows[0].booking_id}`, undefined, true);
      assert.equal(waiting.body.notification.retry_scheduled, true);
      assert.match(waiting.body.notification.message, /automatically|backoff/);
      for (let i = 0; i < 3; i++) await tick();
      assert.equal(sent.length, count);
      await call(`/api/admin/bookings/${rows[0].booking_id}/retry-notifications`, {}, true); await tick();
      assert.equal(sent.length, count, 'manual retries cannot bypass backoff');
      await db('private_email_settings').where({ id: 1 }).update({ api_key_encrypted: encryptKey('rotated', env), from_name: 'Changed' });
      now += 60001; for (let i = 0; i < 3; i++) await tick();
      assert.equal(sent.length, count + 23);
      assert.ok(sent.slice(-23).every(m => m.apiKey === 'synthetic' && m.settings.from_name === 'MSS'));
      now += 300001; for (let i = 0; i < 3; i++) await tick();
      assert.ok((await db('booking_notifications').where({ booking_id: rows[0].booking_id })).every(r => r.attempts === 3));
      const exhausted = await call(`/api/admin/bookings/${rows[0].booking_id}`, undefined, true);
      assert.equal(exhausted.body.notification.can_retry, false); assert.match(exhausted.body.notification.message, /manual|limit/);
      await db('booking_notifications').where({ id: rows[0].id }).update({ attempts: 1, first_attempt_at: new Date(now - 23 * 3600000), lease_until: null });
      const end = sent.length; await tick(); assert.equal(sent.length, end);
      await db('booking_notifications').where({ booking_id: rows[0].booking_id }).update({ status: 'sending', attempts: 3, lease_until: new Date(now - 1) });
      const expired = await call(`/api/admin/bookings/${rows[0].booking_id}`, undefined, true);
      assert.equal(expired.body.notification.status, 'failed', 'exhausted expired leases must not look perpetually in progress');
      assert.equal(expired.body.notification.retry_scheduled, false);
    });
    await t.test('dispatcher uses auth-compatible user-before-booking lock order', async () => {
      await call('/api/bookings', input());
      const pending = await db('booking_notifications').where({ status: 'pending' }).first();
      const barrier = await db.transaction();
      let work;
      try {
        await barrier('users').where({ id: users[0].id }).forUpdate().first();
        work = tick();
        let blocked = false;
        for (let i = 0; i < 200; i++) {
          const { rows } = await db.raw("SELECT query FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%users%for share%'");
          if (rows.length) { blocked = true; break; }
          await new Promise(r => setTimeout(r, 5));
        }
        assert.equal(blocked, true);
        await barrier('bookings').where({ id: pending.booking_id }).forUpdate().noWait().first();
      } finally { await barrier.rollback(); await work; for (let i = 0; i < 3; i++) await tick(); }
    });
    await t.test('recipient role is revalidated under a lock during claims', async () => {
      transport = async m => { sent.push(m); };
      await call('/api/bookings', input());
      const barrier = await db.transaction();
      await barrier('users').where({ id: users[1].id }).update({ role: 'user' });
      const before = sent.length;
      const work = tick();
      await new Promise(r => setTimeout(r, 50));
      await barrier.commit(); await work;
      for (let i = 0; i < 5; i++) await tick();
      assert.equal(sent.slice(before).some(m => m.email === users[1].email), false);
      assert.equal(sent.length - before, 22);
    });
    await t.test('actual frontend helper receives receipts and retries promptly during two eight-second sends', async () => {
      let calls = 0;
      transport = async m => { sent.push(m); if (++calls <= 2) await new Promise(r => setTimeout(r, 8000)); };
      const originalStorage = globalThis.localStorage;
      globalThis.localStorage = { getItem: key => key === 'mss-token' ? 'admin' : 'admin' };
      try {
        const source = fs.readFileSync(new URL('../../mss-web/src/Data.Helper.Api.js', import.meta.url), 'utf8').replace("import { API_BASE } from './config';", `const API_BASE = 'http://127.0.0.1:${server.address().port}/api';`);
        const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
        const b = input(), start = performance.now();
        assert.equal((await api.SubmitBooking(b)).status, 201);
        assert.ok(performance.now() - start < 2000, 'actual 15s-timeout helper receives immediate receipt');
        const work = tick();
        while (!calls) await new Promise(r => setTimeout(r, 5));
        const saved = await db('bookings').where({ submission_id: b.submission_id }).first();
        const retryStart = performance.now();
        assert.equal((await api.RetryBookingNotifications(saved.id)).status, 200);
        assert.ok(performance.now() - retryStart < 2000);
        await work; for (let i = 0; i < 3; i++) await tick();
        assert.equal(calls, 22);
      } finally { if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage; }
    });
    await t.test('shutdown cancels scheduling and waits only for the current claim, leaving pending work for restart', async () => {
      let finish;
      transport = m => new Promise(resolve => { sent.push(m); finish = resolve; });
      await call('/api/bookings', input());
      const work = tick();
      while (!finish) await new Promise(r => setTimeout(r, 5));
      const stopped = router.stopNotifications();
      finish(); await work; await stopped;
      assert.equal(timers.size, 0);
      assert.ok((await db('booking_notifications').where({ status: 'pending' })).length > 0);
      transport = async m => { sent.push(m); };
      router.startNotifications(); for (let i = 0; i < 3; i++) await tick();
      assert.equal((await db('booking_notifications').where({ status: 'pending' })).length, 0);
    });
  } finally {
    release?.();
    await router?.stopNotifications?.();
    if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
    await db.destroy();
  }
});
