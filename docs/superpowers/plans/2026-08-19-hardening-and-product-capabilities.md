# Echo Hardening and Product Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden echo's public APIs and runtime while adding bounded DNS/RDAP behavior, health reporting, connectivity diagnostics, richer ASN data, and safe shareable lookup links.

**Architecture:** Keep the existing Next.js server-first dashboard and single SQLite-backed container. Add focused server modules for endpoint limits, runtime validation, DNS/RDAP caching, retention, health, and connectivity configuration; keep expensive external work on demand. Preserve the public API style while adding stable error codes and endpoint-specific budgets.

**Tech Stack:** Next.js 16.3.1 App Router, React 19, TypeScript strict mode, Node `dns`/`crypto`, better-sqlite3, mmdb-lib, Vitest, Playwright, Docker Compose, GitHub Actions, GHCR, Trivy or Grype.

## Global Constraints

- Geo lookup remains server-side and uses bundled MMDB files.
- No client-side geo provider calls, cookies, or additional database service.
- Docker remains a non-root, read-only runtime with the persistent SQLite volume.
- The application port remains LAN-accessible as `3100:3000`.
- The application continues trusting `X-Real-IP` first and `X-Forwarded-For` second; Nginx Proxy Manager and the host firewall are responsible for overwriting/protecting those headers and the application port.
- All source files remain free of code comments.
- External RDAP and DNS work remains on-demand and must not delay the initial bundled geo page.
- Existing environment variables remain compatible; endpoint-specific values override legacy global rate-limit defaults.
- No signing implementation is added in this plan; image signing remains explicitly deferred.
- Every task ends with focused tests and a conventional commit before the next task begins.

## File Map

- `lib/ratelimit.ts` owns endpoint-specific fixed-window limiter instances, bounded keys, and retry metadata.
- `lib/api.ts` owns stable JSON error and rate-limit response helpers.
- `lib/guards.ts` owns runtime validation for external and client-consumed JSON payloads.
- `lib/dns.ts` owns hostname policy, cancellable resolution, filtering, bounded concurrency, and TTL/in-flight caching.
- `lib/rdap.ts` owns IP and ASN RDAP requests, parsing, guards, and caches.
- `lib/db.ts` and `schema.sql` own retention, indexes, aggregates, and private statistics.
- `app/api/*/route.ts` expose the hardened API contracts.
- `components/ui/*` contain on-demand DNS, WHOIS/ASN, connectivity, copy-link, and health UX.
- `next.config.ts`, `app/layout.tsx`, and `docker-compose.yml` own security headers and deployment configuration.
- `.github/workflows/ci.yml`, `playwright.config.ts`, and browser specs own quality and supply-chain gates.
- `README.md`, `.env.example`, and `CHANGELOG.md` document configuration, privacy, proxy trust, and release behavior.

---

### Task 1: Shared API Contracts and Endpoint Rate Limits

**Files:**
- Modify: `lib/ratelimit.ts`
- Create: `lib/api.ts`
- Create: `lib/api.test.ts`
- Modify: `lib/ratelimit.test.ts`
- Modify: `app/api/json/route.ts`
- Modify: `app/api/ip/route.ts`
- Modify: `app/api/history/route.ts`
- Modify: `app/api/whois/route.ts`
- Modify: `app/api/dns/route.ts`
- Modify: corresponding route tests
- Modify: `docker-compose.yml`, `.env.example`, `README.md`

**Interfaces:**
- Produce `getRateLimiter(name: 'json' | 'ip' | 'history' | 'whois' | 'dns' | 'stats-auth'): RateLimiter`.
- Produce `apiError(status: number, error: string, code: ApiErrorCode, headers?: HeadersInit): Response`.
- Produce `withRateHeaders(headers, rate): Headers` where `retry-after` is delta-seconds.
- Preserve `RateLimiter.allow(key): { allowed, retryAfter, remaining, limit }`.

