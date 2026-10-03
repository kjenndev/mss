import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.js';
test('self avatar routes exist behind authentication', async () => {
 const h = await harness();
 for (const method of ['post', 'delete']) {
  const route = h.route(method, '/api/auth/me/avatar');
  assert.ok(route, method + ' self avatar route');
 }
});
