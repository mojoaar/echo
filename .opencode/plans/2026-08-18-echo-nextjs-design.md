# echo.johansen.foo — Next.js Rewrite Design

**Date:** 2026-08-18
**Status:** Approved (design sections 1–3 checked off by user on 2026-08-18)

## Goal

Rebuild the existing static echo.johansen.foo site (`/Users/mojoaar/Development/echo_landing`,
vanilla HTML/CSS/JS on Cloudflare Pages + Functions) as a **Next.js 16.3.1 App Router
application** with server-side IP/geo detection, a lightweight SQLite lookup log, and a
fully self-contained deployable Docker image. The site must be visually faithful to today's
aesthetic (dark default, `#0f1117` background, `#7c6af7` accent, JetBrains Mono) with full
**light/dark mode** support, polished further with subtle elevation, gradients and
micro-interactions.

## Decisions

1. **Approach:** Server-first (Approach A). The `/` page is an async Server Component;
   geo lookup, DB logging, and HTML rendering all happen server-side on each request.
2. **Architecture choice (user-confirmed):** Server-first rendering with tiny client islands.
3. **Visual direction (user-confirmed):** Faithful port + polish — keep today's exact design
   tokens and layout, elevate the finish.
4. **History:** Global lookup log (every visitor + arbitrary lookup stored server-side with
   timestamp); no cookies. Powers a public recent-lookups feed.
5. **Database:** SQLite via `better-sqlite3`, file on a Docker volume; no extra container.
6. **Geo data:** Bundled db-ip free MMDB files (City + ASN) downloaded at build time; offline
   and self-contained.
7. **Compose:** App + SQLite volume only; TLS handled by the user's existing external reverse
   proxy (already serving umami.johansen.foo).
8. **Umami:** Script tag injected via env vars `UMAMI_SCRIPT_URL` + `UMAMI_WEBSITE_ID` defined
   in docker-compose.yml; browser-only tracking. Defaults: `https://umami.johansen.foo/script.js`
   and `2dd1b560-7022-49d1-8063-bd3ccc99f21d`.

## Architecture

Next.js 16.3.1, App Router, TypeScript, `output: 'standalone'` for a lean container.

```
echo/
├─ app/
│  ├─ layout.tsx            # <head> theme init, Umami script, font
│  ├─ page.tsx              # async Server Component — the whole dashboard
│  └─ api/
│     ├─ ip/route.ts        # plain-text IP endpoint
│     ├─ json/route.ts      # full JSON endpoint (?ip= for arbitrary lookup)
│     └─ history/route.ts   # recent-lookups feed
├─ lib/
│  ├─ ip.ts                 # visitor IP extraction from headers
│  ├─ geo.ts                # mmdb lookups (City + ASN) → normalized payload
│  ├─ db.ts                 # better-sqlite3 init, schema, insert/query
│  └─ types.ts              # shared types (IpInfo, HistoryEntry)
├─ components/
│  └─ ui/                   # client islands only
│     ├─ CopyButton.tsx
│     ├─ ThemeToggle.tsx
│     ├─ RefreshButton.tsx
│     ├─ LookupForm.tsx
│     ├─ MapModal.tsx
│     └─ RecentFeed.tsx
├─ scripts/
│  └─ fetch-mmdb.mjs        # build-time MMDB downloader
├─ data/                    # mmdb files (baked into image at build)
├─ public/                  # favicons ported from today's site
├─ Dockerfile
├─ docker-compose.yml
└─ .env.example             # documents compose env vars
```

### Request flow (visitor)

Reverse proxy → `/` Server Component → `lib/ip.ts` extracts visitor IP from `x-forwarded-for`
→ `lib/geo.ts` (in-memory-loaded mmdb reader, sync, milliseconds) fills the normalized payload
→ `lib/db.ts` inserts a `{ip, iso, ts}` row (global lookup log) → HTML renders pre-filled. No
client fetches.

### Arbitrary lookup

`/?ip=X` validated server-side (IPv4/IPv6 regex, same as today) → same pipeline → rendered page
for that IP. `/api/json?ip=X` and `/api/ip` reuse `lib/geo.ts` verbatim — one code path.

### Map

Coordinates card keeps Leaflet via CDN (client-side display only, as today) — dark/light
CartoDB tiles switch with the theme. IP-precision disclaimer retained.

## Data model

SQLite via better-sqlite3; file `echo.db` on a Docker volume. Single table:

