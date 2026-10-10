import test from "node:test";
import assert from "node:assert/strict";
import fs from 'node:fs';
import { harness } from "./harness.js";
import { createBookingsRouter } from "../bookings.js";
test('production starts and stops its durable dispatcher', () => {
  const source = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(source, /bookingsRouter\.startNotifications\(\)/);
  assert.match(source, /await notificationsStopped/);
  const shutdown = source.slice(source.indexOf('async function shutdown()'));
  assert.ok(shutdown.indexOf('bookingsRouter.stopNotifications()') < shutdown.indexOf('server.close('), 'stop claiming as soon as shutdown begins');
  assert.ok(source.indexOf('bookingsRouter.startNotifications()') > source.indexOf('await initializeDB()'));
});
test("production application mounts public and admin booking routes", async () => {
  const h = await harness({ createBookingsRouter });
  const paths = h.app.middleware
    .flat()
    .flatMap((m) => m?.stack?.map((layer) => layer.route?.path) || []);
  for (const path of [
    "/api/bookings",
    "/api/admin/bookings",
    "/api/admin/bookings/:id",
    "/api/admin/bookings/:id/comments",
    "/api/admin/bookings/:id/retry-notifications",
  ])
    assert.ok(paths.includes(path), path);
});
