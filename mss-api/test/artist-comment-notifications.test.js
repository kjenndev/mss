import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response } from './harness.js';
import { memoryDb } from './memory-db.js';
import { createBookingsRouter } from '../bookings.js';
import { encryptKey } from '../email-settings.js';

function fixture() {
  return memoryDb({
    users: [
      { id: 7, username: 'Commenter', role: 'user' },
      { id: 8, username: 'ArtistOwner', role: 'artist', email: 'artist@example.com', email_verified_at: '2026-01-01', email_alerts_opt_in: true },
    ],
    sessions: [{ token: 'valid', user_id: 7, expires_at: '2099-01-01' }],
    artists: [{ id: 1, name: 'Target Artist', user_id: 8 }],
    events: [{ id: 1, title: 'Target Event' }],
    comments: [],
  });
}

async function invoke(h, body, token = 'valid') {
  const req = { body, headers: { authorization: `Bearer ${token}` }, ip: 'comment-notification-test' };
  const res = response();
  for (const handler of h.route('post', '/api/comments').handlers) {
    let next = false;
    await handler(req, res, error => { if (error) throw error; next = true; });
    if (!next) break;
  }
  return res;
}

function injectedOutbox(calls) {
  const router = {
    queueArtistCommentNotification: async (...args) => { calls.push(args); return true; },
    wakeNotifications() {},
    startNotifications() {},
    async stopNotifications() {},
  };
  return () => router;
}

test('authenticated artist-profile comments enqueue through the injected outbox while event comments do not', async () => {
  const calls = [];
  const db = fixture();
  const h = await harness({ getDb: async () => db, createBookingsRouter: injectedOutbox(calls) });

  const artist = await invoke(h, { content: 'Artist hello', artist_id: 1 });
  assert.equal(artist.code, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].id, artist.body.comment.id);
  assert.equal(calls[0][2].id, 1);
  assert.equal(calls[0][3].id, 7);

  const event = await invoke(h, { content: 'Event hello', event_id: 1 });
  assert.equal(event.code, 201);
  assert.equal(calls.length, 1);
});

test('unauthorized comments cannot enqueue artist notifications', async () => {
  const calls = [];
  const db = fixture();
  const h = await harness({ getDb: async () => db, createBookingsRouter: injectedOutbox(calls) });

  const result = await invoke(h, { content: 'No session', artist_id: 1 }, 'invalid');
  assert.equal(result.code, 401);
  assert.equal(calls.length, 0);
  assert.equal(db.state().comments.length, 0);
});

test('outbox resolves only the enabled verified target artist owner and skips self-comments', async () => {
  const db = memoryDb({
    users: [
      { id: 7, username: 'Commenter', role: 'user' },
      { id: 8, username: 'Owner', role: 'artist', email: '  Artist@Example.COM ', email_verified_at: '2026-01-01', email_alerts_opt_in: true, is_disabled: 0 },
      { id: 9, username: 'NoAlerts', role: 'artist', email: 'off@example.com', email_verified_at: '2026-01-01', email_alerts_opt_in: false, is_disabled: 0 },
    ],
    booking_notifications: [],
  });
  const router = createBookingsRouter({ getDb: async () => db, sendMail: async () => { throw Error('network must not run while queueing'); } });
  const comment = { id: 31, artist_id: 1, author_name: 'Commenter', content: 'Hello' };

  assert.equal(await router.queueArtistCommentNotification(db, comment, { id: 1, name: 'Target', user_id: 8 }, db.state().users[0]), true);
  assert.deepEqual(db.state().booking_notifications.map(row => ({ comment_id: row.comment_id, email: row.email, booking_id: row.booking_id })), [
    { comment_id: 31, email: 'artist@example.com', booking_id: null },
  ]);

  assert.equal(await router.queueArtistCommentNotification(db, { ...comment, id: 32 }, { id: 1, name: 'Target', user_id: 7 }, db.state().users[0]), false);
  assert.equal(await router.queueArtistCommentNotification(db, { ...comment, id: 33 }, { id: 2, name: 'No alerts', user_id: 9 }, db.state().users[0]), false);
  assert.equal(db.state().booking_notifications.length, 1);
});

test('provider failure leaves the comment committed and marks its durable outbox row for retry', async () => {
  const env = {
    EMAIL_SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    EMAIL_VERIFIED_SENDER_DOMAIN: 'example.com',
    NODE_ENV: 'production',
  };
  const db = memoryDb({
    users: [{ id: 8, username: 'Owner', role: 'artist', email: 'artist@example.com', email_verified_at: '2026-01-01', email_alerts_opt_in: true, is_disabled: 0 }],
    artists: [{ id: 1, name: 'Target <Artist>', user_id: 8 }],
    comments: [{ id: 41, artist_id: 1, user_id: 7, author_name: 'Reader & Friend', content: 'A <useful> comment' }],
    private_email_settings: [{ id: 1, enabled: true, from_email: 'sender@example.com', from_name: 'MSS', reply_to: 'support@midnightsoundsyndicate.com', public_url: 'https://example.com', api_key_encrypted: encryptKey('synthetic-key', env) }],
    booking_notifications: [{ id: 'comment-mail-1', booking_id: null, comment_id: 41, email: 'artist@example.com', status: 'pending', attempts: 0 }],
  });
  const attempts = [];
  const router = createBookingsRouter({
    getDb: async () => db,
    env,
    now: () => Date.parse('2026-10-21T12:00:00Z'),
    sendMail: async message => { attempts.push(message); throw Error('synthetic provider failure'); },
  });

  await router.dispatchOutboxNotification('comment-mail-1');

  assert.equal(db.state().comments.length, 1, 'delivery cannot roll back the posted comment');
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].email, 'artist@example.com');
  assert.match(attempts[0].message.html, /Target &lt;Artist&gt;/);
  assert.match(attempts[0].message.text, /A <useful> comment/);
  const row = db.state().booking_notifications[0];
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 1);
  assert.ok(new Date(row.lease_until).getTime() > Date.parse('2026-10-21T12:00:00Z'));
  assert.ok(db.locks.indexOf('users') < db.locks.indexOf('booking_notifications'), 'recipient user locks before the outbox row');
});
