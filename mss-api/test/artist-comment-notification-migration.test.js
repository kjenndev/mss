import test from 'node:test';
import assert from 'node:assert/strict';
import { up } from '../migrations/20261021010000_artist_comment_notifications.js';

test('artist comment notifications extend the existing durable mail outbox with exclusive cascade targets', async () => {
  let sql = '';
  await up({ raw: async value => { sql = value; } });
  assert.match(sql, /ALTER TABLE booking_notifications ALTER COLUMN booking_id DROP NOT NULL/i);
  assert.match(sql, /comment_id integer REFERENCES comments\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /CHECK.*booking_id IS NOT NULL.*comment_id IS NOT NULL/is);
  assert.match(sql, /UNIQUE INDEX.*comment_id.*email/is);
});
