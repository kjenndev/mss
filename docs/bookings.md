# Bookings backend

## Scope and rollout

The public booking form targets venues/events needing DJs, JDS Lasers, and live multiplatform streaming. This backend saves booking requests, emails enabled administrators, and provides administrator-only review and internal comments. It does not confirm availability, quote a price, or send a customer confirmation email.

Apply only the additive, forward-only migration `mss-api/migrations/20261010010000_bookings.js`. It creates `bookings`, `booking_comments`, `booking_notifications`, and `booking_rate_limits`; it does not alter existing tables, migrations, seeds, accounts, or email settings. API startup already applies migrations through the existing application initialization. Follow the normal backup/rehearsal/restart release procedure; do not seed production. Deploy the matching frontend and API together. No production deployment, real mail, real `.env`, live DB access, or provider sending was performed during this implementation.

Prerequisites:

- Node 24 (QA used `/home/ansibl/.nvm/versions/node/v24.16.0/bin`), `npm ci` in `mss-api`, PostgreSQL, existing session authentication.
- Existing private email configuration: `private_email_settings.enabled`, verified `from_email`, `from_name`, valid `reply_to`, fixed `public_url`, encrypted provider API key.
- Preserve `EMAIL_SETTINGS_ENCRYPTION_KEY` and configure `EMAIL_VERIFIED_SENDER_DOMAIN` explicitly. The existing `readySettings`, `publicSettings`, and `decryptKey` policies remain authoritative. No new environment secrets are introduced.
- Add valid email addresses to enabled administrator accounts. Artist/user/disabled accounts are not recipients. Registration alert opt-in is not used for these administrative transactional notifications.
- `public_url` must be the intended site origin, with no path/query/credentials. Notification links use only this configured origin plus `/admin/bookings/<server-generated UUID>`, never request Host/forwarded headers or user input.

The booking form remains available when email is unavailable: saved requests still appear in the admin inbox. Review the inbox regularly; email is supplementary, not the record of receipt.

## API contract

Every booking route returns `Cache-Control: private, no-store` and varies on Authorization. Only the public POST is unauthenticated. All administrator routes require a current, unexpired Bearer session belonging to an enabled DB user with role `admin`. Internal comments and notification details are never public.

### `POST /api/bookings`

JSON fields:

| Field | Type / limit | Required |
| --- | --- | --- |
| `submission_id` | Canonical UUID syntax, versions 1–8; use `crypto.randomUUID()` and reuse for transport retries | yes |
| `venue_name` | string, 200 characters | yes |
| `contact_name` | string, 120 characters | yes |
| `phone` | string, 50 characters; international punctuation allowed | yes |
| `email` | syntactically valid email, 254 characters; trimmed and lowercased | yes |
| `event_date` | `''` or real calendar date `YYYY-MM-DD`; empty becomes null | no |
| `location` | string, 300 characters | no |
| `event_type` | string, 120 characters | no |
| `estimated_attendance` | `''` or integer 0–2147483647; empty becomes null, not a numeric string | no |
| `budget` | string, 120 characters; free-form budget, not a payment field | no |
| `services` | array, at most three distinct values from `djs`, `lasers`, `streaming`; empty array allowed | yes |
| `message` | nonblank string, 5000 characters; line breaks allowed | yes |
| `website` | honeypot string, at most 200 characters; must be empty for genuine requests | no |

Unknown keys, wrong types, disallowed control characters, duplicate/unknown services and impossible dates are rejected. Text is trimmed; single-line fields reject CR/LF. UUIDs are validated before normalization. Submission identity is bound to a hash of the canonical payload; reusing the UUID with changed content returns 400. Services are canonicalized before hashing. Existing duplicate submissions do not cause notification sends.

New receipt: HTTP 201. Same UUID and content: HTTP 200. Both expose only:

```json
{"message":"Your booking request has been received.","reference":"<opaque random reference>"}
```

