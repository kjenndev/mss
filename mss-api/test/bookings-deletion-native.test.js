import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import knex from 'knex';
import { createBookingsRouter } from '../bookings.js';
import { encryptKey } from '../email-settings.js';
const url = process.env.MSS_BOOKINGS_TEST_URL;
test('permanent booking deletion in disposable PostgreSQL', { skip: !url, timeout: 60000 }, async t => {
  assert.match(url, /bookings_test\?host=.*mss-bookings-qa\/backend\/pg-/);
  const db = knex({ client: 'pg', connection: url, pool: { min: 0, max: 12 } });
  let server, router;
  const env = { EMAIL_SETTINGS_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'), EMAIL_VERIFIED_SENDER_DOMAIN: 'example.com' };
  let transport = async () => { throw Error('No real mail'); };
  const fixture = async () => {
    const id = crypto.randomUUID();
    await db('bookings').insert({ id, reference: 'MSS-' + id.slice(0, 12), submission_id: crypto.randomUUID(), submission_hash: 'a'.repeat(64), venue_name: 'Synthetic venue', contact_name: 'Person', phone: '555', email: 'request@example.com', location: '', event_type: '', budget: '', services: '[]', message: 'Synthetic request' });
    await db('booking_comments').insert({ id: crypto.randomUUID(), booking_id: id, submission_id: crypto.randomUUID(), author_name: 'Historical', content: 'Private synthetic note' });
    await db('booking_notifications').insert({ id: crypto.randomUUID(), booking_id: id, email: 'admin@example.com' });
    return id;
  };
  const call = async (id, token = 'admin', method = 'DELETE', body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/bookings/${id}`, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
    return { status: r.status, text: await r.text() };
  };
  try {
    await db.migrate.latest({ directory: new URL('../migrations', import.meta.url).pathname });
    await db.raw('TRUNCATE bookings, users CASCADE');
    const [admin] = await db('users').insert({ username: 'delete-admin', role: 'admin', password: 'synthetic', email: 'admin@example.com' }).returning('*');
    await db('sessions').insert({ token: 'admin', user_id: admin.id, expires_at: new Date(Date.now() + 3600000) });
    router = createBookingsRouter({ getDb: async () => db, env, sendMail: m => transport(m) });
    const app = express(); app.use(express.json()); app.use(router);
    server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    await t.test('deletes only the target and its comments/outbox with existing cascades', async () => {
      const id = await fixture(), other = await fixture();
      const before = {};
      for (const table of ['users', 'sessions', 'booking_rate_limits', 'private_email_settings']) before[table] = await db(table);
      const unrelated = {};
      for (const table of ['booking_comments', 'booking_notifications']) unrelated[table] = await db(table).where({ booking_id: other });
      assert.equal((await call(id)).status, 200);
      assert.equal(await db('bookings').where({ id }).first(), undefined);
      for (const table of ['booking_comments', 'booking_notifications']) {
        assert.equal((await db(table).where({ booking_id: id })).length, 0);
        assert.deepEqual(await db(table).where({ booking_id: other }), unrelated[table]);
      }
      assert.ok(await db('bookings').where({ id: other }).first());
      for (const table of Object.keys(before)) assert.deepEqual(await db(table), before[table]);
      assert.equal((await call(id)).status, 404);
    });
    await t.test('rejects guest, forged, expired, nonadmin, disabled and invalid/missing targets', async () => {
      const id = await fixture();
      for (const role of ['user', 'artist', 'disabled']) {
        const [u] = await db('users').insert({ username: role, password: 'synthetic', role: role === 'disabled' ? 'admin' : role, is_disabled: role === 'disabled' ? 1 : 0 }).returning('*');
        await db('sessions').insert({ token: role, user_id: u.id, expires_at: new Date(Date.now() + 3600000) });
        assert.equal((await call(id, role)).status, 403);
      }
      await db('sessions').insert({ token: 'expired', user_id: admin.id, expires_at: new Date(0) });
      for (const token of ['', 'forged', 'expired']) assert.equal((await call(id, token)).status, 401);
      for (const value of ['bad', '0', '1', '00000000-0000-0000-0000-000000000000']) assert.equal((await call(value)).status, 400);
      assert.equal((await call(crypto.randomUUID())).status, 404);
      assert.ok(await db('bookings').where({ id }).first());
    });
    await t.test('concurrent duplicate deletion commits once and returns missing on the second request', async () => {
      const id = await fixture();
      const results = await Promise.all([call(id), call(id)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 404]);
      assert.equal(await db('bookings').where({ id }).first(), undefined);
    });
    const waitForLock = async pattern => {
      for (let i = 0; i < 400; i++) {
        const { rows } = await db.raw("SELECT query FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ?", [pattern]);
        if (rows.length) return;
        await new Promise(r => setTimeout(r, 5));
      }
      assert.fail('Expected observed PostgreSQL lock wait: ' + pattern);
    };
    for (const change of ['logout', 'role', 'disabled']) await t.test('revalidates ' + change + ' after waiting on the actor lock', async () => {
      const id = await fixture(), barrier = await db.transaction();
      let work;
      try {
        await barrier('users').where({ id: admin.id }).forUpdate().first();
        if (change === 'logout') await barrier('sessions').where({ token: 'admin' }).del();
        else await barrier('users').where({ id: admin.id }).update(change === 'role' ? { role: 'user' } : { is_disabled: 1 });
        work = call(id);
        await waitForLock('%users%for update%');
        await barrier.commit();
        assert.equal((await work).status, change === 'logout' ? 401 : 403);
        assert.ok(await db('bookings').where({ id }).first());
      } finally {
        await barrier.rollback(); await work;
        await db('users').where({ id: admin.id }).update({ role: 'admin', is_disabled: 0 });
        await db('sessions').insert({ token: 'admin', user_id: admin.id, expires_at: new Date(Date.now() + 3600000) }).onConflict('token').ignore();
      }
    });
    await t.test('rolls back all cascade deletions on commit failure', async () => {
      const id = await fixture(), before = {};
      for (const table of ['bookings', 'booking_comments', 'booking_notifications']) before[table] = await db(table).orderBy('id');
      await db.raw("CREATE FUNCTION refuse_booking_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE CONSTRAINT TRIGGER refuse_delete AFTER DELETE ON bookings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION refuse_booking_delete()");
      try {
        assert.equal((await call(id)).status, 503);
        for (const table of Object.keys(before)) assert.deepEqual(await db(table).orderBy('id'), before[table]);
      } finally { await db.raw('DROP TRIGGER refuse_delete ON bookings; DROP FUNCTION refuse_booking_delete()'); }
    });
    for (const operation of ['comments', 'retry-notifications']) await t.test('serializes deletion with concurrent ' + operation, async () => {
      const id = await fixture(), barrier = await db.transaction();
      let deletion, mutation;
      try {
        await barrier('bookings').where({ id }).forUpdate().first();
        deletion = call(id);
        await waitForLock('%bookings%for update%');
        mutation = call(id + '/' + operation, 'admin', 'POST', operation === 'comments' ? { content: 'Race note', submission_id: crypto.randomUUID() } : {});
        await waitForLock('%users%for update%');
        await barrier.commit();
        assert.equal((await deletion).status, 200);
        assert.equal((await mutation).status, 404);
        for (const table of ['booking_comments', 'booking_notifications']) assert.equal((await db(table).where({ booking_id: id })).length, 0);
      } finally { await barrier.rollback(); await Promise.all([deletion, mutation]); }
    });
    for (const outcome of ['accepted', 'failed']) await t.test('deletion during a provider flight (' + outcome + ') skips stale candidates and never recreates mail', async () => {
      await db('booking_notifications').del();
      const id = await fixture();
      await db('users').insert({ username: 'second', role: 'admin', password: 'synthetic', email: 'second@example.com' }).onConflict().ignore();
      await db('booking_notifications').insert({ id: crypto.randomUUID(), booking_id: id, email: 'second@example.com' });
      await db('private_email_settings').where({ id: 1 }).update({ enabled: true, from_email: 'sender@example.com', from_name: 'MSS', reply_to: 'support@example.com', public_url: 'https://example.com', api_key_encrypted: encryptKey('synthetic', env) });
      let release, entered;
      const started = new Promise(r => { entered = r; });
      let sends = 0;
      transport = async () => { sends++; entered(); await new Promise(r => { release = r; }); if (outcome === 'failed') throw Error('Synthetic provider rejection'); };
      const work = router.dispatchNotifications(id);
      try {
        await started;
        assert.equal((await call(id)).status, 200);
      } finally { release?.(); }
      await work;
      assert.equal(sends, 1);
      assert.equal((await db('booking_notifications').where({ booking_id: id })).length, 0);
      await router.dispatchNotifications(id);
      assert.equal(sends, 1);
    });
  } finally {
    await router?.stopNotifications();
    if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
    await db.destroy();
  }
});
