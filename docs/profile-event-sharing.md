# Homepage, artist and event sharing

## Data and behavior

The shared Option 3 sheet is available on numeric `/artists/:id` and `/events/:id` detail routes. Existing router/API routes use IDs, not saved slugs. Artist cards use **only `artists.profile_picture`**; event cards use **only `events.flyer`**. Covers and galleries are never substituted.

Instagram is manual: export a 1080 × 1350 PNG with full, naturally proportioned artwork (contain, not cover), minimal title/location/date metadata and the canonical URL; copy the URL; then add the image/link in Instagram yourself. This is not a feed-posting integration. No provider tokens, SDKs, uploads or automatic posts are used. Missing art produces a neutral labelled card; failed art/CORS/PNG generation reports a download failure instead of silently changing the image. Clipboard failures leave a selectable URL. Browser download completion or Instagram publication is never claimed.

Export uses `getImageUrl` and anonymous-CORS browser Image loading. Same-origin `/uploads` works without a proxy; separately hosted uploads must allow the frontend origin via CORS. No server-side remote fetch/SSRF proxy exists. Decode rejects images above 16 million pixels and image loading has a 15-second timeout; this does not bound a third-party host's transfer before browser decode. Existing MSS uploads have their own admission limits. URLs are revoked after download initiation. Long PNG titles/details are ellipsized; source artwork is not cropped.

Facebook opens the web sharing composer with the canonical entity URL. The original portrait/flyer is supplied as `og:image`, not the generated Instagram card. Facebook controls display cropping, image format support and caching; this code cannot guarantee its final preview layout.

## Initial HTML social previews

The homepage `/` now serves MSS OpenGraph and Twitter card metadata using the existing public `/msslogo.jpg` JPEG. Artist detail HTML uses only the saved `profile_picture` for both cards, with this logo as fallback when the portrait is absent or its URL is unsafe. It never selects a cover or gallery image. Remote image availability is not probed: a saved but broken public portrait URL still requires the operator to repair it. Event artwork remains the saved flyer; missing event flyers do not receive an artist/logo fallback. The interactive share sheet and exported Instagram cards are unchanged.

Disabled artists still return a generic 404 SPA shell with `noindex`, no artist/social metadata, and `Cache-Control: private, no-store`. All renderer responses remain private/no-store. This does not make previously published image URLs private or recall metadata already cached by social networks.

## Required deployment wiring — not performed by this change

A static SPA index cannot give Facebook entity-specific metadata. `mss-api/sharing.js` adds public, server-rendered HTML **on `/` and the actual numeric detail URLs**, for both people and crawlers (no user-agent cloaking). It reads only ID/name or title/location/date/artwork fields, escapes dynamic HTML, and injects OpenGraph/Twitter/title/description/canonical tags into `mss-web/dist/index.html`. No database writes or migrations are required. Missing entity/invalid ID returns 404; missing build/config/read failure returns 503. No arbitrary request Host is used.

1. Choose the real publicly reachable HTTPS site origin. Set API `PUBLIC_SITE_ORIGIN` to that exact origin (no path, credentials, query or fragment). Set **the same** frontend build variable `VITE_PUBLIC_SITE_ORIGIN`. These are public configuration, not secrets. No production domain is guessed. Without configuration, the sheet previews real art but platform/copy actions are disabled with an explanation.
2. Build `mss-web` with that frontend variable. Keep its `dist/index.html` available to the API at the existing adjacent repository path. Serve `/assets/*`, `/msslogo.jpg` (from the build/public asset), and the rest of the web build normally. Do not route the logo to the API or SPA fallback.
3. At the public reverse proxy, forward **the exact homepage `/`** and **only exact numeric detail paths** matching `^/(artists|events)/[1-9][0-9]*/?$` to the MSS API, preserving the path. Keep list/create/update routes on the frontend. Continue existing `/api` and `/uploads` routing. Do not forward all `/artists` or `/events` traffic to the API. Ensure the public HTML route and image URLs work without authentication and are not blocked by robots, CDN/WAF or crawler rules. Compression can be configured at this proxy as described in Meta's webmaster guidance.
4. Deploy/restart only after independent review and explicit environment gating. No nginx, production configuration, services, live DB, credentials or migration was changed here. **The known unrelated comment timestamp/microsecond issue remains untouched and must be accounted for before broad API rollout.**
5. Read the homepage and artist/event public HTML with JavaScript disabled or `facebookexternalhit/1.1` user-agent and require the exact entity image/title/URL. Read the referenced public image separately, checking correct content and supported type. Use [Meta Sharing Debugger](https://developers.facebook.com/tools/debug/) on the real public URLs to validate and refresh cached previews. This requires public deployment; localhost and synthetic fixture origins cannot establish crawler reachability. Existing cached images may require changed image URLs, not only an HTML refresh.

Vite development remains the regular HMR SPA route: it does **not** pretend client-only meta tags are a valid Facebook preview. For isolated local renderer checks, mount `createSharingRouter` in a test Express server with fixture readers, as `test/sharing.test.js` does. Production forwarding is still required. Do not enable a public sharing origin before its real HTML route wiring is ready.

## Official references consulted

- [Meta: Sharing on the Web](https://developers.facebook.com/documentation/sharing/web/) — link sharing, dialogs and OpenGraph prerequisites.
- [Meta: Share Button](https://developers.facebook.com/documentation/plugins/share-button/) — canonical URL and OpenGraph preview fields; sharing does not require website Facebook Login permissions. The current UI uses the Facebook web `sharer/sharer.php?u=` composer link, not an SDK or app-scoped Share Dialog requiring an app ID.
- [Meta: Webmasters](https://developers.facebook.com/documentation/sharing/webmasters/) — `og:url`, `og:title`, `og:description`, `og:image`, server crawler handling and URL-based image caching.
- [Meta: Instagram Content Publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing/) — programmatic publishing is an authenticated professional-account API with permissions, not a general website-to-personal-feed share URL. This feature deliberately does not use it.

Meta documentation's `.md/` variants can be fetched if its rendered documentation page fails. No actual social post or login was performed.

### Reverse-proxy route example (operator action, not installed)

Within the existing HTTPS nginx server, with `root` pointing to the same frontend build that the API reads:

```nginx
location = / {
    proxy_pass http://127.0.0.1:4000;
}
location ~ ^/(artists|events)/[1-9][0-9]*/?$ {
    proxy_pass http://127.0.0.1:4000;
}
location = /msslogo.jpg {
    try_files $uri =404;
}
location /assets/ {
    try_files $uri =404;
}
# Retain existing /api and /uploads proxy locations.
# All other application paths, including /artists and /artists/:id/edit:
location / {
    try_files $uri $uri/ /index.html;
}
```

Merge rather than duplicate existing locations; numeric-detail regex precedence must not be shadowed by an existing `^~ /artists/` or `^~ /events/` location. Preserve the request path and honor `private, no-store`; do not cache these HTML responses at a CDN. Forward for every user agent, not only bots. Keep application asset URLs on the public site. A plain Vite/static homepage bypasses this renderer and has no new cards. No production proxy or environment changes are included.

After deployment, re-scrape both `/` and a public numeric artist URL in the Sharing Debugger. Social caches may retain previous images even after HTML updates; do not claim a refreshed Facebook/X preview until verified on the public site. Local fixture tests validate initial HTML only, not external crawler reachability or final display cropping.
