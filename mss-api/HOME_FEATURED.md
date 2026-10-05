# Homepage featured reel

## Deployment gate

This change is not deployed by implementation/testing. Review the final changed-file hashes and authorize the rollout separately. Migration `20261005000000_home_featured_videos.js` adds only `home_featured_videos`; no prior migration, existing setting, artist association, user, upload or session is rewritten. Rehearse against a disposable/backup database, back up the live database under the existing MSS gate, and check pending migrations before any authorized API restart (startup applies migrations). No seeded videos: the initial curated collection is empty, replacing the former hardcoded fallback with an honest empty state until an admin saves a selection.

Existing server-only `YOUTUBE_API_KEY` configuration is reused without reading, printing, copying or changing credentials. The artist YouTube integration must be present (this branch is based on main after that integration was merged). No Streaming-Platform changes or new streaming responsibilities are introduced.

## Admin workflow and API

System Settings links to **Homepage featured videos** (`/admin/homepage`, existing admin RouteGuard). Paste explicit video URLs, use **Add video** for official metadata preview, change order with up/down controls, and remove unwanted entries. These are local drafts until **Save changes**. The editor reads back the saved collection before reporting success. Loading/failed/malformed reads never enable editing; failed save read-back locks editing until a successful Retry. StrictMode/unmount request generations discard stale responses. Previews are static artwork: no iframe, playback or secret configuration fields.

- `GET /api/home-featured-videos`: public `{videos, canAdd}`; no provider networking. `canAdd` is configuration availability only, not a health claim. DTOs contain canonical URL, real title, nullable official thumbnail, duration, published timestamp (`createdAt`) and snapshot timestamp (`metadataFetchedAt`).
- `POST /api/home-featured-videos/preview`: admin-only `{url}`; official lookup, no persistence. Initial auth precedes provider calls; the existing atomic wrapper revalidates the session/admin before returning the preview.
- `PUT /api/home-featured-videos`: admin-only `{urls: [...]}`; 0–100 unique explicit supported URLs, in curated order. Empty means intentionally clear. No client metadata accepted. Duplicate normalized IDs, unsupported URLs and unknown fields fail. New entries are looked up again at Save, so a preview never authorizes forged metadata. Existing snapshots are reused for reorder/remove even when provider configuration is absent.
- Save performs one atomic replacement, after the existing advisory → user → session permission checks. Session revocation/admin demotion during provider work or lock waits cannot authorize commit. Metadata work occurs before transaction locks. Concurrent saves are serialized, with last successful save winning; this is not a collaborative merge or optimistic-version editor. Read-back detects a different saved order rather than claiming this draft was saved.
- At most five official lookups in flight per save, a nine-second preparation deadline, and existing per-lookup five-second/256-KiB/redirect-denied bounds. After deadline no more workers are admitted and no write occurs; already-running lookups finish under their own five-second bound. Preview/save share process-local limits of 200/account/hour and 1,000/process/hour. These are not distributed quotas. Large batches of new URLs may need smaller incremental saves. All provider errors are sanitized.

## Metadata policy and limitations

Uses existing `youtube.js` validation and official `videos.list`, not arbitrary URL fetches, scraping or channel discovery. Dates are YouTube `snippet.publishedAt`, not the add date or live start time; see `YOUTUBE_LINKS.md` for publication-vs-private-upload semantics and unavailable/nonembeddable/live/upcoming rejection. Adding an unlisted video makes its metadata and link public on MSS.

Metadata is a saved snapshot, not a continuous availability check. Reads and reorder/remove saves do not refresh it. To replace a saved snapshot in this initial workflow, remove it and Save, then add it again and Save; simply removing and re-adding inside one unsaved draft reuses the existing snapshot. No automatic refresh/deletion scheduler is included. Operators must establish an appropriate refresh/deletion policy under the applicable YouTube API data-retention requirements before unattended production use. Real provider/key fidelity and real third-party playback were deliberately not tested. Browser/provider playback restrictions may change after saving.

## Homepage and live priority

One shared Option2 reel layout serves curated videos and live artists: previous/next, normalized count, selected thumbnail, horizontally scrollable responsive strip. One item hides all carousel navigation. Arrows keep the selected tile visible by scrolling only the strip, never the page. There is no timed rotation. Curated page-load/switch embeds use the fixed privacy-enhanced origin and `autoplay=0`, keyed by video ID so replacement removes the old player.

Initial live discovery completes before mounting a curated fallback, preventing a transient fallback before an already-live artist. Any live artist takes priority over the curated reel. Live thumbnails use only the existing public artist profile picture (now included in the existing discovery DTO) or neutral fallback, plus artist name and Live badge. The existing external platform player, pause/open/resume behavior and playback permissions remain unchanged. No new autoplay policy is imposed on the external live platform.

Selection is kept by artist/channel identity, not polling index; reorder preserves the mounted iframe. If that identity disappears, the first remaining entry in the current server list is selected deterministically and retained. Last offline returns to the prior curated selection. Source switches mount only one local iframe.

Explicit artist-library selections override polling: a selected library YouTube video stays selected across live arrival/reorder/offline and exposes **Return to live** when live artists exist (otherwise **Return to video**). Shared library audio similarly disables/unmounts homepage video while keeping metadata/controls inert, and offers the appropriate return action. Polls never steal these explicit choices. Returning removes the override and resumes current live priority or remembered curated selection. Artist-profile cover restoration and the persistent audio dock are unchanged. The existing `show_live_section=0` still hides automatic homepage video, not an explicitly chosen library video.

## Verification (fixtures only)

Frontend: full Vitest with `--maxWorkers=2`, lint, production build. Regressions cover one/many/empty/error, source-response ordering, live reorder/shrink/offline, explicit audio/video override, strip visibility, selected-index shrink, admin drafts/order/save/read-back and stale StrictMode reads.

Backend: native Node unit/route tests and the disposable PostgreSQL runner (`featured-native.test.js`, plus existing suites). New native tests rehearse the additive migration with preservation of users/sessions/settings, exact persisted manual order, preview-no-write, input validation, guest/artist/member rejection, provider failures, no-network-under-lock, admin demotion and revoked sessions during an observed user lock wait. Each native suite gets a fresh DB and verifies cleanup. Never run against `mss_local` for QA.

External Playwright artifacts live in the Hermes cache, not the repo. At 1280/390/320 all APIs, mutations, uploads, artwork and provider frames are intercepted with synthetic fixtures/inert HTML. Actual Chromium checks cover iframe replacement/identity, responsive bounds, arrow-selected tile visibility, live updates, library overrides, admin save/reload/error recovery, and empty/single states without real playback. These fixture checks do not establish live provider availability or deployment readiness.
