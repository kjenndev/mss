import test from "node:test";
import assert from "node:assert/strict";
import { sendResendMail } from "../email-settings.js";
test("custom transactional mail retains recipient isolation, reply-to and idempotency without changing verification default", async () => {
  const calls = [];
  const fake = async (url, opts) => {
    calls.push({ url, ...opts, body: JSON.parse(opts.body) });
    return new Response("{}");
  };
  const settings = {
    from_name: "MSS",
    from_email: "sender@example.com",
    reply_to: "support@example.com",
  };
  const message = {
    subject: "New booking",
    html: "<p>safe</p>",
    text: "safe",
    reply_to: "contact@example.com",
  };
  await sendResendMail(
    {
      settings,
      apiKey: "synthetic",
      email: "admin@example.com",
      idempotencyKey: "booking-test",
      url: "https://example.com/unused",
      message,
    },
    fake,
  );
  assert.equal(calls[0].body.subject, message.subject);
  assert.equal(calls[0].body.reply_to, message.reply_to);
  assert.deepEqual(calls[0].body.to, ["admin@example.com"]);
  assert.equal(calls[0].headers["Idempotency-Key"], "booking-test");
  assert.equal(calls[0].redirect, "error");
  await sendResendMail(
    {
      settings,
      apiKey: "synthetic",
      email: "user@example.com",
      idempotencyKey: "verification-test",
      url: "https://example.com/verify",
    },
    fake,
  );
  assert.equal(
    calls[1].body.subject,
    "Verify your Midnight Sound Syndicate email",
  );
  assert.equal(calls[1].body.reply_to, settings.reply_to);
  await assert.rejects(
    sendResendMail(
      {
        settings,
        apiKey: "synthetic",
        email: "admin@example.com",
        idempotencyKey: "booking-test",
        url: "https://example.com/unused",
        message,
      },
      async () => new Response("secret", { status: 500 }),
    ),
    { message: "Email provider unavailable" },
  );
});