- [ ] **Step 1: Write failing limiter and response tests.** Add cases proving endpoint instances do not share counts, legacy global env values are fallback only, endpoint env values win, and a denied response turns `59900` milliseconds into `60` seconds with `Math.ceil`. Add response tests for each stable error code and preserved CORS/no-store headers.

- [ ] **Step 2: Run focused tests to confirm RED.**

Run: `npx vitest run lib/ratelimit.test.ts lib/api.test.ts`

Expected: FAIL because named endpoint limiters and shared response helpers do not exist yet.

- [ ] **Step 3: Implement the named limiter registry.** Keep the existing fixed-window algorithm and max-key protection. Use these defaults: `json=30`, `ip=60`, `history=30`, `whois=10`, `dns=10`, `stats-auth=5`; all use a 60-second window. Read `RATE_LIMIT_<NAME>_MAX` and `RATE_LIMIT_<NAME>_WINDOW_MS`, falling back to `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`, then the endpoint defaults. Return retry values internally as milliseconds and convert only at the HTTP response boundary.

- [ ] **Step 4: Implement shared API response helpers.** Define `ApiErrorCode` as `'invalid_input' | 'rate_limited' | 'upstream_timeout' | 'upstream_unavailable' | 'not_found' | 'internal_error'`. Ensure JSON errors contain `{ error, code }`, rate-limited responses include `retry-after`, and existing CORS/no-store headers are preserved.

- [ ] **Step 5: Wire every public route to its named limiter.** Use the route-specific limiter before expensive work. Keep `/api/stats` authentication failures on `stats-auth`; do not rate-limit successful stats reads with a public bucket. Add endpoint-specific response headers to successful and denied responses.

- [ ] **Step 6: Update deployment documentation and configuration.** Add endpoint-specific optional variables to Compose and `.env.example`; document legacy fallback behavior, the correct Retry-After unit, anonymous fallback behavior, and the trusted proxy/firewall boundary.

- [ ] **Step 7: Run the focused and full tests.**

Run: `npx vitest run lib/ratelimit.test.ts lib/api.test.ts app/api && npm run lint`

Expected: all focused/API tests pass and TypeScript exits 0.

- [ ] **Step 8: Commit.**

```bash
git add lib app/api docker-compose.yml .env.example README.md
git commit -m "feat: separate api rate limits and standardize errors"
```

### Task 2: Runtime Guards and Safe Stats Authentication

**Files:**
- Create: `lib/guards.ts`
- Create: `lib/guards.test.ts`
- Modify: `app/api/stats/route.ts`
- Modify: `app/api/stats/route.test.ts`
- Modify: `components/ui/DnsSection.tsx`
- Modify: `components/ui/WhoisSection.tsx`
- Modify: `README.md`

**Interfaces:**
- Produce guards for `DnsResponse`, `RdapResponse`, `StatsResponse`, and `IpInfo` client payloads.
- Preserve both stats authentication forms: `Authorization: Bearer <token>` and `?token=<token>`.
- Preserve indistinguishable `404 { error: 'not found', code: 'not_found' }` for disabled, missing, and invalid stats credentials.

- [ ] **Step 1: Add failing guard tests.** Test valid and malformed DNS/RDAP/stats payloads, missing arrays, wrong scalar types, and extra fields being ignored safely. Add stats tests proving invalid auth is throttled before database queries and valid Bearer/query credentials still work.

- [ ] **Step 2: Run tests to confirm RED.**

Run: `npx vitest run lib/guards.test.ts app/api/stats/route.test.ts`

Expected: guard imports fail or malformed payload assertions fail.

- [ ] **Step 3: Implement narrow runtime guards.** Keep the guards dependency-free and return type predicates. Validate only the fields consumed by the application. Never log or return raw external payloads.

