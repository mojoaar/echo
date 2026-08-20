# Task 8 Report

## Status

Complete. Implemented Task 8 from baseline commit `abd7e27`, fixed the prior review findings through commit `29d7c63`, and fixed the remaining token-leak race in this review-fix commit.

## Changes

- Added desktop admin browser coverage for disabled admin, invalid and successful login, cookie flags and protection, logout, date presets/custom ranges, activity filters/table/pagination, resource cards/charts, expired sessions, error states, and token absence from HTML/response bodies.
- Added mobile admin coverage for responsive login/dashboard controls, table/chart rendering, no horizontal overflow, 44px interactive targets, and logout.
- Isolated admin browser tests on a dedicated server, database, and desktop/mobile projects so public lookup tests cannot mutate or race the admin test database.
- Set deterministic test-only environment values with `ADMIN_TOKEN=test-admin-token`, blank public credentials, and isolated `DB_PATH` values. No production credentials are used.
- Split Next.js instrumentation into `instrumentation.ts` and Node-only `instrumentation.node.ts`, following the installed Next.js 16.3.1 guidance so `better-sqlite3` is not bundled into the Edge instrumentation graph during browser-test server startup.
- Updated instrumentation unit setup to exercise the Node runtime path.
- Explicitly blanked public/admin credential environment variables on every non-admin Playwright server and gave desktop/mobile admin projects separate configurable ports, dist directories, and SQLite databases.
- Made custom-range coverage edit both date fields and assert the resulting activity query values; the token-leak test now captures completed admin HTML, login/session/activity/resources response bodies and checks them, plus every observed request URL, for both `ADMIN_TOKEN` and `STATS_TOKEN`.
- Extended mobile admin coverage to assert both Memory and `/data` charts.
- Added a SQLite resource-retention regression test proving samples older than 30 days are deleted while the exact 30-day boundary is retained.
- Made configured-probe CORS assertions follow the configured Playwright port.

## TDD Evidence

- RED: the new focused admin coverage initially exposed the missing deterministic disabled-admin server and test harness startup failure. The initial Playwright server timed out because Next bundled `better-sqlite3` through `instrumentation.ts`.
- GREEN: after the Node-only instrumentation split and dedicated admin server, the focused admin desktop run passed 13 tests and the focused mobile-admin run passed 1 test.
- Reviewer-fix GREEN: focused admin desktop/mobile run passed 14 tests on non-default ports; focused configured-probe run passed 1 test on a non-default port; focused resource-retention test passed.
- Remaining-review-fix GREEN: the deterministic token-leak test passed after awaiting `Response.finished()` before reading each completed response body; admin desktop and mobile suites passed again.

## Exact Verification

Commands and results:

- `npm test`: passed, 35 files and 272 tests.
- `npm run lint`: passed, `tsc --noEmit` exit 0.
- `npm run coverage`: passed, statements 92%, branches 85.32%, functions 95.63%, lines 95.2%.
- `npx playwright test` with non-default ports: 30/32 passed. All Task 8 admin checks passed (14/14: 13 desktop and 1 mobile), and configured probes passed in an isolated rerun (1/1). The only full-suite failure was the unrelated existing mobile check `mobile theme control remains keyboard accessible`, caused by persisted dark theme state; the other mobile check passed. The initial configured-probe failure was corrected by making its CORS origin use the configured port, and the isolated rerun passed.
- `npm audit --audit-level=high`: passed, 0 vulnerabilities.
- `docker compose config`: passed; default `ADMIN_TOKEN` and `HEALTH_TOKEN` rendered empty, session TTL 28800, retention 90 days.
- `npm run build`: passed; production Next build completed with the existing dynamic filesystem tracing warning.
- `docker build -t ghcr.io/mojoaar/echo:task8 .`: passed; production image built and exported.
- Default production image smoke: `ECHO_TAG=task8 docker compose up -d --force-recreate` passed; container became healthy. `curl -fsS http://127.0.0.1:3100/api/health` returned `{"status":"ok"}`. `/admin` returned HTTP 404 without token material.
- Enabled production admin smoke: `ADMIN_TOKEN=task8-secret ECHO_TAG=task8 docker compose up -d --force-recreate` passed; login returned HTTP 200 and `{"authenticated":true}` with `HttpOnly; Secure; SameSite=Strict; Path=/`, session/activity/resources endpoints returned valid data, and logout returned `{"authenticated":false}` with `Max-Age=0` cookie clearing.
- Public endpoint compatibility: `/api/ip?ip=8.8.8.8`, `/api/dns?name=johansen.foo`, and `/api/whois?ip=8.8.8.8` returned valid existing response contracts; `/api/health` remained healthy.
- Container hardening: `docker inspect` confirmed `ReadonlyRootfs=true`, `CapDrop=[ALL]`, `no-new-privileges:true`, runtime user `node`, `/data` as the only mount, and no Docker socket.
- `git diff --check`: passed.
- Final `npm run lint && git diff --check`: passed.

## Commit

- Required message: `test: verify private admin dashboard`
- Prior Task 8 commit: `3b05944`
- Subsequent provenance commit: `29d7c63`
- Remaining review-fix commit: `6439eb7`

## Preserved Unrelated Changes

- Preserved modified `next-env.d.ts`.
- Preserved modified `tsconfig.json`.
- Preserved untracked `test-results/`.
- These files were not staged, reverted, deleted, or included in the Task 8 commit.

## Concerns

- Playwright emits the existing service-worker registration blocked message because the configuration intentionally sets `serviceWorkers: 'block'`.
- Production build emits the existing Turbopack warning that dynamic schema filesystem access traces the project; the build and image still complete successfully.
- Vitest emits the existing Vite `configLoader: 'native'` ESM/CommonJS warning.
- Container resource sampler status is enabled but has no successful sample immediately after startup; CPU is intentionally unavailable until a second sample, matching the existing sampler contract.
- The prior container named `echo` had to be removed to run the required image smoke test because Compose hard-codes `container_name: echo`; its named data volume was preserved.
- Full browser verification still has the pre-existing mobile theme test failure when a shared browser profile starts in dark mode; this Task 8 change does not touch theme state or that test.
- The full Playwright command is not a green gate yet because of that persisted-theme failure; all affected admin checks and the configured-probe rerun are green.
