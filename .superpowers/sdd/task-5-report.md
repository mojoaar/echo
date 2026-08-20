# Task 5 Report: Admin Login, Session, And Data APIs

## Status

Implemented Task 5 from baseline `80be4b1`.

## Delivered

- Added form-urlencoded `POST /api/admin/login` with safe token verification, indistinguishable disabled/failed-login 404 responses, trusted visitor identity failed-login limiting, opaque signed session creation, and secure cookie attributes.
- Added authenticated `POST /api/admin/logout` with matching cookie clearing attributes.
- Added authenticated `GET /api/admin/session` with minimal `{ authenticated: true }` output.
- Added authenticated `GET /api/admin/activity` with timezone-aware date validation, retention and future-date bounds, type/channel/actor/country/outcome/IP filters, bounded pagination, and existing activity query integration.
- Added authenticated `GET /api/admin/resources` with 30-day bounded history, current sample/status output, parameterized SQLite reads, and normalized resource fields.
- Added malformed-cookie handling that returns the same not-found response instead of throwing.
- Added named `admin-login` limiter support without changing public `STATS_TOKEN` behavior.
- Added no-store responses, no CORS headers, stable error categories, and redacted operational error logs.
- Added route tests covering disabled admin, wrong token, successful cookie, configured TTL, login limiting, logout, missing/expired/malformed sessions, no-store/no-CORS behavior, date validation, filters, pagination, resource status/history, and internal database errors.
- Added no source comments.
- Preserved unrelated worktree changes in `next-env.d.ts`, `tsconfig.json`, and `test-results/`; none were staged.

## TDD Evidence

### RED

Command:

```text
npx vitest run app/api/admin/login/route.test.ts app/api/admin/logout/route.test.ts app/api/admin/session/route.test.ts app/api/admin/activity/route.test.ts app/api/admin/resources/route.test.ts
```

Result before route implementation:

```text
Failed Suites 5
Error: Cannot find module './route' imported from app/api/admin/*/route.test.ts
Tests no tests
```

The focused tests failed at the missing route module boundary for all five required handlers.

### GREEN

Final focused command:

```text
npx vitest run app/api/admin/login/route.test.ts app/api/admin/logout/route.test.ts app/api/admin/session/route.test.ts app/api/admin/activity/route.test.ts app/api/admin/resources/route.test.ts
```

Result: `Test Files 5 passed (5)` and `Tests 19 passed (19)`.

## Verification

Full tests:

```text
npm test
```

Result: `Test Files 33 passed (33)` and `Tests 251 passed (251)`.

Lint/type check:

```text
npm run lint
```

Result: `tsc --noEmit` exited 0 with no errors.

Diff validation:

```text
git diff --check
```

Result: exited 0 with no whitespace errors.

## Commit

Implementation commit: `a0fb18f`

## Concerns

- Vitest emits the existing non-fatal Vite warning about ESM syntax in `vitest.config.ts` being loaded as CommonJS.
- Login and admin data endpoints require HTTPS in deployment because the session cookie is intentionally `Secure`.
- Resource history is bounded to 1,000 returned samples in addition to the 30-day date bound.
- The existing admin session helper retains its previously documented base64url parsing behavior; route cookie parsing now safely handles malformed percent encoding.

## Review Resolution

Resolved all findings from review range `80be4b1..9850e14`.

- Disabled admin login now returns `404` before reading or consuming the failed-login limiter.
- Missing, invalid, and malformed admin sessions are rate-limited by trusted visitor identity; ordinary failures remain indistinguishable `404` responses.
- Activity and resource date ranges now use one shared helper based on the configured container `TZ`, with calendar-day arithmetic and DST-safe local-midnight boundaries.
- Resource `current` is selected from the latest sample independently of the requested history range.
- Login and logout use shared admin cookie options and serialization.
- Removed the unsafe legacy session-token assertion and unused session-cookie export.
- Added regression coverage for limiter ordering, invalid-session limiting, DST boundaries, and range-independent resource current data.

## Review Verification

Focused regressions:

```text
npx vitest run app/api/admin/login/route.test.ts app/api/admin/session/route.test.ts app/api/admin/activity/route.test.ts app/api/admin/resources/route.test.ts
Test Files 4 passed (4)
Tests 21 passed (21)
```

Full tests:

```text
npm test
Test Files 33 passed (33)
Tests 255 passed (255)
```

Lint/type check:

```text
npm run lint
tsc --noEmit exited 0
```

Diff validation:

```text
git diff --check exited 0
```

Review-fix commit: pending.