- [ ] **Step 4: Harden stats authentication.** Extract Bearer first, retain query fallback, use the named `stats-auth` limiter for missing/wrong credentials, keep SHA-256 plus `timingSafeEqual`, and return `no-store`. Preserve full `topIps` only after successful authentication.

- [ ] **Step 5: Guard client responses.** Make DNS and WHOIS client components reject malformed JSON with a stable error state instead of casting arbitrary response data to interfaces.

- [ ] **Step 6: Run tests and lint.**

Run: `npx vitest run lib/guards.test.ts app/api/stats/route.test.ts && npm test && npm run lint`

Expected: guard, stats, full test, and TypeScript checks all pass.

- [ ] **Step 7: Commit.**

```bash
git add lib/guards.ts lib/guards.test.ts app/api/stats components/ui/DnsSection.tsx components/ui/WhoisSection.tsx README.md
git commit -m "feat: validate api payloads and throttle stats auth"
```

### Task 3: DNS Policy, Resolver Controls, and Cache Metadata

**Files:**
- Modify: `lib/dns.ts`
- Modify: `lib/dns.test.ts`
- Modify: `app/api/dns/route.ts`
- Modify: `app/api/dns/route.test.ts`
- Modify: `components/ui/DnsSection.tsx`
- Modify: `app/globals.css`
- Modify: `.env.example`, `docker-compose.yml`, `README.md`

**Interfaces:**
- Produce `resolveRecords(name): Promise<DnsLookupResult>` where `DnsLookupResult` contains `records`, `cache`, `resolvedAt`, `durationMs`, and `partial`.
- Preserve `DnsRecords` keys `a`, `aaaa`, `mx`, `ns`, `txt`, `soa`.
- Produce `isPublicHostname(name): boolean` and a bounded resolver/cache configuration.

- [ ] **Step 1: Write failing DNS policy/cache tests.** Cover IP literals, `localhost`, single-label names, `.local`, `.internal`, invalid labels, private A/AAAA filtering, partial results, timeout classification, cache hit, concurrent same-name deduplication, and max-concurrency enforcement.

- [ ] **Step 2: Run focused tests to confirm RED.**

Run: `npx vitest run lib/dns.test.ts app/api/dns/route.test.ts`

Expected: tests fail because current DNS results have no metadata, public-name policy, cache, or concurrency controls.

- [ ] **Step 3: Implement public hostname policy.** Reject IP literals and prohibited names before resolver creation. Validate lowercased fully qualified names, reject trailing dots unless explicitly normalized, and classify disallowed suffixes and local labels.

- [ ] **Step 4: Implement bounded cancellable resolution.** Use a per-operation `dns.promises.Resolver`, launch only the configured number of record-family jobs at once, apply the six-second overall deadline, and mark partial/timeout outcomes without leaking resolver details. Filter private/reserved A and AAAA records before returning them.

- [ ] **Step 5: Implement bounded TTL cache with in-flight deduplication.** Cache normalized results and short-lived failures, return `cache: 'hit'` for settled or shared in-flight entries, evict oldest entries at the maximum, and record `resolvedAt` plus `durationMs` on the returned result.

- [ ] **Step 6: Update the API and UI.** Return `{ records, cache, resolvedAt, durationMs, partial }`, stable error codes, and rate headers. Display cache state, timestamp, duration, partial warning, empty results, resolver errors, and retry controls without blocking the initial page.

- [ ] **Step 7: Verify.**

Run: `npx vitest run lib/dns.test.ts app/api/dns/route.test.ts && npm run lint`

Expected: focused tests and TypeScript pass.

- [ ] **Step 8: Commit.**

```bash
git add lib/dns.ts lib/dns.test.ts app/api/dns components/ui/DnsSection.tsx app/globals.css .env.example docker-compose.yml README.md
git commit -m "feat: harden dns lookup policy and caching"
```

### Task 4: RDAP ASN Expansion and In-Flight Caches

