# Public profile SEO

`/@handle` is the canonical public profile URL. Handles are lowercase in URLs; the page preserves the player's chosen capitalisation. `/players/:username`, mixed-case handles and trailing slashes redirect permanently to the canonical path.

The Worker renders the profile into the initial HTML response using the same profile components as the browser. The browser reads the public bootstrap data before refreshing it through the API. The existing React application handles interactions. Profile styles load with the initial document, including when JavaScript is disabled.

## Public data

HTML, bootstrap JSON and the public API share `readPublicProfile`. They expose the username, ratings and activity visibility. Activity and streaks appear only when activity is public. Email, reviews, conversations, teaching settings, timezone and subscription details stay out of these responses. Accounts pending deletion are omitted.

Profile HTML uses `Cache-Control: no-store` so visibility changes are not held in an edge cache. Missing profiles return HTTP 404 and `noindex`. Rendering or database failures return HTTP 503 with `Retry-After: 60`.

## Search and sharing

Each profile has a unique title and description, an absolute canonical URL, Open Graph and Twitter metadata, and `ProfilePage` JSON-LD. The canonical origin is `https://ludus.mrlemoos.dev`.

`/robots.txt` permits public profile crawling and advertises `/sitemap.xml`. The sitemap index links to the homepage sitemap and profile sitemaps containing at most 1,000 profiles each. Sitemaps include public usernames even when their activity is hidden. Deleted and deletion-pending profiles are excluded. Sitemap responses are not cached.

Server-rendered content uses British English. The browser retains the visitor's selected interface language and updates profile metadata accordingly. There are no separate language URLs or hreflang claims.

These changes make profiles discoverable and crawlable. They do not establish that Google has indexed a URL. Submit `/sitemap.xml` and inspect a profile URL in Search Console to verify Google's view.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm exec playwright test tests/e2e/profile-seo.spec.ts tests/e2e/profile-design.spec.ts tests/e2e/account.spec.ts tests/e2e/online.spec.ts`

The browser checks include JavaScript-disabled rendering, metadata after client navigation, canonical redirects, real 404 responses, HEAD requests, sitemap discovery and hidden activity in initial HTML. SQLite unit checks cover deletion exclusion, pagination and retryable template failures.
