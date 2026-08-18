# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-08-18

### Added

- Security response headers and a Content-Security-Policy
- TTL cache for hostname lookups and MMDB preload at boot
- Coverage tooling via `npm run coverage`
- Robots and sitemap routes, theme color, and structured data for search engines
- PWA support: web manifest, installable metadata, and a service worker for static assets
- Larger tap targets for touch devices
- Nginx Proxy Manager header configuration documented in the README

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