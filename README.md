# Midnight Sound Syndicate

MSS manages artist profiles, events, community comments, and links to each artist's streaming channel.

**Streaming belongs to the separate Streaming-Platform application.** MSS does not host RTMP ingest, transcode media, or manage restream workers. Operators manually create a channel in Streaming-Platform and associate its exact channel name with an artist in MSS. Automatic provisioning is not required.

## Components

- `mss-api`: Node.js / Express, PostgreSQL through Knex, Redis-based live-stream discovery.
- `mss-web`: React / MUI / Vite frontend.

SQLite and the embedded RTMP server described in older documentation are obsolete.

## Local development

Use a supported Node.js release compatible with the package engine requirements. Install the lockfiles in each component:

```sh
cd mss-api
npm ci
cd ../mss-web
npm ci
```

Provide backend configuration privately; never commit `.env` or credentials. Use a dedicated PostgreSQL database, not the Streaming-Platform database. Read [API setup](mss-api/README.md) before first startup or a schema upgrade. Never seed an existing database to reset credentials.

Local services use:

- MSS frontend: http://localhost:5174
- MSS API: http://localhost:4000
- Separate Streaming-Platform frontend: http://localhost:5175

The Vite development proxy routes API and upload requests to the MSS API. Production requires its own reverse proxy or explicit public API configuration; a development proxy is not a production deployment.

Keep the Streaming-Platform frontend URL distinct from its API, media, and Redis addresses. Configuring a watch URL alone does not configure those services.

## Verification

Run backend and frontend tests separately, then frontend lint and build. See the audit-hardening documentation for configuration, migration preservation, tested cases, and issues explicitly deferred to Streaming-Platform.
