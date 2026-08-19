# Echo Hardening and Product Capabilities Design

**Status:** Approved design

**Date:** 2026-08-19

## Goal

Harden echo's public APIs and runtime behavior while adding reliable network diagnostics, richer registration data, operational health reporting, and safe shareable lookup links without changing the server-side geo architecture.

## Scope

The work is organized into four independently reviewable batches:

1. API and security correctness
2. Runtime and data reliability
3. CI and browser quality gates
4. Product capabilities and UX

Each batch must remain comment-free in source files, retain the existing single-container deployment, and finish with its own tests and conventional commit.

## Existing Constraints

- Geo lookup remains server-side and uses bundled MMDB files.
- No client-side geo provider calls, cookies, or additional database service.
- Docker remains a non-root, read-only runtime with the persistent SQLite volume.
- The application port remains LAN-accessible as `3100:3000`.
- The application continues trusting `X-Real-IP` first and `X-Forwarded-For` second; Nginx Proxy Manager and the host firewall are responsible for overwriting/protecting those headers and the application port.
- All source files remain free of code comments.
- External RDAP and DNS work remains on-demand and must not delay the initial bundled geo page.

## Batch 1: API and Security Correctness

### Endpoint rate limiting

Replace the current shared public limiter bucket with named endpoint limiters while retaining the process-local fixed-window implementation for the single-container deployment.

The endpoint defaults are:

| Endpoint | Default limit | Window |
| --- | ---: | ---: |
| `/api/json` | 30 | 60 seconds |
| `/api/ip` | 60 | 60 seconds |
| `/api/history` | 30 | 60 seconds |
| `/api/whois` | 10 | 60 seconds |
| `/api/dns` | 10 | 60 seconds |

Each endpoint gets an environment override using `RATE_LIMIT_<NAME>_MAX` and `RATE_LIMIT_<NAME>_WINDOW_MS`. Existing `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` remain supported as fallback defaults so current deployments do not silently change behavior.

Every rate-limited response includes:

- `x-ratelimit-limit`
- `x-ratelimit-remaining`
- `retry-after` in HTTP delta-seconds, calculated with `Math.ceil(milliseconds / 1000)`

The limiter continues to bound tracked keys and uses the trusted proxy-derived address. Requests without an extracted address use an explicit anonymous bucket with the endpoint's normal limit; deployment documentation must make clear that direct access without a trusted proxy permits header spoofing. Stats authentication failures use a separate small fixed-window limiter and do not share public endpoint capacity.

### Stats authentication and privacy

`/api/stats` continues to support both `Authorization: Bearer <token>` and `?token=<token>` for compatibility and convenience. Bearer authentication is preferred and documented as safer. Query-string authentication remains an explicit risk because URLs can be logged or retained in browser history and monitoring systems.

Authentication uses timing-safe comparison and returns indistinguishable `404 {"error":"not found"}` responses when `STATS_TOKEN` is unset, missing, or incorrect. Failed attempts are throttled before expensive database queries. Successful responses remain `no-store` and are not CORS-enabled.

The full `topIps` field remains available only after successful stats authentication. It is never returned by public feed/history endpoints and is bounded by the retention policy in Batch 2. Logs must never contain the token, authorization header, query token, or full IP values.

### Stable API errors and runtime guards

Introduce shared response/error helpers and runtime guards for RDAP, DNS, stats, and client-consumed API payloads. External JSON must be validated before it is used; unchecked casts from `response.json()` are not acceptable at new or modified boundaries.

JSON error responses retain the human-readable `error` field and add a stable `code` from this set:

- `invalid_input`
- `rate_limited`
- `upstream_timeout`
- `upstream_unavailable`
- `not_found`
- `internal_error`

The public page continues degrading gracefully when optional lookup work fails. API handlers return stable status/code pairs rather than leaking upstream response bodies, filesystem paths, tokens, or resolver details.

### Proxy trust and headers

The LAN-accessible compose binding is retained by decision. README deployment guidance must state:

- Nginx Proxy Manager must overwrite `X-Real-IP` and `X-Forwarded-For`.
- The host firewall must prevent untrusted networks from reaching port 3100 when the service is intended to be proxy-only.
- Direct access to port 3100 allows spoofing of the identity headers and therefore affects displayed geo data, logging, and rate-limit keys.

Tests must preserve and explicitly verify `X-Real-IP` precedence over `X-Forwarded-For`, normalization, and the documented proxy-boundary assumption.

### Content Security Policy

Replace the current inline theme initialization allowance where feasible with a deterministic CSP hash or nonce. Keep only the origins required by the application. Leaflet must be self-hosted or tightly pinned to the exact version used by the application instead of trusting a broad unpkg script origin. The CSS marker remains inline and does not need an image origin.

