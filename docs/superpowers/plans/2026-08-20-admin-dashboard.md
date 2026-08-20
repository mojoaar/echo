# Echo Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private `/admin` dashboard with signed session authentication, detailed successful activity analytics, and bounded Echo-container resource history.

**Architecture:** Keep the existing public APIs and `lookups` table compatible. Add server-only admin auth, a separate `activity_events` table for newly attributed successful requests, and a `resource_samples` table populated by an in-process sampler only when `ADMIN_TOKEN` is configured. Render `/admin` on the server and use small client islands for login, filters, pagination, logout, and charts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, better-sqlite3, Vitest, Playwright, Docker Compose.

## Global Constraints

- Admin route is `/admin`.
- Use `ADMIN_TOKEN`, separate from `STATS_TOKEN`.
- When `ADMIN_TOKEN` is unset, `/admin` and all admin APIs return `404`.
- Default admin session lifetime is `28800` seconds, configured by `ADMIN_SESSION_TTL_SECONDS`.
- Use signed opaque `HttpOnly`, `Secure`, `SameSite=Strict` session cookies.
- Never place admin tokens in URLs, local storage, rendered HTML, or API responses.
- Date calculations use the container-configured `TZ`, not browser timezone.
- Date ranges cannot exceed `LOOKUP_RETENTION_DAYS` or include future dates.
- Count only successful completed activity; invalid, failed, timed-out, and rate-limited requests do not create activity events.
- Keep `lookups` unchanged and classify existing rows as `legacy/unclassified`.
- Resource sampling is Echo-container-only, runs only when `ADMIN_TOKEN` is set, samples every five minutes, and retains 30 days.
- Do not mount the Docker socket or add elevated privileges.
- Public aggregate history and `STATS_TOKEN` behavior remain compatible.
- Source files remain comment-free.
- Preserve unrelated existing worktree changes in `next-env.d.ts`, `tsconfig.json`, and `test-results/`; do not stage or revert them.

## File Map

- Create `lib/admin-auth.ts`: admin secret checks, signed opaque session creation/verification, cookie helpers, and session expiry.
- Create `lib/admin-auth.test.ts`: authentication, expiry, rotation, cookie, and disabled-secret tests.
- Create `lib/activity.ts`: activity types, User-Agent actor heuristic, attribution helpers, exclusion rules, and event insertion/query logic.
- Create `lib/activity.test.ts`: event attribution, exclusions, partial outcomes, legacy rows, retention, filters, pagination, and timezone-boundary tests.
- Create `lib/resources.ts`: cgroup/filesystem/SQLite measurements and resource-sampler lifecycle.
- Create `lib/resources.test.ts`: measurement fallbacks, first CPU sample, 30-day pruning, disabled sampler, and restart uptime behavior.
- Modify `lib/db.ts` and `schema.sql`: add idempotent activity/resource tables, indexes, retention queries, and resource queries without changing `lookups`.
- Create `app/api/admin/login/route.ts`, `logout/route.ts`, `session/route.ts`, `activity/route.ts`, and `resources/route.ts`.
- Create corresponding route tests under `app/api/admin/**/route.test.ts`.
- Create `app/admin/page.tsx`: server-rendered gate/login/dashboard shell.
- Create `components/admin/AdminLogin.tsx`, `AdminControls.tsx`, `ActivityTable.tsx`, `ResourceCards.tsx`, and `ResourceCharts.tsx` as minimal client islands where interaction requires it.
- Modify `app/layout.tsx` or admin metadata handling only as needed to ensure admin pages are `noindex` and private.
- Modify `instrumentation.ts`: start the resource sampler only when `ADMIN_TOKEN` is configured, while preserving MMDB warmup.
- Modify `docker-compose.yml`, `.env.example`, `README.md`, and `CHANGELOG.md` with admin settings and operational behavior.
- Extend `e2e/admin.spec.ts` and Playwright configuration only where required for desktop/mobile admin coverage.

