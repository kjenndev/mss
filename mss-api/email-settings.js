import { renderVerificationEmail } from "./email-template.js";
import crypto from "node:crypto";
export const DEFAULT_EMAIL_SETTINGS = {
  enabled: false,
  from_email: "",
  from_name: "Midnight Sound Syndicate",
  reply_to: "support@midnightsoundsyndicate.com",
  public_url: "",
};
export function encryptionKey(env) {
  const value = env.EMAIL_SETTINGS_ENCRYPTION_KEY;
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    return null;
  const key = Buffer.from(value, "base64");
  return key.length === 32 ? key : null;
}
export function encryptKey(value, env) {
  const key = encryptionKey(env);
  if (!key) throw Error("Mail unavailable");
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("mss-email-settings-v1"));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    data.toString("base64"),
    cipher.getAuthTag().toString("base64"),
  ].join(".");
}
export function decryptKey(value, env) {
  try {
    const [version, iv, data, tag] = value.split(".");
    if (version !== "v1") return null;
    const cipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(env),
      Buffer.from(iv, "base64"),
    );
    cipher.setAAD(Buffer.from("mss-email-settings-v1"));
    cipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      cipher.update(Buffer.from(data, "base64")),
      cipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
export function validEmail(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
      value,
    )
  );
}
export function safeOrigin(value, env) {
  try {
    const u = new URL(value);
    return (
      u.origin === value &&
      !u.username &&
      !u.password &&
      (u.protocol === "https:" ||
        (env.NODE_ENV !== "production" &&
          u.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)))
    );
  } catch {
    return false;
  }
}
export function publicSettings(row) {
  return {
    ...Object.fromEntries(
      Object.keys(DEFAULT_EMAIL_SETTINGS).map((k) => [
        k,
        row?.[k] ?? DEFAULT_EMAIL_SETTINGS[k],
      ]),
    ),
    api_key_configured: Boolean(row?.api_key_encrypted),
  };
}
export function readySettings(row, env) {
  return Boolean(
    row?.enabled &&
      encryptionKey(env) &&
      validEmail(row.from_email) &&
      row.from_email.split("@")[1] ===
        env.EMAIL_VERIFIED_SENDER_DOMAIN?.trim().toLowerCase() &&
      validEmail(row.reply_to) &&
      safeOrigin(row.public_url, env) &&
      row.from_name &&
      !/[\r\n<>]/.test(row.from_name) &&
      decryptKey(row.api_key_encrypted, env),
  );
}
export async function sendResendMail(
  { settings, apiKey, email, url, idempotencyKey },
  fetchImpl = fetch,
) {
  let response;
  try {
    response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: `${settings.from_name} <${settings.from_email}>`,
        to: [email],
        reply_to: settings.reply_to,
        subject: "Verify your Midnight Sound Syndicate email",
        html: renderVerificationEmail(url),
        text: `Open this link to finish signup: choose your own username and password, review the terms, and confirm your choices. If you requested an email change instead, sign in to the matching account and confirm with your current password:\n\n${url}\n\nThis link expires in 30 minutes. If you did not request it, ignore this email.`,
      }),
    });
    if (!response.ok) throw Error();
    await response.body?.cancel();
  } catch {
    throw Error("Email provider unavailable");
  }
}
