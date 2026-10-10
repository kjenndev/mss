import express from "express";
import crypto from "node:crypto";
import {
  normalizeEmail,
  validEmail,
  readySettings,
  publicSettings,
  decryptKey,
  sendResendMail,
} from "./email-settings.js";
import { bookingMessage } from "./booking-email.js";
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const error = (status) => Object.assign(Error(), { status });
const accepted = (reference) => ({
  message: "Your booking request has been received.",
  reference,
});
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const fields = {
  venue_name: 200,
  contact_name: 120,
  phone: 50,
  email: 254,
  location: 300,
  event_type: 120,
  budget: 120,
  message: 5000,
};
const strict = (b, keys) =>
  b &&
  typeof b === "object" &&
  !Array.isArray(b) &&
  Object.keys(b).every((k) => keys.includes(k));
function validate(b) {
  if (
    !strict(b, [
      ...Object.keys(fields),
      "submission_id",
      "event_date",
      "estimated_attendance",
      "services",
      "website",
    ]) ||
    !uuid(b.submission_id)
  )
    throw error(400);
  const out = { submission_id: b.submission_id.toLowerCase() };
  for (const [key, max] of Object.entries(fields)) {
    const value = b[key] ?? "";
    if (
      typeof value !== "string" ||
      value.length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ||
      (key !== "message" && /[\r\n]/.test(value))
    )
      throw error(400);
    out[key] = value.trim();
  }
  if (
    ["venue_name", "contact_name", "phone", "email", "message"].some(
      (k) => !out[k],
    )
  )
    throw error(400);
  out.email = normalizeEmail(out.email);
  if (!validEmail(out.email)) throw error(400);
  const date = b.event_date ?? "";
  if (
    typeof date !== "string" ||
    (date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date < "0001-01-01" ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date))
  )
    throw error(400);
  out.event_date = date || null;
  const attendance = b.estimated_attendance ?? "";
  if (
    attendance !== "" &&
    (!Number.isInteger(attendance) || attendance < 0 || attendance > 2147483647)
  )
    throw error(400);
  out.estimated_attendance = attendance === "" ? null : attendance;
  if (
    !Array.isArray(b.services) ||
    b.services.length > 3 ||
    new Set(b.services).size !== b.services.length ||
    b.services.some((s) => !["djs", "lasers", "streaming"].includes(s))
  )
    throw error(400);
  out.services = [...b.services].sort();
  if (
    b.website !== undefined &&
    (typeof b.website !== "string" || b.website.length > 200)
  )
    throw error(400);
  return out;
}
// Forwarding headers are untrusted. Loopback nginx is shared, not a client.
export function bookingPeer(req) {
  const peer = req.socket?.remoteAddress;
  if (!peer || peer === '::1' || /^(?:::ffff:)?127\./i.test(peer)) return null;
  return peer;
}
export function createBookingsRouter({
  getDb,
  env = process.env,
  sendMail = sendResendMail,
  limits = { ip: 10, account: 5, global: 200 },
  now = Date.now,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = clearTimeout,
} = {}) {
  const router = express.Router();
  const messages = {
    400: "Invalid booking request",
    401: "Unauthorized",
    403: "Permission denied",
    404: "Booking not found",
    429: "Too many attempts; try again later",
    503: "Bookings temporarily unavailable",
  };
  const route = (method, path, handler) =>
    router[method](path, (req, res) => {
      res.set("Cache-Control", "private, no-store");
      res.vary("Authorization");
      return Promise.resolve()
        .then(() => handler(req, res))
        .catch((e) =>
          res
            .status(messages[e.status] ? e.status : 503)
            .json({ error: messages[e.status] || messages[503] }),
        );
    });
  const auth = async (req, db, lock = false) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw error(401);
    const session = await db("sessions")
      .where({ token })
      .where("expires_at", ">", new Date())
      .first();
    if (!session) throw error(401);
    const query = db("users").where({ id: session.user_id });
    if (lock) query.forUpdate();
    const user = await query.first();
    if (!user) throw error(401);
    if (lock) {
      const current = await db("sessions")
        .where({ token, user_id: user.id })
        .forUpdate()
        .first();
      if (!current || new Date(current.expires_at) <= new Date())
        throw error(401);
    }
    if (user.is_disabled || user.role !== "admin") throw error(403);
    return user;
  };
  const getBooking = async (db, id, lock = false) => {
    if (!uuid(id)) throw error(400);
    const q = db("bookings")
      .select("*", db.raw("event_date::text as event_date"))
      .where({ id });
    if (lock) q.forUpdate();
    const b = await q.first();
    if (!b) throw error(404);
    return b;
  };
  const canAttempt = (r) =>
    r.status !== "sent" &&
    r.attempts < 3 &&
    (!r.lease_until || new Date(r.lease_until).getTime() <= now()) &&
    (!r.first_attempt_at ||
      now() - new Date(r.first_attempt_at).getTime() < 23 * 3600000);
  const recipients = async (db, lock = false) => {
    const query = db("users").where({ role: "admin", is_disabled: 0 }).orderBy("id");
    if (lock) query.forShare();
    const admins = await query;
    return {
      emails: [
        ...new Set(
          admins.map((u) => normalizeEmail(u.email)).filter(validEmail),
        ),
      ],
      missing: admins.filter((u) => !validEmail(normalizeEmail(u.email)))
        .length,
    };
  };
  let running = false, timer = null, flight = null;
  const dispatch = async (id) => {
    const db = await getDb();
    // Bound each database scan and provider batch. Subsequent batches are scheduled
    // independently of HTTP, including after a process restart.
    const query = db("booking_notifications")
      .whereNot({ status: "sent" }).where("attempts", "<", 3)
      .where(q => q.whereNull("lease_until").orWhere("lease_until", "<=", new Date(now())))
      .where(q => q.whereNull("first_attempt_at").orWhere("first_attempt_at", ">", new Date(now() - 23 * 3600000)))
      .orderBy("lease_until", "asc", "first").orderBy("id").limit(20);
    if (id) query.where({ booking_id: id });
    const candidates = await query;
    for (const candidate of candidates) {
      if (!id && !running) break;
      const item = await db.transaction(async (trx) => {
        // Account mutations lock actor then target (not necessarily ascending IDs).
        // Serialize before ANY user lock, then users -> booking -> notification.
        // Never acquire this advisory lock from inside auth/recipients: callers
        // may already hold a user lock, which would invert the account order.
        await trx.raw("SELECT pg_advisory_xact_lock(1297306453)");
        const current = await recipients(trx, true);
        // The candidate scan precedes the lock; deletion may have cascaded it away.
        const b = await getBooking(trx, candidate.booking_id, true).catch(e => {
          if (e.status === 404) return null;
          throw e;
        });
        if (!b) return null;
        const r = await trx("booking_notifications")
          .where({ id: candidate.id })
          .forUpdate()
          .first();
        if (!r || !canAttempt(r)) return null;
        const row = await trx("private_email_settings")
          .where({ id: 1 })
          .first();
        if (!readySettings(row, env) || !current.emails.includes(r.email)) {
          await trx("booking_notifications")
            .where({ id: r.id })
            .update({ status: "unavailable", lease_until: new Date(now() + 60000) });
          return null;
        }
        const payload = r.payload || {
          settings: publicSettings(row),
          message: bookingMessage(b, row.public_url),
          api_key_encrypted: row.api_key_encrypted,
        };
        const apiKey = decryptKey(payload.api_key_encrypted, env);
        // Keep the original provider account as well as payload/key stable across retries.
        if (
          !apiKey ||
          payload.settings.from_email.split("@")[1] !==
            env.EMAIL_VERIFIED_SENDER_DOMAIN?.trim().toLowerCase()
        ) {
          await trx("booking_notifications")
            .where({ id: r.id })
            .update({ status: "unavailable", lease_until: new Date(now() + 60000) });
          return null;
        }
        await trx("booking_notifications")
          .where({ id: r.id })
          .update({
            payload: JSON.stringify(payload),
            status: "sending",
            attempts: r.attempts + 1,
            first_attempt_at: r.first_attempt_at || new Date(now()),
            lease_until: new Date(now() + 60000),
          });
        return {
          id: r.id,
          attempt: r.attempts + 1,
          args: {
            settings: payload.settings,
            message: payload.message,
            email: r.email,
            apiKey,
            idempotencyKey: "mss-booking-" + r.id,
          },
        };
      });
      if (!item) continue;
      let sent = false;
      try {
        await sendMail(item.args);
        sent = true;
      } catch {
        /* Provider details and credentials never leave this boundary. */
      }
      await db("booking_notifications")
        .where({ id: item.id, attempts: item.attempt, status: "sending" })
        .update({
          status: sent ? "sent" : "failed",
          lease_until: sent ? null : new Date(now() + (item.attempt === 1 ? 60000 : 300000)),
          ...(sent ? { sent_at: new Date() } : {}),
        });
    }
    return candidates.length;
  };
  const wake = (delay = 0) => {
    if (!running || timer !== null || flight) return;
    timer = schedule(async () => {
      timer = null;
      if (!running) return;
      let count = 0;
      flight = dispatch();
      try { count = await flight; }
      catch { /* Durable rows are retried on the next tick; never log private data. */ }
      finally { flight = null; wake(count === 20 ? 250 : 5000); }
    }, delay);
    timer?.unref?.();
  };
  router.startNotifications = () => { running = true; wake(); };
  router.stopNotifications = async () => {
    running = false;
    if (timer !== null) cancel(timer);
    timer = null;
    await flight?.catch(() => {});
  };
  // Deterministic single-booking batch for native tests / embedded hosts.
  router.dispatchNotifications = dispatch;
  const notification = async (db, b) => {
    const rows = await db("booking_notifications").where({ booking_id: b.id });
    const settings = await db("private_email_settings")
      .where({ id: 1 })
      .first();
    const sent = rows.filter((r) => r.status === "sent").length,
      total = rows.length;
    const complete = total > 0 && sent === total && !b.missing_recipients;
    const unavailable =
      !readySettings(settings, env) ||
      !total ||
      b.missing_recipients > 0 ||
      rows.some((r) => r.status === "unavailable");
    const retry_scheduled = rows.some(r => r.status !== "sent" && r.attempts < 3 &&
      (!r.first_attempt_at || now() - new Date(r.first_attempt_at).getTime() < 23 * 3600000));
    const can_retry = !complete && (retry_scheduled || b.missing_recipients > 0 || !total);
    const status = complete
      ? "sent"
      : unavailable
        ? "unavailable"
        : sent
          ? "partial"
          : rows.some(
                (r) =>
                  r.status === "failed" ||
                  (!canAttempt(r) && (r.status !== "sending" || !r.lease_until || new Date(r.lease_until).getTime() <= now())),
              )
            ? "failed"
            : "pending";
    const message = complete
      ? null
      : unavailable
        ? "Email configuration or enabled administrator addresses need attention."
        : !can_retry
          ? "Delivery is in progress or its safe retry limit has been reached; check delivery manually before contacting recipients."
          : "Delivery is queued or in progress; failed attempts retry automatically after backoff.";
    return { status, sent, total, can_retry, retry_scheduled, ...(message ? { message } : {}) };
  };
  const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));
  const commentDto = (c) =>
    pick(c, ["id", "author_name", "content", "created_at"]);
  route("get", "/api/admin/bookings", async (req, res) => {
    const db = await getDb();
    await auth(req, db);
    const number = (v, fallback, max) => {
      if (v === undefined) return fallback;
      if (typeof v !== "string" || !/^[1-9]\d*$/.test(v) || Number(v) > max)
        throw error(400);
      return Number(v);
    };
    const page = number(req.query.page, 1, 1000000),
      pageSize = number(req.query.pageSize, 20, 100);
    const total = Number(
      (await db("bookings").count("* as count").first()).count,
    );
    const rows = await db("bookings")
      .select("*", db.raw("event_date::text as event_date"))
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const requests = await Promise.all(
      rows.map(async (b) => ({
        ...pick(b, [
          "id",
          "reference",
          "venue_name",
          "contact_name",
          "event_date",
          "created_at",
        ]),
        comment_count: Number(
          (
            await db("booking_comments")
              .where({ booking_id: b.id })
              .count("* as count")
              .first()
          ).count,
        ),
        notification_status: (await notification(db, b)).status,
      })),
    );
    res.json({ requests, total, page, pageSize });
  });
  route("get", "/api/admin/bookings/:id", async (req, res) => {
    const db = await getDb();
    await auth(req, db);
    const b = await getBooking(db, req.params.id);
    const comments = await db("booking_comments")
      .where({ booking_id: b.id })
      .orderBy("created_at")
      .orderBy("id");
    res.json({
      booking: pick(b, [
        "id",
        "reference",
        ...Object.keys(fields),
        "event_date",
        "estimated_attendance",
        "services",
        "created_at",
      ]),
      comments: comments.map(commentDto),
      notification: await notification(db, b),
    });
  });
  route("delete", "/api/admin/bookings/:id", async (req, res) => {
    const db = await getDb();
    await auth(req, db);
    await db.transaction(async (trx) => {
      // Match dispatcher/account mutation ordering before taking any user lock.
      await trx.raw("SELECT pg_advisory_xact_lock(1297306453)");
      await auth(req, trx, true);
      const booking = await getBooking(trx, req.params.id, true);
      // Existing foreign keys atomically cascade comments and durable mail intent.
      // Already claimed/in-flight provider requests cannot be recalled.
      await trx("bookings").where({ id: booking.id }).del();
    });
    res.json({ deleted: true });
  });
  route("post", "/api/admin/bookings/:id/comments", async (req, res) => {
    const db = await getDb();
    await auth(req, db);
    const b = req.body;
    if (
      !strict(b, ["content", "submission_id"]) ||
      !uuid(b.submission_id) ||
      typeof b.content !== "string" ||
      !b.content.trim() ||
      b.content.length > 3000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(b.content)
    )
      throw error(400);
    const comment = await db.transaction(async (trx) => {
      const user = await auth(req, trx, true);
      await getBooking(trx, req.params.id, true);
      const existing = await trx("booking_comments")
        .where({ booking_id: req.params.id, submission_id: b.submission_id })
        .first();
      if (existing) {
        if (
          existing.content !== b.content.trim() ||
          existing.author_id !== user.id
        )
          throw error(400);
        return existing;
      }
      return (
        await trx("booking_comments")
          .insert({
            id: crypto.randomUUID(),
            booking_id: req.params.id,
            submission_id: b.submission_id,
            author_id: user.id,
            author_name: (user.display_name || user.username).slice(0, 200),
            content: b.content.trim(),
          })
          .returning("*")
      )[0];
    });
    res.status(201).json({ comment: commentDto(comment) });
  });
  route(
    "post",
    "/api/admin/bookings/:id/retry-notifications",
    async (req, res) => {
      const db = await getDb();
      await auth(req, db);
      if (!strict(req.body, [])) throw error(400);
      await db.transaction(async (trx) => {
        await auth(req, trx, true);
        const b = await getBooking(trx, req.params.id, true);
        const current = await recipients(trx);
        await trx("bookings")
          .where({ id: b.id })
          .update({ missing_recipients: current.missing });
        if (current.emails.length)
          await trx("booking_notifications")
            .insert(
              current.emails.map((email) => ({
                id: crypto.randomUUID(),
                booking_id: b.id,
                email,
              })),
            )
            .onConflict(["booking_id", "email"])
            .ignore();
      });
      wake();
      res.json({
        notification: await notification(
          db,
          await getBooking(db, req.params.id),
        ),
      });
    },
  );
  route("post", "/api/bookings", async (req, res) => {
    const b = validate(req.body);
    const hash = digest(JSON.stringify(b));
    const db = await getDb();
    // Persistent budgets, independent of the insert transaction; honeypots consume them too.
    const admitted = await db.transaction(async (trx) => {
      await trx.raw("SELECT pg_advisory_xact_lock(1297306466)");
      await trx("booking_rate_limits")
        .where("expires_at", "<=", new Date())
        .del();
      const buckets = [
        ["global", limits.global],
        ...(bookingPeer(req) ? [["ip:" + bookingPeer(req), limits.ip]] : []),
        ["account:" + b.email, limits.account],
      ];
      for (const [name, max] of buckets) {
        const row = await trx("booking_rate_limits")
          .where({ key: digest(name) })
          .first();
        if (row && row.count >= max) return false;
      }
      for (const [name] of buckets)
        await trx("booking_rate_limits")
          .insert({
            key: digest(name),
            count: 1,
            expires_at: new Date(Date.now() + 3600000),
          })
          .onConflict("key")
          .merge({ count: trx.raw("booking_rate_limits.count + 1") });
      return true;
    });
    if (!admitted) throw error(429);
    if (req.body.website?.trim())
      return res
        .status(201)
        .json(accepted(crypto.randomBytes(12).toString("hex")));
    const result = await db.transaction(async (trx) => {
      await trx.raw("SELECT pg_advisory_xact_lock(1297306465)");
      const existing = await trx("bookings")
        .where({ submission_id: b.submission_id })
        .first();
      if (existing) {
        if (existing.submission_hash !== hash) throw error(400);
        return { row: existing, duplicate: true };
      }
      const { emails, missing } = await recipients(trx);
      const [row] = await trx("bookings")
        .insert({
          ...b,
          services: JSON.stringify(b.services),
          id: crypto.randomUUID(),
          reference: crypto.randomBytes(12).toString("hex"),
          submission_hash: hash,
          missing_recipients: missing,
        })
        .returning("*");
      if (emails.length)
        await trx("booking_notifications").insert(
          emails.map((email) => ({
            id: crypto.randomUUID(),
            booking_id: row.id,
            email,
          })),
        );
      return { row };
    });
    wake();
    res
      .status(result.duplicate ? 200 : 201)
      .json(accepted(result.row.reference));
  });
  return router;
}