```
lookups
  id      INTEGER PRIMARY KEY AUTOINCREMENT
  ip      TEXT NOT NULL            -- normalized (no IPv6-mapped IPv4 quirks)
  iso     TEXT                     -- country code (nullable: localhost/private)
  ts      INTEGER NOT NULL         -- unix ms
  idx:    ts DESC (feed ordering)
```

- No person data beyond IP + country; privacy-lean, no cookies.
- WAL mode for reads (single container, write-on-read visitor traffic).
- Init via `schema.sql` applied at boot (idempotent `CREATE TABLE IF NOT EXISTS`).

## Geo pipeline

Offline, in-image. Two db-ip free MMDB files downloaded at **build time** in the Dockerfile:
city-mmdb (city, coordinates, country) and asn-mmdb (ISP/ASN) — placed in `/app/data`. A Node
script (`scripts/fetch-mmdb.mjs`) runs as a build step; no runtime network dependency.
`lib/geo.ts` loads both with **`mmdb-lib`** (sync, ~50µs lookups, no native deps — better Docker
cache layers than @maxmind/geoip2-node's FFI) into memory at server start.

### Normalized payload (`IpInfo`)

Parity with today's `normalise()` covering both ipapi.co and ip-api.com shapes:

```ts
{ ip, city, region, country, countryCode, countryName, flag, org, asn,
  timezone, utcOffset, latitude, longitude, hostname }
```

- `hostname` falls back to PTR reverse lookup (as today).
- `flag` via the same `flagEmoji(countryCode)` mapping today's site uses.
- IPv6 accepted (db-ip covers IPv6).
- Private/reserved ranges handled gracefully — country columns null, page renders a
  "private/loopback" state instead of fake coordinates.

## API surface

All server-rendered, sharing `lib/geo.ts`:

- `GET /api/ip` — plain text IP (`text/plain`), parity with today's `/api/ip`.
- `GET /api/json` — full `IpInfo` JSON for the visitor; `?ip=X` for arbitrary lookup. CORS `*`
  + OPTIONS preflight, `no-store`, as today's Cloudflare function.
- `GET /api/history?limit=N` — recent-lookups feed from the SQLite log (drives the public
  "recent" section): JSON array of `{ip, iso, ts}`.

## Theming

Faithful port + polish. CSS custom properties in `globals.css`; two palettes via
`[data-theme="light"|"dark"]` (dark default). Anti-FOUC `<script>` inline in `<head>` reads
`localStorage.echo-theme` before paint. Toggle is a client island.

- Same tokens as today: `#0f1117` bg dark, `#7c6af7` accent, JetBrains Mono.
- Light palette derived from the current light theme in the existing site.
- Polish layer: smooth theme transition, subtle card elevation, CSS-var-driven accent glows,
  refined spacing.
- Favicons ported to `public/`.

## Umami

`layout.tsx` conditionally injects `<script defer src={UMAMI_SCRIPT_URL}
data-website-id={UMAMI_WEBSITE_ID}>` when both env vars are set. Browser-only tracking; no
server-side events.

## Delivery

**Dockerfile** — multi-stage:
- Build stage: `npm ci`, run `scripts/fetch-mmdb.mjs` (downloads City + ASN MMDBs into `data/`),
  `next build`.
- Runtime stage: copies `standalone`, `public`, `data`, `schema.sql`; **non-root user**
  (image runs as an unprivileged user with the volume writable); `HEALTHCHECK` hitting `/api/ip`.

**docker-compose.yml** — app service + named volume `/data` for `echo.db`; env
`UMAMI_SCRIPT_URL`, `UMAMI_WEBSITE_ID`, `DB_PATH`, `PORT`; expose internal port; TLS remains on
the user's existing reverse proxy.

## Error handling

- Geo lookup failures: render the page sections gracefully with a clear "unavailable" state;
  the visitor IP row is still logged.
- DB failure: log and continue (page degrades to read-only payload).
- Invalid `?ip=` values: 400 on the API, inline validation message on the page.

## Testing

- Unit tests for `lib/ip.ts` (header parsing, IPv6-mapped IPv4 normalization),
  `lib/geo.ts` (known CIDR → expected country), and IP validation regexes.
- API route tests (vitest) for `/api/ip`, `/api/json`, `/api/history` with a temp SQLite file.
- Manual E2E via `docker compose up` + local `curl`, plus browser check of light/dark mode and
  the map modal.