# Public artist media library

`GET /api/media-library?offset=0&limit=50` returns the combined public-upload metadata catalog from **all** MSS artists' existing `soundcloud` and `mixcloud` fields. SC/MC discovery does not write the database, scrape, enumerate private uploads, extract streams or play media. Explicit artist-linked YouTube video snapshots now merge into this catalog; their additive migration, separate management API, server configuration and limits are documented in [YOUTUBE_LINKS.md](YOUTUBE_LINKS.md). `/api/feed` remains unchanged for existing consumers.

## Response

- `items`: deduplicated by provider + stable track URN/id or show key, globally sorted descending by original `created_at` (SoundCloud) / `created_time` (Mixcloud), with ID tie-break. Unknown dates are `null` and sort last. Artist modification, ingestion and provider `updated_at` dates never substitute for upload time.
- Item fields: `id`, `provider`, `platform`, `artistId`, `artistName`, `artistImage`, `title`, `url`, `artworkUrl`, `createdAt`, `durationSeconds`, `playable`, `providerAccess`, `streamable`. Provider URLs are validated; artwork is restricted to provider/CDN domains.
- `playable:false` means the deprecated SoundCloud `embeddable_by:none` explicitly disallows embedding; otherwise it is `null` (unverified), never a guarantee. `providerAccess` is `playable`, `preview`, `blocked`, or `null`. `streamable` is informational: app-stream permission and widget permission can differ. Let the visible official widget enforce playback restrictions and provide a provider-page fallback.
- `total`, `offset`, `limit`, `nextOffset`: pagination over the current cached aggregate, not a claim that every provider upload was discovered. `limit` is 1–200, default 50; `offset` is a nonnegative integer. Reset client pagination when `cache.version` changes (fall back to `cache.fetchedAt` for older servers). Invalid pagination returns 400.
- `sources`: one status per linked artist/provider. Fields include `artistId`, `artistName`, `provider`, canonical `profileUrl`, `status`, sanitized `message`, `complete`, `itemCount`, and last successful `fetchedAt`. Status values are `ok`, `partial`, `unavailable`, `not_configured`, `invalid_profile`. Empty successful provider responses are `ok` with count zero; missing credentials/errors are not mislabeled as an empty successful library.
- `complete`: false if any source failed, was malformed, or hit a safety limit.
- `cache`: `fetchedAt`, `expiresAt`, `refreshing`, `stale`. Initial requests wait for bounded discovery. Expired cached results return immediately while a single background refresh runs. Concurrent initial requests share one discovery promise. Cache identity includes the entire current artist/provider selection, so editing/deleting profile links cannot return the previous selection's items.

Mixcloud's public `cloudcasts` connection can include host-tagged shows; this is a library of the public profile connection, not a assertion that each show was uploaded by that profile's account. Original-upload ordering uses each show's own timestamp.

## Credentials

Keep credentials only in the server's private environment (locally `/home/kjenn/.local/state/mss/local.env`, reached by the ignored `.env` symlink). Never use `VITE_` variables for secrets.

Preferred SoundCloud setup:

```
SOUNDCLOUD_CLIENT_ID=
SOUNDCLOUD_CLIENT_SECRET=
```

The registered application must have SoundCloud API access. The module uses HTTP Basic authentication for the client-credentials grant at the fixed `https://secure.soundcloud.com/oauth/token` endpoint, reuses the token according to `expires_in`, and single-flights rotating refresh grants. A consumed/revoked refresh token (`invalid_grant` on 400/401) permits one bounded client-credentials regrant with cooldown; throttling does not trigger a regrant loop. A premature API 401 gets at most one refreshed-token retry. Failed token requests back off for 15 minutes. Secrets and raw upstream errors never enter responses/logs.

`SOUNDCLOUD_ACCESS_TOKEN` is an optional externally managed token override; it is not automatically refreshed and an expired value produces `unavailable`. Without either configuration path, SoundCloud sources report `not_configured` and make no SoundCloud request. Mixcloud public metadata needs no credentials.

