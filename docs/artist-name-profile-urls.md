# Artist profile name URLs

Public artist profiles use server-derived lowercase slugs, for example `/artists/midnight-sound-syndicate`. Numeric artist IDs remain the internal keys for ownership, comments, media, uploads, streaming, and authenticated management routes.

## Canonical slug policy

The API owns the slug; create and update clients cannot submit it directly. Artist names are compatibility-decomposed with Unicode NFKD, combining marks are removed, text is lowercased, and each run of characters outside ASCII `a-z` and `0-9` becomes one hyphen. Leading and trailing hyphens are removed and the result is limited to 100 characters without a trailing hyphen. A name that produces no slug, a numeric-only slug such as `123`, or the reserved SPA route `create` is rejected.

Slugs are unique. Creation or renaming that would reuse another artist's slug returns HTTP `409`; the server does not append a number, rename an existing artist, merge records, or otherwise resolve the collision silently. Renaming an artist changes its canonical URL immediately. The previous name slug is not retained as an alias.

## Migration

`20261021020000_artist_name_slugs.js` is a transactional, forward-only migration. It derives and validates every existing artist's slug before changing any rows. An empty, numeric-only, reserved, or colliding result aborts and rolls back the migration, preserving all existing rows and slug values. On success it temporarily clears legacy slug values inside the transaction while the existing unique constraint remains active, then assigns the validated final values. This conflict-free step permits valid swaps such as legacy `a`/`b` becoming final `b`/`a`. The migration then makes `artists.slug` `NOT NULL`, adds the canonical policy check, and adds a unique index.

## Legacy numeric profile URLs

Numeric IDs remain accepted by the public artist JSON lookup for compatibility. The response includes `canonicalPath`, and the React profile route replaces a loaded numeric browser URL with that path. Server-rendered HTML requests to `/artists/<numeric-id>` receive a permanent `308` redirect to the trusted configured public origin and canonical slug URL. Invalid, missing, and hidden artists do not redirect; hidden artists retain the generic `404`/`noindex` HTML behavior.

## Reverse-proxy routing

Production must send canonical `/artists/<slug>` and legacy `/artists/<numeric-id>` document requests to the API sharing renderer while leaving application routes on the SPA. The artist slug matcher must require at least one ASCII letter and explicitly exclude `/artists/create`; numeric routes are forwarded separately so the API can issue the legacy redirect. See `docs/profile-event-sharing.md` for the authoritative nginx example and deployment verification steps.
