import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import knex from "knex";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createRegistrationRouter } from "../registration.js";
const database = process.env.MSS_REGISTRATION_TEST_DB;
test(
  "native PostgreSQL registration lifecycle",
  { skip: !database },
  async (t) => {
    assert.match(database, /^mss_registration_test_[a-z0-9_]+$/);
    const db = knex({
      client: "pg",
      connection: { host: "/var/run/postgresql", user: "postgres", database },
    });
    let server;
    try {
      const directory = new URL("../migrations", import.meta.url).pathname;
      for (const name of (await fs.readdir(directory))
        .filter(
          (n) =>
            n.endsWith(".js") && n < "20261003000000_public_registration.js",
        )
        .sort())
        await db.migrate.up({ directory, name });
      const [before] = await db("users")
        .insert({
          username: "migration-legacy",
          password: "legacy-original-hash",
          role: "artist",
        })
        .returning("*");
      await db.migrate.latest({ directory });
      const after = await db("users").where({ id: before.id }).first();
      for (const key of Object.keys(before))
        assert.deepEqual(after[key], before[key]);
      assert.equal(after.email, null);
      const [defaultUser] = await db("users")
        .insert({ username: "default-role", password: "synthetic" })
        .returning("*");
      assert.equal(defaultUser.role, "user");
      const env = {
        EMAIL_SETTINGS_ENCRYPTION_KEY: crypto
          .randomBytes(32)
          .toString("base64"),
        NODE_ENV: "test",
        EMAIL_VERIFIED_SENDER_DOMAIN: "example.com",
      };
      // Execute the real password functions without importing dotenv or constructing a live DB.
      const passwordSource = (await fs.readFile(new URL("../db.js", import.meta.url), "utf8"))
        .split("const derive =")[1].split("export async function initializeDB")[0].replaceAll("export ", "");
      const passwords = vm.runInNewContext("const derive =" + passwordSource + ";({hashPassword, verifyPassword})", {crypto, Buffer});
      const mails = [];
      let fail = false,
        hashCalls = 0;
      const limits = { ip: 1000, account: 1000, global: 1000 };
      const app = express();
      app.use(express.json());
      app.use(
        createRegistrationRouter({
          getDb: async () => db,
          env,
          hashPassword: async (p) => {
            hashCalls++;
            return passwords.hashPassword(p);
          },
          verifyPassword: async (p, h) => h.startsWith("hash:") ? h === "hash:" + p : passwords.verifyPassword(p, h),
          sendMail: async (m) => {
            assert.ok(
              await db("email_verifications")
                .where({
                  id: m.idempotencyKey.replace("mss-verification-", ""),
                })
                .first(),
              "provider runs only after committed persistence",
            );
            if (fail) throw Error("secret provider error");
            mails.push(m);
          },
          limits,
        }),
      );
      server = app.listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      const base = `http://127.0.0.1:${server.address().port}`;
      const call = async (
        path,
        body,
        token,
        method = body ? "POST" : "GET",
      ) => {
        const r = await fetch(base + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: "Bearer " + token } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: r.status, body: await r.json() };
      };
      const settings = "/api/admin/email-settings",
        register = "/api/auth/register",
        verify = "/api/auth/verify-email";
      const [admin] = await db("users")
        .insert({
          username: "legacy",
          password: "hash:legacy password",
          role: "admin",
        })
        .returning("*");
      await db("sessions").insert({
        token: "admin-session",
        user_id: admin.id,
        expires_at: new Date(Date.now() + 3600000),
      });
      const config = {
        enabled: true,
        from_email: "accounts@example.com",
        from_name: "Midnight Sound Syndicate",
        reply_to: "support@midnightsoundsyndicate.com",
        public_url: "https://example.com",
        api_key: "re_test_private",
      };
      await t.test(
        "admin-only private encrypted mail configuration",
        async () => {
          assert.equal((await call(settings)).status, 401);
          assert.equal(
            (await call(settings, config, "admin-session", "PUT")).status,
            200,
          );
          const result = await call(settings, undefined, "admin-session");
          assert.equal(result.body.api_key_configured, true);
          assert.equal(
            JSON.stringify(result).includes("re_test_private"),
            false,
          );
          assert.equal(
            JSON.stringify(await db("private_email_settings").first()).includes(
              "re_test_private",
            ),
            false,
          );
          assert.equal(
            (
              await call(
                settings,
                { ...result.body, api_key: "" },
                "admin-session",
                "PUT",
              )
            ).status,
            200,
          );
          assert.equal(
            (await call("/api/auth/registration-config")).body.enabled,
            true,
          );
        },
      );
      const body = {
        username: "new-user",
        email: "NEW@Example.com",
      };
      const completion = {
        username: body.username,
        password: "victim password 456",
        accept_terms: true,
        confirm_adult: true,
        terms_version: "2026-10-03",
        privacy_version: "2026-10-03",
        email_alerts_opt_in: true,
      };
      await t.test("email-first prehijack recovery uses only mailbox-holder credentials and fresh consent", async () => {
        const attacker = {username: "attacker-suggestion", email: "victim@example.com"};
        assert.equal((await call(register, {...attacker, password: "attacker password 123"})).status, 400);
        assert.equal((await call(register, attacker)).status, 202);
        const pending = await db("pending_registrations").where({email: attacker.email}).first();
        for (const field of ["password", "terms_version", "privacy_version", "terms_accepted_at", "adult_confirmed_at", "email_alerts_opt_in"]) assert.equal(field in pending, false);
        assert.equal((await call(register, {...attacker, username: "victim-choice"})).status, 202);
        await call("/api/auth/resend-verification", {email: attacker.email});
        const token = new URL(mails.at(-1).url).hash.slice(7);
        assert.deepEqual((await call("/api/auth/verification-info", {token})).body, {purpose: "registration", username: attacker.username});
        assert.equal((await call(verify, {token})).status, 400);
        // A later admin/profile claim of the suggestion must not trap the mailbox holder.
        await db("users").insert({username: attacker.username, password: "unrelated verifier", role: "artist"});
        for (const changed of [{confirm_adult: false}, {accept_terms: false}, {terms_version: "old"}, {privacy_version: "old"}, {email_alerts_opt_in: "true"}, {role: "admin"}]) {
          const beforeHashes = hashCalls;
          assert.equal((await call(verify, {token, ...completion, ...changed})).status, 400);
          assert.equal(hashCalls, beforeHashes);
        }
        const start = Date.now();
        assert.equal((await call(verify, {token, ...completion, username: "victim-choice", email_alerts_opt_in: false})).status, 200);
        const user = await db("users").where({email: attacker.email}).first();
        assert.equal(user.username, "victim-choice");
        assert.equal(await passwords.verifyPassword(completion.password, user.password), true);
        assert.equal(await passwords.verifyPassword("attacker password 123", user.password), false);
        assert.equal(user.email_alerts_opt_in, false);
        assert.ok(new Date(user.terms_accepted_at).getTime() >= start);
        assert.ok(new Date(user.adult_confirmed_at).getTime() >= start);
        assert.equal(user.role, "user");
        assert.equal((await call(verify, {token, ...completion})).status, 400);
        mails.length = 0;
        hashCalls = 0;
      });
      let token;
      await t.test(
        "pending signup, strict consent and privilege rejection",
        async () => {
          assert.equal(
            (await call(register, { ...body, role: "admin" })).status,
            400,
          );
          assert.equal(
            (await call(register, { ...body, confirm_adult: false })).status,
            400,
          );
          assert.equal(
            (await call(register, { ...body, terms_version: "old" })).status,
            400,
          );
          assert.equal(hashCalls, 0);
          assert.equal((await call(register, body)).status, 202);
          assert.equal(
            await db("users").where({ username: body.username }).first(),
            undefined,
          );
          token = new URL(mails.at(-1).url).hash.slice(7);
          assert.ok(token);
          assert.equal(
            JSON.stringify(
              await db("email_verifications").select("*"),
            ).includes(token),
            false,
          );
        },
      );
      await t.test(
        "verification consumes once, establishes user only, never session",
        async () => {
          const results = await Promise.all([
            call(verify, { token, ...completion }),
            call(verify, { token, ...completion }),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
          const user = await db("users")
            .where({ username: body.username })
            .first();
          assert.equal(user.role, "user");
          assert.equal(user.email, "new@example.com");
          assert.ok(user.terms_accepted_at);
          assert.ok(user.adult_confirmed_at);
          assert.equal(user.email_alerts_opt_in, true);
          assert.ok(user.email_verified_at);
          assert.equal(
            (await db("sessions").where({ user_id: user.id })).length,
            0,
          );
          assert.equal((await call(register, body)).status, 202);
          assert.equal(mails.length, 1);
        },
      );
      await t.test(
        "provider failure persists pending state and explicit resend recovers",
        async () => {
          fail = true;
          assert.equal(
            (
              await call(register, {
                ...body,
                username: "retry",
                email: "retry@example.com",
              })
            ).status,
            503,
          );
          assert.ok(
            await db("pending_registrations")
              .where({ email: "retry@example.com" })
              .first(),
          );
          fail = false;
          assert.equal(
            (
              await call("/api/auth/resend-verification", {
                email: "retry@example.com",
              })
            ).status,
            202,
          );
          const next = new URL(mails.at(-1).url).hash.slice(7);
          assert.equal((await call(verify, { token: next, ...completion, username: "retry" })).status, 200);
        },
      );
      await t.test(
        "email change keeps old address until verified and binds credentials",
        async () => {
          const user = await db("users")
            .where({ username: body.username })
            .first();
          await db("sessions").insert({
            token: "user-session",
            user_id: user.id,
            expires_at: new Date(Date.now() + 3600000),
          });
          assert.equal(
            (await call(settings, undefined, "user-session")).status,
            403,
          );
          assert.equal(
            (
              await call(
                "/api/auth/email-change",
                {
                  email: "changed@example.com",
                  current_password: completion.password,
                },
                "user-session",
              )
            ).status,
            202,
          );
          assert.equal(
            (await db("users").where({ id: user.id }).first()).email,
            user.email,
          );
          const change = new URL(mails.at(-1).url).hash.slice(7);
          assert.deepEqual((await call("/api/auth/verification-info", {token: change})).body, {purpose: "email_change"});
          assert.equal((await call(verify, { token: change, current_password: completion.password })).status, 401);
          assert.equal((await call(verify, { token: change, current_password: "legacy password" }, "admin-session")).status, 403);
          assert.equal((await call(verify, { token: change, current_password: completion.password }, "user-session")).status, 200);
          assert.equal(
            (await db("users").where({ id: user.id }).first()).email,
            "changed@example.com",
          );
          await call(
            "/api/auth/email-change",
            { email: "stale@example.com", current_password: completion.password },
            "user-session",
          );
          const stale = new URL(mails.at(-1).url).hash.slice(7);
          await db("users")
            .where({ id: user.id })
            .update({ password: "changed hash" });
          assert.equal((await call(verify, { token: stale, current_password: completion.password }, "user-session")).status, 400);
        },
      );
      await t.test("expired token and duplicate race fail closed", async () => {
        const results = await Promise.all([
          call(register, {
            ...body,
            username: "race",
            email: "race@example.com",
          }),
          call(register, {
            ...body,
            username: "race",
            email: "RACE@example.com",
          }),
        ]);
        assert.deepEqual(
          results.map((r) => r.status),
          [202, 202],
        );
        assert.equal(
          (
            await db("pending_registrations").where({
              email: "race@example.com",
            })
          ).length,
          1,
        );
        const stale = new URL(mails.at(-1).url).hash.slice(7);
        await db("email_verifications").update({ expires_at: new Date(0) });
        assert.equal((await call("/api/auth/verification-info", {token: stale})).status, 400);
        assert.equal((await call(verify, { token: stale, ...completion })).status, 400);
      });
      await t.test(
        "legacy account can add its first verified email without changing roles/passwords",
        async () => {
          const before = await db("users").where({ id: admin.id }).first();
          assert.equal(
            (
              await call(
                "/api/auth/email-change",
                {
                  email: "legacy@example.com",
                  current_password: "legacy password",
                },
                "admin-session",
              )
            ).status,
            202,
          );
          assert.equal(
            (await db("users").where({ id: admin.id }).first()).email,
            null,
          );
          const token = new URL(mails.at(-1).url).hash.slice(7);
          assert.equal((await call(verify, { token, current_password: "legacy password" }, "admin-session")).status, 200);
          const after = await db("users").where({ id: admin.id }).first();
          assert.equal(after.email, "legacy@example.com");
          assert.equal(after.role, before.role);
          assert.equal(after.password, before.password);
          assert.equal(after.email_alerts_opt_in, false);
        },
      );
      await t.test(
        "competing email changes cannot claim the same email twice",
        async () => {
          for (const n of [1, 2]) {
            const [u] = await db("users")
              .insert({
                username: "compete" + n,
                password: "hash:long password 123",
                role: "user",
              })
              .returning("*");
            await db("sessions").insert({
              token: "compete-session" + n,
              user_id: u.id,
              expires_at: new Date(Date.now() + 3600000),
            });
          }
          const start = mails.length;
          await Promise.all(
            [1, 2].map((n) =>
              call(
                "/api/auth/email-change",
                {
                  email: "claim@example.com",
                  current_password: "long password 123",
                },
                "compete-session" + n,
              ),
            ),
          );
          const results = await Promise.all(
            mails
              .slice(start)
              .map(async (m) => {
                const item = await db("email_verifications").where({id: m.idempotencyKey.replace("mss-verification-", "")}).first();
                const session = await db("sessions").where({user_id: item.user_id}).first();
                return call(verify, { token: new URL(m.url).hash.slice(7), current_password: "long password 123" }, session.token);
              },
              ),
          );
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
          assert.equal(
            (await db("users").where({ email: "claim@example.com" })).length,
            1,
          );
        },
      );
      await t.test(
        "IP, account and global limits reject before hashing and sending",
        async () => {
          for (const bucket of ["ip", "account", "global"]) {
            await db("registration_rate_limits").del();
            limits[bucket] = 1;
            const input = {
              ...body,
              username: "rate-" + bucket,
              email: "rate-" + bucket + "@example.com",
            };
            assert.equal((await call(register, input)).status, 202);
            const hashes = hashCalls,
              sends = mails.length;
            assert.equal(
              (
                await call(
                  register,
                  bucket === "account"
                    ? input
                    : {
                        ...input,
                        username: input.username + "2",
                        email: "two-" + input.email,
                      },
                )
              ).status,
              429,
            );
            assert.equal(hashCalls, hashes);
            assert.equal(mails.length, sends);
            limits[bucket] = 1000;
          }
        },
      );
      await t.test("preview budgets are separate; issued links survive sending disablement", async () => {
        await db("registration_rate_limits").del();
        assert.equal((await call(register, {username: "disabled-finish", email: "disabled-finish@example.com"})).status, 202);
        const token = new URL(mails.at(-1).url).hash.slice(7);
        const pendingBefore = await db("pending_registrations").select("*");
        const tokensBefore = await db("email_verifications").select("*");
        limits.account = 2;
        assert.equal((await call("/api/auth/verification-info", {token})).status, 200);
        assert.equal((await call("/api/auth/verification-info", {token})).status, 200);
        assert.equal((await call("/api/auth/verification-info", {token})).status, 429);
        assert.deepEqual(await db("pending_registrations").select("*"), pendingBefore);
        assert.deepEqual(await db("email_verifications").select("*"), tokensBefore);
        await db("private_email_settings").where({id: 1}).update({enabled: false});
        assert.equal((await call(verify, {token, ...completion, username: "disabled-finish"})).status, 200);
        await db("private_email_settings").where({id: 1}).update({enabled: true});
        limits.account = 1000;
      });
      await t.test("recipient budget is shared across signup and authenticated email changes", async () => {
        await db("registration_rate_limits").del();
        limits.account = 1;
        assert.equal((await call(register, {username: "recipient-budget", email: "recipient-budget@example.com"})).status, 202);
        const sends = mails.length;
        assert.equal((await call("/api/auth/email-change", {email: "RECIPIENT-BUDGET@example.com", current_password: "legacy password"}, "admin-session")).status, 429);
        assert.equal(mails.length, sends);
        limits.account = 1000;
      });
      await t.test("revoked sessions cannot authorize writes after waiting on the user lock", async () => {
        for (const mode of ["reset", "logout"]) {
          for (const target of ["settings", "email-change"]) {
            const [u] = await db("users").insert({username: `revoked-${mode}-${target}`, role: "admin", password: "hash:original password"}).returning("*");
            const session = `revoked-${mode}-${target}`;
            await db("sessions").insert({token: session, user_id: u.id, expires_at: new Date(Date.now() + 3600000)});
            const before = await db("private_email_settings").first();
            const sends = mails.length;
            const barrier = await db.transaction();
            let request;
            try {
              await barrier("users").where({id: u.id}).forUpdate().first();
              if (mode === "reset") await barrier("users").where({id: u.id}).update({password: "hash:reset password"});
              await barrier("sessions").where({token: session}).del();
              request = target === "settings" ? call(settings, {...config, from_name: "Revoked writer"}, session, "PUT") :
                call("/api/auth/email-change", {email: `${session}@example.com`, current_password: "original password"}, session);
              const deadline = Date.now() + 5000;
              let blocked = false;
              while (Date.now() < deadline) {
                const {rows} = await db.raw("SELECT query FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%users%for update%'");
                if (rows.length) { blocked = true; break; }
                await new Promise(r => setTimeout(r, 10));
              }
              assert.equal(blocked, true, "request must actually wait for user row lock");
              await barrier.commit();
              assert.equal((await request).status, 401);
              assert.deepEqual(await db("private_email_settings").first(), before);
              assert.equal(mails.length, sends);
              assert.equal((await db("email_verifications").where({user_id: u.id})).length, 0);
            } finally {
              if (!barrier.isCompleted()) await barrier.rollback();
              if (request) await request;
            }
          }
        }
      });
      await t.test(
        "settings blank key retains, clear disables; unsafe origin never enables",
        async () => {
          const current = await db("private_email_settings")
            .where({ id: 1 })
            .first();
          assert.equal(
            (
              await call(
                settings,
                { ...config, api_key: "" },
                "admin-session",
                "PUT",
              )
            ).status,
            200,
          );
          assert.equal(
            (await db("private_email_settings").where({ id: 1 }).first())
              .api_key_encrypted,
            current.api_key_encrypted,
          );
          assert.equal(
            (
              await call(
                settings,
                { ...config, public_url: "http://evil.example" },
                "admin-session",
                "PUT",
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await call(
                settings,
                { ...config, enabled: false, api_key: "", clear_api_key: true },
                "admin-session",
                "PUT",
              )
            ).status,
            200,
          );
          assert.equal(
            (await call("/api/auth/registration-config")).body.enabled,
            false,
          );
          assert.equal((await call(register, body)).status, 503);
          assert.equal(
            (await call("/api/auth/resend-verification", { email: body.email }))
              .status,
            503,
          );
        },
      );
    } finally {
      if (server) {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
      }
      await db.destroy();
    }
  },
);
