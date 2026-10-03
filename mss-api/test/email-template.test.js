import test from "node:test";
import assert from "node:assert/strict";
import { renderVerificationEmail } from "../email-template.js";

const decode = (value) => value.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[entity]);

test("verification links preserve fragments while escaping HTML text and attributes", () => {
  const url = `https://example.com/verify-email#token=synthetic&x="'><img src=x onerror='alert(1)'>`;
  const html = renderVerificationEmail(url);
  const links = [...html.matchAll(/href="([^"]*)"/g)].map((match) => decode(match[1]));
  assert.deepEqual(links, [url, url, "mailto:support@midnightsoundsyndicate.com"]);
  assert.ok(html.includes("&amp;x=&quot;&#39;&gt;&lt;img"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes(`>${url.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')}</a>`));
});

test("renderer rejects active, relative, malformed and credential-bearing URLs", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hello", "ftp://example.com/link", "//example.com/link", "/verify-email", "not a url", "https://u:p@example.com/link", null, undefined, {}, "https://example.com/\nlink"]) {
    assert.throws(() => renderVerificationEmail(url), { message: "Invalid verification URL" });
  }
});

test("self-contained email renders localhost links and both account workflows", () => {
  const url = `http://localhost:5174/verify-email#token=${"synthetic-preview-".repeat(4).slice(0, 64)}`;
  const html = renderVerificationEmail(url);
  assert.equal((html.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 3);
  assert.match(html, /Choose your own username and password/);
  assert.match(html, /review the terms/);
  assert.match(html, /matching account.*current password/);
  assert.match(html, /30 minutes/);
  assert.match(html, /If you did not request this, ignore this email/);
  assert.match(html, /display:none.*mso-hide:all/);
  assert.match(html, /max-width:600px/);
  assert.match(html, /word-break:break-all/);
  assert.match(html, /border-radius:4px/);
  assert.match(html, /Arial,Helvetica,sans-serif/);
  for (const table of html.matchAll(/<table\b[^>]*>/g)) assert.match(table[0], /role="presentation"/);
  assert.doesNotMatch(html, /<(?:script|img|svg|iframe|link|style|video|form)\b|\bsrc\s*=|@import|url\(/i);
  assert.doesNotMatch(html, /https?:\/\/(?!localhost:5174)/);
});