**Deployment limit:** catalog and OAuth state are process-local, not persisted across restarts or shared between workers. Use one API worker for this implementation and avoid restart loops; SoundCloud documents 50 client-credentials grants / 12 hours / application and 30 / hour / IP. Multi-worker/distributed token persistence is not implemented. No service restart or credential change is performed by this feature.

## Safety, caching and large catalogs

Default factory budgets: 15-minute TTL; 4 concurrent sources; 20 pages/source; 100 total provider requests/refresh (including OAuth/resolve); 2.5-second request timeout including response body; 8-second whole-refresh network deadline; 1 MiB maximum body per request. All artist rows are considered, even when the remaining network budget is exhausted, and every linked source gets a status. Each request is constructed on fixed provider hosts, redirects are manual, resolve can follow only one validated SoundCloud user location, pagination must retain the exact resource path, and repeated continuation URLs stop discovery. Rate-limit 429 and Mixcloud 403 with `Retry-After` / `error.retry_after` suppress calls to that provider origin until its cooldown expires.

Provider pagination traverses `collection/next_href` or `data/paging.next`, including empty terminal pages. SoundCloud requests `linked_partitioning=true`, `sort=desc`, and `access=playable,preview,blocked` so restricted public metadata is not silently omitted. Only public uploads/connections are requested; no likes/reposts endpoint is used.

**Large-catalog limitation:** discovery restarts from the first page at each refresh, not a persistent continuation cursor. Catalogs that exceed budgets remain explicitly partial; older uploads beyond the ceiling may not appear. Pagination of cached results does not bypass provider discovery limits. Budget tuning is available through `createMediaLibrary` factory options for an intentionally configured deployment; arbitrary request query parameters cannot increase budgets. A resumable background index is future work, not a claimed capability.

Transient failures retain prior items only for the identical artist/provider selection, explicitly mark them stale/incomplete, and expire them after six hours from the last successful fetch. Explicit provider 404 removes prior items; an upload explicitly seen as private is not resurrected even when later pagination fails. Full successful refresh replaces the previous source catalog, removing disappeared uploads. Cached metadata cannot establish current playback availability.

## Verification without starting MSS

```
cd /home/kjenn/code/mss/mss-api
node --test test/media-library.test.js test/media-library-route.test.js
npm test
```

Tests inject provider HTTP, time and artist queries; they do not import application startup or use a live DB. The route harness verifies all artists are queried and `/api/feed` still exists. Real metadata-only probes can import `createMediaLibrary` directly with an explicit artist list and server environment, never `index.js` (which starts services and initializes the DB).

Official contracts checked:
- https://developers.soundcloud.com/docs/api/guide
- https://developers.soundcloud.com/docs/api/explorer/api.json (`/resolve`, `/users/{user_urn}/tracks`)
- https://www.mixcloud.com/developers/

Live integration exposed a SoundCloud detail: `/resolve` for `https://soundcloud.com/ansibl/` returned 404 whereas the canonical permalink without the trailing slash resolved with 302. SoundCloud profile canonicals therefore omit the trailing slash; Mixcloud canonicals retain it. A failing-first regression protects that behavior.

### Artist-scoped views

`GET /api/media-library?artistId=123&offset=0&limit=50` accepts an optional positive safe-integer artist ID (invalid, repeated, zero, or malformed IDs return 400). Omit it for the unchanged global catalog. A valid ID with no linked sources returns an empty, complete result.

Scopes reuse the global process-local discovery/cache and do not fetch providers separately. Filtering uses original artist/source associations before track deduplication and pagination, so shared provider uploads remain available to either linked artist. `total`, `sources`, `complete`, and retained-data `cache.stale` describe that scope; snapshot times and `cache.refreshing` describe the shared refresh. Unrelated failed sources do not make an artist's catalog incomplete.

Artist pages use the same MediaLibrary and persistent audio dock as the homepage, with an artist-only loaded queue. Route changes reset library/detail state and ignore late responses without replacing currently selected dock audio. Independent SoundCloud/Mixcloud profile widgets are removed; live and YouTube players retain the existing audio-overlap gate.
