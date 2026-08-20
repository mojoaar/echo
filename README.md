# echo

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/tag/mojoaar/echo.svg)](https://github.com/mojoaar/echo/tags)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fmojoaar%2Fecho-blue.svg)](https://github.com/mojoaar/echo/pkgs/container/echo)
[![CI](https://img.shields.io/github/actions/workflow/status/mojoaar/echo/ci.yml.svg)](https://github.com/mojoaar/echo/actions/workflows/ci.yml)

See exactly what the internet sees when you connect: your IP address, location, ISP
and more — plus WHOIS, DNS and connectivity diagnostics.

## Features

- Server-side IP + geo lookup with bundled data (no client-side geo calls)
- Lookup any IP with `?ip=`, shareable links, copy as JSON
- On-demand WHOIS/RDAP and forward DNS resolution
- Optional IPv4/IPv6 connectivity diagnostic
- Aggregate-only public statistics (raw IPs stay private)
- Private `/admin` dashboard with resource sampling
- Rate limited public API, SQLite storage, hardened Docker image
- Light and dark theme, PWA support, Umami analytics

## Documentation

Full documentation — usage, API reference, environment variables, deployment,
Nginx Proxy Manager setup and releasing — lives at
**[https://echo.johansen.foo/docs](https://echo.johansen.foo/docs)**
(or `/docs` on your own deployment).

## Tech stack

Next.js 16 (App Router), TypeScript, better-sqlite3, mmdb-lib, tz-lookup,
Vitest, Playwright, Docker.

## Quick start

```bash
npm install
npm run fetch:mmdb
npm run dev
```

```bash
npm test
npm run lint
```

## Deploying

Images are published to GitHub Container Registry. Copy `docker-compose.yml` to
your host, configure a `.env`, then:

```bash
docker compose pull
docker compose up -d
```

See the docs for full deployment and reverse-proxy guidance.

## Data

Geo data via [db-ip](https://db-ip.com/) (CC BY 4.0).

## License

MIT © 2026 Morten Johansen (johansen.foo)