---

### Task 1: Admin Session Authentication

**Files:**
- Create: `lib/admin-auth.ts`
- Test: `lib/admin-auth.test.ts`
- Modify: `.env.example`, `docker-compose.yml`

**Interfaces:**
- Produces `isAdminEnabled(): boolean`.
- Produces `createAdminSession(): string`.
- Produces `verifyAdminSession(value: string | undefined): { valid: boolean; expiresAt: number }`.
- Produces `adminCookieOptions(maxAge: number): { httpOnly: true; secure: true; sameSite: 'strict'; path: '/'; maxAge: number }`; `/` is required because the same session must reach both `/admin` and `/api/admin/*`.
- Produces `adminNotFound(): Response` and `adminNoStoreHeaders()` helpers or equivalent shared behavior.

- [ ] **Step 1: Write failing auth tests** covering disabled `ADMIN_TOKEN`, correct/incorrect token comparison, opaque session values, expiry, malformed values, token rotation invalidation, and cookie flags.
- [ ] **Step 2: Run `npx vitest run lib/admin-auth.test.ts` and verify module/API failures occur for the missing implementation.**
- [ ] **Step 3: Implement HMAC-signed opaque sessions.** Derive the signing key from `ADMIN_TOKEN` plus a fixed purpose string, encode only an expiry and random nonce, use constant-time signature comparison, reject expired/malformed values, and read `ADMIN_SESSION_TTL_SECONDS` as a positive safe integer defaulting to `28800`.
- [ ] **Step 4: Add Compose and example configuration.** Add `ADMIN_TOKEN: ${ADMIN_TOKEN:-}` and `ADMIN_SESSION_TTL_SECONDS: ${ADMIN_SESSION_TTL_SECONDS:-28800}` without exposing a token value.
- [ ] **Step 5: Run focused tests and `npm run lint`; expected result is all auth tests and TypeScript checks passing.**
- [ ] **Step 6: Commit with `feat: add admin session authentication`.**

### Task 2: Activity Event Model And Queries

**Files:**
- Modify: `schema.sql`, `lib/db.ts`
- Create: `lib/activity.ts`
- Test: `lib/activity.test.ts`, `lib/db.test.ts`

**Interfaces:**
- Produces `ActivityLookupType = 'page' | 'geo' | 'ip' | 'whois' | 'dns'`.
- Produces `ActivityChannel = 'ui' | 'api' | 'unknown'`.
- Produces `ActivityActor = 'browser' | 'bot' | 'unknown'`.
- Produces `ActivityOutcome = 'success' | 'partial'`.
- Produces `recordActivityEvent(event: ActivityEvent): void`.
- Produces `queryActivity(options: ActivityQuery): ActivityQueryResult`.
- Produces `activityRetentionCutoff(nowMs?: number): number` and `pruneActivity(nowMs?: number): number`.

- [ ] **Step 1: Write failing schema/query tests.** Assert idempotent creation of `activity_events`, `resource_samples` placeholder schema compatibility, event insertion, time filtering, type/channel/actor filters, unique IP counts, country/type/outcome breakdowns, bounded pagination, exact retention cutoff, and empty results.
- [ ] **Step 2: Add attribution tests.** Verify browser/bot/unknown User-Agent heuristics, `ui` versus `api` channel resolution, target preservation, partial outcomes, and exclusion of health/admin/static/history/stats requests.
- [ ] **Step 3: Run focused tests and confirm RED.**
- [ ] **Step 4: Add the idempotent `activity_events` table and indexes.** Keep `lookups` unchanged. Store exact IP, nullable ISO country, epoch milliseconds, lookup type, channel, actor, nullable target, outcome, and integer partial flag.
- [ ] **Step 5: Implement parameterized aggregate and detail queries.** Return total successful events, unique IPs, breakdowns, paginated events, and legacy rows separately labeled `legacy/unclassified`.
- [ ] **Step 6: Implement activity retention using `LOOKUP_RETENTION_DAYS`.** Use the same strict cutoff semantics as existing lookup pruning and never delete `lookups` from activity cleanup.
- [ ] **Step 7: Run focused tests, full `npm test`, and `npm run lint`; expected result is GREEN.**
- [ ] **Step 8: Commit with `feat: add attributed activity event storage`.**

