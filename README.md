# echo

Yet another "what is my IP" service — but this one tells you what the internet sees when you connect: your IP address, location, ISP/ASN, timezone, coordinates (with a map) and hostname. All lookups run server-side against a bundled offline geo database.

## Features

- Server-side IP and geo lookup — no client-side calls to third-party services
- Lookup any IP address with `?ip=` or query the API directly
- IP history log stored in SQLite, exposed through `/api/history`
- Per-visitor rate limiting on the JSON API
- Light and dark themes with a manual toggle
- Copy / copy-as-JSON buttons and a Leaflet map modal for coordinates
- Self-hosted Umami analytics, enabled through environment variables
- Ships as a Docker image with a persistent data volume

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, TypeScript, standalone output)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for the lookup history
- [mmdb-lib](https://github.com/nicolo-ribaudo/mmdb-lib) to read the bundled [db-ip](https://db-ip.com) MMDB files
- [@photostructure/tz-lookup](https://github.com/photostructure/tz-lookup) to derive the timezone from coordinates
- [Vitest](https://vitest.dev) for tests
- [Docker](https://docker.com) for delivery

## Local development

```bash
npm install
npm run fetch:mmdb     # downloads db-ip City + ASN databases into data/
npm run dev
```

```bash
npm test               # run the test suite
npm run lint           # typecheck (tsc --noEmit)
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `APP_URL` | `https://echo.johansen.foo` | Public origin used in metadata and footer curl examples |
| `ECHO_TAG` | `latest` | GHCR image tag to pull (e.g. `v1.2.0`) |
| `TZ` | `Europe/Copenhagen` | Container timezone |
| `RATE_LIMIT_MAX` | `30` | Max `/api/json` requests per visitor IP per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window length in milliseconds |
| `UMAMI_SCRIPT_URL` | _(unset)_ | Umami script URL; when set together with `UMAMI_WEBSITE_ID`, the analytics script is injected |
| `UMAMI_WEBSITE_ID` | _(unset)_ | Umami website id |

The following are set inside the official Docker image and are only needed when running outside it: `PORT`, `HOSTNAME`, `DB_PATH`, `SCHEMA_PATH`, `MMDB_CITY`, `MMDB_ASN`.

## API

### `GET /api/ip`

Returns the caller's IP address as plain text.

```
$ curl https://echo.johansen.foo/api/ip
203.0.113.7
```

### `GET /api/json`

Returns the full geo payload for the caller's IP address, or for a specific address when `?ip=` is provided. Responses are CORS-enabled and carry `x-ratelimit-limit` and `x-ratelimit-remaining` headers. Exceeding the per-IP window returns `429` with a `retry-after` header.

```
$ curl https://echo.johansen.foo/api/json?ip=8.8.8.8
```

```json
{
  "ip": "8.8.8.8",
  "city": "Mountain View",
  "region": "California",
  "country": "US",
  "countryName": "United States",
  "flag": "🇺🇸",
  "org": "Google LLC",
  "asn": "AS15169",
  "timezone": "America/Los_Angeles",
  "utcOffset": "-08:00",
  "latitude": 37.422,
  "longitude": -122.085,
  "hostname": null,
  "isPrivate": false
}
```

### `GET /api/history?limit=20`

Returns the most recent lookups, newest first. `limit` is clamped to `1..100` and defaults to `20`.

## Deployment

Copy `docker-compose.yml` to the host, then:

```bash
docker compose pull
docker compose up -d
```

No checkout of the source is needed — the image is pulled from the GitHub Container Registry.

The app listens on port `3100` (bound to all interfaces; keep the host firewall closed to direct access if the reverse proxy is the only intended entry). The lookup history persists in the `echo-data` volume. TLS terminates on your existing reverse proxy in front of the app. To pin a specific release instead of `latest`, set `ECHO_TAG` (for example `ECHO_TAG=v1.2.0` in the environment or a `.env` file next to the compose file).

Prebuilt images are published to GitHub Container Registry on every release:

```bash
docker pull ghcr.io/mojoaar/echo:v1.2.0
docker run -d --name echo -p 3100:3000 \
  -v echo-data:/data \
  -e APP_URL=https://echo.johansen.foo \
  -e TZ=Europe/Copenhagen \
  ghcr.io/mojoaar/echo:v1.2.0
```

The default timezone is `Europe/Copenhagen`; set `TZ` to change it (for example `UTC`).

The app trusts `x-real-ip` first, then `x-forwarded-for`. The reverse proxy must overwrite these headers with the verified client address.

When you access the site from inside the same network it's hosted on, NAT-loopback rewrites your source to the gateway's private IP, so the site shows "You are on a private network" — that's expected. Visit from outside your LAN (e.g. mobile data) to see your public WAN IP.

### Nginx Proxy Manager

If echo runs behind Nginx Proxy Manager, the proxy headers are set automatically — no manual configuration is needed. Every NPM 2.x Proxy Host generates a location block that sets:

- `X-Real-IP` from `$remote_addr`
- `X-Forwarded-For` from `$proxy_add_x_forwarded_for`
- `X-Forwarded-Proto` from `$scheme`
- `X-Forwarded-Host` from `$host`

The app trusts `X-Real-IP` first, so it always sees the real visitor address. Client-supplied `X-Real-IP` / `X-Forwarded-For` values are overwritten by nginx and have no effect.

Manual steps are only needed when an extra hop sits between NPM and the app:

- **Cloudflare (or another CDN) in front of NPM** — NPM then sees Cloudflare's IP, not the visitor's. In the proxy host's **Advanced** tab add:

  ```nginx
  set_real_ip_from 173.245.48.0/20; # repeat for all ranges at https://www.cloudflare.com/ips/
  real_ip_header CF-Connecting-IP;
  ```

  or `real_ip_header X-Forwarded-For; real_ip_recursive on;`.

- **NPM forwards through an intermediate proxy** before reaching echo — same pattern: `set_real_ip_from` the intermediate proxy's IP range, then `real_ip_header X-Forwarded-For; real_ip_recursive on;`.

Verify after deploying:

```bash
curl -H 'X-Real-IP: 1.1.1.1' -H 'X-Forwarded-For: 1.1.1.1' https://echo.johansen.foo/api/ip
```

must return your real public IP — never `1.1.1.1`. The same setup applies to any service behind NPM, including umami.

## Releasing

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and keeps a [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) formatted changelog. Releases are cut with a single command:

```bash
npm run release:patch   # 1.0.0 -> 1.0.1
npm run release:minor   # 1.0.0 -> 1.1.0
npm run release:major   # 1.0.0 -> 2.0.0
```

Each release bumps the version, moves the `## [Unreleased]` entries into a dated changelog section, commits, and creates a `vX.Y.Z` git tag. The release command refuses to run on a dirty working tree. Pushing that tag triggers CI to build and publish the image to GitHub Container Registry.

## Data

Geo data is provided by [db-ip.com](https://db-ip.com) and is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Morten Johansen (johansen.foo).