import test from "node:test";
import assert from "node:assert/strict";
import { harness, response } from "./harness.js";
import { memoryDb } from "./memory-db.js";
test("ordinary users cannot create events, including after an interleaved downgrade", async () => {
  const db = memoryDb({
    users: [{ id: 1, role: "artist" }],
    sessions: [{ token: "t", user_id: 1, expires_at: "2099-01-01" }],
  });
  const h = await harness({ getDb: async () => db });
  const req = {
    headers: { authorization: "Bearer t" },
    body: { title: "event" },
    params: {},
  };
  const res = response(),
    handlers = h.route("post", "/api/events").handlers;
  for (const fn of handlers.slice(0, -1)) {
    let allowed = false;
    await fn(req, res, () => (allowed = true));
    assert.equal(allowed, true);
  }
  await db("users").where({ id: 1 }).update({ role: "user" });
  await handlers.at(-1)(req, res, (e) => {
    throw e;
  });
  assert.equal(res.code, 403);
  assert.equal((db.state().events || []).length, 0);
});
test("self profile exposes email only to self and saves eligible alert preference timestamps", async () => {
  const user = {
    id: 1,
    username: "u",
    role: "user",
    email: "u@example.com",
    email_verified_at: "2026-01-01",
    email_alerts_opt_in: true,
  };
  const db = memoryDb({ users: [user] });
  const h = await harness({ getDb: async () => db });
  const res = response();
  await h.route("put", "/api/auth/me").handlers.at(-1)(
    { user, body: { email_alerts_opt_in: false } },
    res,
    (e) => {
      throw e;
    },
  );
  assert.equal(res.code, 200);
  assert.equal(res.body.user.email, user.email);
  assert.equal(res.body.user.email_alerts_opt_in, false);
  assert.ok(db.state().users[0].email_alerts_updated_at);
});
test("legacy users cannot opt into email alerts; privilege and verification fields are rejected", async () => {
  for (const body of [
    { email_alerts_opt_in: true },
    { email_alerts_opt_in: "true" },
    { email: "evil@example.com" },
    { role: "admin" },
    { email_verified_at: "now" },
    { terms_version: "new" },
  ]) {
    const user = { id: 1, username: "u", role: "user" };
    const db = memoryDb({ users: [user] });
    const h = await harness({ getDb: async () => db });
    const res = response();
    await h.route("put", "/api/auth/me").handlers.at(-1)(
      { user, body },
      res,
      (e) => {
        throw e;
      },
    );
    assert.equal(res.code, 400);
  }
});
