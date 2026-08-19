# Task 1 Report

Status: DONE

Commit: `5e74144 feat: separate api rate limits and standardize errors`

## Files Changed

- `.env.example`
- `README.md`
- `docker-compose.yml`
- `lib/api.test.ts`
- `lib/api.ts`
- `lib/ratelimit.test.ts`
- `lib/ratelimit.ts`
- `app/api/dns/route.test.ts`
- `app/api/dns/route.ts`
- `app/api/history/route.test.ts`
- `app/api/history/route.ts`
- `app/api/ip/route.test.ts`
- `app/api/ip/route.ts`
- `app/api/json/route.test.ts`
- `app/api/json/route.ts`
- `app/api/stats/route.test.ts`
- `app/api/stats/route.ts`
- `app/api/whois/route.test.ts`
- `app/api/whois/route.ts`

## RED

Command: `npx vitest run lib/ratelimit.test.ts lib/api.test.ts`

Expected failure: named endpoint limiters and shared API response helpers did not exist. Observed missing `@/lib/api` and failures for named limiter isolation and endpoint environment precedence.

## GREEN And Full Verification

- `npx vitest run lib/ratelimit.test.ts lib/api.test.ts app/api && npm run lint`: 8 test files passed, 44 tests passed; `tsc --noEmit` exited 0.
- `npx vitest run`: 16 test files passed, 113 tests passed.
- `git diff --check`: passed.

## Concerns

- Vitest emits the existing Vite `configLoader: 'native'` deprecation warning; tests and TypeScript checks still pass.

## Reviewer Fixes

Status: FIXED

### Findings Addressed

1. Changed every endpoint-specific rate-limit interpolation in `docker-compose.yml` to `${VAR:-}` so an omitted endpoint override is passed as empty. This preserves the application resolution order of endpoint variable, legacy global variable, then endpoint default. Updated `.env.example` to show optional endpoint overrides as empty and clarified the behavior in `README.md`.
2. Routed the unauthenticated `/api/stats` 404 response through `withRateHeaders`, preserving `cache-control: no-store` and the indistinguishable `{ "error": "not found", "code": "not_found" }` body while adding `x-ratelimit-limit` and `x-ratelimit-remaining`.
3. Extended `lib/ratelimit.test.ts` cleanup to delete all named endpoint max and window variables for JSON, IP, history, WHOIS, DNS, and stats authentication.

### TDD Evidence

- RED command: `npx vitest run lib/ratelimit.test.ts app/api/stats/route.test.ts`
- RED result: 2 targeted failures, one proving Compose still injected endpoint defaults and one proving the stats 404 omitted rate-limit headers.
- GREEN command: `npx vitest run lib/ratelimit.test.ts app/api/stats/route.test.ts app/api/json/route.test.ts app/api/ip/route.test.ts app/api/history/route.test.ts app/api/whois/route.test.ts app/api/dns/route.test.ts`
- GREEN result: 7 test files passed, 38 tests passed.

### Verification

- Covering tests: 7 test files passed, 38 tests passed.
- `npm run lint`: passed (`tsc --noEmit` exited 0).
- `npm test`: 16 test files passed, 114 tests passed.
- `git diff --check`: passed.

### Fix Concerns

- Vitest continues to emit the pre-existing Vite `configLoader: 'native'` deprecation warning; it does not affect test or typecheck results.