The reference is not a public retrieval credential. There is no public list/detail endpoint and no public recipient, provider, notification, database-ID, or request-PII response. A filled honeypot gets the same success shape but is not stored or emailed.

Persistent fixed-window admission limits: 10 requests per meaningful direct socket peer/hour, 5 per normalized contact email/hour, 200 globally/hour. The deployed loopback nginx is a shared proxy, not a visitor: IPv4 loopback (127/8), IPv6 loopback, IPv4-mapped loopback, and unknown peers have **no per-IP bucket**. They still consume both persistent email and global budgets. This narrow policy prevents ten visitors exhausting a shared proxy budget; it does not claim to identify individual visitors behind nginx. Non-loopback direct peers are limited by `req.socket.remoteAddress`, never `req.ip` or attacker-controlled forwarding headers. Global Express trust-proxy and nginx configuration are unchanged. A future non-loopback proxy deployment requires a separately verified client-identity policy; do not enable arbitrary X-Forwarded-For trust.

Valid honeypots and idempotent submission retries consume budgets too. SQL serialization prevents multi-process races; expired buckets are cleaned on admission. Rate keys are SHA-256 digests, not cleartext IP/email. Limits survive process restarts.

### `GET /api/admin/bookings?page=1&pageSize=20`

```text
{requests:[{id,reference,venue_name,contact_name,event_date,created_at,
            comment_count,notification_status}],total,page,pageSize}
```

Page must be an integer 1–1000000; pageSize 1–100. Most recent first, ordered by `created_at DESC, id DESC`. Offset pages may move when new submissions arrive. Date-only values are returned as `YYYY-MM-DD` or null, never timezone-shifted timestamps.

### `GET /api/admin/bookings/:id`

```text
{booking:{id,reference,venue_name,contact_name,phone,email,event_date,
          location,event_type,estimated_attendance,budget,services,message,created_at},
 comments:[{id,author_name,content,created_at}],
 notification:{status,sent,total,can_retry,retry_scheduled,message?}}
```

Comments are oldest first, ordered by `created_at ASC, id ASC` including timestamp ties. Author name is the saved DB display-name/username snapshot. No password, session, submission hash, provider key, encrypted configuration, or notification payload is returned.

### `POST /api/admin/bookings/:id/comments`

Body: `{content,submission_id}`. Content is nonblank, max 3000 characters. UUID is required. Returns HTTP 201 `{comment:{id,author_name,content,created_at}}`, including idempotent retries. Reuse with another author or changed text returns 400. The author is resolved from the authenticated DB user, never from the submitted JSON.

### `POST /api/admin/bookings/:id/retry-notifications`

Body must be `{}`. Returns HTTP 200 `{notification:{status,sent,total,can_retry,retry_scheduled,message?}}`. `status` is `sent`, `pending`, `partial`, `failed`, or `unavailable`. `sent` means provider-acknowledged, not confirmed inbox delivery. `total` counts distinct persisted notification addresses, excluding missing/invalid addresses; unavailable status and the safe message still identify incomplete recipient/configuration coverage.

401 means no valid session; 403 means disabled/non-admin; 404 means missing booking after authorization; 400 means malformed input; 429 means public admission exhausted; 503 means DB/service unavailable. Errors are `{error:"<safe message>"}`. Provider errors do not turn a committed public submission into a failure. The existing application's JSON-parser/body-size error boundary is unchanged.

## Durable delivery and recovery

