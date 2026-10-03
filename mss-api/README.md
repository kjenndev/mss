# MSS API

Express API for Midnight Sound Syndicate artist profiles, events, comments, site settings and discovery of streams hosted by the separate Streaming-Platform application.

## Database and startup

Use PostgreSQL and a private `DATABASE_URL`. SQLite configuration in old documentation is obsolete. Node.js 22.22.1 or newer compatible LTS is recommended for the complete repository tooling.

```sh
npm ci
npm start
```

Run these commands from `mss-api`. Copy `.env.example` to a private, ignored `.env` and supply your PostgreSQL connection string. Never commit real credentials. The local managed development installation already has a private environment file; do not overwrite it.

Startup runs Knex migrations. Back up the existing database and upload directory, and rehearse upgrades before deploying. Historical migration files must remain unchanged; apply new forward migrations. Do not rerun seeds against an existing installation or overwrite users/passwords. Seed account initialization must use an explicitly supplied password, not bundled default credentials.

New passwords (registration completion, admin creation/reset, self-profile changes and explicit `MSS_ADMIN_PASSWORD` provisioning) must be **5–1024 characters**. Passwords remain case-sensitive and use salted scrypt; existing shorter passwords still work at login. Usernames compare case-insensitively using PostgreSQL `lower()` while their stored/display spelling is preserved. The provisioning seed leaves an existing case-insensitive username match unchanged.

The additive `20261003010000_case_insensitive_usernames.js` migration creates unique `lower(username)` indexes on users and pending registrations. Existing case collisions cause the migration to fail and roll back; it never renames, merges or deletes records. Review collisions before deployment and resolve them only with explicit operator approval. Pending signup suggestions remain non-authoritative: only mailbox-owner completion establishes credentials, and suggestions do not reserve names against authenticated account management. Duplicate account writes return HTTP 409; ineligible registration requests retain their generic HTTP 202 response.

Default API port: **4000**. MSS web development uses **5174**. These are distinct from ItsNoSecret and Streaming-Platform services.

## Streaming boundary

MSS does **not** host an RTMP server, media transcoder or streaming-channel management service. Manually create each artist's channel in Streaming-Platform, then have an MSS administrator assign its exact, case-sensitive channel name. Automatic provisioning is intentionally out of scope.

- `REDIS_URL`: server-side discovery connection; when omitted, node-redis's local default is used.
- `MEDIA_BASE_URL`: optional public HTTP(S) media base. Set this to the actual media service URL if clients need the optional HTTP-FLV `playUrl`. MSS does not invent a public localhost fallback.
- `STREAM_DISCOVERY_TIMEOUT_MS`: bounded discovery operation timeout; default 2000 milliseconds, maximum 10000.
- `streaming_platform_url`: site setting pointing to the Streaming-Platform **web application**, not the MSS API or RTMP ingest endpoint.

The Redis `live_streams` hash is read-only to MSS. Invalid individual rows do not hide healthy streams. A dependency outage is reported as unavailable, not as a healthy offline result. MSS does not create/delete channels or infer expiry from a stream's start time.

Streaming-Platform's channel authorization, password-protected playback and platform player behavior remain responsibilities of that separate application. MSS authentication is not shared with it.

## Browser deployment

During development, Vite proxies `/api` and `/uploads` to this API. In production, configure the reverse proxy to serve those paths before the SPA fallback. Alternatively build the frontend with an explicit `VITE_API_URL` and configure `CORS_ORIGINS` with the frontend's exact HTTP(S) origin (comma-separated for multiple origins; no wildcard or URL paths). `HOST` defaults to `127.0.0.1`; container deployments that need port publishing must explicitly set `HOST=0.0.0.0` and restrict exposure using their reverse proxy/network configuration. Use HTTPS for an exposed deployment and restrict network access to the database and Redis.

## Verification

```sh
npm test
npm audit
npm audit --omit=dev
```

Backend regression tests must not modify the live development database. Native database upgrade/CRUD verification uses a uniquely named disposable PostgreSQL database. See `../docs/audit-hardening.md` for verified results and remaining limitations.

## Artist media library

`GET /api/media-library` aggregates public SoundCloud/Mixcloud metadata from linked artist profiles without changing `/api/feed`. See [MEDIA_LIBRARY.md](MEDIA_LIBRARY.md) for credentials, API contract, safety budgets, cache semantics, verification, and large-catalog limitations.

## Public registration

See [PUBLIC_REGISTRATION.md](PUBLIC_REGISTRATION.md) for additive PostgreSQL migration, private Resend configuration, API contracts, email-change flow, deployment safeguards and disposable integration tests. Registration remains unavailable until mail setup is complete. Public contact: support@midnightsoundsyndicate.com.

## Account profile pictures

Run the new additive `20261003020000_user_profile_picture.js` migration before this API version. It adds nullable `users.profile_picture`; existing accounts remain unchanged with a null picture. Account avatars are independent of artist portraits, covers and galleries.

- Authenticated `user`, `artist`, and `admin` roles may manage **only their own** avatar via `POST /api/auth/me/avatar` with multipart field **`image`** (one file, no other fields). `DELETE /api/auth/me/avatar` takes no body and is idempotent. Both return `{ user: publicUser }`, including nullable `profile_picture`. Login, GET/PUT `/api/auth/me` also include that field. URLs cannot be supplied through the profile update API.
- Uses the existing upload limit: **5 MiB (5,242,880 bytes)** for both input and re-encoded output; **16,000,000 decoded pixels**. JPEG, PNG and WebP are decoded by content, never trusted MIME/extension; SVG, GIF, malformed files and animation (including APNG) are rejected. Output is metadata-stripped, orientation-corrected WebP at quality 85 with a random filename. No client-selected path is used.
- Existing admission remains two simultaneous buffered uploads, 60 attempts/account/hour, 100 MiB/account and 1 GiB total persisted upload quotas. A replacement temporarily needs quota for old plus new encoded file until after-commit cleanup. Oversize/quota returns 413; unsupported/invalid image returns 415; missing file/extra fields returns 400; missing/revoked authentication returns 401; disabled accounts return 403; admission limits return 429.
- The existing transaction/upload wrapper serializes mutations with the shared advisory lock, then locks/revalidates the account/session. Staged/published files are compensated on transaction failure; previous media is reclaimed only after commit and only if no user avatar, artist/gallery, event/gallery or settings reference remains. Account deletion schedules its avatar for the same guarded cleanup. Filesystem cleanup failures retain accounting and log deferred cleanup, as for existing galleries.
- Public GET comments and authenticated POST comments return nullable `author_profile_picture` from the associated user's **current** avatar (not client input, not a historical snapshot). Legacy anonymous comments return null, historical author names remain unchanged, and only avatar/id columns are fetched in one bounded batch per page. No private account fields are returned in comment DTOs.
- Isolated regression: `node --test test/*.test.js`; real PostgreSQL/multipart/concurrency checks: `wsl.exe -d Ubuntu -u root -- python3 /home/kjenn/code/mss/mss-api/test/run-registration-postgres.py avatar-native.test.js`. The latter copies without `.env`, uploads or media and creates/drops only a uniquely named disposable test database. It does not migrate live data or send email.