**Files:**
- Modify: `lib/rdap.ts`
- Modify: `lib/rdap.test.ts`
- Modify: `app/api/whois/route.ts`
- Modify: `app/api/whois/route.test.ts`
- Modify: `components/ui/WhoisSection.tsx`
- Modify: `lib/geo.ts`, `lib/geo.test.ts`

**Interfaces:**
- Produce `RdapAsnInfo` with `handle`, `name`, `startAutnum`, `endAutnum`, `country`, `organization`, and `abuse`.
- Return `/api/whois` as `{ ip: RdapInfo, asn: RdapAsnInfo | null }`.
- Preserve cached `fetchRdap(ip)` behavior and extend it to deduplicate pending requests.

- [ ] **Step 1: Write failing RDAP tests.** Add IP and ASN fixture tests, missing/invalid vCard tests, unavailable and timeout tests, successful cache hits, concurrent same-key fetch deduplication, and missing ASN data that still returns IP registration data.

- [ ] **Step 2: Run focused tests to confirm RED.**

Run: `npx vitest run lib/rdap.test.ts app/api/whois/route.test.ts`

Expected: ASN fields and in-flight deduplication assertions fail.

- [ ] **Step 3: Implement ASN RDAP lookup.** Use the existing MMDB ASN number and the RDAP `autnum/{asn}` endpoint, normalize numeric ranges safely, parse organization/country/abuse data, and classify timeout/unavailable/no-data outcomes without failing the IP lookup.

- [ ] **Step 4: Add pending-promise cache entries.** Apply bounded TTL and short failure TTL to IP RDAP, ASN RDAP, and hostname PTR lookup. Ensure concurrent callers share one request and cleanup occurs after resolve/reject.

- [ ] **Step 5: Update route, UI, and guards.** Return the wrapper response, validate it on the client, and render separate IP registration/netblock and ASN registration sections with partial/retry states.

- [ ] **Step 6: Verify and commit.**

Run: `npx vitest run lib/rdap.test.ts app/api/whois/route.test.ts lib/geo.test.ts && npm run lint`

```bash
git add lib/rdap.ts lib/rdap.test.ts lib/geo.ts lib/geo.test.ts app/api/whois components/ui/WhoisSection.tsx
git commit -m "feat: add asn rdap details and deduplicate lookups"
```

### Task 5: SQLite Retention, Health, and Operational Errors

