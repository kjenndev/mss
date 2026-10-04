# Artist-linked YouTube videos

## Operator prerequisite (not configured by this change)

Enable **YouTube Data API v3** in an operator-owned Google Cloud project and supply a restricted **server-only `YOUTUBE_API_KEY`**. Never put it in `VITE_*`, client storage, requests from the browser, source control or API DTOs. No existing key was inspected or assumed. Without it, management GET reports `configured:false`, the editor explains the setup requirement and add/refresh returns 503 `not_configured`. Removal and previously saved links remain usable.

Migration `20261004000000_artist_youtube_videos.js` is additive: one new table, artist foreign key with cascade, composite `(artist_id, video_id)` primary key, publication index and ID/duration constraints. It does not modify existing artists, channel links, covers, users or uploads. **Review/back up/rehearse and apply through the separately approved migration gate before serving this code.** MSS startup runs migrations; do not restart the live API merely to test this feature. The migration rollback drops only the new link table (and therefore its links).

## Contract

- Existing `artists.youtube` remains the **channel/social link**, labeled **YouTube Channel URL** in the editor. It is no longer used as an arbitrary iframe source. No channel discovery/import happens.
- `GET /api/artists/:id/youtube-videos` is public: `{videos, configured, limit}`. Stable video DTO IDs are `youtube:<11-character-id>`, with canonical URL, title, artwork URL (nullable), duration seconds, `createdAt` and `metadataFetchedAt`.
- `POST /api/artists/:id/youtube-videos` accepts **only** `{url}` or `{url, refresh:true}`. Owner/admin authorization uses the existing artist guard; a second authenticated/ownership check runs in the existing atomic handler. New links return 201. Duplicates for that artist return 409; `refresh:true` updates metadata without duplicating the association (200). Same video can belong to multiple artists.
- `DELETE /api/artists/:id/youtube-videos/:videoId` owner/admin only; idempotent 200. UI uses inline confirmation and reads the exact collection back after successful mutations before reporting success.
- 100 links/artist. The existing serialized mutation transaction checks the limit and duplicates atomically. API lookup admission is bounded to 30/account/hour and 1,000/process/hour; these are process-local budgets, not a distributed quota manager.
- Only supported HTTPS `youtube.com` / `www.youtube.com` / `m.youtube.com` watch, shorts, live, embed paths and `youtu.be/<id>` are accepted. Require exactly 11 URL-safe ID characters; duplicate `v`, credentials, nonstandard ports, unrelated hosts and channels fail. Sharing/timestamp parameters are discarded. Provider requests never fetch supplied URLs.

## Metadata and dates

The only metadata source is official `https://www.googleapis.com/youtube/v3/videos`, requesting `snippet,contentDetails,status` for the exact explicit ID. Fixed origin, redirects disabled, 5-second total timeout including body, 256 KiB maximum body; key remains in a server-side request header. Provider failures return sanitized messages, never raw provider errors/URLs/keys. Networking happens **before** any row/advisory lock; commit revalidates current session after the user lock and current artist ownership.

`createdAt` is normalized **YouTube `snippet.publishedAt`**, never the add date, update date or local fetch date. YouTube documents that public publication can differ from original upload (a private upload subsequently made public uses its public publication time); unlisted videos use the upload timestamp YouTube exposes. This API does not claim access to an earlier hidden upload timestamp. Timezone offsets normalize to UTC; invalid/impossible calendar dates, future timestamps, missing title/duration and nonpositive duration fail closed.

Private/deleted/missing/not-processed videos are rejected with 422, as are videos whose `status.embeddable` is false. Live/upcoming streams and scheduled premieres are not cataloged until the recording has ended, processed and is published (`liveBroadcastContent:none`, positive duration). Archived streams use `snippet.publishedAt`, not the broadcast start time. Public/unlisted embeddable videos are accepted; adding an unlisted link makes its metadata/link publicly visible on MSS.

Metadata is a **saved snapshot**, fetched on add or explicit **Refresh metadata**; catalog reads do not repeatedly spend provider quota. `metadataFetchedAt` records snapshot age. Availability can change after saving; the UI states YouTube controls playback and provides a provider-page link. A failed refresh leaves the existing snapshot unchanged and reports the failure, not a successful refresh. Automatic revalidation/retention scheduling is not implemented: operators must establish an appropriate refresh/deletion schedule under the applicable YouTube API policies before unattended production use (including the policy's API-data storage refresh/deletion requirements). No real-key/live-provider fidelity check was performed here.

## Combined library and playback

Saved links merge with SC/MC discovery **before** deduplication/pagination. Scoped catalogs filter associations before dedupe; global dedupe uses provider-stable IDs and existing last-association attribution semantics. Sort descending by publication instant, deterministic ID tie-break; invalid video dates are excluded rather than replaced with ingestion dates. SC/MC unknown dates retain their existing last-place behavior. `cache.version` hashes the audio snapshot and video DTOs for client pagination reset; `cache.fetchedAt` stays an ISO timestamp. Audio discovery/cache itself is reused.

Homepage video selection replaces the featured area and all selected-video metadata, scrolls to top and removes the obsolete Groovematics label. Artist selection replaces (but never overwrites) the saved cover. Close video restores the original cover. Video state belongs to the route and is discarded on navigation. Audio remains persistent across route changes, but selecting a video synchronously unmounts audio before mounting the video; selecting audio invalidates the local video and excludes it from audio queues. Closing audio does not resurrect the prior video.

Autoplay is **requested on explicit selection**, not guaranteed: the iframe permits autoplay and uses `autoplay=1`; browser/provider policy can still require Play. No playback state is fabricated from iframe load. The YouTube iframe is visible, privacy-enhanced, fixed-origin and ID-validated at the browser boundary.

## Isolated verification

```
# Does not import index startup or private dotenv
cd mss-api
node --test test/youtube.test.js test/youtube-catalog.test.js test/media-library*.test.js
# From Windows, explicit disposable native PostgreSQL harness:
wsl.exe -d Ubuntu -u root -- python3 /home/kjenn/code/mss/mss-api/test/run-registration-postgres.py youtube-native.test.js
cd ../mss-web
npm test -- --maxWorkers=2
npm run lint
npm run build
```

Native QA uses synthetic users/links and injected metadata, actual wrapped HTTP handlers, a fresh disposable DB, historical-to-latest migration preservation checks, revoked-session/ownership races, native user-lock wait revocation, duplicate/cap handling and cleanup. Browser QA intercepts every API/upload/thumbnail/iframe and exercises the built app at 1280/390/320; no external playback or private uploads.

Official references:
- https://developers.google.com/youtube/v3/docs/videos (`snippet.publishedAt`, `contentDetails.duration`, `status.embeddable`)
- https://developers.google.com/youtube/v3/docs/videos/list
- https://developers.google.com/youtube/terms/developer-policies
