import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import express from "express";
import knex from "knex";
import { encryptKey } from "../email-settings.js";
const url = process.env.MSS_BOOKINGS_TEST_URL;
test(
  "bookings native PostgreSQL",
  { skip: !url, timeout: 60000 },
  async (t) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/bookings_test");
    assert.equal(parsed.hostname, "localhost");
    assert.match(
      parsed.searchParams.get("host"),
      /\/mss-bookings-qa\/backend\/pg-[^/]+\/socket$/,
    );
    const db = knex({
      client: "pg",
      connection: url,
      pool: { min: 0, max: 12 },
    });
    let server;
    try {
      const directory = new URL("../migrations", import.meta.url).pathname;
      for (const name of fs
        .readdirSync(directory)
        .filter((n) => n.endsWith(".js") && n < "20261010010000_bookings.js")
        .sort())
        await db.migrate.up({ directory, name });
      await db("users").insert({
        username: "preserved",
        password: "synthetic",
        role: "admin",
      });
      const tables = (
        await db.raw(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'knex_%' ORDER BY tablename",
        )
      ).rows.map((r) => r.tablename);
      const before = {};
      for (const table of tables) before[table] = await db(table).select("*");
      await db.migrate.latest({ directory });
      await t.test(
        "additive migration preserves all original tables and creates durable booking storage",
        async () => {
          for (const table of tables)
            assert.deepEqual(await db(table).select("*"), before[table]);
          for (const table of [
            "bookings",
            "booking_comments",
            "booking_notifications",
            "booking_rate_limits",
          ])
            assert.equal(await db.schema.hasTable(table), true, table);
        },
      );
      const module = await import("../bookings.js").catch((e) => {
        if (e.code === "ERR_MODULE_NOT_FOUND") return {};
        throw e;
      });
      const app = express();
      // Exercise direct-peer budgets without trusting forwarding headers.
      const directPeer = (req, res, next) => {
        Object.defineProperty(req.socket, 'remoteAddress', { value: '198.51.100.10', configurable: true });
        next();
      };
      app.use(directPeer);
      let router;
      app.use(express.json());
      const mails = [],
        attempts = [];
      let fail = false,
        failEmail = null;
      const env = {
        NODE_ENV: "test",
        EMAIL_SETTINGS_ENCRYPTION_KEY: crypto
          .randomBytes(32)
          .toString("base64"),
        EMAIL_VERIFIED_SENDER_DOMAIN: "example.com",
      };
      const limits = { ip: 1000, account: 1000, global: 1000 };
      const sendMail = async (m) => {
        assert.ok(
          await db("booking_notifications")
            .where({ id: m.idempotencyKey.replace("mss-booking-", "") })
            .first(),
          "notification committed before network",
        );
        await db.transaction(async (trx) => {
          await trx.raw("SET LOCAL lock_timeout='300ms'");
          await trx("booking_notifications")
            .where({ id: m.idempotencyKey.replace("mss-booking-", "") })
            .forUpdate()
            .first();
        });
        attempts.push(m);
        if (fail || m.email === failEmail)
          throw Error("secret provider failure");
        mails.push(m);
      };
      if (module.createBookingsRouter)
        app.use(
          (router = module.createBookingsRouter({
            getDb: async () => db,
            env,
            limits,
            sendMail,
          })),
        );
      server = app.listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      const call = async (
        path,
        body,
        token,
        method = body ? "POST" : "GET",
      ) => {
        const r = await fetch(
          `http://127.0.0.1:${server.address().port}${path}`,
          {
            method,
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: "Bearer " + token } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          },
        );
        const text = await r.text();
        let result;
        try {
          result = JSON.parse(text);
        } catch {
          result = text;
        }
        // Legacy contract assertions inspect settled mail. Explicitly run a test
        // batch AFTER the HTTP response; worker-native separately proves async
        // scheduling, real backoff, startup recovery and prompt HTTP responses.
        if (r.ok && body && (path === '/api/bookings' || path.endsWith('/retry-notifications'))) {
          const saved = path === '/api/bookings'
            ? await db('bookings').where({ submission_id: body.submission_id }).first()
            : { id: path.split('/')[4] };
          if (saved && (r.status === 201 || path.endsWith('/retry-notifications'))) {
            await db('booking_notifications').where({ booking_id: saved.id }).whereIn('status', ['failed', 'unavailable']).update({ lease_until: new Date(0) });
            await router.dispatchNotifications(saved.id);
            if (path.endsWith('/retry-notifications')) {
              const detail = await call('/api/admin/bookings/' + saved.id, undefined, token);
              result.notification = detail.body.notification;
            }
          }
        }
        return { status: r.status, body: result };
      };
      const input = () => ({
        submission_id: crypto.randomUUID(),
        venue_name: "Venue",
        contact_name: "Person",
        phone: "+1 555 1234",
        email: "Person@Example.com",
        event_date: "",
        location: "",
        event_type: "",
        estimated_attendance: "",
        budget: "",
        services: ["djs", "lasers", "streaming"],
        message: "Our event",
        website: "",
      });
      let booking;
      await t.test(
        "public submission atomically saves request and durable notification intent; retry does not expose PII",
        async () => {
          await db("users").insert({
            username: "recipient",
            password: "synthetic",
            role: "admin",
            email: "ADMIN@example.com",
          });
          const b = input();
          const r = await call("/api/bookings", b);
          assert.equal(r.status, 201);
          assert.deepEqual(Object.keys(r.body).sort(), [
            "message",
            "reference",
          ]);
          assert.equal(
            r.body.message,
            "Your booking request has been received.",
          );
          booking = await db("bookings")
            .where({ submission_id: b.submission_id })
            .first();
          assert.equal(booking.email, "person@example.com");
          assert.equal(booking.reference, r.body.reference);
          assert.equal(
            (
              await db("booking_notifications").where({
                booking_id: booking.id,
              })
            ).length,
            1,
          );
          assert.equal((await call("/api/bookings", b)).status, 200);
          assert.equal((await db("bookings")).length, 1);
          assert.equal(
            (await call("/api/bookings", { ...b, message: "changed" })).status,
            400,
          );
          assert.equal(mails.length, 0, "unconfigured mail cannot send");
        },
      );
      await t.test(
        "strict bounded input and calendar validation never persist invalid requests",
        async () => {
          const count = (await db("bookings")).length;
          for (const patch of [
            { submission_id: "bad" },
            { venue_name: "" },
            { contact_name: " " },
            { phone: "" },
            { email: "a\r\nBcc: victim@example.com" },
            { message: "" },
            { message: "x".repeat(5001) },
            { venue_name: "x".repeat(201) },
            { services: ["unknown"] },
            { services: ["djs", "djs"] },
            { event_date: "2026-02-30" },
            { event_date: "26-01-01" },
            { estimated_attendance: -1 },
            { estimated_attendance: 1.5 },
            { estimated_attendance: "20" },
            { estimated_attendance: 2147483648 },
            { role: "admin" },
            { phone: 12 },
            { location: "a\u0000b" },
          ])
            assert.equal(
              (await call("/api/bookings", { ...input(), ...patch })).status,
              400,
              JSON.stringify(patch).slice(0, 100),
            );
          assert.equal((await db("bookings")).length, count);
          assert.equal(
            (
              await call("/api/bookings", {
                ...input(),
                event_date: "2028-02-29",
                estimated_attendance: 0,
              })
            ).status,
            201,
          );
        },
      );
      await t.test(
        "persistent rate limits include honeypots and survive router recreation",
        async () => {
          for (const bucket of ["ip", "account", "global"]) {
            await db("booking_rate_limits").del();
            limits[bucket] = 1;
            const count = (await db("bookings")).length;
            const honey = await call("/api/bookings", {
              ...input(),
              website: "spam",
            });
            assert.equal(honey.status, 201);
            assert.equal((await db("bookings")).length, count);
            server.closeAllConnections();
            await new Promise((r) => server.close(r));
            const restarted = express();
            restarted.use(express.json());
            restarted.use(directPeer);
            restarted.use(
              module.createBookingsRouter({
                getDb: async () => db,
                env,
                limits,
                sendMail,
              }),
            );
            server = restarted.listen(0, "127.0.0.1");
            await new Promise((r) => server.once("listening", r));
            assert.equal((await call("/api/bookings", input())).status, 429);
            assert.ok((await db("booking_rate_limits")).length);
            limits[bucket] = 1000;
          }
          await db("booking_rate_limits").del();
        },
      );
      const admin = await db("users").where({ username: "recipient" }).first();
      await db("sessions").insert({
        token: "admin",
        user_id: admin.id,
        expires_at: new Date(Date.now() + 3600000),
      });
      await t.test(
        "admin list/detail/comment operations enforce real sessions, roles and strict DTOs",
        async () => {
          for (const role of ["artist", "user", "disabled"]) {
            const [u] = await db("users")
              .insert({
                username: role,
                role: role === "disabled" ? "admin" : role,
                is_disabled: role === "disabled" ? 1 : 0,
                password: "synthetic",
              })
              .returning("*");
            await db("sessions").insert({
              token: role,
              user_id: u.id,
              expires_at: new Date(Date.now() + 3600000),
            });
          }
          await db("sessions").insert({
            token: "expired",
            user_id: admin.id,
            expires_at: new Date(0),
          });
          const detail = "/api/admin/bookings/" + booking.id;
          for (const token of [
            undefined,
            "forged",
            "expired",
            "artist",
            "user",
            "disabled",
          ])
            for (const [path, body] of [
              ["/api/admin/bookings"],
              [detail],
              [
                detail + "/comments",
                { content: "hello", submission_id: crypto.randomUUID() },
              ],
            ])
              assert.equal(
                (await call(path, body, token)).status,
                ["artist", "user", "disabled"].includes(token) ? 403 : 401,
              );
          const list = await call(
            "/api/admin/bookings?page=1&pageSize=1",
            undefined,
            "admin",
          );
          assert.equal(list.status, 200);
          assert.equal(list.body.requests.length, 1);
          assert.equal(list.body.total, 2);
          assert.equal(list.body.pageSize, 1);
          assert.deepEqual(
            Object.keys(list.body.requests[0]).sort(),
            [
              "id",
              "reference",
              "venue_name",
              "contact_name",
              "event_date",
              "created_at",
              "comment_count",
              "notification_status",
            ].sort(),
          );
          for (const query of [
            "page=0",
            "pageSize=101",
            "page=1.5",
            "page=abc",
          ])
            assert.equal(
              (await call("/api/admin/bookings?" + query, undefined, "admin"))
                .status,
              400,
            );
          const d = await call(detail, undefined, "admin");
          assert.equal(d.status, 200);
          assert.equal(d.body.booking.email, "person@example.com");
          assert.equal(d.body.notification.status, "unavailable");
          assert.match(d.body.notification.message, /config|address/i);
          assert.equal("submission_hash" in d.body.booking, false);
          assert.equal("submission_id" in d.body.booking, false);
          assert.equal(
            (
              await call(
                "/api/admin/bookings/" + crypto.randomUUID(),
                undefined,
                "admin",
              )
            ).status,
            404,
          );
          const c = {
            content: "First internal note",
            submission_id: crypto.randomUUID(),
          };
          const posted = await call(detail + "/comments", c, "admin");
          assert.equal(posted.status, 201);
          assert.equal(posted.body.comment.author_name, "recipient");
          assert.deepEqual(
            (await call(detail + "/comments", c, "admin")).body,
            posted.body,
          );
          assert.equal(
            (
              await call(
                detail + "/comments",
                { ...c, content: "changed" },
                "admin",
              )
            ).status,
            400,
          );
          for (const content of ["", " ", "x".repeat(3001), 42])
            assert.equal(
              (
                await call(
                  detail + "/comments",
                  { content, submission_id: crypto.randomUUID() },
                  "admin",
                )
              ).status,
              400,
            );
          assert.equal(
            (
              await call(
                detail + "/comments",
                { content: "Second", submission_id: crypto.randomUUID() },
                "admin",
              )
            ).status,
            201,
          );
          const comments = (await call(detail, undefined, "admin")).body
            .comments;
          assert.deepEqual(
            comments.map((c) => c.content),
            ["First internal note", "Second"],
          );
          const rows = (await call("/api/admin/bookings", undefined, "admin"))
            .body.requests;
          assert.equal(rows.find((r) => r.id === booking.id).comment_count, 2);
        },
      );
      await t.test(
        "configured emails isolate normalized enabled admins, escape user input and link only configured origin",
        async () => {
          await db("private_email_settings")
            .where({ id: 1 })
            .update({
              enabled: true,
              from_email: "sender@example.com",
              from_name: "MSS",
              reply_to: "support@example.com",
              public_url: "https://example.com",
              api_key_encrypted: encryptKey("synthetic-key", env),
            });
          await db("users")
            .where({ username: "preserved" })
            .update({ role: "user" });
          await db("users")
            .where({ username: "disabled" })
            .update({ email: "disabled@example.com" });
          await db("users")
            .where({ username: "user" })
            .update({ email: "member@example.com" });
          await db("users").insert([
            {
              username: "duplicate",
              role: "admin",
              password: "synthetic",
              email: " admin@example.com ",
            },
            {
              username: "second",
              role: "admin",
              password: "synthetic",
              email: "second@example.com",
            },
            {
              username: "invalid",
              role: "admin",
              password: "synthetic",
              email: "bad-address",
            },
          ]);
          const b = {
            ...input(),
            venue_name: "<script>alert(1)</script>",
            message: '<img src=x onerror=alert(1)> & "hello"',
            event_date: "2027-04-05",
            location: "Somewhere",
            budget: "$500",
          };
          assert.equal((await call("/api/bookings", b)).status, 201);
          const saved = await db("bookings")
            .where({ submission_id: b.submission_id })
            .first();
          assert.deepEqual(mails.map((m) => m.email).sort(), [
            "admin@example.com",
            "second@example.com",
          ]);
          for (const m of mails) {
            assert.equal(m.apiKey, "synthetic-key");
            assert.equal(m.message.reply_to, "person@example.com");
            assert.equal(m.message.html.includes("<script>"), false);
            assert.equal(m.message.html.includes("<img"), false);
            assert.ok(m.message.html.includes("&lt;script&gt;"));
            assert.ok(
              m.message.html.includes(
                "https://example.com/admin/bookings/" + saved.id,
              ),
            );
            assert.ok(m.message.text.includes(b.message));
            assert.ok(m.message.text.includes("2027-04-05"));
            assert.equal(m.message.subject.includes("<script>"), false);
          }
          const detail = (
            await call("/api/admin/bookings/" + saved.id, undefined, "admin")
          ).body;
          assert.equal(detail.notification.sent, 2);
          assert.equal(detail.notification.status, "unavailable");
          assert.match(detail.notification.message, /address/i);
          assert.equal((await call("/api/bookings", b)).status, 200);
          assert.equal(mails.length, 2);
          await db("users")
            .where({ username: "invalid" })
            .update({ role: "user" });
        },
      );
      await t.test(
        "provider failure preserves request; authorized retries reuse frozen payload/key and never resend successes",
        async () => {
          fail = true;
          const b = input();
          assert.equal((await call("/api/bookings", b)).status, 201);
          const saved = await db("bookings")
              .where({ submission_id: b.submission_id })
              .first(),
            path = "/api/admin/bookings/" + saved.id;
          assert.equal(
            (await call(path, undefined, "admin")).body.notification.status,
            "failed",
          );
          const originals = attempts.slice(-2);
          for (const token of [
            undefined,
            "forged",
            "expired",
            "artist",
            "user",
            "disabled",
          ])
            assert.equal(
              (await call(path + "/retry-notifications", {}, token)).status,
              ["artist", "user", "disabled"].includes(token) ? 403 : 401,
            );
          await db("private_email_settings")
            .where({ id: 1 })
            .update({
              from_name: "Changed sender name",
              api_key_encrypted: encryptKey(
                "rotated-other-provider-account",
                env,
              ),
            });
          fail = false;
          const retried = await call(
            path + "/retry-notifications",
            {},
            "admin",
          );
          assert.equal(retried.status, 200);
          assert.equal(retried.body.notification.status, "sent");
          for (const m of attempts.slice(-2)) {
            const old = originals.find((o) => o.email === m.email);
            assert.equal(m.idempotencyKey, old.idempotencyKey);
            assert.equal(
              m.apiKey,
              old.apiKey,
              "provider account identity cannot change across retries",
            );
            assert.deepEqual(m.message, old.message);
            assert.deepEqual(m.settings, old.settings);
          }
          const sends = mails.length;
          await call(path + "/retry-notifications", {}, "admin");
          assert.equal(mails.length, sends);
        },
      );
      await t.test(
        "bounded retries stop at three attempts and before provider idempotency expiration; abandoned leases recover safely",
        async () => {
          fail = true;
          const b = input();
          await call("/api/bookings", b);
          const saved = await db("bookings")
              .where({ submission_id: b.submission_id })
              .first(),
            path = "/api/admin/bookings/" + saved.id;
          await call(path + "/retry-notifications", {}, "admin");
          await call(path + "/retry-notifications", {}, "admin");
          assert.ok(
            (
              await db("booking_notifications").where({ booking_id: saved.id })
            ).every((r) => r.attempts === 3),
          );
          let count = attempts.length;
          const last = await call(path + "/retry-notifications", {}, "admin");
          assert.equal(attempts.length, count);
          assert.equal(last.body.notification.can_retry, false);
          assert.match(
            last.body.notification.message,
            /manual|limit|delivery/i,
          );
          await db("booking_notifications")
            .where({ booking_id: saved.id })
            .update({
              attempts: 1,
              first_attempt_at: new Date(Date.now() - 24 * 3600000),
              status: "failed",
            });
          fail = false;
          assert.equal(
            (await call(path + "/retry-notifications", {}, "admin")).body
              .notification.can_retry,
            false,
          );
          assert.equal(attempts.length, count);
          await db("booking_notifications")
            .where({ booking_id: saved.id })
            .update({
              first_attempt_at: new Date(),
              status: "sending",
              lease_until: new Date(Date.now() + 60000),
            });
          await call(path + "/retry-notifications", {}, "admin");
          assert.equal(attempts.length, count);
          await db("booking_notifications")
            .where({ booking_id: saved.id })
            .update({ lease_until: new Date(0) });
          const recovered = await call(
            path + "/retry-notifications",
            {},
            "admin",
          );
          assert.equal(recovered.body.notification.status, "sent");
          assert.equal(attempts.length, count + 2);
          await db("private_email_settings")
            .where({ id: 1 })
            .update({ enabled: false });
          assert.equal(
            (await call(path, undefined, "admin")).body.notification.status,
            "sent",
            "historical delivery remains sent when config disabled",
          );
          await db("private_email_settings")
            .where({ id: 1 })
            .update({ enabled: true });
        },
      );
      await t.test(
        "date-only DTO and deterministic pagination/comment tie ordering",
        async () => {
          const dated = await db("bookings")
            .whereNotNull("event_date")
            .orderBy("created_at", "desc")
            .first();
          const list = (
            await call("/api/admin/bookings?pageSize=100", undefined, "admin")
          ).body;
          assert.match(
            list.requests.find((r) => r.id === dated.id).event_date,
            /^\d{4}-\d{2}-\d{2}$/,
          );
          assert.match(
            (await call("/api/admin/bookings/" + dated.id, undefined, "admin"))
              .body.booking.event_date,
            /^\d{4}-\d{2}-\d{2}$/,
          );
          await db("booking_comments")
            .where({ booking_id: booking.id })
            .update({ created_at: new Date("2026-10-10T12:00:00Z") });
          const expected = await db("booking_comments")
            .where({ booking_id: booking.id })
            .orderBy("created_at")
            .orderBy("id");
          assert.deepEqual(
            (
              await call(
                "/api/admin/bookings/" + booking.id,
                undefined,
                "admin",
              )
            ).body.comments.map((c) => c.id),
            expected.map((c) => c.id),
          );
          const p1 = (
              await call(
                "/api/admin/bookings?page=1&pageSize=2",
                undefined,
                "admin",
              )
            ).body,
            p2 = (
              await call(
                "/api/admin/bookings?page=2&pageSize=2",
                undefined,
                "admin",
              )
            ).body;
          assert.equal(
            new Set([...p1.requests, ...p2.requests].map((r) => r.id)).size,
            4,
          );
        },
      );
      await t.test(
        "atomic outbox rollback never acknowledges a request without notification intent",
        async () => {
          const b = input();
          await db.raw(
            "CREATE FUNCTION bookings_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private database error'; END $$; CREATE TRIGGER bookings_test_failure BEFORE INSERT ON booking_notifications FOR EACH ROW EXECUTE FUNCTION bookings_test_fail();",
          );
          try {
            const r = await call("/api/bookings", b);
            assert.equal(r.status, 503);
            assert.equal(JSON.stringify(r).includes("synthetic"), false);
            assert.equal(
              await db("bookings")
                .where({ submission_id: b.submission_id })
                .first(),
              undefined,
            );
          } finally {
            await db.raw(
              "DROP TRIGGER bookings_test_failure ON booking_notifications; DROP FUNCTION bookings_test_fail();",
            );
          }
          assert.equal((await call("/api/bookings", b)).status, 201);
        },
      );
      await t.test(
        "concurrent public submissions and independent-router retries deduplicate committed requests and recipients",
        async () => {
          const b = input(),
            results = await Promise.all([
              call("/api/bookings", b),
              call("/api/bookings", b),
            ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
          assert.equal(results[0].body.reference, results[1].body.reference);
          fail = true;
          const fresh = input();
          await call("/api/bookings", fresh);
          fail = false;
          const saved = await db("bookings")
            .where({ submission_id: fresh.submission_id })
            .first();
          const app2 = express();
          app2.use(express.json());
          app2.use(
            module.createBookingsRouter({
              getDb: async () => db,
              env,
              limits,
              sendMail,
            }),
          );
          const s2 = app2.listen(0, "127.0.0.1");
          await new Promise((r) => s2.once("listening", r));
          try {
            const path =
                "/api/admin/bookings/" + saved.id + "/retry-notifications",
              count = mails.length;
            const other = fetch(
              `http://127.0.0.1:${s2.address().port}${path}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: "Bearer admin",
                },
                body: "{}",
              },
            );
            const [a, c] = await Promise.all([call(path, {}, "admin"), other]);
            assert.equal(a.status, 200);
            assert.equal(c.status, 200);
            assert.equal(mails.length, count + 2);
          } finally {
            s2.closeAllConnections();
            await new Promise((r) => s2.close(r));
          }
        },
      );
      await t.test(
        "disabled or demoted notification recipients are rechecked; restored configuration permits unsent recovery",
        async () => {
          await db("private_email_settings")
            .where({ id: 1 })
            .update({ enabled: false });
          const b = input(),
            count = mails.length;
          await call("/api/bookings", b);
          const saved = await db("bookings")
              .where({ submission_id: b.submission_id })
              .first(),
            path = "/api/admin/bookings/" + saved.id;
          assert.equal(mails.length, count);
          assert.equal(
            (await call(path, undefined, "admin")).body.notification.status,
            "unavailable",
          );
          await db("users")
            .where({ username: "second" })
            .update({ is_disabled: 1 });
          await db("private_email_settings")
            .where({ id: 1 })
            .update({ enabled: true });
          const r = await call(path + "/retry-notifications", {}, "admin");
          assert.equal(r.status, 200);
          assert.equal(mails.length, count + 1);
          assert.equal(mails.at(-1).email, "admin@example.com");
          assert.equal(r.body.notification.status, "unavailable");
          await db("users")
            .where({ username: "second" })
            .update({ is_disabled: 0 });
          assert.equal(
            (await call(path + "/retry-notifications", {}, "admin")).body
              .notification.status,
            "sent",
          );
          assert.equal(mails.length, count + 2);
        },
      );
      await t.test(
        "partial recipient failures retry only unsent mail and never expose encrypted credentials",
        async () => {
          failEmail = "second@example.com";
          const b = input(),
            count = mails.length;
          await call("/api/bookings", b);
          failEmail = null;
          const saved = await db("bookings")
              .where({ submission_id: b.submission_id })
              .first(),
            path = "/api/admin/bookings/" + saved.id;
          const detail = await call(path, undefined, "admin");
          assert.equal(detail.body.notification.status, "partial");
          assert.equal(detail.body.notification.sent, 1);
          assert.equal(detail.body.notification.total, 2);
          assert.equal(JSON.stringify(detail).includes("api_key"), false);
          const stored = JSON.stringify(
            await db("booking_notifications").where({ booking_id: saved.id }),
          );
          assert.equal(
            stored.includes("rotated-other-provider-account"),
            false,
          );
          assert.equal(stored.includes("synthetic-key"), false);
          assert.equal(
            (await call(path + "/retry-notifications", {}, "admin")).body
              .notification.status,
            "sent",
          );
          assert.equal(mails.length, count + 2);
        },
      );
      await t.test(
        "no administrator addresses still saves requests, reports unavailable, and can recover after configuration",
        async () => {
          const admins = await db("users").where({
            role: "admin",
            is_disabled: 0,
          });
          await db("users")
            .whereIn(
              "id",
              admins.map((a) => a.id),
            )
            .update({ email: null });
          const b = input(),
            count = mails.length;
          await call("/api/bookings", b);
          const saved = await db("bookings")
              .where({ submission_id: b.submission_id })
              .first(),
            path = "/api/admin/bookings/" + saved.id;
          const detail = await call(path, undefined, "admin");
          assert.equal(detail.body.notification.status, "unavailable");
          assert.equal(detail.body.notification.total, 0);
          assert.equal(mails.length, count);
          for (const a of admins)
            await db("users").where({ id: a.id }).update({ email: a.email });
          assert.equal(
            (await call(path + "/retry-notifications", {}, "admin")).body
              .notification.status,
            "sent",
          );
          assert.equal(mails.length, count + 2);
        },
      );
      for (const mode of [
        "logout",
        "reset",
        "expire",
        "demote",
        "disable",
        "delete",
      ])
        for (const target of ["comments", "retry-notifications"])
          await t.test(`locked ${target} revalidates ${mode}`, async () => {
            const token = "race-" + mode + "-" + target;
            const [u] = await db("users")
              .insert({ username: token, role: "admin", password: "fixture" })
              .returning("*");
            await db("sessions").insert({
              token,
              user_id: u.id,
              expires_at: new Date(Date.now() + 3600000),
            });
            const barrier = await db.transaction();
            let request;
            const beforeComments = await db("booking_comments"),
              beforeNotifications = await db("booking_notifications").orderBy(
                "id",
              ),
              count = mails.length;
            try {
              await barrier("users").where({ id: u.id }).forUpdate().first();
              if (mode === "logout" || mode === "reset")
                await barrier("sessions").where({ token }).del();
              if (mode === "reset")
                await barrier("users")
                  .where({ id: u.id })
                  .update({ password: "new password" });
              if (mode === "expire")
                await barrier("sessions")
                  .where({ token })
                  .update({ expires_at: new Date(0) });
              if (mode === "demote")
                await barrier("users")
                  .where({ id: u.id })
                  .update({ role: "user" });
              if (mode === "disable")
                await barrier("users")
                  .where({ id: u.id })
                  .update({ is_disabled: 1 });
              if (mode === "delete")
                await barrier("users").where({ id: u.id }).del();
              request = call(
                "/api/admin/bookings/" + booking.id + "/" + target,
                target === "comments"
                  ? { content: "revoked", submission_id: crypto.randomUUID() }
                  : {},
                token,
              );
              const deadline = Date.now() + 5000;
              let blocked = false;
              while (Date.now() < deadline) {
                const { rows } = await db.raw(
                  "SELECT query FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%users%for update%'",
                );
                if (rows.length) {
                  blocked = true;
                  break;
                }
                await new Promise((r) => setTimeout(r, 10));
              }
              assert.equal(
                blocked,
                true,
                "request actually waits for the user lock",
              );
              await barrier.commit();
              assert.equal(
                (await request).status,
                ["demote", "disable"].includes(mode) ? 403 : 401,
              );
              assert.deepEqual(await db("booking_comments"), beforeComments);
              assert.deepEqual(
                await db("booking_notifications").orderBy("id"),
                beforeNotifications,
              );
              assert.equal(mails.length, count);
            } finally {
              if (!barrier.isCompleted()) await barrier.rollback();
              if (request) await request;
              await db("users").where({ id: u.id }).del();
            }
          });
    } finally {
      if (server) {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
      }
      await db.destroy();
    }
  },
);