**Files:**
- Modify: `schema.sql`
- Modify: `lib/db.ts`
- Modify: `lib/db.test.ts`
- Create: `lib/health.ts`
- Create: `lib/health.test.ts`
- Create: `app/api/health/route.ts`
- Create: `app/api/health/route.test.ts`
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`, `.env.example`, `README.md`
- Modify: `app/page.tsx`

**Interfaces:**
- Produce `pruneOldLookups(nowMs?: number): number`.
- Produce `getHealth(readiness: boolean): HealthPayload` without exposing paths or secrets.
- Public health returns `{ status: 'ok' }`; authenticated readiness returns DB/MMDB readiness, version, uptime, and retention configuration.

- [ ] **Step 1: Write failing DB and health tests.** Cover empty aggregates, exact cutoff behavior, null country values, old-row pruning, current-row retention, UTC daily grouping, database reopen, public liveness, missing/invalid readiness token, and valid readiness output.

- [ ] **Step 2: Run focused tests to confirm RED.**

Run: `npx vitest run lib/db.test.ts lib/health.test.ts app/api/health/route.test.ts`

Expected: retention and health modules/tests fail because they do not exist.

- [ ] **Step 3: Implement retention configuration and migration-safe pruning.** Read `LOOKUP_RETENTION_DAYS` with a positive default of 90, add only justified indexes, prune at initialization and a controlled interval, and keep schema setup idempotent for existing SQLite files.

- [ ] **Step 4: Implement health/readiness.** Add `HEALTH_TOKEN` support with Bearer authentication, indistinguishable not-found responses, no DB writes, and no paths/IPs/tokens/upstream payloads in the response. Keep public liveness minimal.

- [ ] **Step 5: Switch Docker healthcheck.** Make the container healthcheck call `/api/health` so health polling cannot consume lookup rate limits or write lookup rows.

- [ ] **Step 6: Replace modified silent catches with redacted structured events.** Preserve page availability while logging only event category, endpoint, status, and duration; do not log full IPs or external payloads.

- [ ] **Step 7: Verify and commit.**

Run: `npx vitest run lib/db.test.ts lib/health.test.ts app/api/health/route.test.ts && npm run lint`

```bash
git add schema.sql lib/db.ts lib/db.test.ts lib/health.ts lib/health.test.ts app/api/health Dockerfile docker-compose.yml .env.example README.md app/page.tsx
git commit -m "feat: add lookup retention and health readiness"
```

### Task 6: CSP and Proxy Deployment Hardening

**Files:**
- Modify: `next.config.ts`
- Modify: `app/layout.tsx`
- Modify: `components/ui/MapModal.tsx`
- Modify: `README.md`
- Create or modify: `next.config.test.ts` or the existing config test location

**Interfaces:**
- Preserve required Umami, Leaflet, CARTO, PWA, and map behavior while reducing broad CSP permissions.
- Preserve the LAN binding and explicitly document its trust boundary.

- [ ] **Step 1: Write failing header/config tests.** Assert required security headers, absence of unnecessary broad image/script origins, correct theme initialization allowance, and deployment documentation for NPM overwrite/firewall responsibilities.

- [ ] **Step 2: Implement CSP tightening.** Prefer a hash or nonce for the theme initializer. If Leaflet remains CDN-loaded, pin the exact version and exact origin; otherwise self-host the assets and remove unpkg from CSP. Keep required Umami origin handling and existing object/frame/base/form restrictions.

- [ ] **Step 3: Add HTTPS deployment guidance.** Document HSTS ownership at the external TLS proxy and evaluate COOP/CORP without breaking Umami, PWA, or map behavior. Do not change the selected all-interface compose port.

- [ ] **Step 4: Verify.**

Run: `npm run lint && npm test && docker build -t ghcr.io/mojoaar/echo:security-check .`

Expected: headers compile, tests pass, and the image builds.

- [ ] **Step 5: Commit.**

```bash
git add next.config.ts app/layout.tsx components/ui/MapModal.tsx README.md
git commit -m "fix: tighten content security and proxy deployment guidance"
```

### Task 7: Coverage, Browser Tests, and Supply-Chain CI

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `playwright.config.ts`
- Create: `e2e/home.spec.ts`, `e2e/api.spec.ts`, `e2e/mobile.spec.ts`
- Modify: `vitest.config.ts`
- Modify: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Create: `.trivyignore` only for documented, reviewed false positives
- Modify: `README.md`

**Interfaces:**
- Produce `npm run coverage` with enforced V8 thresholds: 80% statements/lines/functions and 70% branches for the configured server scope.
- Produce Playwright smoke/accessibility checks against a local Next server.
- CI retains existing push/PR checks and tag-based multi-architecture release publishing.

- [ ] **Step 1: Add browser dependencies and config.** Install Playwright test tooling, configure a local web server using `npm run dev` or `npm run start`, and use deterministic network interception for RDAP/DNS where external calls are not the subject of the test.

- [ ] **Step 2: Write browser specs.** Cover home/private state, IPv4/IPv6 query links, copy/copy-link success and failure, theme switching, DNS states, WHOIS states, map modal size/CSS marker/focus behavior, health, mobile overflow, and 44px controls.

- [ ] **Step 3: Run browser tests to confirm failures for missing behavior.**

Run: `npx playwright test`

Expected: new specs identify any implementation gaps before CI wiring is finalized.

- [ ] **Step 4: Add coverage thresholds.** Configure Vitest V8 thresholds over `lib/**/*.ts` and `app/api/**/*.ts`, keeping `.next` and dependencies excluded. Add deterministic unit/API tests named in the design spec.

- [ ] **Step 5: Add CI quality jobs.** Run lint, unit tests, coverage, Playwright, `npm audit --audit-level=high`, secret scanning, and a container scan. Generate and retain an SBOM. Keep signing deferred. Add Dependabot for npm, Actions, and Docker and schedule MMDB/dependency rebuild verification.

- [ ] **Step 6: Verify CI commands locally.**

Run: `npm run lint && npm test && npm run coverage && npx playwright test && npm audit --audit-level=high`

Expected: all commands pass, or any accepted audit exception is explicitly documented before commit.

- [ ] **Step 7: Commit.**

```bash
git add package.json package-lock.json playwright.config.ts e2e vitest.config.ts .github .trivyignore README.md
git commit -m "ci: add coverage browser and supply chain quality gates"
```

### Task 8: Connectivity Diagnostic and Probe Deployment

**Files:**
- Create: `components/ui/ConnectivitySection.tsx`
- Create: `components/ui/ConnectivitySection.test.tsx` or browser coverage in `e2e/home.spec.ts`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `docker-compose.yml`, `.env.example`, `README.md`
- Create: deployment probe documentation or lightweight probe route only if it does not log/rate-limit lookups

**Interfaces:**
- Configuration: `CONNECTIVITY_IPV4_URL`, `CONNECTIVITY_IPV6_URL`.
- Client result: `{ state: 'not_configured' | 'reachable' | 'unreachable' | 'timeout'; latencyMs?: number }` per address family.

- [ ] **Step 1: Write failing component/browser tests.** Cover missing configuration, successful probe with measured latency, timeout, network failure, independent v4/v6 results, no API lookup call, and retry.

- [ ] **Step 2: Implement the on-demand probe component.** Use `performance.now()`, `AbortController`, a short timeout, same-origin/CORS-safe GETs, and no secrets. Explain that this measures browser reachability rather than the server's recorded IP.

- [ ] **Step 3: Document probe hosting.** Document separate A-only and AAAA-only hosts and a lightweight CORS-enabled response that does not write the lookup database or consume public API rate limits.

- [ ] **Step 4: Verify and commit.**

Run: `npm test && npm run lint && npx playwright test e2e/home.spec.ts`

```bash
git add components/ui/ConnectivitySection.tsx app/page.tsx app/layout.tsx app/globals.css docker-compose.yml .env.example README.md e2e
git commit -m "feat: add ipv4 and ipv6 connectivity diagnostics"
```

### Task 9: Share Links and Dynamic Lookup Metadata

**Files:**
- Create: `components/ui/CopyLinkButton.tsx`
- Create: `lib/share.ts`
- Create: `lib/share.test.ts`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `components/ui/CopyButton.tsx` if shared clipboard behavior is extracted
- Modify: `app/globals.css`
- Modify: browser/API tests

**Interfaces:**
- Produce `buildLookupUrl(baseUrl: string, ip: string): string` using `URL` and `searchParams.set('ip', ip)`.
- Produce metadata for valid query lookups with main-site canonical URL and `noindex` query pages.

- [ ] **Step 1: Write failing share-link tests.** Cover IPv4, compressed IPv6, URL encoding, invalid values, browser-origin fallback, clipboard rejection, and no-index/canonical metadata behavior.

- [ ] **Step 2: Implement URL construction and copy-link UI.** Reuse the existing 44px button conventions, report clipboard failure honestly, and use server `APP_URL` with browser origin fallback.

- [ ] **Step 3: Implement query metadata.** Keep the home page indexable; valid `?ip=` pages get descriptive title/description, canonical main URL, and `noindex`; invalid values remain errors without misleading metadata.

- [ ] **Step 4: Verify and commit.**

Run: `npx vitest run lib/share.test.ts && npm run lint && npx playwright test e2e/home.spec.ts`

```bash
git add components/ui/CopyLinkButton.tsx lib/share.ts lib/share.test.ts app/page.tsx app/layout.tsx components/ui/CopyButton.tsx app/globals.css e2e
git commit -m "feat: add safe shareable lookup links"
```

### Task 10: ASN UI, Final Documentation, and Release Verification

**Files:**
- Modify: `README.md`, `.env.example`, `docker-compose.yml`, `CHANGELOG.md`
- Modify: `components/ui/WhoisSection.tsx`, `app/page.tsx`
- Modify: `scripts/release.mjs` only if new release metadata requires it
- Modify: `e2e/*` and affected tests

**Interfaces:**
- No new public ASN endpoint; the existing `/api/whois` wrapper exposes `ip` and optional `asn` objects.
- README documents all environment values, privacy retention, proxy trust, health/readiness, DNS restrictions, connectivity probe hosts, rate budgets, CSP/HSTS responsibilities, and new share-link metadata behavior.

- [ ] **Step 1: Add ASN presentation tests.** Verify IP registration and ASN registration render independently, missing ASN data preserves the IP section, and abuse/contact fields are not rendered when absent.

- [ ] **Step 2: Update documentation.** Document endpoint contracts, stable error codes, endpoint-specific limits, Retry-After seconds, `HEALTH_TOKEN`, `LOOKUP_RETENTION_DAYS`, DNS public-only policy, `CONNECTIVITY_IPV4_URL`, `CONNECTIVITY_IPV6_URL`, and security tradeoffs for query-string stats tokens.

- [ ] **Step 3: Add Unreleased changelog entries.** Record security hardening, runtime reliability, health, CI/browser gates, connectivity diagnostics, richer ASN data, DNS metadata/caching, and share links. Do not run the release script in this task.

- [ ] **Step 4: Run the complete verification matrix.**

Run:

```bash
npm run lint
npm test
npm run coverage
npx playwright test
npm audit --audit-level=high
docker build -t ghcr.io/mojoaar/echo:review .
docker compose config
docker compose up -d --force-recreate
docker compose ps
curl -fsS http://127.0.0.1:3100/api/health
curl -fsS 'http://127.0.0.1:3100/api/ip?ip=8.8.8.8'
curl -fsS 'http://127.0.0.1:3100/api/dns?name=johansen.foo'
curl -fsS 'http://127.0.0.1:3100/api/whois?ip=8.8.8.8'
curl -fsS http://127.0.0.1:3100/api/history
```

Expected: all tests/builds pass, health is liveness-only, public endpoints return stable contracts and correct rate headers, DNS/RDAP remain on-demand, and the container is healthy without writing healthcheck lookups.

- [ ] **Step 5: Commit final docs and verification updates.**

```bash
git add README.md .env.example docker-compose.yml CHANGELOG.md components/ui/WhoisSection.tsx app/page.tsx e2e
git commit -m "docs: finalize hardening and network diagnostic contracts"
```

## Plan Self-Review

- Spec coverage: all four batches are represented; rate limits, stats auth, DNS policy/cache, RDAP ASN, retention, health, error handling, CSP, CI/browser/supply-chain checks, connectivity, share links, and documentation each have tasks.
- Placeholder scan: no incomplete or deferred implementation steps are used.
- Type consistency: `DnsLookupResult`, `RdapAsnInfo`, `HealthPayload`, `buildLookupUrl`, `getRateLimiter`, and stable error codes are defined where first introduced and consumed consistently later.
- Scope: tasks are sequential because later UI/API work depends on shared contracts, but each has a focused test boundary and conventional commit.
- Compatibility: legacy global rate-limit settings remain fallback; `/api/history` stays aggregate-only; no new service or signing requirement is introduced.
- Risk explicitly retained: LAN port/header trust is documented rather than removed, matching the approved user decision.