### Task 3: Instrument Successful Public Activity

**Files:**
- Modify: `app/page.tsx`, `app/api/json/route.ts`, `app/api/ip/route.ts`, `app/api/whois/route.ts`, `app/api/dns/route.ts`
- Test: existing route tests and `lib/activity.test.ts`

**Interfaces:**
- Consumes `recordActivityEvent(event: ActivityEvent): void` from Task 2.
- Produces no public response-shape changes.

- [ ] **Step 1: Add failing integration assertions** that successful page, geo, IP, WHOIS, and DNS requests create the correct event, while invalid, failed, timeout, rate-limited, health, admin, static, history, and stats requests do not.
- [ ] **Step 2: Run affected route tests and verify RED.**
- [ ] **Step 3: Instrument only completed success paths.** Use `x-real-ip`/`x-forwarded-for` attribution already used by the app, preserve country/target/partial data, infer channel from request context, and classify User-Agent heuristically.
- [ ] **Step 4: Ensure page activity is recorded only after geo rendering data is available.** A degraded but rendered lookup may be recorded as partial; a failed lookup must not be recorded.
- [ ] **Step 5: Add explicit exclusion guards** so health checks, `/api/history`, `/api/stats`, admin endpoints, and static assets cannot call the recorder.
- [ ] **Step 6: Run all affected route tests, `npm test`, and `npm run lint`; expected result is GREEN with public contracts unchanged.**
- [ ] **Step 7: Commit with `feat: record successful lookup activity`.**

### Task 4: Resource Measurement And Sampler

**Files:**
- Create: `lib/resources.ts`
- Test: `lib/resources.test.ts`
- Modify: `schema.sql`, `lib/db.ts`, `instrumentation.ts`

**Interfaces:**
- Produces `readResourceSample(nowMs?: number): ResourceSampleInput`.
- Produces `startResourceSampler(): (() => void) | null`.
- Produces `getResourceSamplerStatus(): ResourceSamplerStatus`.
- Produces `pruneResourceSamples(nowMs?: number): number`.

- [ ] **Step 1: Write failing measurement tests** for cgroup v2/v1 memory limits, unavailable CPU first sample, CPU delta calculation, `/data` file breakdown, SQLite/WAL/SHM sizing, row counts, uptime, configured local timestamp, optional image size, and sampler-disabled behavior.
- [ ] **Step 2: Write failing lifecycle tests** for five-minute scheduling, 30-day pruning, startup sample, no duplicate sampler, and cleanup on shutdown.
- [ ] **Step 3: Run focused tests and verify RED.**
- [ ] **Step 4: Implement measurement using only container-visible files and SQLite.** Use cgroup files with safe fallbacks, `fs.statfs`/directory traversal for `/data`, and existing DB connection/query helpers. Treat rootfs as non-metric.
- [ ] **Step 5: Implement bounded persistence.** Add `resource_samples` with timestamp index, save every five minutes, prune older than 30 days, and preserve sampler status/last-success state.
- [ ] **Step 6: Update `instrumentation.ts`.** Preserve MMDB warmup and call `startResourceSampler()` only when `ADMIN_TOKEN` is non-empty. Do not start it in tests or when disabled.
- [ ] **Step 7: Run focused tests, full tests, and lint; expected result is GREEN.**
- [ ] **Step 8: Commit with `feat: add container resource sampler`.**

### Task 5: Admin Login, Session, And Data APIs