Retain `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, and `form-action 'self'`. Add HSTS only for HTTPS deployments and document that the external TLS proxy is responsible for it when appropriate. Evaluate COOP/CORP headers against Umami and map behavior before enabling them.

## Batch 2: Runtime and Data Reliability

### Public DNS policy and resolver controls

DNS lookup accepts public hostnames only. Reject:

- IP literals
- `localhost`
- `.local` and `.internal` names
- single-label names
- loopback, link-local, private, CGNAT, multicast, and other reserved name/address results

Returned A and AAAA records are filtered so private or reserved addresses never reach the client. MX, NS, TXT, and SOA names remain records, but their resolver targets must not be used to perform additional unbounded lookups.

Use a bounded global resolver concurrency limit. Use a cancellable `dns.promises.Resolver` per operation, abort outstanding work on timeout where supported, and distinguish complete, partial, timeout, and resolver-error results. A timeout must not leave an unbounded stream of resolver work running in the background.

### DNS cache contract

DNS results use a bounded TTL cache with in-flight promise deduplication. Successful results use a configurable positive TTL; failures use a short failure TTL to prevent repeated upstream hammering. Cache entries are bounded by key count and evict oldest entries.

`/api/dns` returns:

```json
{
  "records": { "a": [], "aaaa": [], "mx": [], "ns": [], "txt": [], "soa": [] },
  "cache": "hit",
  "resolvedAt": "2026-08-19T12:00:00.000Z",
  "durationMs": 42,
  "partial": false
}
```

`cache` is `hit` or `miss`; `partial` is true when at least one record family failed or timed out while another completed. The UI distinguishes cache hits, partial responses, empty public results, upstream errors, and retryable timeouts.

### RDAP and hostname cache concurrency

Extend the existing bounded cache pattern so hostname PTR, RDAP IP, RDAP ASN, and DNS caches retain pending promises while an operation is in flight. Concurrent requests for the same key share one upstream operation. Cache successful results for their configured TTL and cache failures only briefly. Pending and settled entries are subject to the same maximum-key bound.

RDAP timeout, upstream-unavailable, and valid no-registration-data states must be distinguishable in normalized results and UI messaging. The initial geo page remains independent of RDAP availability.

### Retention and SQLite indexes

Add `LOOKUP_RETENTION_DAYS`, defaulting to 90. At database initialization, prune rows older than the retention cutoff. A controlled interval prevents repeated pruning on every request. Full IPs remain stored for owner stats during the configured retention period.

Add indexes only where query plans justify them, including country and IP aggregation paths if needed. Keep the timestamp index for retention and recent-window queries. Retention and schema behavior must be idempotent across existing databases.

Required database tests cover:

- Empty database aggregates
- Exact retention cutoff boundaries
- Null country values
- Pruning old rows while retaining current rows
- Top IP and country aggregation
- UTC daily grouping
- Reopening an existing database after the migration

README deployment documentation must state that lookup IPs are retained privately for the configured period and that public history exposes aggregates only.

### Health and readiness

Add `/api/health` with no database write and a minimal public liveness response:

```json
{ "status": "ok" }
```

The endpoint must not expose paths, IPs, tokens, upstream errors, or database details publicly. An authenticated readiness response is available with a separate `HEALTH_TOKEN` and `Authorization: Bearer <token>`. It reports database readiness, MMDB readiness, application version, process uptime, and retention configuration without filesystem paths or secrets. It returns an indistinguishable not-found response when the token is unset or invalid.

Switch the Docker healthcheck from `/api/ip` to `/api/health`, ensuring health polling never consumes lookup rate-limit capacity or creates lookup data.

### Error handling and observability

Replace silent catches in modified paths with structured server-side logging and stable fallback behavior. Log only event category, endpoint, status, duration, and non-sensitive identifiers such as a cache key hash where required. Never log full IPs, tokens, authorization headers, DNS/RDAP bodies, or private filesystem paths.

Page rendering continues serving the IP and bundled geo result when optional database, PTR, RDAP, or DNS work fails. Readiness must accurately identify database/MMDB failure without turning operational details into a public information leak.

## Batch 3: CI and Browser Quality Gates

### Unit and API coverage

Run V8 coverage in CI with thresholds of at least 80% for statements, lines, and functions, and 70% for branches over the included `lib/**/*.ts` and `app/api/**/*.ts` scope. Keep `.next` and dependency directories excluded.

Add deterministic tests for:

- Retry-After seconds and endpoint-specific budgets
- Failed stats authentication throttling
- DNS public-name policy, private-result filtering, partial results, timeout, cache hit, and in-flight deduplication
- RDAP IP/ASN guards, timeout, unavailable, no-data, cache hit, and in-flight deduplication
- Hostname cache in-flight behavior
- Retention and health/readiness contracts
- Proxy header precedence and invalid input
- Share-link IPv4/IPv6 encoding and clipboard failure

### Browser tests

Add Playwright smoke and accessibility coverage for desktop and mobile:

- Home page and private-network state
- Arbitrary IPv4 and IPv6 lookup
- Copy and copy-link behavior
- Theme switching
- DNS section loading, cache/partial/error states
- WHOIS loading and retry states
- Map modal width, CSS marker, keyboard close, and focus behavior
- Health route availability
- No horizontal overflow and 44px touch targets on mobile

### Supply-chain and deployment checks

Extend GitHub Actions with:

- `npm run coverage` and thresholds
- `npm audit --audit-level=high`
- Secret scanning
- Container vulnerability scanning with Trivy or Grype
- SBOM generation and artifact retention
- Dependabot configuration for npm, GitHub Actions, and Docker dependencies
- Scheduled MMDB/dependency rebuild verification

Image signing is explicitly deferred. Existing push/PR checks and tag-based multi-architecture GHCR publishing remain unchanged.

## Batch 4: Product Capabilities and UX

### IPv4/IPv6 connectivity diagnostic

Add an on-demand client component that probes two separately configured URLs:

- `CONNECTIVITY_IPV4_URL`
- `CONNECTIVITY_IPV6_URL`

The deployment must provide separate A-only and AAAA-only probe hosts. Each probe is a lightweight CORS-enabled GET that does not log lookups or consume API rate-limit capacity. The browser measures each request with `performance.now()` and a short abort timeout, reporting independently:

- Not configured
- Reachable with latency
- Unreachable
- Timed out

The UI must explain that this measures browser reachability over each address family, not the IP recorded by the lookup service. Probe URLs are passed as public configuration only; no secrets are exposed.

### Richer ASN and netblock detail

Extend the existing on-demand WHOIS response rather than creating a separate ASN endpoint. The MMDB ASN number triggers an RDAP `autnum/{asn}` lookup. Normalize ASN data as:

```ts
{
  handle: string | null;
  name: string | null;
  startAutnum: number | null;
  endAutnum: number | null;
  country: string | null;
  organization: string | null;
  abuse: { email: string | null; phone: string | null } | null;
}
```

The WHOIS API response becomes `{ ip: RdapInfo, asn: RdapAsnInfo | null }`. Missing ASN data must not fail the IP registration lookup. The UI separates IP registration/netblock information from ASN registration information and shows partial/unavailable states honestly.

### Shareable lookup links

Retain `/?ip=` as the canonical share format. Add a Copy link control that uses `APP_URL` on the server and the browser origin as a client fallback. It must correctly encode IPv4 and IPv6 values and report clipboard failure honestly.

For valid `?ip=` pages, generate a descriptive title and description while setting the canonical URL to the main site URL and `noindex` for the query-specific page. The home URL remains indexable. Invalid query values remain visible errors and must not produce misleading metadata.

### Cross-feature UX rules

- WHOIS, DNS, and connectivity remain on-demand.
- Initial rendering remains bundled geo + hostname + aggregate stats.
- Loading, success, partial, empty, timeout, and retry states are explicit.
- Controls remain at least 44px for mobile interaction.
- No lookup logging or API rate budget is consumed by connectivity probes.

## Migration and Compatibility

- `/api/history` remains aggregate-only and documents its changed shape.
- `/api/whois` adds ASN data using the documented wrapper response; the UI and tests migrate together.
- Existing environment variables continue working where endpoint-specific settings are introduced; endpoint-specific values override legacy global rate-limit defaults.
- Existing SQLite files are migrated idempotently at startup; no external database service is introduced.
- New optional features are disabled or report `not configured` when their environment values are absent.

## Acceptance Criteria

The design is complete when:

1. Public API rate limits are independent, use correct HTTP units, and expose stable error codes.
2. Stats authentication, DNS policy, proxy assumptions, CSP, and retention are documented and tested.
3. Database, cache, RDAP, DNS, and health behavior remain bounded and observable without leaking sensitive data.
4. Coverage, browser smoke/accessibility, dependency, secret, container, and SBOM checks run in CI.
5. Connectivity, richer ASN data, health, DNS status, and share links work on desktop and mobile without delaying the initial lookup page.
6. `npm test`, `npm run lint`, coverage, Playwright, Docker build/health checks, and endpoint smoke tests pass before release.
