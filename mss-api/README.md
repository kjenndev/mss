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