1. The request and one notification row per distinct valid normalized enabled-admin email are committed together. A failure inserting the outbox rolls back the request; no acknowledgement of a partially persisted booking is returned.
2. Public submission acknowledges the committed request immediately, without waiting for any provider IO. Administrator retry refreshes recipient coverage and schedules delivery, then promptly returns current notification state (not a delivery promise). A built-in dispatcher drains **all** recipients in batches of at most 20, with one provider call in flight per process. Full batches schedule another pass after 250ms; otherwise a pass runs every 5 seconds. Each provider call retains the existing 10-second transport timeout, redirect rejection and fixed Resend API endpoint. No external worker service is required. Retry the same submission UUID and unchanged details after an uncertain response; explicitly starting a new request can duplicate a request already saved.
3. Dispatch claims a row inside a short transaction, rechecks recipient eligibility and configuration, writes a 60-second lease and attempt count, then releases every lock before the network call. Successful rows are not resent. Concurrent workers are serialized by booking/notification row locks; stale completions cannot overwrite newer attempt state.
4. The first attempted message freezes the sender, escaped HTML/plaintext, reply-to, fixed-origin link, and an **encrypted** copy of the provider key. Retry keeps the same provider account, exact message, and `mss-booking-<notification UUID>` idempotency key even after settings/API-key rotation. No plaintext credential is persisted. Clearing/disabling current configuration prevents sends. Revoked historical credentials require operator intervention; never swap a pending attempted row to an unrelated provider account to work around it.
5. Failed attempts persist their next eligible time in `lease_until`: 60 seconds after attempt one and 5 minutes after attempt two. Manual retry never bypasses this backoff. Unavailable configuration/recipient rows are rechecked after 60 seconds without consuming a provider attempt. Maximum three attempts per recipient, and no retries once 23 hours have elapsed since its first claim. This is deliberately conservative around provider idempotency retention; confirm the provider's idempotency contract before rollout. Application state alone cannot prove whether an ambiguous timeout delivered mail. Do not reset counters, regenerate keys, or automatically resend outside the safe window.
6. Explicit administrator retry refreshes missing-address counts and adds currently eligible administrator addresses that were absent, while preserving existing sent/attempted rows. Before each send, its address must still belong to a current enabled administrator. An address whose only account was disabled/demoted/changed is not sent; its historical unsent row remains unavailable rather than being falsely counted as delivered. Requests with no usable addresses are saved and can be retried after accounts are corrected.
7. API startup starts the dispatcher after DB initialization and server binding. Every pass discovers eligible persisted pending/failed/unavailable rows and expired sending leases, so crashes do not lose in-memory jobs. A crashed `sending` lease can resume after 60 seconds only within the three-attempt/23-hour bounds. Database failures defer work to a later pass. Shutdown cancels scheduled work, stops taking new claims, and waits for the current provider attempt; the existing process shutdown deadline may terminate an in-flight attempt, whose lease then recovers on restart. No transaction or DB lock crosses provider IO. Multiple processes coordinate through locked row eligibility checks and stable provider deduplication keys, not an in-memory-only flag. Exhausted or ambiguous old rows require manual provider-delivery review before separately contacting recipients. Never reset counters or keys to force recovery. The booking itself always remains reviewable.

`can_retry` permits scheduling or refreshing recipient coverage, not bypassing lease/backoff/attempt/window restrictions. `retry_scheduled` means unsent rows remain within the automatic retry guardrails; configuration/address correction may still be necessary. The safe message distinguishes configuration problems, queued/backoff delivery, and manual reconciliation. Historical all-sent requests stay sent when mail is disabled. The admin detail polls pending/partial or automatically retryable notifications every 5 seconds, cancels obsolete results on route/account changes, and provides **Refresh notification status** for recovery; neither polling nor manual refresh overwrites comment drafts or comments.

Each asynchronous claim takes the existing account-mutation advisory transaction lock (`1297306453`) **before any user lock**, then enabled-admin users `FOR SHARE` in ID order, then the booking and notification `FOR UPDATE`. Account mutations take the same advisory lock before actor user → session → target user; actor/target IDs need not ascend, so user-before-booking ordering alone is insufficient to prevent a cross-feature deadlock. The advisory and row locks end before provider IO. Recipient membership remains protected by the share locks and is rechecked on every claim.

