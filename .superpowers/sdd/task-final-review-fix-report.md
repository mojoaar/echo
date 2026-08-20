# Task 9 Final Review Fix Report

## Status

Fixed all Critical and Important findings identified in the Task 9 whole-branch review package `6439797..fd1960b`. The unrelated worktree changes in `next-env.d.ts`, `tsconfig.json`, and `test-results/` were preserved and were not staged.

## Findings And Fixes

### Critical: activity retention

`activity_events` are now pruned with the existing `LOOKUP_RETENTION_DAYS` cutoff during the normal database startup and hourly controlled database-maintenance lifecycle. Activity pruning remains separate from legacy `lookups` pruning and never deletes legacy rows. The exact cutoff remains strict: rows older than the cutoff are deleted and rows at the cutoff are retained.

Regression coverage: `lib/db.test.ts` verifies startup pruning and `lib/activity.test.ts` verifies the strict cutoff and legacy preservation.

### Critical: server-side logout invalidation

Logout now revokes the validated current opaque session on the server before clearing its cookie. Session verification rejects revoked sessions while preserving expiry, malformed-cookie handling, and `ADMIN_TOKEN` rotation invalidation.

Regression coverage: `lib/admin-auth.test.ts` verifies direct revocation and `app/api/admin/logout/route.test.ts` verifies the exact logged-out session can no longer access the session API.

### Important: disabled-admin limiter ordering

All authenticated admin APIs now check `isAdminEnabled()` before session verification or any limiter access. Disabled admin responses remain indistinguishable `404` responses and cannot consume the session limiter. Login retains its existing pre-limiter disabled check, and `STATS_TOKEN` behavior is unchanged.

Regression coverage: session, logout, activity, and resources route tests verify a disabled request does not consume the limiter before enabling admin and making the first and second invalid-session requests.

### Important: legacy classification and duplication

Legacy `lookups` rows are returned only in the separate `legacy` collection with `legacy/unclassified` semantics and an explicit `unknown` outcome. They are excluded from successful-event totals and attributed type/channel/actor/outcome/partial breakdowns. The separate `legacySummary` reports legacy row count and unique IP count. Paginated `events` contains only attributed activity rows, so legacy rows are not duplicated in the paginated event collection.

Regression coverage: `lib/activity.test.ts` verifies totals, breakdowns, legacy labels, legacy summary, and non-duplicated event pagination.

### Important: activity breakdowns

The activity result and API now include channel, actor, outcome, and explicit `complete` versus `partial` status breakdowns. Counts are calculated only from attributed activity events, with partial events counted in `partial` outcome and `partial` status buckets.

Regression coverage: `lib/activity.test.ts` and `app/api/admin/activity/route.test.ts` assert exact breakdown counts.

### Important: activity trend visualization

The authenticated admin UI now renders a bounded activity trend SVG alongside the resource trends. The API returns at most 31 daily trend points, grouped using the configured container timezone. The visualization is server-rendered through the existing component tree with no additional client behavior and remains inside the existing mobile-safe panel layout.

Regression coverage: activity query tests assert trend data and the admin page tests render the activity table/trend component path.

### Important: admin JSON noindex response headers

Shared admin response headers now include `X-Robots-Tag: noindex, nofollow` in addition to `Cache-Control: no-store`. This applies to successful responses, not-found responses, rate-limit responses, and admin validation/internal-error responses. Page metadata already sets non-indexable robots values.

Regression coverage: activity and resources route tests assert the header, and authentication tests cover the shared not-found header helper.

### Minor: configured-timezone timestamps

Activity table timestamps and sampler last-success timestamps now use the configured container timezone instead of UTC ISO formatting. The configured timezone remains visible in the dashboard.

Regression coverage: `app/admin/page.test.ts` asserts the configured-timezone rendering.

### Minor: other data storage

The resource storage card now displays `otherDataBytes` as a separate `/data` value alongside database, WAL, and SHM sizes.

Regression coverage: `app/admin/page.test.ts` asserts the storage value.

## TDD Evidence

Focused RED command:

```text
npx vitest run lib/db.test.ts lib/admin-auth.test.ts lib/activity.test.ts app/api/admin/logout/route.test.ts app/api/admin/session/route.test.ts app/api/admin/activity/route.test.ts app/api/admin/resources/route.test.ts app/admin/page.test.ts
```

Before implementation, the new regressions failed for missing activity startup pruning, missing session revocation, disabled-admin limiter consumption, missing noindex headers, legacy-success/duplication behavior, and missing activity result fields. The first RED run reported 9 failing tests across the requested boundaries.

Focused GREEN command:

```text
npx vitest run lib/db.test.ts lib/admin-auth.test.ts lib/activity.test.ts app/api/admin/logout/route.test.ts app/api/admin/session/route.test.ts app/api/admin/activity/route.test.ts app/api/admin/resources/route.test.ts app/admin/page.test.ts
```

