import test from 'node:test';
import assert from 'node:assert/strict';
import * as bookings from '../bookings.js';
test('IP budget uses only a meaningful direct socket peer, never forwarded identity', () => {
  assert.equal(typeof bookings.bookingPeer, 'function');
  for (const address of ['127.0.0.1', '127.9.2.3', '::1', '::ffff:127.0.0.1', undefined])
    assert.equal(bookings.bookingPeer({ socket: { remoteAddress: address }, ip: '198.51.100.9', headers: { 'x-forwarded-for': '198.51.100.9' } }), null);
  for (const address of ['198.51.100.1', '::ffff:198.51.100.1', '2001:db8::1'])
    assert.equal(bookings.bookingPeer({ socket: { remoteAddress: address }, ip: '127.0.0.1', headers: { 'x-forwarded-for': '127.0.0.1' } }), address);
});