**Files:**
- Create: `app/api/admin/login/route.ts`
- Create: `app/api/admin/logout/route.ts`
- Create: `app/api/admin/session/route.ts`
- Create: `app/api/admin/activity/route.ts`
- Create: `app/api/admin/resources/route.ts`
- Tests: `app/api/admin/**/route.test.ts`

**Interfaces:**
- Login accepts `application/x-www-form-urlencoded` field `token` and returns a redirect or JSON success without token data.
- Activity accepts `from`, `to`, bounded `limit`, `offset`, `type`, `channel`, `actor`, `country`, `outcome`, and `ip` filters.
- Resources accepts optional history range bounded to 30 days.

- [ ] **Step 1: Write failing route tests** for disabled admin, wrong token, successful cookie, logout, expired session, missing session, no-store/no-CORS headers, date validation, filters, pagination, resource status, and internal DB errors.
- [ ] **Step 2: Run focused route tests and verify RED.**
- [ ] **Step 3: Implement login.** Apply a dedicated failed-login limiter keyed by the trusted visitor identity, compare token safely, return indistinguishable `404` failures, and set the signed cookie only on success.
- [ ] **Step 4: Implement session middleware/helper use.** Every non-login route verifies the cookie and returns `404` when disabled or invalid.
- [ ] **Step 5: Implement logout and session status.** Clear the cookie with matching security attributes and return only minimal authenticated state.
- [ ] **Step 6: Implement activity/resources reads.** Validate and normalize all query inputs, enforce retention/timezone rules, use parameterized bounded queries, return stable error categories, and log only redacted operational metadata.
- [ ] **Step 7: Run focused tests, full tests, and lint; expected result is GREEN.**
- [ ] **Step 8: Commit with `feat: add admin data APIs`.**

### Task 6: Server-Rendered Admin Shell And Controls

**Files:**
- Create: `app/admin/page.tsx`
- Create: `components/admin/AdminLogin.tsx`
- Create: `components/admin/AdminControls.tsx`
- Create: `components/admin/ActivityTable.tsx`
- Create: `components/admin/ResourceCards.tsx`
- Create: `components/admin/ResourceCharts.tsx`
- Modify: `app/globals.css`, admin metadata handling if required
- Test: `app/admin/page.test.ts`, component tests where test setup supports them

**Interfaces:**
- Server page renders login or authenticated dashboard based on `verifyAdminSession`.
- Client controls call only same-origin admin APIs and never receive `ADMIN_TOKEN`.
- Activity table receives validated server data and renders exact IPs only inside the authenticated dashboard.

- [ ] **Step 1: Write failing page/UI tests** for disabled 404, login state, authenticated shell, logout, date presets, custom range, empty/error/expired states, legacy labels, unique IP wording, mobile controls, and resource unavailable states.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Implement the server page.** Add `noindex` metadata, no-store response behavior, and a compact login form. Do not render configuration secrets or raw API tokens.
- [ ] **Step 4: Implement controls and tables.** Support daily, weekly, monthly, and custom dates; filters; pagination; breakdown summaries; legacy/unclassified rows; and clear heuristic bot-label copy.
- [ ] **Step 5: Implement resource cards/charts.** Show CPU first-sample unavailable state, memory, `/data`, DB/WAL/SHM, row counts, uptime, local timestamp, sampler status, and optional image size.
- [ ] **Step 6: Add responsive styling using existing tokens and 44px controls.** Keep admin data readable on mobile without exposing it to public pages.
- [ ] **Step 7: Run tests, lint, and a local server smoke check; expected result is GREEN.**
- [ ] **Step 8: Commit with `feat: add admin dashboard UI`.**

### Task 7: Compose, Documentation, And Operational Contracts

**Files:**
- Modify: `docker-compose.yml`, `.env.example`, `README.md`, `CHANGELOG.md`
- Test: Compose/config documentation assertions where present

