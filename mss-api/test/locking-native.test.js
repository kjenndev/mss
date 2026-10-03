import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import knex from 'knex';
import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { harness } from './harness.js';
import { createRegistrationRouter } from '../registration.js';

const database = process.env.MSS_REGISTRATION_TEST_DB;
const latch = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('native PostgreSQL surrounding auth lock ordering', { skip: !database, timeout: 30000 }, async t => {
  assert.match(database, /^mss_registration_test_[a-z0-9_]+$/);
  const db = knex({ client: 'pg', connection: { host: '/var/run/postgresql', user: 'postgres', database }, pool: { min: 0, max: 10 } });
  const sqlErrors = [];
  db.on('query-error', error => { sqlErrors.push(error.code); t.diagnostic('PostgreSQL SQLSTATE: ' + error.code); });
  let server;
  const passwordEntered = latch(), releasePassword = latch();
  let pauseLogin = false;
  try {
    await db.migrate.latest({ directory: new URL('../migrations', import.meta.url).pathname });
    const verifyPassword = async (password, hash) => {
      if (pauseLogin) { passwordEntered.resolve(); await releasePassword.promise; }
      return hash === 'hash:' + password;
    };
    const h = await harness({ getDb: async () => db, verifyPassword, uuidv4: () => crypto.randomUUID() });
    const app = express(); app.use(express.json());
    for (const [method, path] of [['post', '/api/auth/login'], ['put', '/api/users/:id'], ['delete', '/api/users/:id']]) {
      app[method](path, ...h.route(method, path).handlers);
    }
    app.use(createRegistrationRouter({ getDb: async () => db, verifyPassword,
      hashPassword: async () => { throw Error('Unexpected password write'); },
      sendMail: async () => { throw Error('Unexpected mail'); }, env: { NODE_ENV: 'test' } }));
    app.use(h.app.middleware.flat().find(f => typeof f === 'function' && f.length === 4));
    server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    const call = async (method, path, token, body) => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000)
      });
      return { status: r.status, body: await r.json() };
    };
    const user = async (username, role = 'user') => (await db('users').insert({ username, role, password: 'hash:Valid123' }).returning('*'))[0];
    const session = async (id, expires_at = new Date(Date.now() + 3600000)) => {
      const token = crypto.randomUUID(); await db('sessions').insert({ token, user_id: id, expires_at }); return token;
    };
    const waitLock = async (pattern, event) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const rows = await db('pg_stat_activity').select('query', 'wait_event').whereRaw('datname = current_database()').where({ wait_event_type: 'Lock' });
        const row = rows.find(r => pattern.test(r.query) && (!event || r.wait_event === event));
        if (row) { t.diagnostic(`Observed ${row.wait_event}: ${row.query}`); return row; }
        await delay(10);
      }
      assert.fail('Expected native PostgreSQL lock wait: ' + pattern);
    };

    await t.test('login never deletes another account expired session held by admin edit', async () => {
      const admin = await user('ExpiryAdmin', 'admin'), target = await user('ExpiryTarget');
      const expiry = new Date(Date.now() + 2000), token = await session(admin.id, expiry);
      const oldOwn = await session(target.id, new Date(Date.now() - 10000));
      const activeOwn = await session(target.id);
      pauseLogin = true;
      let login, edit;
      try {
        login = call('POST', '/api/auth/login', null, { username: target.username, password: 'Valid123' });
        await passwordEntered.promise; // Actual login has acquired target user FOR UPDATE.
        edit = call('PUT', '/api/users/' + target.id, token, { display_name: 'Edited while login waits' });
        await waitLock(/select .*from "users".*for update/i);
        await delay(Math.max(0, expiry.getTime() - Date.now() + 30));
        releasePassword.resolve();
        const results = await Promise.all([login, edit]);
        assert.deepEqual(results.map(r => r.status), [200, 200], JSON.stringify(results));
        assert.equal((await db('users').where({ id: target.id }).first()).display_name, 'Edited while login waits');
        assert.equal(await db('sessions').where({ token: oldOwn }).first(), undefined);
        assert.ok(await db('sessions').where({ token: activeOwn }).first());
        assert.equal((await db('sessions').where({ user_id: target.id })).length, 2);
        assert.ok(await db('sessions').where({ token }).first(), 'login must not collect another account session');
        const created = await db('sessions').where({ token: results[0].body.token }).first();
        assert.ok(new Date(created.expires_at).getTime() > Date.now());
        assert.ok(new Date(created.expires_at).getTime() <= Date.now() + 86400000);
      } finally { pauseLogin = false; releasePassword.resolve(); await Promise.allSettled([login, edit].filter(Boolean)); }
    });

    await t.test('admin deletion locks target user before sessions against standalone authentication', async () => {
      const admin = await user('DeleteAdmin', 'admin'), target = await user('DeleteTarget', 'admin');
      const adminToken = await session(admin.id), targetToken = await session(target.id);
      // Gate the actual DELETE after it takes the session tuple lock, not a memory query double.
      await db.raw(`CREATE FUNCTION qa_pause_session_delete() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF OLD.user_id = ${Number(target.id)} THEN PERFORM pg_advisory_xact_lock(917341); END IF; RETURN OLD; END $$`);
      await db.raw('CREATE TRIGGER qa_session_delete AFTER DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION qa_pause_session_delete()');
      const barrier = await db.transaction();
      let deletion, registration;
      try {
        await barrier.raw('SELECT pg_advisory_xact_lock(917341)');
        deletion = call('DELETE', '/api/users/' + target.id, adminToken);
        await waitLock(/delete from "sessions"/i, 'advisory');
        registration = call('PUT', '/api/admin/email-settings', targetToken, {
          enabled: false, from_email: '', from_name: '', reply_to: '', public_url: ''
        });
        // Broken order waits on sessions; fixed order waits on users. Both are observed, not timed guesses.
        await waitLock(/select .*from "(?:users|sessions)".*for update/i);
        await barrier.commit();
        const results = await Promise.all([deletion, registration]);
        assert.deepEqual(results.map(r => r.status), [200, 401], JSON.stringify(results));
        assert.equal(await db('users').where({ id: target.id }).first(), undefined);
        assert.equal((await db('sessions').where({ user_id: target.id })).length, 0);
      } finally {
        if (!barrier.isCompleted()) await barrier.rollback();
        await Promise.allSettled([deletion, registration].filter(Boolean));
        await db.raw('DROP TRIGGER qa_session_delete ON sessions');
        await db.raw('DROP FUNCTION qa_pause_session_delete()');
      }
    });
    assert.deepEqual(sqlErrors, [], 'no deadlocks or other PostgreSQL errors');
  } finally {
    releasePassword.resolve();
    if (server) {
      const port = server.address().port;
      await new Promise(r => server.close(r));
      await assert.rejects(fetch(`http://127.0.0.1:${port}/`));
      t.diagnostic('Disposable HTTP port closed');
    }
    await db.destroy();
  }
});