Result: `8` test files passed and `72` tests passed.

## Verification

Full tests:

```text
npm test
```

Result: `35` test files passed and `280` tests passed.

Typecheck/lint:

```text
npm run lint
```

Result: `tsc --noEmit` exited `0`.

Whitespace validation:

```text
git diff --check
```

Result: exited `0` with no whitespace errors.

## Final Task 9 Minor Fix

`lib/resources.ts` now uses the existing `containerTimezone()` helper for sampler `localTs` formatting. Invalid or missing `TZ` values therefore fall back to `UTC` consistently with admin date and page handling. Resource measurement and sampler lifecycle behavior are unchanged.

Regression coverage: `lib/resources.test.ts` verifies that an invalid configured timezone produces the UTC local timestamp instead of `null`.

## Final Fix TDD Evidence

Focused RED command:

```text
npx vitest run lib/resources.test.ts
```

Result: `1` regression failed as expected with invalid `TZ` producing `localTs: null`.

Focused GREEN command:

```text
npx vitest run lib/resources.test.ts
```

Result: `1` test file passed and `15` tests passed.

## Final Fix Verification

Full tests:

```text
npm test
```

Result: `35` test files passed and `284` tests passed.

Typecheck/lint:

```text
npm run lint
```

Result: `tsc --noEmit` exited `0`.

Whitespace validation:

```text
git diff --check
```

Result: exited `0` with no whitespace errors.

## Final Fix Concerns

- Vitest continues to emit the existing non-fatal warning that `vitest.config.ts` uses ESM syntax while loaded as CommonJS.

## Concerns

- Vitest continues to emit the existing non-fatal warning that `vitest.config.ts` uses ESM syntax while loaded as CommonJS.
- Session revocation is process-local in-memory state; `ADMIN_TOKEN` rotation still invalidates all signed sessions across restarts, while a logout revocation list does not need persistence beyond the running process because the browser session is cleared and the signed session expires or token rotation invalidates it.
- Browser/Playwright verification was not rerun because the requested completion gates were `npm test`, `npm run lint`, and `git diff --check`; the branch’s prior Task 8 report records the existing full-browser environment limitation.

## Re-Review Findings Resolution

### Important: bounded legacy activity pages

Legacy `lookups` rows now use the requested activity page limit and offset instead of loading the complete legacy result set. Legacy rows remain isolated in the `legacy` collection with `legacy/unclassified` labeling, while `legacySummary` remains unpaginated for accurate totals. The dashboard enables the next-page control when either attributed or legacy rows fill a page.

Regression coverage: `lib/activity.test.ts` verifies that consecutive pages return bounded, non-duplicated legacy rows and preserve the full legacy summary.

### Important: bounded activity trends

Activity trends now reduce matching events in parameterized SQL and return at most the retained 31-day trend window. The application no longer loads every matching timestamp before grouping, and the query is timezone-aware through the shared normalized admin timezone and local-day boundaries.

Regression coverage: `lib/activity.test.ts` verifies daily trend counts and asserts the SQL path uses a grouped CTE rather than a timestamp-only result query.

### Important: explicit activity sort validation

The activity API now validates `sort` explicitly, accepting only `asc` or `desc` and returning the stable `{ error: 'invalid input', code: 'invalid_input' }` response for unsupported or repeated values. Validated sort order is applied to both attributed and legacy detail queries.

Regression coverage: `app/api/admin/activity/route.test.ts` verifies unsupported sort values return HTTP 400 with the stable invalid-input response.

### Minor: invalid admin timezone fallback

The admin page now uses the same normalized timezone helper as admin date handling. Missing or invalid `TZ` values fall back to `UTC` before reaching `Intl.DateTimeFormat`, preventing page rendering exceptions and keeping displayed local timestamps consistent with date-range calculations.

Regression coverage: `app/admin/page.test.ts` renders an authenticated page with an invalid timezone and verifies the UTC label and timestamp.

## Re-Review TDD Evidence

Focused RED command:

```text
npx vitest run lib/activity.test.ts app/api/admin/activity/route.test.ts app/admin/page.test.ts
```

Result: `4` new regressions failed for unbounded legacy rows, timestamp materialization, ignored sort validation, and invalid timezone rendering.

Focused GREEN command:

```text
npx vitest run lib/activity.test.ts app/api/admin/activity/route.test.ts app/admin/page.test.ts
```

Result: `3` test files passed and `33` tests passed.

## Re-Review Verification

Full tests:

```text
npm test
```

Result: `35` test files passed and `283` tests passed.

Typecheck/lint:

```text
npm run lint
```

Result: `tsc --noEmit` exited `0`.

Whitespace validation:

```text
git diff --check
```

Result: exited `0` with no whitespace errors.
