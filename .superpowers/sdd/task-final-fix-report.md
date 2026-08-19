# Final Whole-Branch Review Fix Report

Status: DONE

Branch base: `749e144`

## Findings Addressed

1. CI now runs `npm run fetch:mmdb` immediately after `npm ci` in the check, coverage, and Playwright jobs. The MMDB files remain ignored and untracked. The existing build and scheduled-rebuild provisioning remains intact.
2. `/api/json` emits redacted structured `database_write` events containing only category, endpoint, status, and duration. `/api/history` and `/api/stats` catch database read failures and return stable `500 { error: "internal server error", code: "internal_error" }` responses. History preserves CORS, no-store, and rate headers; stats preserves no-store. No IPs, tokens, payloads, or exception messages are logged or returned.
3. DNS now keeps pending work in a separate bounded admission map and settled results in the bounded eviction map. Active pending work cannot be evicted by settled-cache pressure, same-host callers share the pending promise, and new hosts are rejected when pending admission is full.
4. RDAP organization parsing now prioritizes the `organization` role over `registrant` regardless of entity order. Empty or whitespace-only IP RDAP objects normalize to `null`, matching unavailable/retry UI behavior.
5. `/api/ip`, `/api/json`, and `/api/whois` reject repeated `ip` parameters before rate-limit or lookup work with stable `invalid_input` responses.
6. Rate-limit maxima now accept only positive safe integers from endpoint-specific or legacy environment variables. Window values retain positive-number parsing.
7. README now states that missing trusted proxy headers use the shared anonymous rate-limit bucket.
8. Removed the tracked `.superpowers/sdd/task-1-report.md`, `task-2-report.md`, and `task-4-report.md` artifacts.

## TDD Evidence

### RED

Command:

```text
npx vitest run lib/ratelimit.test.ts lib/dns.test.ts lib/rdap.test.ts app/api/ip/route.test.ts app/api/json/route.test.ts app/api/history/route.test.ts app/api/stats/route.test.ts app/api/whois/route.test.ts
```

Result: 8 test files failed with 10 expected regression failures covering non-integer rate maxima, DNS pending pressure, empty/ordered RDAP data, repeated parameters, silent JSON writes, and unstable database reads.

### GREEN

Command:

```text
npx vitest run lib/ratelimit.test.ts lib/dns.test.ts lib/rdap.test.ts app/api/ip/route.test.ts app/api/json/route.test.ts app/api/history/route.test.ts app/api/stats/route.test.ts app/api/whois/route.test.ts
```

Result: 8 test files passed, 76 tests passed.

## Verification

| Command | Result |
| --- | --- |
| `npm test` | 24 files passed, 195 tests passed |
| `npm run coverage` | Passed; statements 91.1%, branches 85.77%, functions 92.76%, lines 95.06% |
| `npm run lint` | Passed; `tsc --noEmit` exited 0 |
| `npm run build` | Passed; Next.js production build completed |
| `npx playwright test` | 18 tests passed |
| `npm audit --audit-level=high` | Passed; 0 vulnerabilities |
| `npm run fetch:mmdb` | Passed; both existing valid MMDB files detected |
| `docker compose config` | Passed |
| `git diff --check` | Passed |
| MMDB tracking check | Both files ignored by `.gitignore` and absent from Git index |

The test runner still prints the existing Vite `configLoader: 'native'` warning. Next build and Playwright still print pre-existing Node.js Edge Runtime warnings for server-only imports, and Playwright prints its expected service-worker blocking messages. These warnings did not fail any command.

## Commit Scope

Intended changes include the affected API, DNS, RDAP, rate-limit, CI, README, tests, this report, and deletion of the three tracked SDD artifacts.

Preserved outside the commit as requested:

- `next-env.d.ts`
- `tsconfig.json`
- untracked `test-results/`
