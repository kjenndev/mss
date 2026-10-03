import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  encryptKey,
  decryptKey,
  readySettings,
  sendResendMail,
  safeOrigin,
} from "../email-settings.js";
const env = {
  EMAIL_SETTINGS_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"),
  NODE_ENV: "production",
  EMAIL_VERIFIED_SENDER_DOMAIN: "example.com",
};
const row = {
  enabled: true,
  from_email: "accounts@example.com",
  from_name: "Midnight Sound Syndicate",
  reply_to: "support@midnightsoundsyndicate.com",
  public_url: "https://example.com",
  api_key_encrypted: encryptKey("re_synthetic", env),
};
test("mail readiness requires explicit verified sender domain attestation", () => {
  assert.equal(readySettings(row, env), true);
  assert.equal(
    readySettings(row, { ...env, EMAIL_VERIFIED_SENDER_DOMAIN: "" }),
    false,
  );
  assert.equal(
    readySettings({ ...row, from_email: "accounts@other.example" }, env),
    false,
  );
});
test("authenticated encryption rejects tampering and key replacement", () => {
  assert.equal(decryptKey(row.api_key_encrypted, env), "re_synthetic");
  assert.notEqual(encryptKey("re_synthetic", env), row.api_key_encrypted);
  assert.equal(
    decryptKey(row.api_key_encrypted, {
      ...env,
      EMAIL_SETTINGS_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"),
    }),
    null,
  );
  const parts = row.api_key_encrypted.split(".");
  parts[2] = "AAAA" + parts[2].slice(4);
  assert.equal(decryptKey(parts.join("."), env), null);
});
test("only explicit safe frontend origins are accepted", () => {
  for (const origin of [
    "http://example.com",
    "https://example.com/",
    "https://u:p@example.com",
    "https://example.com#x",
    "https://example.com/path",
    "javascript:alert(1)",
  ])
    assert.equal(safeOrigin(origin, env), false);
  assert.equal(
    safeOrigin("http://localhost:5174", { NODE_ENV: "development" }),
    true,
  );
  assert.equal(safeOrigin("http://localhost:5174", env), false);
});
test("Resend adapter fixes host, disables redirects, sets timeout and stable idempotency", async () => {
  let seen;
  const input = {
    settings: row,
    apiKey: "re_synthetic",
    email: "recipient@example.com",
    url: "https://example.com/verify-email#token=synthetic",
    idempotencyKey: "mss-test",
  };
  await sendResendMail(input, async (url, options) => {
    seen = { url, options };
    return new Response("{}");
  });
  const payload = JSON.parse(seen.options.body);
  assert.equal(payload.subject, "Verify your Midnight Sound Syndicate email");
  assert.deepEqual(payload.to, [input.email]);
  assert.equal(payload.from, `${row.from_name} <${row.from_email}>`);
  assert.equal(payload.text, `Open this link to finish signup: choose your own username and password, review the terms, and confirm your choices. If you requested an email change instead, sign in to the matching account and confirm with your current password:\n\n${input.url}\n\nThis link expires in 30 minutes. If you did not request it, ignore this email.`);
  assert.equal(typeof payload.html, "string");
  assert.ok(payload.html.includes(`href="${input.url}"`));
  assert.match(payload.html, /Verify email address/);
  assert.match(JSON.parse(seen.options.body).text, /finish signup/i);
  assert.match(JSON.parse(seen.options.body).text, /choose.*password/i);
  assert.equal(seen.url, "https://api.resend.com/emails");
  assert.equal(seen.options.redirect, "error");
  assert.ok(seen.options.signal);
  assert.equal(seen.options.headers["Idempotency-Key"], "mss-test");
  assert.equal(
    JSON.parse(seen.options.body).reply_to,
    "support@midnightsoundsyndicate.com",
  );
  await assert.rejects(
    sendResendMail(input, async () => {
      throw Error("private API key");
    }),
    { message: "Email provider unavailable" },
  );
  await assert.rejects(
    sendResendMail(
      input,
      async () => new Response("sensitive provider body", { status: 403 }),
    ),
    { message: "Email provider unavailable" },
  );
});
