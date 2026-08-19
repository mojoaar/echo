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

## Remaining Reviewer Fixes

Status: FIXED

### Findings Addressed

1. Changed `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` in `docker-compose.yml` to `${...:-}` interpolation. When unset, Compose now passes empty values, allowing the application to resolve endpoint-specific settings, then legacy global settings, then endpoint defaults. Explicit legacy global values still pass through unchanged. Endpoint-specific variables remain empty when unset.
2. Strengthened the named limiter isolation test by configuring `RATE_LIMIT_JSON_MAX=1`, consuming the JSON limiter for a key, and asserting that the IP limiter still allows its first request. Existing limiter identity and cache assertions remain in place.

### TDD Evidence

- RED command: `npx vitest run lib/ratelimit.test.ts`
- RED result: 1 expected failure in `keeps endpoint-specific Compose variables empty unless configured`; the new JSON/IP isolation assertions passed. The failure showed the legacy Compose interpolation still used `:-30` and `:-60000`.
- GREEN command: `npx vitest run lib/ratelimit.test.ts app/api/stats/route.test.ts app/api/json/route.test.ts app/api/ip/route.test.ts app/api/history/route.test.ts app/api/whois/route.test.ts app/api/dns/route.test.ts`
- GREEN result: 7 test files passed, 38 tests passed.

### Verification

- Covering tests: 7 test files passed, 38 tests passed.
- `npm run lint`: passed (`tsc --noEmit` exited 0).
- `npm test`: 16 test files passed, 114 tests passed.
- `git diff --check`: passed before commit.

### Fix Concerns

- Vitest continues to emit the pre-existing Vite `configLoader: 'native'` deprecation warning; it does not affect test or typecheck results.
