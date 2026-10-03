import express from "express";
import crypto from "node:crypto";
import {
  encryptionKey,
  encryptKey,
  decryptKey,
  normalizeEmail,
  validEmail,
  safeOrigin,
  publicSettings,
  readySettings,
  sendResendMail,
} from "./email-settings.js";
export const TERMS_VERSION = "2026-10-03";
export const PRIVACY_VERSION = "2026-10-03";
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const binding = (user) =>
  digest(
    JSON.stringify([
      user.id,
      user.username,
      user.password,
      user.email,
      user.email_verified_at,
    ]),
  );
const accepted = {
  message:
    "If the request is eligible, a verification email will be sent. Check your inbox or request a new link.",
};
const invalid = () =>
  Object.assign(Error("Invalid or expired request"), { status: 400 });
const conflict = () => Object.assign(Error("Username is already taken"), {status: 409});
const unavailable = () =>
  Object.assign(Error("Email verification is temporarily unavailable"), {
    status: 503,
  });
const validUsername = (value) => typeof value === "string" && !!value.trim() && value.length <= 100;
const validToken = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const strict = (body, keys) =>
  body &&
  typeof body === "object" &&
  !Array.isArray(body) &&
  Object.keys(body).every((k) => keys.includes(k));
export function createRegistrationRouter({
  getDb,
  hashPassword,
  verifyPassword,
  env = process.env,
  sendMail = sendResendMail,
  limits = { ip: 20, account: 5, global: 200 },
} = {}) {
  const router = express.Router();
  const route = (method, path, handler) =>
    router[method](path, (req, res, next) =>
      Promise.resolve()
        .then(() => handler(req, res))
        .catch((error) => {
          const status = error.status || (error.code === "23505" ? 409 : 503);
          res
            .status(status)
            .json({
              error:
                status === 400
                  ? "Invalid or expired request"
                  : status === 401
                    ? "Unauthorized"
                    : status === 403
                      ? "Permission denied"
                      : status === 409
                        ? "Account details are already in use"
                      : status === 429
                        ? "Too many attempts; try again later"
                        : "Email verification is temporarily unavailable",
            });
        }),
    );
  const settings = async () => {
    if (!encryptionKey(env)) return null;
    return (await getDb())("private_email_settings").where({ id: 1 }).first();
  };
  const configured = async () => {
    const row = await settings();
    if (!readySettings(row, env)) throw unavailable();
    return row;
  };
  const auth = async (req, db, lock = false) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw Object.assign(Error(), { status: 401 });
    const session = await db("sessions")
      .where({ token })
      .where("expires_at", ">", new Date())
      .first();
    if (!session) throw Object.assign(Error(), { status: 401 });
    const query = db("users").where({ id: session.user_id });
    if (lock) query.forUpdate();
    const user = await query.first();
    if (!user) throw Object.assign(Error(), { status: 401 });
    if (lock) {
      // Reset/logout lock users before deleting sessions. Re-read after any user-lock wait;
      // locking the session now also orders a concurrent standalone session deletion.
      const currentSession = await db("sessions").where({token, user_id: user.id})
        .forUpdate().first();
      if (!currentSession || new Date(currentSession.expires_at) <= new Date())
        throw Object.assign(Error(), {status: 401});
    }
    if (user.is_disabled) throw Object.assign(Error(), { status: 403 });
    return user;
  };
  // Shared PostgreSQL budgets: all admitted attempts charged before scrypt or provider calls.
  const rate = async (req, account, { namespace = "", recipient } = {}) => {
    const db = await getDb();
    const ok = await db.transaction(async (trx) => {
      await trx.raw("SELECT pg_advisory_xact_lock(1297306460)");
      await trx("registration_rate_limits")
        .where("expires_at", "<=", new Date())
        .del();
      const buckets = [
        [namespace + "global", limits.global],
        [namespace + "ip:" + req.ip, limits.ip],
        [namespace + "account:" + account, limits.account],
        ...(recipient ? [["account:" + recipient, limits.account]] : []),
      ];
      for (const [name, max] of buckets) {
        const key = digest(name),
          row = await trx("registration_rate_limits").where({ key }).first();
        if (row && row.count >= max) return false;
      }
      for (const [name] of buckets) {
        const key = digest(name);
        await trx("registration_rate_limits")
          .insert({
            key,
            count: 1,
            expires_at: new Date(Date.now() + 15 * 60000),
          })
          .onConflict("key")
          .merge({ count: trx.raw("registration_rate_limits.count + 1") });
      }
      return true;
    });
    if (!ok) throw Object.assign(Error(), { status: 429 });
  };
  const issue = async (trx, { pending, user, email }) => {
    await trx("email_verifications")
      .where("expires_at", "<=", new Date())
      .del();
    const token = crypto.randomBytes(32).toString("base64url"),
      id = crypto.randomUUID();
    if (pending)
      await trx("email_verifications").where({ pending_id: pending.id }).del();
    else await trx("email_verifications").where({ user_id: user.id }).del();
    await trx("email_verifications").insert({
      id,
      token_hash: digest(token),
      pending_id: pending?.id || null,
      user_id: user?.id || null,
      email,
      credential_binding: user ? binding(user) : null,
      expires_at: new Date(Date.now() + 30 * 60000),
    });
    return { email, token, id };
  };
  const deliver = async (row, item) => {
    if (!item) return;
    try {
      await sendMail({
        settings: publicSettings(row),
        apiKey: decryptKey(row.api_key_encrypted, env),
        email: item.email,
        url: `${row.public_url}/verify-email#token=${item.token}`,
        idempotencyKey: "mss-verification-" + item.id,
      });
    } catch {
      throw unavailable();
    }
  };
  // Separate short-lived registration lock, never the upload lock; hashing and network run outside it.
  const transaction = async (fn) =>
    (await getDb()).transaction(async (trx) => {
      await trx.raw("SELECT pg_advisory_xact_lock(1297306459)");
      return fn(trx);
    });
  route("get", "/api/auth/registration-config", async (req, res) =>
    res.json({
      enabled: readySettings(await settings(), env),
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
    }),
  );
  route("get", "/api/admin/email-settings", async (req, res) => {
    const db = await getDb();
    if ((await auth(req, db)).role !== "admin")
      throw Object.assign(Error(), { status: 403 });
    res.json(
      publicSettings(
        await db("private_email_settings").where({ id: 1 }).first(),
      ),
    );
  });
  route("put", "/api/admin/email-settings", async (req, res) => {
    const db = await getDb();
    if ((await auth(req, db)).role !== "admin")
      throw Object.assign(Error(), { status: 403 });
    const b = req.body;
    if (
      !strict(b, [
        "enabled",
        "from_email",
        "from_name",
        "reply_to",
        "public_url",
        "api_key",
        "clear_api_key",
        "api_key_configured",
      ]) ||
      (b.api_key_configured !== undefined &&
        typeof b.api_key_configured !== "boolean") ||
      typeof b.enabled !== "boolean" ||
      typeof b.from_email !== "string" ||
      typeof b.from_name !== "string" ||
      typeof b.reply_to !== "string" ||
      typeof b.public_url !== "string" ||
      (b.api_key !== undefined &&
        (typeof b.api_key !== "string" || b.api_key.length > 1000)) ||
      (b.clear_api_key !== undefined && typeof b.clear_api_key !== "boolean")
    )
      throw invalid();
    const update = {
      enabled: b.enabled,
      from_email: normalizeEmail(b.from_email),
      from_name: b.from_name.trim(),
      reply_to: normalizeEmail(b.reply_to),
      public_url: b.public_url,
      updated_at: new Date(),
    };
    if (
      update.from_name.length > 100 ||
      /[\r\n<>]/.test(update.from_name) ||
      (update.from_email && !validEmail(update.from_email)) ||
      (update.reply_to && !validEmail(update.reply_to)) ||
      (update.public_url && !safeOrigin(update.public_url, env)) ||
      (b.clear_api_key && b.api_key?.trim())
    )
      throw invalid();
    if (b.clear_api_key) update.api_key_encrypted = null;
    else if (b.api_key?.trim()) {
      if (!encryptionKey(env)) throw unavailable();
      update.api_key_encrypted = encryptKey(b.api_key.trim(), env);
    }
    const result = await db.transaction(async (trx) => {
      const user = await auth(req, trx, true);
      if (user.role !== "admin") throw Object.assign(Error(), { status: 403 });
      const row = await trx("private_email_settings")
        .where({ id: 1 })
        .forUpdate()
        .first();
      if (b.enabled && !readySettings({ ...row, ...update }, env))
        throw invalid();
      await trx("private_email_settings").where({ id: 1 }).update(update);
      return publicSettings({ ...row, ...update });
    });
    res.json(result);
  });
  route("post", "/api/auth/register", async (req, res) => {
    const row = await configured(),
      b = req.body;
    if (!strict(b, ["username", "email"]) || !validUsername(b.username) ||
        !validEmail(normalizeEmail(b.email))) throw invalid();
    const email = normalizeEmail(b.email),
      username = b.username.trim();
    await rate(req, email);
    const db = await getDb();
    if (
      (await db("users")
        .whereRaw("lower(username) = lower(?)", [username])
        .orWhereRaw("lower(email) = ?", [email])
        .first()) ||
      (await db("pending_registrations")
        .where(function () {
          this.whereRaw("lower(username) = lower(?)", [username]).orWhere({ email });
        })
        .where("expires_at", ">", new Date())
        .first())
    )
      return res.status(202).json(accepted);
    const item = await transaction(async (trx) => {
      await trx("pending_registrations")
        .where("expires_at", "<=", new Date())
        .del();
      if (
        (await trx("users")
          .whereRaw("lower(username) = lower(?)", [username])
          .orWhereRaw("lower(email) = ?", [email])
          .first()) ||
        (await trx("pending_registrations")
          .whereRaw("lower(username) = lower(?)", [username])
          .orWhere({ email })
          .first())
      )
        return null;
      const pending = {
        id: crypto.randomUUID(),
        username,
        email,
        expires_at: new Date(Date.now() + 24 * 3600000),
      };
      await trx("pending_registrations").insert(pending);
      return issue(trx, { pending, email });
    });
    await deliver(row, item);
    res.status(202).json(accepted);
  });
  route("post", "/api/auth/resend-verification", async (req, res) => {
    const row = await configured();
    if (
      !strict(req.body, ["email"]) ||
      !validEmail(normalizeEmail(req.body.email))
    )
      throw invalid();
    const email = normalizeEmail(req.body.email);
    await rate(req, email);
    const item = await transaction(async (trx) => {
      const pending = await trx("pending_registrations")
        .where({ email })
        .where("expires_at", ">", new Date())
        .first();
      return pending ? issue(trx, { pending, email }) : null;
    });
    await deliver(row, item);
    res.status(202).json(accepted);
  });
  route("post", "/api/auth/email-change", async (req, res) => {
    const db = await getDb(),
      user = await auth(req, db),
      row = await configured(),
      b = req.body;
    if (
      !strict(b, ["email", "current_password"]) ||
      !validEmail(normalizeEmail(b.email)) ||
      typeof b.current_password !== "string" ||
      !b.current_password ||
      b.current_password.length > 1024
    )
      throw invalid();
    const email = normalizeEmail(b.email);
    await rate(req, "user:" + user.id, {recipient: email});
    if (!(await verifyPassword(b.current_password, user.password)))
      throw invalid();
    const item = await transaction(async (trx) => {
      const current = await auth(req, trx, true);
      if (binding(current) !== binding(user)) throw invalid();
      if (
        (await trx("users").whereRaw("lower(email) = ?", [email]).first()) ||
        (await trx("pending_registrations")
          .where({ email })
          .where("expires_at", ">", new Date())
          .first())
      )
        return null;
      return issue(trx, { user: current, email });
    });
    await deliver(row, item);
    res.status(202).json(accepted);
  });
  const lookup = async (db, token, lock = false) => {
    const query = db("email_verifications").where({token_hash: digest(token)});
    if (lock) query.forUpdate();
    const item = await query.first();
    if (!item || new Date(item.expires_at) <= new Date()) throw invalid();
    return item;
  };
  route("post", "/api/auth/verification-info", async (req, res) => {
    if (!strict(req.body, ["token"]) || !validToken(req.body.token)) throw invalid();
    // Read-only preview has independent budgets: opening a link cannot spend activation attempts.
    await rate(req, digest(req.body.token), {namespace: "info:"});
    const db = await getDb(), item = await lookup(db, req.body.token);
    if (!item.pending_id) return res.json({purpose: "email_change"});
    const pending = await db("pending_registrations").where({id: item.pending_id}).first();
    if (!pending || new Date(pending.expires_at) <= new Date()) throw invalid();
    res.json({purpose: "registration", username: pending.username});
  });
  route("post", "/api/auth/verify-email", async (req, res) => {
    const b = req.body;
    if (!b || !validToken(b.token)) throw invalid();
    await rate(req, "verification:" + digest(b.token));
    const db = await getDb(), initial = await lookup(db, b.token);
    let password, authenticated;
    if (initial.pending_id) {
      if (!strict(b, ["token", "username", "password", "accept_terms", "confirm_adult", "terms_version", "privacy_version", "email_alerts_opt_in"]) ||
          !validUsername(b.username) || typeof b.password !== "string" || b.password.length < 5 || b.password.length > 1024 ||
          b.accept_terms !== true || b.confirm_adult !== true || b.terms_version !== TERMS_VERSION ||
          b.privacy_version !== PRIVACY_VERSION || typeof b.email_alerts_opt_in !== "boolean") throw invalid();
      password = await hashPassword(b.password);
    } else {
      authenticated = await auth(req, db);
      if (authenticated.id !== initial.user_id) throw Object.assign(Error(), {status: 403});
      if (!strict(b, ["token", "current_password"]) || typeof b.current_password !== "string" ||
          !b.current_password || b.current_password.length > 1024 ||
          !(await verifyPassword(b.current_password, authenticated.password))) throw invalid();
    }
    try {
      await transaction(async (trx) => {
        // User before token/session locks, matching credential reset and authenticated issuance.
        const current = authenticated ? await auth(req, trx, true) : null;
        const item = await lookup(trx, b.token, true);
        if (item.id !== initial.id || await trx("users").whereRaw("lower(email) = ?", [item.email]).first()) throw invalid();
        if (item.pending_id) {
          const pending = await trx("pending_registrations").where({id: item.pending_id}).forUpdate().first();
          if (!pending || new Date(pending.expires_at) <= new Date()) throw invalid();
          if (await trx("users").whereRaw("lower(username) = lower(?)", [b.username.trim()]).first()) throw conflict();
          const now = new Date();
          await trx("users").insert({
            username: b.username.trim(), display_name: b.username.trim(), email: item.email, password,
            role: "user", email_verified_at: now, terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION,
            terms_accepted_at: now, adult_confirmed_at: now,
            email_alerts_opt_in: b.email_alerts_opt_in, email_alerts_updated_at: now,
          });
          await trx("pending_registrations").where({id: pending.id}).del();
        } else {
          if (!current || current.id !== item.user_id || binding(current) !== binding(authenticated) ||
              binding(current) !== item.credential_binding) throw invalid();
          await trx("users").where({id: current.id}).update({email: item.email, email_verified_at: new Date()});
          await trx("email_verifications").where({user_id: current.id}).del();
        }
      });
    } catch (error) {
      if (error.code === "23505") throw conflict();
      throw error;
    }
    res.json({success: true});
  });
  return router;
}
