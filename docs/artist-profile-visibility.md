# Artist profile visibility

## Policy and administrator workflow

`artists.is_disabled` is a profile visibility flag, not `users.is_disabled` (account suspension). The additive migration `20261008000000_artist_visibility.js` creates a non-null boolean defaulting to `false`; existing artists remain public. No artists, associations, comments, settings, uploaded files or media links are deleted.

In **Edit Profile → Profile visibility**, a verified administrator can **Disable profile** or **Enable profile**. This is an immediate, separate action, not part of Save Changes. It uses `PUT /api/artists/:id/visibility` with exactly `{ "is_disabled": true }` or `false`, then reads the profile back before confirming the change. Pending controls are disabled; errors leave the editor draft intact and allow retry. General artist PUT rejects visibility fields. Artist accounts cannot toggle, even for their own profile. Session and administrator status are revalidated under the existing mutation/user/session locks.

Every authenticated, enabled account whose database role is **artist** or **admin** can view every disabled artist, regardless of ownership. Visitors, regular `user` accounts, expired/revoked sessions and disabled accounts cannot. Ordinary-user ownership does not bypass hidden profile management. Privileged directory/detail/edit views show Disabled status. Sharing actions are unavailable on a disabled detail.

## API coverage

Visibility is enforced on the server, not just in React:

- Artist directory, direct profile, management, artist images, artist events and linked YouTube collection.
- Own-artist navigation, global image gallery, Twitch/live stream discovery and legacy feed.
- Global and artist-scoped media library, including saved YouTube associations.
- Event lineups omit hidden artists. Event photos remain, but hidden current artist attribution is omitted for public readers.
- Discussions attached to a hidden profile return 404 to public readers; authenticated regular users cannot post to them.
- Existing event comments keep their historical posting-time names/content. Hidden current artist profile IDs and portraits are omitted publicly; unrelated account portraits and enabled artists are unchanged. Stored comments are never rewritten.

Hidden direct API resources return **404**. Sensitive GET responses use `Cache-Control: private, no-store` and `Vary: Authorization`. Optional bearer sessions are resolved from actual session/user records; frontend cached role hints are not authorization.

The media discovery cache remains shared. Each response filters original per-artist sources and saved videos by currently allowed artist IDs **before** deduplication and pagination. An enabled association to the same provider upload remains usable. Audience/artist scope contributes to the response cache version; totals and source status reflect only eligible sources. Stream mapping ambiguity checks still run on the complete artist mapping before filtering, so disabling one duplicate does not silently legitimize another mapping.

## Frontend identity transitions

Visibility-sensitive GET helpers send an optional bearer token and bypass the browser HTTP cache. Responses that finish after the captured token/role changes are rejected. `VisibilityBoundary` resets routed content and the retained media player/queue on account changes or validated role changes, preventing an old privileged page or iframe from surviving logout. Ordinary navigation and account-avatar changes do not reset playback or editor drafts. Existing effect cancellation rejects late responses from unmounted pages. Role changes are learned through authenticated current-user reads; no client can revoke already downloaded information instantaneously.

## Canonical links and sharing

The canonical server-rendered `/artists/:id` route returns a **404 generic SPA shell with no profile metadata** for disabled artists, marked noindex and private/no-store. A document navigation cannot attach a bearer token stored in localStorage, so retaining the generic application shell is intentional: an artist/admin opening a direct URL can subsequently authenticate the API read. Public viewers see Artist not found. There is no crawler-specific bypass. Existing exact-detail reverse-proxy routing and public-origin/build requirements in `profile-event-sharing.md` still apply.

## Explicit limitations

This is profile/discovery restriction, **not private media storage or DRM**. Previously known `/uploads` or `/media` URLs remain public, including shared assets. Public SoundCloud, Mixcloud, YouTube and Streaming-Platform URLs are not revoked. Already downloaded content, external caches and social previews cannot be recalled by this flag. Purge controlled CDN caches at rollout and refresh social caches where supported; third-party cache removal cannot be guaranteed.

Freeform event text, flyers, saved settings and historical comment author names may still mention an artist and are not scrubbed. Homepage curated YouTube entries have no artist association; their ownership is not guessed from titles/channels and they remain unchanged. Events and their photos are not deleted merely because a lineup artist is hidden.

## Deployment gate — not executed by implementation

1. Obtain independent review of the complete changed/untracked file union and exact SHA-256 manifest. Do not deploy a partially reviewed snapshot.
2. Confirm target branch and only the intended new pending migration; inspect the target database migration history without importing API startup. Preserve settings, environment and credentials.
3. During an authorized maintenance window, stop only MSS API, verify quiescence, take a verified PostgreSQL custom-format backup and retain before/after digests of all preexisting table rows (compare artist rows excluding the new column). Do not seed, reset or use down migrations against valuable data.
4. Apply the additive migration through the reviewed startup path, then start only MSS API. Build/release the reviewed frontend separately; this implementation's QA output is external and does not replace the served `dist`.
5. Verify health, all old artists default false, exact old-row/association preservation, and read-only public/admin/artist/regular-user visibility probes. If a real toggle smoke test is authorized, use a specifically approved synthetic profile and restore its original flag.
6. Verify cache/reverse-proxy policy and hidden canonical shell. If rollout fails, stop and investigate; keep the additive column and restore only an explicitly prepared compatible code artifact. Never blindly down-migrate or restore a valued database.

## Verification commands

- `cd mss-api && npm test` (native suites skip without an explicitly owned disposable database).
- As WSL root: `python3 /home/kjenn/code/mss/mss-api/test/run-registration-postgres.py artist-visibility-native.test.js`. The runner copies source/dependencies excluding environment/uploads/media, uses a fresh disposable database, and drops/verifies cleanup. No live DB is imported.
- `cd mss-web && npm test -- --maxWorkers=2 && npm run lint`.
- Build with an external `--outDir`, not the currently served build.

Native regressions exercise additive preservation, role/session matrices, endpoint/aggregate hiding, shared cached media, strict admin-only reversible mutation, and actual PostgreSQL user-lock revocation/demotion races. Fully intercepted native Chromium QA uses fictional profiles/artwork and inert provider frames at 1280, 390 and 320px, including retry/read-back/draft preservation and clearing a selected media iframe on logout. Local fixture QA does not establish public crawler reachability or external media privacy.
