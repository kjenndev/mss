# MSS audit hardening

## Scope

MSS owns artists, events, community content and the presentation/discovery of streams. Streaming-Platform owns channels, ingest and playback. Channels continue to be created manually and assigned by an MSS administrator. This branch does not modify Streaming-Platform.

## Implemented changes

- Contain asynchronous route errors; validate request shapes without terminating the API.
- Use explicit public DTOs rather than serializing password hashes or legacy streaming-secret columns.
- Upgrade successful legacy logins to scrypt without resetting the password. Expire sessions and revoke them after credential changes; throttle login attempts.
- Authorize uploads before writing, validate and re-encode bounded raster images, enforce storage accounting, and compensate failed database operations.
- Use transactional mutations, authoritative ownership and forward relational constraints. Clear deleted image references; preserve optional event dates as null.
- Validate comment targets/parents and expose pagination with a deletion-safe ID cursor.
- Keep artist drafts separate from media updates; retry failed flyer uploads without creating another event; guard routes and stale asynchronous responses.
- Support mobile navigation, explicit load errors/retry, local logout despite network failure, safe rich text and consistent new-password validation.
- Bound Redis discovery, separate unavailable from offline, isolate malformed records, preserve exact channel names, and make public/API/media addresses configurable.
- Keep stream status fresh without undoing a viewer's deliberate pause.

## Upgrade precautions

Back up PostgreSQL and the upload directory. Rehearse the new migration against a restored backup before restarting the API: startup applies migrations. Do not edit historical migrations or rerun seeds on existing installations.

The forward migration deliberately refuses inconsistent references instead of deleting or guessing at legacy data. Review the reported inconsistency and choose the intended ownership/reference before retrying. `artists.user_id` is the canonical ownership association; `users.artist_id` is a primary selection, not a second independent permission grant. A primary selection must refer to an artist owned by that user. Use the explicit owned-artist list to transfer ownership.

Channel names are matched exactly, including case. `Foo` and `foo` are distinct names; assigning the identical nonempty name to multiple artists is rejected. This does not provision a channel or verify ownership inside Streaming-Platform.

Keep the private environment and credential files outside Git. New passwords must be 12–1024 characters; do not reset existing passwords as part of an upgrade. Validate login with the existing credential, and expect only its legacy stored hash to change after a successful upgrade login.

## Configuration

See the API README and safe `.env.example` files. Use a same-origin reverse proxy for `/api` and `/uploads`, or configure `VITE_API_URL` together with the exact `CORS_ORIGINS`. Container deployments may need explicit `HOST=0.0.0.0`; development defaults to loopback. `streaming_platform_url` points to the separate web player; `MEDIA_BASE_URL` is an optional public media base, not an ingest endpoint.

## Verification status

Verified locally on `feature/audit-hardening`:

- Clean lockfile installs; 87 API tests and 123 frontend tests passed. Lint, production build and whitespace checks passed.
- Independent backend, frontend and stream-discovery reviews passed for the scoped fixes.
- 98 isolated PostgreSQL/HTTP checks passed (50 core and 48 review), including rollback, shared-upload last-reference removal and concurrent mutation cases. Owned test databases, listeners and upload files were cleaned up.
- 51 desktop/mobile browser scenarios passed after local deployment, with no recorded page errors or blocked unexpected mutations. Authenticated/destructive browser workflows use intercepted API fixtures; the home page also uses real read-only APIs.
- Full and production dependency audits: API zero advisories; frontend two low-severity findings, no moderate/high/critical findings. Frontend raw audit exit status remains nonzero; these are documented exceptions, not a clean audit.
- Backup restoration and forward migration were rehearsed on an owned disposable database before restarting only MSS API/web. Applied migrations and HTTP readiness were read back successfully.
- Existing admin credentials authenticated against the updated live API. Public and authenticated API probes returned HTTP 200; the temporary session was logged out. Preservation checks verified original data and private configuration, allowing only the verified login-time hash upgrade. Streaming-Platform work remained unchanged.

This establishes local verification, not production readiness or live broadcasting verification. Changes remain uncommitted and unpushed.

## Remaining boundaries

- Streaming-Platform channel-management authorization and password-protected viewing findings are deferred to that separate project by the selected scope.
- The platform's existing full player is used; MSS does not claim an unsupported video-only embed or shared login.
- Redis entries have no producer heartbeat contract. MSS does not incorrectly expire a healthy long-running stream using only its start time.
- Two low-severity Quill/react-quill-new advisories require upstream resolution or a separately evaluated editor replacement. Safe HTML sanitization is applied; audit output is not claimed to be zero on the frontend.
- The frontend build's large-chunk warning is a performance follow-up, not a failed build.
- Filesystem failures or process crashes can require upload-storage reconciliation; database rollback does not make filesystem operations fully atomic.
- Mocked player tests do not constitute an end-to-end live broadcast or load test.

## Nonblocking review follow-ups

- Upload cleanup has no durable retry after process/filesystem failures. Candidate discovery scans the upload ledger, and the shared mutation lock serializes unrelated writes; measure and improve scalability before expanding deployment.
- Rehearsal covered the existing backup, not every possible inconsistent legacy fixture.
- Existing navigation lacks cross-tab identity synchronization; admin dashboard rejection handling and its Standard User role-edit option remain UX follow-ups. Backend authorization remains the security boundary.
