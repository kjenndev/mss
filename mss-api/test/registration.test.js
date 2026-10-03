import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
test("registration is unavailable without configured mail", async () => {
  const { createRegistrationRouter } = await import("../registration.js");
  const app = express();
  app.use(express.json());
  app.use(
    createRegistrationRouter({
      getDb: async () => {
        throw Error("unexpected database");
      },
      env: {},
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.deepEqual(
      await fetch(base + "/api/auth/registration-config").then((r) => r.json()),
      {
        enabled: false,
        terms_version: "2026-10-03",
        privacy_version: "2026-10-03",
      },
    );
    assert.equal(
      (
        await fetch(base + "/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      503,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test("verification endpoints reject malformed and privileged preview payloads before database access", async () => {
  const { createRegistrationRouter } = await import("../registration.js");
  const app = express();
  app.use(express.json());
  let queries = 0;
  app.use(createRegistrationRouter({getDb: async () => {queries++; throw Error("unexpected database");}, env: {}}));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  try {
    for (const [path, body] of [
      ["verification-info", {}], ["verification-info", {token: "x"}],
      ["verification-info", {token: "a".repeat(43), role: "admin"}],
      ["verify-email", {}], ["verify-email", {token: "x"}],
    ]) {
      const result = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${path}`, {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
      });
      assert.equal(result.status, 400);
      assert.deepEqual(await result.json(), {error: "Invalid or expired request"});
    }
    assert.equal(queries, 0);
  } finally {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
  }
});
