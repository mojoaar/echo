# Task 6 Report: Server-Rendered Admin Shell And Controls

## Status

Implemented Task 6 reviewer follow-up from baseline `3b09237`, correcting all findings identified for commit `ee5f6dc`.

## Delivered

- Added server-rendered `app/admin/page.tsx` with `ADMIN_TOKEN` capability gating, signed-cookie verification, `noStore()`, `force-dynamic`, and non-indexable metadata.
- Added compact `AdminLogin` form using the established `application/x-www-form-urlencoded` login contract. The token is not rendered, stored, or returned by the client UI.
- Added authenticated dashboard controls for daily/24-hour, weekly/7-day, monthly/30-day, and custom ranges, activity filters, bounded pagination, same-origin API requests, session-expiry errors, and logout.
- Added activity summaries, exact authenticated IP table rows, country/type/outcome breakdowns, legacy/unclassified rows, empty states, and heuristic bot-label copy.
- Added resource cards for CPU, memory, `/data`, database/WAL/SHM, row counts, uptime, local timestamp, sampler state, and optional image size.
- Added bounded memory and `/data` history charts with unavailable/empty states.
- Added responsive admin styling using existing visual tokens, readable mobile overflow handling, and 44px controls.
- Preserved unrelated worktree changes in `next-env.d.ts`, `tsconfig.json`, and `test-results/`; none were staged.
- Added no source comments and no client-side geo behavior.

## Reviewer Follow-up

- API failures now surface server-provided error messages instead of silently retaining successful-looking state.
- Resource failures clear the previous snapshot before displaying the honest error, including session-expiry responses.
- Initial activity loading is guarded by an authenticated admin error state instead of failing the page render.
- Resource cards display sampler enabled/running status and `lastError`.
- Login distinguishes invalid-token responses from login server failures; logout catches network failures.
- Activity rows are sorted chronologically after merging current and legacy data.
- Admin buttons, inputs, and selects explicitly enforce 44px minimum width and height.
- Added Playwright interaction coverage for login errors, loading, API errors, expired sessions, stale-resource clearing, logout failure, filters, pagination, and mobile touch sizing.

## TDD Evidence

### RED

Command:

```text
npx vitest run app/admin/page.test.ts
```

Result before the Task 6 implementation:

```text
Failed Suites 1
Error: Cannot find package '@/app/admin/page' imported from app/admin/page.test.ts
Tests no tests
```

The focused tests failed at the intended missing page/component module boundary.

### GREEN

Focused command after implementation:

```text
npx vitest run app/admin/page.test.ts
```

Result: `Test Files 1 passed (1)` and `Tests 14 passed (14)`.

The focused tests cover disabled 404, login state, authenticated shell, no token in rendered HTML, noindex metadata, initial activity errors, date presets, custom ranges, same-origin paths, empty/error resource states, sampler errors, legacy labels, chronological rows, unique IP wording, heuristic bot copy, filters, pagination, and logout controls.

## Verification

Typecheck/lint:

```text
npm run lint
```

Result: `tsc --noEmit` exited 0.

Full tests:

```text
npm test
```

Result: `Test Files 35 passed (35)` and `Tests 271 passed (271)`.

Whitespace validation:

```text
git diff --check
```

Result: exited 0 with no whitespace errors.

Browser interaction verification:

- Added `e2e/admin.spec.ts` and wired it into the desktop Playwright project.
- The suite could not execute because Next.js 16.3.1 failed to compile the pre-existing native `better-sqlite3` import from `instrumentation.ts` (`Module not found: Can't resolve (<dynamic> | 'null')`) before serving `/api/health`.
- Rebuilding `better-sqlite3` produced a local native addon but did not change the Next bundler failure. An existing Next process also occupied port `3000`; it was not stopped.

Local server smoke check:

- A new server could not bind to port `3100` because an existing Docker process already owned the listener.
- A separate browser server attempt on an unused port reached the native-module compilation failure described above.
- The existing listener was not stopped and was not used as authenticated UI evidence.

Security checks:

- Admin component source contains only relative same-origin API paths.
- No `ADMIN_TOKEN` reference exists in client components.
- No client-side geo calls were added.
- GitHub secret scanning was unavailable because GitHub Advanced Security is not enabled for the repository.

## Concerns

- The requested browser/local HTTP smoke check could not exercise this implementation because the existing Next build cannot compile the native SQLite import in this environment; no existing process was stopped.
- Vitest emits the existing non-fatal warning that `vitest.config.ts` uses ESM syntax while loaded as CommonJS.
- Resource history charts are intentionally lightweight SVG trend lines and do not add a chart dependency.
- The authenticated page reads the initial admin data directly on the server; subsequent controls use the existing admin API contracts and display a session-expired state on `404`.

## Commit

The requested commit message is:

```text
feat: add admin dashboard UI
```

## Remaining Review Findings

- Activity state is cleared before each activity request, so a failed request cannot leave stale successful rows visible.
- Activity and pagination state are committed as soon as the activity response succeeds, before resource loading can fail. Resource failures therefore preserve the requested page and activity result while clearing the resource snapshot.
- Added Playwright regressions for stale activity clearing and pagination coherence when the resource request fails.

## Follow-up Verification

- `npx vitest run app/admin/page.test.ts`: `Test Files 1 passed`, `Tests 14 passed`.
- `npm test`: `Test Files 35 passed`, `Tests 271 passed`.
- `npm run lint`: `tsc --noEmit` exited 0.
- `git diff --check`: exited 0.
- Playwright regression execution remains blocked by the existing Next.js `better-sqlite3` bundling failure: `Can't resolve (<dynamic> | 'null')`. The existing Next process was not stopped.

## Follow-up Concerns

- The two new browser regressions are present but could not execute in this environment because the Next.js development server fails during native `better-sqlite3` module compilation before serving the test page.
