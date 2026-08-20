# Task 6 Report: Server-Rendered Admin Shell And Controls

## Status

Implemented Task 6 from baseline `3b09237`.

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

Result: `Test Files 1 passed (1)` and `Tests 9 passed (9)`.

The focused tests cover disabled 404, login state, authenticated shell, no token in rendered HTML, noindex metadata, date presets, custom ranges, same-origin paths, empty/error resource states, legacy labels, unique IP wording, heuristic bot copy, filters, pagination, and logout controls.

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

Result: `Test Files 35 passed (35)` and `Tests 266 passed (266)`.

Whitespace validation:

```text
git diff --check
```

Result: exited 0 with no whitespace errors.

Local server smoke check:

- A new server could not bind to port `3100` because an existing Docker process already owned the listener.
- The existing listener returned a generic 404 with `noindex`, but it was not this workspace's Next.js process and was not used as authenticated UI evidence.
- The page/component tests provide the authenticated and disabled rendering evidence.

Security checks:

- Admin component source contains only relative same-origin API paths.
- No `ADMIN_TOKEN` reference exists in client components.
- No client-side geo calls were added.
- GitHub secret scanning was unavailable because GitHub Advanced Security is not enabled for the repository.

## Concerns

- The requested local HTTP smoke check could not exercise this implementation because port `3100` was occupied by Docker; no existing process was stopped.
- Vitest emits the existing non-fatal warning that `vitest.config.ts` uses ESM syntax while loaded as CommonJS.
- Resource history charts are intentionally lightweight SVG trend lines and do not add a chart dependency.
- The authenticated page reads the initial admin data directly on the server; subsequent controls use the existing admin API contracts and display a session-expired state on `404`.

## Commit

The requested commit message is:

```text
feat: add admin dashboard UI
```
