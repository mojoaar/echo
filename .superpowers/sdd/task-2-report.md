# Task 2 Report: Activity Event Model And Queries

## Status

Complete. Implemented Task 2 from baseline `09166e8`.

## Implementation

- Added idempotent `activity_events` storage with timestamp, type, channel, actor, IP, nullable country and target, outcome, and integer partial fields.
- Added the `resource_samples` placeholder schema and timestamp index for later resource-sampler migration.
- Added activity indexes for timestamp, lookup type, channel, actor, and IP.
- Added activity event types, recording, User-Agent actor classification, channel resolution, path exclusions, aggregate queries, filter queries, bounded pagination, and legacy lookup labeling.
- Added activity retention helpers using `LOOKUP_RETENTION_DAYS` and the existing strict `ts < cutoff` behavior.
- Activity pruning only deletes `activity_events`; legacy `lookups` remain untouched.
- Preserved the existing `lookups` table definition and behavior.
- Added no source comments, in accordance with the task constraint.

## RED Evidence

Command:

```text
npx vitest run lib/activity.test.ts lib/db.test.ts
```

Result before implementation:

```text
lib/activity.test.ts: Cannot find module './activity'
lib/db.test.ts: expected resource_samples schema, received no resource_samples table
Test Files 2 failed (2)
Tests 1 failed | 13 passed (14)
```

The failures demonstrated that the new activity module and required schema were absent.

## GREEN Evidence

Focused command:

```text
npx vitest run lib/activity.test.ts lib/db.test.ts
```

Result:

```text
Test Files 2 passed (2)
Tests 21 passed (21)
```

The focused tests cover attribution heuristics, channel resolution, exclusions, event persistence, target and partial fields, time and attribution filters, aggregates, legacy rows, pagination, exact retention cutoff, lookup preservation, and empty results.

## Verification

Full tests:

```text
npm test
```

Result:

```text
Test Files 26 passed (26)
Tests 213 passed (213)
```

Lint/type check:

```text
npm run lint
```

Result: `tsc --noEmit` exited 0 with no errors.

Additional checks:

- `git diff --check` passed before commit.
- Cached diff contained only the five Task 2 files.
- Protected `next-env.d.ts`, `tsconfig.json`, and `test-results/` were not staged.

## Commit

```text
fa8e43c feat: add attributed activity event storage
```

## Concerns

- Vitest emits the existing non-fatal Vite warning about ESM syntax in `vitest.config.ts` being loaded as CommonJS.
- Activity attribution remains intentionally heuristic: non-empty User-Agents not matching bot markers are classified as browsers.
- `resource_samples` is a compatibility placeholder only; resource measurement and persistence are deferred to the later resource-sampler task.

## Reviewer Fixes

Fixed all findings from review package `09166e8..fa8e43c`:

- `totalSuccessfulEvents` now counts only rows whose outcome is `success`; partial activity rows remain available in event and outcome results but are excluded from the successful total.
- String activity inputs now parse absolute URLs with `URL`, preserving relative-path handling and enabling channel detection and exclusions for inputs such as `https://host/api/ip`.
- `pruneActivity` now closes the temporary SQLite connection it opens when no module-level connection exists, while retaining the existing owned-connection behavior when one is active.
- Added regression coverage for partial totals, absolute URL channel/exclusion handling, and temporary connection cleanup.

## Fix Verification

Focused activity/database tests:

```text
npx vitest run lib/activity.test.ts lib/db.test.ts
Test Files 2 passed (2)
Tests 22 passed (22)
```

Lint/type check:

```text
npm run lint
tsc --noEmit exited 0 with no errors.
```

The focused Vitest run continues to emit the existing non-fatal Vite warning about ESM syntax in `vitest.config.ts` being loaded as CommonJS. Protected `next-env.d.ts`, `tsconfig.json`, and `test-results/` were not included in the fix changes.
