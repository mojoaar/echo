# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Homepage lookup statistics gain a range selector (24 hours default / 7 days / 30 days / all time) with per-range totals and top countries.
- DNS lookup also resolves CNAME, SRV, and CAA records.

### Fixed

- Admin activity trend renders a flat line for single-day ranges instead of an isolated dot.

## [1.8.0] - 2026-08-20

### Changed

- The `/data` card shows the actual volume contents plus free space on the backing volume instead of the host filesystem usage
- Admin resource trends gain Y and X axis value labels, a CPU chart, and network ingress/egress charts
- Admin dashboard adds a network card with live ingress and egress rates in bytes per second

### Fixed

- Admin activity trend dots are no longer distorted on single-day ranges

## [1.7.0] - 2026-08-20

### Changed

- The `echo` brand in the header links back to the home page
- Admin activity no longer shows legacy/unclassified rows and avoids duplicate lookup writes
- Public stats are now derived from attributed activity events instead of the separate lookup log
- Admin resource charts show current, peak, and minimum values for memory and `/data`
- Admin memory card shows usage as a percentage of the container limit or a `no container memory limit` note when unset
- Admin dashboard gains a refresh button, light/dark theme toggle, and site footer
- The resource sampler self-heals when authenticated but stopped, without requiring a container restart
- Admin dashboard includes a SQLite storage breakdown from `dbstat` and page-count pragmas

### Fixed

- Navigating back from `/docs` is now possible via the header brand link
- Mobile Safari keyboard activation of the light/dark toggle no longer flakes in the test suite
- Admin activity trend stays visible when the selected range contains a single day of activity

## [1.6.0] - 2026-08-20

### Added

- Public `/docs` page with usage, API reference, environment variables and deployment notes

## [1.5.0] - 2026-08-20

### Fixed

- DNS result timestamps now use strict ISO 8601 formatting with the browser's local timezone offset
- Admin login card no longer stretches to the full viewport height
- Connectivity diagnostics are hidden when no probe URL is configured

### Added

- Private `/admin` dashboard for retained visitor activity and Echo container resources
- Attributed activity events for successful page, geo, IP, WHOIS, and DNS lookups
- In-process resource sampling with bounded history and optional deployment-provided image size

### Security

- Separate `ADMIN_TOKEN` authentication with signed expiring sessions for the admin surface

## [1.4.3] - 2026-08-19

### Fixed

- Removed unused npm and npx tooling from the production image so container vulnerability scanning covers only runtime dependencies

## [1.4.2] - 2026-08-19

### Fixed

- Container vulnerability scanning now uses the current Trivy action release with a valid tag

## [1.4.1] - 2026-08-19

### Fixed

- CI version-sensitive health tests, consolidated WHOIS browser assertions, and mobile Safari theme keyboard coverage

### Changed

- Docker Compose now exposes the recommended endpoint-specific rate-limit defaults and corrected history window configuration

## [1.4.0] - 2026-08-19

### Added

- Independent IP and ASN registration presentation, including richer RDAP ASN fields and honest unavailable states
- On-demand browser IPv4/IPv6 connectivity diagnostics with separate public probe configuration
- Share links in the canonical `/?ip=` format with lookup-specific noindex metadata and main-site canonical URLs
- Public liveness and authenticated readiness reporting through `/api/health`

### Changed

- DNS lookups now enforce public-only policy and expose bounded cache, timing, and partial-result metadata
- DNS result timestamps now use 24-hour formatting while preserving the browser's local timezone
- WHOIS IP and ASN registration details are presented together in one consolidated table
- Lookup retention, aggregate public history, endpoint budgets, stable error codes, and HTTP rate headers are documented as explicit contracts
- CI and browser verification gates now cover coverage thresholds, CSP, supply chain, container, and deterministic browser behavior

### Security

- Documented CSP and COOP/CORP responsibilities, proxy header trust, LAN firewall boundaries, and proxy-owned HSTS
- Documented the query-string stats-token tradeoff and recommended bearer-header authentication

### Fixed

- Map marker now renders as a CSS pin so the content security policy does not block it

## [1.3.0] - 2026-08-19

### Added

- WHOIS ownership lookup via RDAP, with a TTL cache and an on-demand button
- Forward DNS lookup (A, AAAA, MX, NS, TXT, SOA records) via `/api/dns`
- Plain-text arbitrary IP lookup via `/api/ip?ip=8.8.8.8`
- Private owner-analytics endpoint `/api/stats`, guarded by a `STATS_TOKEN`

### Changed

- The public lookup feed and `/api/history` now return aggregates (totals and top countries) instead of raw visitor IPs, for privacy
- Per-visitor rate limiting now applies to all public API endpoints
- Copy and copy-as-JSON buttons are hidden together on private networks

## [1.2.0] - 2026-08-18

### Added

- Robots and sitemap routes, theme color, and structured data for search engines
- PWA support: web manifest, installable metadata, and a service worker for static assets
- Larger tap targets for touch devices
- Nginx Proxy Manager header configuration documented in the README

## [1.1.0] - 2026-08-18

### Added

- Security response headers and a Content-Security-Policy
- TTL cache for hostname lookups and MMDB preload at boot
- Coverage tooling via `npm run coverage`

### Fixed

- Rate limiting now keys on the proxy-verified address and bounds tracked keys
- IPv6 `fe00::/10` classified as reserved
- `/api/ip` 400 now returns `text/plain` with `no-store`
- Hostname race timer cleared on completion

## [1.0.0] - 2026-08-18

### Added

- Server-side IP and geo lookup for the visitor's own address and arbitrary `?ip=` lookups
- Full `IpInfo` payload: city, region, country, flag, ISP/ASN, timezone and UTC offset, coordinates, hostname
- Bundled offline geo database (db-ip City and ASN MMDB files) with no client-side lookups
- SQLite lookup history with a public `/api/history` endpoint
- Public API endpoints `/api/ip` (plain text) and `/api/json` (full payload, CORS enabled)
- Per-visitor fixed-window rate limiting on `/api/json`
- Light and dark themes with an anti-flash inline init and a manual toggle
- Typed IP animation, copy and copy-as-JSON buttons, and a Leaflet map modal for coordinates
- Self-hosted Umami analytics script injection, gated on environment variables
- Docker delivery with a multi-stage build, non-root runtime, and a persistent data volume

### Fixed

- IPv6-mapped IPv4 addresses (`::ffff:a.b.c.d`) normalized to plain IPv4 before storage and logging
- UTC offsets normalized to a padded `±HH:MM` shape, with `+00:00` for zero-offset zones
- Timezone derived from coordinates when the geo database carries no per-IP timezone
- Map modal width: overlaid layout and portal rendering escape the card hover transform
- Leaflet CSS and JavaScript awaited before map initialization
- Self-referential `--font-mono` token that prevented JetBrains Mono from applying
- Copy button now reports success only when the clipboard write succeeds
