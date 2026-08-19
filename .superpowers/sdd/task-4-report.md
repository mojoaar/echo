STATUS: DONE_WITH_CONCERNS

## Implementation

- `lib/rdap.ts`: added `RdapAsnInfo`, ASN RDAP parsing and lookup through `autnum/{asn}`, safe numeric range normalization, bounded success/failure caching, and pending-request deduplication for IP and ASN lookups.
- `lib/geo.ts`: extended `createHostnameCache` with shared pending promises, cleanup after rejection, bounded eviction, and short TTL handling for null failures while preserving its public `get` interface.
- `app/api/whois/route.ts`: retained on-demand server-side RDAP behavior and changed the response to `{ ip, asn }`, using the existing MMDB ASN number without allowing missing ASN data to fail IP registration lookup.
- `lib/guards.ts`: updated the runtime RDAP guard for the wrapper and added IP/ASN response shapes.
- `components/ui/WhoisSection.tsx`: validates the wrapper client-side and renders separate IP registration/netblock and ASN registration sections with unavailable/ retryable partial states.
- `lib/rdap.test.ts`, `lib/geo.test.ts`, `lib/guards.test.ts`, `app/api/whois/route.test.ts`: added fixture, malformed vCard, unavailable, cache-hit, concurrent deduplication, wrapper, and guard coverage.

## TDD Evidence

- RED command: `npx vitest run lib/rdap.test.ts app/api/whois/route.test.ts`
- RED result: 6 expected failures. Missing ASN exports/parsers, wrapper response assertions, and concurrent IP deduplication failed while existing RDAP tests passed.
- GREEN command: `npx vitest run lib/rdap.test.ts app/api/whois/route.test.ts lib/geo.test.ts && npm run lint`
- GREEN result: 35 tests passed across the focused RDAP, WHOIS, and geo suites; `tsc --noEmit` passed.

## Verification

- `npm test`: 141 tests passed across 17 files, 0 failed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- No new dependencies were added.

## Self-Review

- Existing `fetchRdap(ip)` behavior and interface remain available.
- PTR, IP RDAP, and ASN RDAP calls share concurrent requests by key; rejected promises are removed and null failures expire quickly.
- IP registration remains available when the MMDB ASN record or ASN RDAP response is missing.
- External RDAP calls remain initiated only by `/api/whois` on demand.
- Source files remain free of explanatory comments as required by the project constraints.

## Concerns

- Vitest emits the pre-existing Vite `configLoader: 'native'` ESM warning; it does not affect test results and was not changed.
- The API test uses a partial `lib/geo` mock to represent an unavailable MMDB ASN reader; full ASN route integration depends on the deployment MMDB fixture.
- The UI uses existing CSS classes plus a new semantic subtitle class without adding a stylesheet rule; browser defaults provide readable headings, but a later UI pass could align that heading with the site's design tokens.

## Reviewer Fixes

- `lib/geo.ts`: separated in-flight promises from settled cache entries so concurrent pressure cannot evict pending work or start duplicate same-key requests; rejected requests are removed and settled entries remain bounded by `maxKeys`.
- `lib/rdap.ts`: classify successful empty ASN objects as unavailable (`null`) and preserve the short failure TTL for IP and ASN cache users.
- `lib/guards.ts`: require ASN numeric fields to be non-negative safe integers or `null`.
- `app/api/whois/route.ts`: combined the RDAP imports.
- Added focused tests for cache pressure, PTR rejection cleanup and failure TTL, concurrent ASN deduplication, empty ASN responses, and invalid ASN numeric fields.

## Fix Evidence

- RED: `npx vitest run lib/rdap.test.ts app/api/whois/route.test.ts lib/geo.test.ts` failed with 4 expected regressions before implementation: pending pressure duplicate work, empty ASN data classification, and missing failure-TTL retries.
- Focused GREEN: `npx vitest run lib/rdap.test.ts app/api/whois/route.test.ts lib/geo.test.ts` passed 41 tests across 3 files.
- Lint: `npm run lint` passed (`tsc --noEmit`).
- Full suite: `npm test` passed 148 tests across 17 files.
- `git diff --check` passed.
