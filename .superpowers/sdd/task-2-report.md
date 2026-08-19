# Task 2 Report

**Status:** DONE

**Commit:** `475947d` — `feat: validate api payloads and throttle stats auth`

**Files:**
- `lib/guards.ts`
- `lib/guards.test.ts`
- `app/api/stats/route.ts`
- `app/api/stats/route.test.ts`
- `components/ui/DnsSection.tsx`
- `components/ui/WhoisSection.tsx`
- `README.md`

**RED:**

Command:

```text
npx vitest run lib/guards.test.ts app/api/stats/route.test.ts
```

Output summary:

```text
2 failed suites; lib/guards.test.ts failed because ./guards was missing.
app/api/stats/route.test.ts had 5 passing tests and 1 failing test:
expected Bearer precedence status 200, received 404.
```

**GREEN:**

Command:

```text
npx vitest run lib/guards.test.ts app/api/stats/route.test.ts
```

Output:

```text
2 passed test files
11 passed tests
```

**Full verification:**

Command:

```text
npx vitest run lib/guards.test.ts app/api/stats/route.test.ts && npm test && npm run lint
```

Output:

```text
Focused: 2 test files passed, 11 tests passed.
Full: 17 test files passed, 121 tests passed.
Lint: tsc --noEmit completed with exit code 0 and no errors.
```

Vitest emitted the existing Vite `configLoader: 'native'` future-warning; it did not affect exit status.

**Changes:**
- Added dependency-free type-predicate guards for DNS, RDAP, stats, and IP info payloads.
- Added malformed-payload guard coverage, including missing arrays, wrong scalar types, nullable fields, and ignored extra fields.
- Made stats authentication prefer Bearer credentials while retaining query-token fallback, `stats-auth` throttling, constant-time comparison, indistinguishable 404 responses, and `no-store`.
- Made DNS and WHOIS clients reject malformed JSON with stable error states.
- Documented malformed client response handling.

**Concerns:**
- No blocking concerns.
- The existing Vitest/Vite configuration warning remains; it is unrelated to Task 2 and does not fail tests or lint.

## Reviewer Fix Report

**Status:** FIXED

**Findings addressed:**

- `components/ui/DnsSection.tsx`: clear the previous successful result immediately when a new lookup starts. This prevents stale DNS records from remaining visible while malformed JSON, runtime validation failure, HTTP failure, rate limiting, or a fetch exception sets an error state.
- `lib/guards.ts`: narrow `isCountedString` to the exact `{ iso: string; count: number }` type predicate used by `StatsResponse`.
- `app/api/stats/route.test.ts`: assert `x-ratelimit-limit`, `x-ratelimit-remaining`, and numeric `retry-after` headers on the throttled 429 response.

**DNS test verification:**

- No DNS component test was added. The existing Vitest configuration runs in the Node environment, includes only `*.test.ts`, and the repository has no React DOM or component-testing setup. The state transition was verified by code inspection and TypeScript checking; the existing DNS API tests remain covered by the full test suite.

**Verification:**

```text
npx vitest run lib/guards.test.ts app/api/stats/route.test.ts
2 test files passed, 11 tests passed

npm run lint
tsc --noEmit passed with no errors

npm test
17 test files passed, 121 tests passed
```

Vitest continues to emit the existing Vite `configLoader: 'native'` future-warning; it does not affect exit status.