- [ ] **Step 1: Add explicit configuration.** Document `ADMIN_TOKEN`, `ADMIN_SESSION_TTL_SECONDS=28800`, and optional `ECHO_IMAGE_SIZE_BYTES` in Compose and `.env.example`; leave secrets empty by default so admin is disabled.
- [ ] **Step 2: Document deployment behavior.** Explain `/admin` availability, token generation/storage, session lifetime, token rotation, container timezone, 90-day activity retention, 30-day resource retention, exact IP privacy implications, heuristic bot classification, and no Docker socket requirement.
- [ ] **Step 3: Document legacy rows.** Explain that old `lookups` rows are shown as `legacy/unclassified` and only new activity events have reliable attribution.
- [ ] **Step 4: Add Unreleased changelog entries** for the private admin dashboard, attributed activity, resource sampling, and separate `ADMIN_TOKEN` authentication.
- [ ] **Step 5: Run `docker compose config`, documentation tests, and `git diff --check`; expected result is GREEN.**
- [ ] **Step 6: Commit with `docs: document admin dashboard deployment`.**

### Task 8: Browser Coverage And Final Verification

**Files:**
- Create or modify: `e2e/admin.spec.ts`, `playwright.config.ts`, CI workflow only if required by existing test commands

- [ ] **Step 1: Add Playwright setup with a deterministic `ADMIN_TOKEN` test environment.** Ensure the test process does not use production credentials or mutate a developer database.
- [ ] **Step 2: Add desktop tests** for disabled admin, login failure/success, cookie-protected dashboard, logout, date presets/custom range, activity filters/table, resource cards/charts, expired session, and no token in HTML/network response bodies.
- [ ] **Step 3: Add mobile tests** for responsive login, controls, tables, charts, and logout with 44px interactive targets.
- [ ] **Step 4: Run `npm test`, `npm run lint`, `npm run coverage`, `npx playwright test`, `npm audit --audit-level=high`, and `docker compose config`; expected result is all GREEN with configured thresholds.
- [ ] **Step 5: Build and run the production image.** Verify admin disabled by default, enabled with `ADMIN_TOKEN`, session cookie flags, public API compatibility, healthcheck behavior, read-only rootfs, no Docker socket, and bounded SQLite/resource retention.
- [ ] **Step 6: Run `git diff --check` and inspect `git status`.** Stage only intended product files; preserve unrelated `next-env.d.ts`, `tsconfig.json`, and `test-results/` changes.
- [ ] **Step 7: Commit with `test: verify private admin dashboard`.**

### Task 9: Whole-Branch Review And Release Readiness

- [ ] **Step 1: Generate a full branch review package from the implementation base to `HEAD`.**
- [ ] **Step 2: Review security boundaries first:** disabled-secret 404 behavior, cookie signing/rotation, query validation, raw IP exposure only after auth, no CORS, no-store/noindex, no Docker socket, and redacted logs.
- [ ] **Step 3: Review data correctness:** successful-only event recording, legacy classification, timezone boundaries, retention cutoffs, unique IP wording, partial outcomes, and resource sampling lifecycle.
- [ ] **Step 4: Fix all Critical and Important findings, rerun affected tests, and re-review the fixes before release.**
- [ ] **Step 5: Confirm the release changelog and version workflow remain compatible.** Do not publish a release until the user explicitly requests it.

## Plan Self-Review

- Spec coverage: authentication and disabled behavior are Tasks 1 and 5; activity schema/attribution/instrumentation are Tasks 2 and 3; resources are Task 4; dashboard APIs/UI are Tasks 5 and 6; deployment/docs are Task 7; browser and full verification are Task 8; whole-branch review is Task 9.
- Placeholder scan: every implementation step is concrete and no unspecified work remains.
- Type consistency: all later tasks consume the named `ActivityEvent`, `ActivityQuery`, `ResourceSample`, session, and route contracts introduced in earlier tasks.
- Scope: the plan remains limited to the approved private admin dashboard and its required storage, instrumentation, delivery, and verification work. Public API behavior and the existing `lookups` table are explicitly preserved.
