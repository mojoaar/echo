# Task 4 Report: Resource Measurement And Sampler

## Status

Complete. Implemented Task 4 from baseline `5fb552f`.

## Implementation

- Added container-visible resource measurement in `lib/resources.ts`.
- Added cgroup v2 memory and CPU reads with cgroup v1 memory/CPU fallbacks.
- Reported CPU as unavailable until two valid samples exist, then calculated the usage delta against elapsed time and CPU quota.
- Measured persistent `/data` usage with `statfs` and directory traversal fallback.
- Broke out the configured SQLite database, WAL, SHM, and other `/data` file sizes without measuring the read-only root filesystem.
- Recorded lookup/activity row counts, process uptime, configured-timezone local timestamps, and optional `ECHO_IMAGE_SIZE_BYTES`.
- Added SQLite persistence and 30-day timestamp pruning through existing database helpers.
- Added five-minute sampling with an immediate startup sample, status tracking, duplicate prevention, and shutdown cleanup.
- Kept sampling disabled unless `ADMIN_TOKEN` is non-empty and disabled it in tests.
- Preserved MMDB warmup in `instrumentation.ts` before conditional sampler startup.
- Kept the existing idempotent `resource_samples` schema and timestamp index unchanged; it was already present from Task 2.
- Added focused measurement, lifecycle, and instrumentation tests.
- Preserved unrelated worktree changes in `next-env.d.ts`, `tsconfig.json`, and `test-results/`; none were staged.
- Added no source comments.

## RED Evidence

Command:

```text
npx vitest run lib/resources.test.ts
```

Result before implementation:

```text
Failed Suites 1
Error: Cannot find module './resources' imported from lib/resources.test.ts
Tests 0
```

The focused tests failed at the missing resource module boundary before production implementation existed.

## GREEN Evidence

Focused command:

```text
npx vitest run instrumentation.test.ts lib/resources.test.ts
```

Result:

```text
Test Files 2 passed (2)
Tests 10 passed (10)
```

## Verification

Full tests:

```text
npm test
```

Result:

```text
Test Files 28 passed (28)
Tests 227 passed (227)
```

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

```text
feat: add container resource sampler
```

Commit SHA: `406296a`

## Concerns

- Vitest emits the existing non-fatal Vite warning about ESM syntax in `vitest.config.ts` being loaded as CommonJS.
- CPU percentage depends on cgroup CPU accounting being exposed by the container; unavailable or malformed cgroup data produces a null CPU value rather than a host-derived metric.
- `ECHO_IMAGE_SIZE_BYTES` is intentionally configuration-only because querying the Docker host would violate the container-only design.
- Sampler failures are retained as a redacted status category and do not interrupt application startup.