Comments and retry enqueue operations retain actor user → session → booking ordering and revalidate authentication under those locks. They never acquire the mutation advisory lock or lock a second user. Retry recipient refresh and public submission read recipient snapshots without row locks; only a later claim authorizes sending. Public admission (`1297306466`) commits separately from submission (`1297306465`); neither path nests the account-mutation or registration (`1297306459`) advisory lock. Registration paths remain unchanged and do not acquire the account-mutation advisory after user locks. Do not move the claim advisory acquisition into `auth` or the shared recipient helper: acquiring it after an actor user lock would invert the account order. A message already handed to the provider cannot be recalled by a subsequent role change.

Emails are individually addressed (`to: [one address]`), never CC/BCC broadcasts. Contact reply-to is syntax-validated but unverified; admins must treat incoming contact information as untrusted. The self-contained HTML escapes all user content and uses no remote assets/scripts. Plaintext includes the same request information. Do not forward these messages publicly.

## Storage and privacy

Bookings, comments, and notification payloads contain contact PII and are retained until an operator applies a separately reviewed retention policy. There is no automatic deletion or public deletion endpoint in this release. Database backups must be protected accordingly. Administrator access is privileged; do not log request bodies, notification payloads, provider keys, or full provider errors. Rate-limit buckets expire in an hour and are cleaned lazily. The additive migration is forward-only; rollback means restoring a reviewed backup, not running a destructive down migration.

## Verification

From the feature checkout (not production):

```sh
export PATH=/home/ansibl/.nvm/versions/node/v24.16.0/bin:$PATH
npm ci --prefix mss-api
(cd mss-api && npm test)
python3 mss-api/test/run-bookings-postgres.py
```

The native runner creates a mode-private disposable cluster under `$TMPDIR/mss-bookings-qa/backend` (default `~/.hermes/cache/scratch`), listens only on its private Unix socket, uses synthetic accounts/configuration, injects a recording/failing mail transport, and stops/removes the cluster in `finally`. Requires installed PostgreSQL `initdb`, `pg_ctl`, `createdb`, `pg_config`, and an unprivileged user. It never reads `.env` or connects to an existing cluster. `npm test` alone skips native suites without their disposable DB variables.

Native coverage includes migration preservation of every preexisting table/column, atomic outbox rollback, validation/calendar/field bounds, persistent admission after router restart, honeypots, session/role cases, real lock-wait logout/reset/expiry/demotion/disable/deletion races for both mutations, recipient selection/deduplication, escaped emails, stable provider identity, failure/partial delivery, lease recovery and safe retry expiry, concurrent requests/retries, pagination/date-only DTOs and comment ordering/idempotency. Unit coverage verifies backward-compatible verification email transport and production router mounting. Existing native suites were additionally exercised on scratch copies with only disposable connection paths adapted.

Original implementation QA is under `/home/ansibl/.hermes/cache/scratch/mss-bookings-qa/backend/`. Final cross-feature deadlock RED/GREEN and full verification logs are under `/home/ansibl/.hermes/cache/scratch/mss-bookings-qa/fix2/`. The maintained `bookings-worker-locking-native.test.js` gates the actual account endpoint at session revalidation with a higher-ID actor and lower-ID target, then overlaps the actual dispatcher: RED recorded `40P01`, GREEN requires both operations to succeed, no SQL errors, persisted demotion and delivery only to the remaining administrator. It also retains stale-completion and queued-retry-after-demotion regressions. The filename places this fixture after the original native migration-preservation test in Node's test-file ordering. Fix RED/GREEN and full verification logs are under `/home/ansibl/.hermes/cache/scratch/mss-bookings-qa/fix1/`. New native cases exercise 23-recipient automatic draining, prompt HTTP with a blocked transport and the actual frontend 15-second-timeout helper during two successful 8-second sends, startup recovery, concurrent workers/retries, persisted backoff, frozen provider identity, three-attempt/23-hour bounds, role-revocation lock races, auth-compatible lock ordering, and shutdown/restart. The older native contract helper explicitly settles one booking after HTTP and expires backoff only in its test fixture; the new worker suite uses controlled scheduling/time without that shortcut. No dependencies were changed; the earlier reported existing-lockfile critical advisory remains a separate release concern.
