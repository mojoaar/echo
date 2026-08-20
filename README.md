# echo

Yet another "what is my IP" service — but this one tells you what the internet sees when you connect: your IP address, location, ISP/ASN, timezone, coordinates (with a map) and hostname. All lookups run server-side against a bundled offline geo database.

## Features

- Server-side IP and geo lookup — no client-side calls to third-party services
- Lookup any IP address with `?ip=` or query the API directly
- WHOIS ownership lookup (RDAP) and forward DNS records
- Aggregate lookup stats (totals and top countries) for privacy
- Per-visitor rate limiting on all public API endpoints
- Light and dark themes with a manual toggle
- Copy / copy-as-JSON buttons and a Leaflet map modal for coordinates
- On-demand browser IPv4 and IPv6 connectivity diagnostics
- Self-hosted Umami analytics, enabled through environment variables
- Ships as a Docker image with a persistent data volume

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, TypeScript, standalone output)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for the lookup history
- [mmdb-lib](https://github.com/nicolo-ribaudo/mmdb-lib) to read the bundled [db-ip](https://db-ip.com) MMDB files
- [@photostructure/tz-lookup](https://github.com/photostructure/tz-lookup) to derive the timezone from coordinates
- [Vitest](https://vitest.dev) for tests
- [Playwright](https://playwright.dev) for deterministic desktop and mobile browser tests
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
npm run coverage       # V8 coverage with enforced server-side thresholds
npx playwright install chromium webkit
npx playwright test   # local Next server, with RDAP/DNS fixtures in browser specs
npm audit --audit-level=high
```

Browser tests start isolated local Next development servers and intercept RDAP, DNS, Leaflet, and configured probe requests where the upstream service is not the behavior under test. CSP is enabled in every browser project, including the configured-probe assertion; runtime nonce handling keeps development hydration compatible with the production policy. The home page includes a `Copy link` control for the approved `/?ip=` share format, and valid lookup pages receive descriptive noindex metadata with the main site as canonical.

The CI supply-chain jobs require GitHub Actions to be able to download the pinned action dependencies, Docker Buildx to build the local image, and Trivy's vulnerability database to be reachable. Secret scanning uses TruffleHog's verified-results mode and therefore reports only verified findings. Trivy blocks HIGH and CRITICAL vulnerabilities; `.trivyignore` is intentionally absent because no reviewed false positives are currently accepted. SBOM files are retained as workflow artifacts for 30 days. Image signing is intentionally deferred.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `APP_URL` | `https://echo.johansen.foo` | Public origin used in metadata and footer curl examples |
| `CONNECTIVITY_IPV4_URL` | _(unset)_ | Public CORS-enabled A-only probe URL; unset disables the IPv4 diagnostic |
| `CONNECTIVITY_IPV6_URL` | _(unset)_ | Public CORS-enabled AAAA-only probe URL; unset disables the IPv6 diagnostic |
| `ECHO_TAG` | `latest` | GHCR image tag to pull (e.g. `v1.2.0`) |
| `TZ` | `Europe/Copenhagen` | Container timezone |
| `RATE_LIMIT_MAX` | `30` | Legacy fallback max for endpoints without an endpoint-specific value |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Legacy fallback window length in milliseconds |
| `RATE_LIMIT_JSON_MAX` / `RATE_LIMIT_JSON_WINDOW_MS` | `30` / `60000` | `/api/json` max and window |
| `RATE_LIMIT_IP_MAX` / `RATE_LIMIT_IP_WINDOW_MS` | `60` / `60000` | `/api/ip` max and window |
| `RATE_LIMIT_HISTORY_MAX` / `RATE_LIMIT_HISTORY_WINDOW_MS` | `30` / `60000` | `/api/history` max and window |
| `RATE_LIMIT_WHOIS_MAX` / `RATE_LIMIT_WHOIS_WINDOW_MS` | `10` / `60000` | `/api/whois` max and window |
| `RATE_LIMIT_DNS_MAX` / `RATE_LIMIT_DNS_WINDOW_MS` | `10` / `60000` | `/api/dns` max and window |
| `RATE_LIMIT_STATS_AUTH_MAX` / `RATE_LIMIT_STATS_AUTH_WINDOW_MS` | `5` / `60000` | Failed `/api/stats` authentication max and window |
| `STATS_TOKEN` | _(unset)_ | Optional secret token protecting `/api/stats`; endpoint is disabled when unset |
| `HEALTH_TOKEN` | _(unset)_ | Optional secret token for authenticated `/api/health` readiness |
| `ADMIN_TOKEN` | _(unset)_ | Separate secret token for the private `/admin` dashboard and admin APIs; admin is disabled when unset |
| `ADMIN_SESSION_TTL_SECONDS` | `28800` | Admin session lifetime in seconds; defaults to eight hours |
| `LOOKUP_RETENTION_DAYS` | `90` | Private lookup retention period in days |
| `ECHO_IMAGE_SIZE_BYTES` | _(unset)_ | Optional deployment-provided image size shown in the admin resource view; the container never queries the Docker host |
| `UMAMI_SCRIPT_URL` | _(unset)_ | Umami script URL; when set together with `UMAMI_WEBSITE_ID`, the analytics script is injected |
| `UMAMI_WEBSITE_ID` | _(unset)_ | Umami website id |

The following are set inside the official Docker image and are only needed when running outside it: `PORT`, `HOSTNAME`, `DB_PATH`, `SCHEMA_PATH`, `MMDB_CITY`, `MMDB_ASN`.

Endpoint-specific rate-limit variables are optional. Leave them unset or empty to use the legacy global values; the application resolves each setting as endpoint-specific, then legacy global, then the endpoint default. In `docker-compose.yml`, endpoint-specific variables are intentionally passed through as empty unless explicitly configured.

## API

### `GET /api/ip`

Returns the caller's IP address as plain text. Provide `?ip=` to look up an arbitrary address as plain text instead. Invalid input returns a stable JSON error with `code: "invalid_input"`; rate-limited responses return `code: "rate_limited"`.

```
$ curl https://echo.johansen.foo/api/ip
203.0.113.7

$ curl https://echo.johansen.foo/api/ip?ip=8.8.8.8
8.8.8.8
```

### `GET /api/json`

Returns the full geo payload for the caller's IP address, or for a specific address when `?ip=` is provided. Responses are CORS-enabled and carry `x-ratelimit-limit` and `x-ratelimit-remaining` headers. Exceeding the per-IP window returns `429` with `{ "error": "rate limit exceeded", "code": "rate_limited" }` and a `retry-after` header in delta-seconds. Endpoint-specific variables take precedence; the legacy global variables are fallback values only.

All JSON API errors use `{ "error": "...", "code": "..." }` with one of `invalid_input`, `rate_limited`, `upstream_timeout`, `upstream_unavailable`, `not_found`, or `internal_error`. Rate-limited responses include `x-ratelimit-limit`, `x-ratelimit-remaining`, and `retry-after`; `retry-after` is an integer number of seconds until the fixed-window budget resets. The endpoint budgets are `/api/json` 30, `/api/ip` 60, `/api/history` 30, `/api/whois` 10, and `/api/dns` 10 requests per 60 seconds by default, with endpoint-specific environment overrides and the legacy global values as fallback.

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

### `GET /api/whois?ip=8.8.8.8`

Returns WHOIS ownership data for an IP address via [RDAP](https://en.wikipedia.org/wiki/Registration_Data_Access_Protocol), routed automatically to the authoritative regional registry. The response is always the wrapper `{ "ip": ..., "asn": ... }`: `ip` contains the network handle, netblock start/end, assigned organization and registrant, abuse contact, and CIDR block; `asn` is an optional ASN registration object containing `handle`, `name`, `startAutnum`, `endAutnum`, `country`, `organization`, and `abuse`. ASN lookup is derived from the bundled MMDB ASN number, remains on-demand, and can be `null` without failing the IP registration section. There is no separate ASN endpoint. Same CORS and rate-limit headers as `/api/json`; malformed upstream responses are rejected before display. The UI renders IP and ASN sections independently and omits absent abuse/contact rows.

### `GET /api/dns?name=johansen.foo`

Resolves forward DNS records for public fully qualified hostnames only, returning `a`, `aaaa`, `mx`, `ns`, `txt`, and `soa` arrays. Private/reserved A and AAAA answers are removed. Same CORS and rate-limit headers; malformed responses are rejected before display.

Successful DNS responses also include `cache` (`hit` or `miss`), `resolvedAt`, `durationMs`, and `partial`. The resolver uses a six-second overall deadline, two concurrent record-family jobs, a bounded 30-second result cache, and a five-second failure cache. Configure these limits with `DNS_TIMEOUT_MS`, `DNS_MAX_CONCURRENCY`, `DNS_CACHE_TTL_MS`, `DNS_FAILURE_TTL_MS`, and `DNS_CACHE_MAX`. Local names, IP literals, single-label names, trailing-dot names, and `.local`, `.internal`, `.localhost`, `.home.arpa`, `.test`, `.invalid`, and `.example` suffixes are rejected.

### `GET /api/history`

Returns aggregate lookup statistics instead of raw addresses, to protect visitor privacy:

```json
{
  "total": 1234,
  "last24h": 56,
  "topCountries": [{ "iso": "US", "count": 320 }]
}
```

Same CORS and rate-limit headers. This is a breaking change from the previous raw list; full per-IP history remains available privately via `/api/stats`.

### `GET /api/stats?token=SECRET`

Private owner-analytics endpoint. Requires the `STATS_TOKEN` environment variable; requests should pass the matching value via an `Authorization: Bearer SECRET` header. `?token=SECRET` remains supported for compatibility, but query-string tokens can be copied into browser history and URLs may be retained by reverse-proxy, access, analytics, or monitoring logs. Use the header form for operational access and never publish a token-bearing URL. Returns totals, last-24h count, top countries, top IPs, and a per-day breakdown. Returns `404` when `STATS_TOKEN` is unset or the token is wrong. Failed authentication uses the separate `stats-auth` bucket; successful reads are not rate-limited.

To generate and set a token, add it to a `.env` file next to `docker-compose.yml`:

```bash
openssl rand -hex 24        # prints something like 9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1908
```

```
STATS_TOKEN=9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1908
```

Then restart with `docker compose up -d` and query as shown above. The app does not render the token, but query-string authentication is visible to any client or intermediary that receives the URL; prefer the `Authorization` header.

### `GET /api/health`

Public liveness returns only `{ "status": "ok" }` from `/api/health` and does not write lookup rows or consume lookup rate limits. The container healthcheck uses this liveness route, not `/api/ip`. When `HEALTH_TOKEN` is configured, request `/api/health?readiness=1` with `Authorization: Bearer <token>` to receive restricted readiness details for the database, bundled MMDB files, application version, uptime, and retention configuration. Missing, invalid, or unset readiness credentials return `404`.

Lookup IPs are retained privately for `LOOKUP_RETENTION_DAYS` days. Public history exposes aggregates only; raw IP statistics remain restricted to `/api/stats`.

### Private admin dashboard

When `ADMIN_TOKEN` is configured, `/admin` and its admin APIs are available to the owner. When it is empty or unset, the page and all admin APIs return `404`, so the deployment does not advertise that an admin surface exists. `ADMIN_TOKEN` is separate from `STATS_TOKEN`; configuring one does not enable or authenticate the other. Keep both values out of source control, shell history, URLs, browser storage, rendered HTML, and logs.

Generate a long random admin token and store it in the `.env` file next to `docker-compose.yml`:

```bash
openssl rand -hex 32
```

```dotenv
ADMIN_TOKEN=replace-with-the-generated-value
ADMIN_SESSION_TTL_SECONDS=28800
```

After changing the token, restart the container. Token rotation changes the session signing material and invalidates every existing admin session, so operators must log in again. Successful login creates an opaque, `HttpOnly`, `Secure`, `SameSite=Strict` session cookie. The default session lifetime is eight hours and can be changed with `ADMIN_SESSION_TTL_SECONDS`.

The dashboard displays exact visitor IPs to authenticated administrators. This is intentionally more sensitive than public aggregate history: anyone who can use the admin token can see retained addresses, lookup targets, timestamps, and attribution. Protect the reverse proxy, host firewall, `.env` file, persistent `echo-data` volume, backups, and browser session accordingly. The application does not add a Docker socket mount or require Docker-host access; resource sampling reads only cgroup and filesystem information available inside the Echo container. `ECHO_IMAGE_SIZE_BYTES` is optional deployment metadata because the image size cannot be queried from inside the container.

Lookup activity is retained for 90 days by default, controlled by `LOOKUP_RETENTION_DAYS`. Resource samples are retained independently for 30 days. The dashboard uses container-local timestamps and the configured `TZ`, which defaults to `Europe/Copenhagen`, rather than the browser timezone. Container uptime resets when the container restarts. CPU may be unavailable until a second sample is available because the sampler needs a delta; unavailable resource values are shown as such.

Only successfully completed visitor lookup activity is recorded. Invalid, failed, timed-out, and rate-limited requests do not create activity events. Partial page, WHOIS, and DNS operations may be recorded with an explicit partial outcome. Health checks, admin requests, static assets, `/api/history`, and `/api/stats` are excluded. Actor values are `browser`, `bot`, or `unknown`; bot classification is a heuristic based on the User-Agent and is not proof that a request came from an automated client. The dashboard labels counts as `unique IPs`, not unique people.

Rows written before the activity-event model was introduced remain in the original `lookups` table. The dashboard shows those rows as `legacy/unclassified`: their historical source, channel, actor, and outcome cannot be reconstructed reliably. Only new activity events have reliable attribution fields.

The dashboard is intended for a trusted owner path behind the existing TLS reverse proxy. It is server-rendered, non-indexable, same-origin, and not CORS-enabled. Do not expose port `3100` to untrusted networks or publish admin URLs containing secrets. The public `/api/health` liveness endpoint remains unauthenticated; when `HEALTH_TOKEN` is configured, restricted readiness details require `Authorization: Bearer <token>` and are otherwise indistinguishable from a missing route.

## Deployment

Copy `docker-compose.yml` to the host, then:

```bash
docker compose pull
docker compose up -d
```

No checkout of the source is needed — the image is pulled from the GitHub Container Registry.

The app listens on port `3100` (intentionally bound to all interfaces; keep the host firewall closed to untrusted direct access if the reverse proxy is the only intended entry). The lookup history persists in the `echo-data` volume. TLS terminates on your existing reverse proxy in front of the app. To pin a specific release instead of `latest`, set `ECHO_TAG` (for example `ECHO_TAG=v1.2.0` in the environment or a `.env` file next to the compose file).

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

The app trusts `x-real-ip` first, then `x-forwarded-for`. The reverse proxy must overwrite these headers with the verified client address. Treat the proxy and host firewall as the trusted boundary: do not expose the application port directly to untrusted networks.

If neither trusted proxy header is present, the application uses the shared anonymous rate-limit bucket rather than treating each request as a separate visitor.

### Connectivity probe deployment

The optional connectivity diagnostic requires two separate public probe hosts: one hostname with an A record only for `CONNECTIVITY_IPV4_URL`, and another hostname with an AAAA record only for `CONNECTIVITY_IPV6_URL`. Each URL should serve a lightweight successful GET response with CORS enabled for the echo site origin. The response must be static or otherwise side-effect-free: probe requests must not write the lookup database, call public lookup APIs, or consume any echo rate-limit bucket. The diagnostic measures browser reachability to each address family and does not reveal or replace the server-recorded visitor IP.

These variables are intentionally runtime configuration. The page and the request-time `proxy.ts` read them from the running Node/Docker process, so the configured probe origins are added to that response's `connect-src` without requiring a new image build. Deployments must run the Next Node server/proxy and must not replace or cache the CSP response with a build-time header. The policy remains an explicit origin allowlist and never uses `connect-src https:`.

The external TLS proxy owns HTTPS-only deployment settings such as HSTS (`Strict-Transport-Security`); the container does not emit HSTS because it can also be reached over the LAN on its HTTP port. Configure HSTS at the proxy only after HTTPS is working for the intended hostnames. Keep the host firewall and NPM access policy aligned with the intended boundary: port `3100` is available for the selected LAN deployment, but must not be reachable from untrusted networks. NPM must overwrite client-supplied forwarding headers and preserve the app's response security headers; any NPM custom header rules that overwrite CSP, COOP, or CORP are part of the deployment security configuration and must be reviewed there.

The app intentionally does not set `Cross-Origin-Embedder-Policy`: enabling cross-origin isolation would require additional compatibility work for the configured Umami, Leaflet, and CARTO resources. `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` are set by the app without requiring that isolation.

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
