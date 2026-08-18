# echo.johansen.foo — Next.js Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the static echo.johansen.foo site as a Next.js 16.3.1 App Router application with server-side IP/geo detection, a SQLite lookup log, and a deployable Docker image.

**Architecture:** Server-first. The `/` page is an async Server Component that extracts the visitor IP from proxy headers, looks up geo data from bundled MMDB files in memory (mmdb-lib, sync, no native deps), logs `{ip, iso, ts}` to SQLite, and renders HTML. Only theme toggle, copy, refresh, lookup form, and map modal are client islands. API routes `/api/ip`, `/api/json`, `/api/history` reuse the same `lib/` functions.

**Tech Stack:** Next.js 16.3.1 (App Router, `output: 'standalone'`), React 19.2.x, TypeScript 5.9, better-sqlite3 13, mmdb-lib 3, vitest 4, Docker (node:22-slim), JetBrains Mono via next/font.

Design spec: `.opencode/plans/2026-08-18-echo-nextjs-design.md` (approved).

## Global Constraints

- Next.js pinned to exactly `16.3.1`. React `19.2.8`, react-dom `19.2.8`.
- TypeScript pinned to `^5.9.3` — do NOT use the 7.x `latest` tag.
- `next.config.ts` sets `output: 'standalone'` and `serverExternalPackages: ['better-sqlite3']`.
- Runtime deps: `better-sqlite3@13.0.3`, `mmdb-lib@3.0.3`. Dev deps: `vitest@4.1.10`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/better-sqlite3`. No other dependencies. Everything is bundled/self-contained — no external geo API calls at runtime.
- NO code comments in any source file.
- No cookies. Personal data limited to IP + country code.
- IPv4 and IPv6 both supported. IPv6-mapped IPv4 (`::ffff:a.b.c.d`) is normalized to plain IPv4 before storing/logging.
- Umami is injected as a browser script tag when BOTH `UMAMI_SCRIPT_URL` AND `UMAMI_WEBSITE_ID` env vars are set. Defaults: `https://umami.johansen.foo/script.js` / `2dd1b560-7022-49d1-8063-bd3ccc99f21d`.
- Env vars: `DB_PATH` (default `echo.db` locally, `/data/echo.db` in container), `SCHEMA_PATH` (default `schema.sql` next to cwd), `MMDB_CITY` / `MMDB_ASN` (defaults `data/dbip-city-lite.mmdb` / `data/dbip-asn-lite.mmdb`), `PORT`/`HOSTNAME` (Next standalone server), `UMAMI_SCRIPT_URL`, `UMAMI_WEBSITE_ID`.
- Design tokens (unchanged from today): dark bg `#0f1117`, accent `#7c6af7`, JetBrains Mono. Light palette derived from the current light theme. Theme persisted in `localStorage['echo-theme']`, applied via `data-theme` attribute on `<html>`, dark default, anti-FOUC inline script in `<head>`, `suppressHydrationWarning` on `<html>`.
- API behavior: `/api/ip` → `text/plain` + `no-store`. `/api/json` and `/api/history` → JSON + CORS `*` + OPTIONS preflight + `no-store`.
- MMDB files are db-ip free (CC-BY-4.0), downloaded at build time by `scripts/fetch-mmdb.mjs` from `https://download.db-ip.com/free/` with a pinned month (`2026-08`, overridable via `MMDB_MONTH`), validated by `.mmdb` magic bytes (`ab cd ef 02`) before use.
- Docker: two-stage build on `node:22-slim` (glibc — no Alpine, better-sqlite3 must not compile against musl). Build stage installs `python3 make g++` (native-module source-build fallback), runs `npm ci` → `npm run fetch:mmdb` → `next build`. Runtime stage copies `standalone` + `.next/static` + `public` + `data` + `schema.sql`, runs as non-root `node` user with `/data` writable, `HEALTHCHECK` hits `/api/ip` via `node -e "fetch(...)"`.
- docker-compose: single `echo` app service, named volume `echo-data` mounted at `/data`, port `127.0.0.1:3100:3000`, Umami env vars set in compose. TLS/HTTPS stays on the user's existing reverse proxy.
- Git: repository already initialized at `/Users/mojoaar/Development/echo` (design doc committed). Conventional commit messages. Each task ends with a commit.

## File Structure

All files created under `/Users/mojoaar/Development/echo` unless noted.

| File | Responsibility |
|---|---|
| `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `vitest.config.ts`, `.gitignore`, `.dockerignore` | Scaffold |
| `app/layout.tsx` | Root layout: theme init script, Umami injection, fonts, metadata |
| `app/globals.css` | Design tokens + all component styles |
| `app/page.tsx` | Async Server Component dashboard (whole page) |
| `app/api/ip/route.ts` | Plain-text IP endpoint |
| `app/api/json/route.ts` | Full JSON endpoint with `?ip=` |
| `app/api/history/route.ts` | Recent-lookups feed |
| `app/api/{json,history}/route.test.ts`, `app/api/ip/route.test.ts` | Route tests; co-located (Next ignores non-special files) |
| `lib/types.ts` | Shared types: `IpInfo`, `CityRecord`, `AsnRecord`, `HistoryEntry` |
| `lib/validate.ts` | Client-safe IP regex validation (`isValidIp`, `isValidIpv4`, `isValidIpv6`) |
| `lib/validate.test.ts` | Validation tests |
| `lib/ip.ts` | Server-only: `normalizeIp`, `extractVisitorIp`, `classifyIp`, `isPublicIp` |
| `lib/ip.test.ts` | Header parsing / normalization / classification tests |
| `lib/geo.ts` | MMDB readers + `lookupInfo` → `IpInfo`, `flagEmoji`, `utcOffsetFor` |
| `lib/geo.test.ts` | Geo normalization tests (stub readers — no network, no binary fixtures) |
| `lib/db.ts` | better-sqlite3 init (WAL + schema.sql), `insertLookup`, `listRecent`, `countLookups` |
| `lib/db.test.ts` | SQLite tests with temp files |
| `lib/time.ts` | `relativeTime` helper |
| `schema.sql` | Idempotent `lookups` table + index |
| `components/ui/ThemeToggle.tsx` | Client island: light/dark toggle |
| `components/ui/CopyButton.tsx` | Client island: copy value / copy-as-JSON |
| `components/ui/RefreshButton.tsx` | Client island: reload page |
| `components/ui/LookupForm.tsx` | Client island: arbitrary IP lookup form |
| `components/ui/MapModal.tsx` | Client island: Leaflet map modal + `MapTrigger` |
| `components/ui/RecentFeed.tsx` | Server-rendered recent lookups list |
| `scripts/fetch-mmdb.mjs` | Build-time MMDB downloader (Node 22, global fetch not used, `https` + gunzip) |
| `data/` | Downloaded MMDB files (gitignored, baked into image) |
| `public/` | Favicons copied from the existing echo_landing site |
| `Dockerfile` | Multi-stage build → runtime |
| `docker-compose.yml` | App + volume, env with Umami defaults |
| `.env.example` | Documents all compose env vars |

Interface contracts between tasks:

- `lib/validate.ts`: `isValidIpv4(ip: string): boolean`, `isValidIpv6(ip: string): boolean`, `isValidIp(ip: string): boolean`, consts `IPV4_RE`, `IPV6_RE`.
- `lib/ip.ts`: `normalizeIp(ip: string): string`, `extractVisitorIp(headers: Headers): string | null`, `classifyIp(ip: string): 'public' | 'private' | 'loopback' | 'linklocal' | 'reserved'`, `isPublicIp(ip: string): boolean`.
- `lib/geo.ts`: `createReaders(cityPath?: string, asnPath?: string): Readers`, `resetReaders(): void`, `lookupInfo(ip: string, opts?: { hostname?: boolean; readers?: Readers }): Promise<IpInfo>`, `flagEmoji(countryCode: string): string`, `utcOffsetFor(timeZone: string): string | null`. `Readers = { city: ReaderLike | null; asn: ReaderLike | null }`, `ReaderLike = { get(ip: string): unknown }`.
- `lib/db.ts`: `initDb(path?: string): Database.Database`, `closeDb(): void`, `insertLookup(ip: string, iso: string | null): { id: number; ts: number }`, `listRecent(limit?: number): HistoryEntry[]`, `countLookups(): number`.
- `lib/time.ts`: `relativeTime(ts: number): string`.
- `lib/types.ts`: exported types `IpInfo`, `CityRecord`, `AsnRecord`, `HistoryEntry`.

---

### Task 1: Scaffold Next.js 16.3.1 TypeScript project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `vitest.config.ts`, `.gitignore`, `.dockerignore`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

**Interfaces:**
- Produces: installable project with `npm run lint` (tsc), `npm run build`, `npm test` working.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "echo",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "fetch:mmdb": "node scripts/fetch-mmdb.mjs"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
```

- [ ] **Step 4: Write `next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 5: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules/
.next/
out/
echo.db
echo.db-*
data/*.mmdb
data/*.mmdb.tmp
.env
```

- [ ] **Step 7: Write `.dockerignore`**

```
node_modules
.next
.git
.opencode
data/*.mmdb
data/*.mmdb.tmp
echo.db
```

- [ ] **Step 8: Write minimal `app/layout.tsx`, `app/page.tsx`, `app/globals.css` placeholder**

`app/layout.tsx`:

```tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'echo',
  description: 'What the internet sees when you connect.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx`:

```tsx
export default function Page() {
  return <main>echo</main>;
}
```

`app/globals.css`:

```css
body {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
```

- [ ] **Step 9: Install dependencies**

```bash
npm install next@16.3.1 react@19.2.8 react-dom@19.2.8 better-sqlite3@13.0.3 mmdb-lib@3.0.3
npm install -D typescript@^5.9.3 vitest@4.1.10 @types/node@^26 @types/react@19.2.18 @types/react-dom@19.2.18 @types/better-sqlite3@9.6.0
```

Expected: `package-lock.json` created, `node_modules/` populated. If better-sqlite3 packages a native binary build warning on macOS, that is normal — do not fail on warnings.

- [ ] **Step 10: Verify typecheck and build**

```bash
npm run lint
npm run build
```

Expected: lint exits 0. Build completes with `.next/standalone/` present (`ls .next/standalone/server.js`).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold next 16 typescript project"
```

---

### Task 2: Shared types and client-safe IP validation

**Files:**
- Create: `lib/types.ts`, `lib/validate.ts`, `lib/validate.test.ts`

**Interfaces:**
- Produces: `IpInfo`, `CityRecord`, `AsnRecord`, `HistoryEntry` (in `lib/types.ts`); `IPV4_RE`, `IPV6_RE`, `isValidIpv4`, `isValidIpv6`, `isValidIp` (in `lib/validate.ts`). Consumed by all later tasks. `lib/validate.ts` must import NOTHING from `node:` — it is imported by the client bundle (LookupForm).

- [ ] **Step 1: Write the failing test**

`lib/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isValidIpv4, isValidIpv6, isValidIp } from './validate';

describe('isValidIpv4', () => {
  it('accepts valid dotted-quad addresses', () => {
    expect(isValidIpv4('8.8.8.8')).toBe(true);
    expect(isValidIpv4('0.0.0.0')).toBe(true);
    expect(isValidIpv4('255.255.255.255')).toBe(true);
  });
  it('rejects out-of-range and malformed input', () => {
    expect(isValidIpv4('999.1.1.1')).toBe(false);
    expect(isValidIpv4('1.2.3')).toBe(false);
    expect(isValidIpv4('1.2.3.4.5')).toBe(false);
    expect(isValidIpv4('nope')).toBe(false);
  });
});

describe('isValidIpv6', () => {
  it('accepts common forms', () => {
    expect(isValidIpv6('2001:db8::1')).toBe(true);
    expect(isValidIpv6('2001:db8:0:0:0:0:0:1')).toBe(true);
    expect(isValidIpv6('::')).toBe(true);
    expect(isValidIpv6('2606:4700:4700::1111')).toBe(true);
  });
  it('rejects malformed input', () => {
    expect(isValidIpv6('2001:::1')).toBe(false);
    expect(isValidIpv6('1::2::3')).toBe(false);
    expect(isValidIpv6('12345::1')).toBe(false);
    expect(isValidIpv6('2001:db8')).toBe(false);
  });
});

describe('isValidIp', () => {
  it('accepts v4 and v6, rejects everything else', () => {
    expect(isValidIp('8.8.8.8')).toBe(true);
    expect(isValidIp('2001:db8::1')).toBe(true);
    expect(isValidIp('not-an-ip')).toBe(false);
    expect(isValidIp('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validate.test.ts`
Expected: FAIL — module `./validate` not found.

- [ ] **Step 3: Write `lib/types.ts`**

```ts
export interface IpInfo {
  ip: string;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  countryName: string | null;
  flag: string | null;
  org: string | null;
  asn: string | null;
  timezone: string | null;
  utcOffset: string | null;
  latitude: number | null;
  longitude: number | null;
  hostname: string | null;
  isPrivate: boolean;
}

export interface CityRecord {
  country?: { iso_code?: string; names?: Record<string, string> };
  subdivisions?: Array<{ names?: Record<string, string> }>;
  city?: { names?: Record<string, string> };
  location?: { latitude?: number; longitude?: number; time_zone?: string };
}

export interface AsnRecord {
  autonomous_system_number?: number;
  autonomous_system_organization?: string;
}

export interface HistoryEntry {
  ip: string;
  iso: string | null;
  ts: number;
}
```

- [ ] **Step 4: Write `lib/validate.ts`**

```ts
export const IPV4_RE = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const HEXTET_RE = /^[0-9a-fA-F]{1,4}$/;

export function isValidIpv4(ip: string): boolean {
  return IPV4_RE.test(ip);
}

export function isValidIpv6(ip: string): boolean {
  if (ip.includes(':::')) return false;
  const hasDouble = ip.includes('::');
  const sides = ip.split('::');
  if (sides.length > 2) return false;
  const chunks = (s: string) => (s.length ? s.split(':') : []);
  const all = chunks(sides[0]).concat(sides.length === 2 ? chunks(sides[1]) : []);
  if (!all.every((h) => HEXTET_RE.test(h))) return false;
  const total = all.length;
  if (!hasDouble && total !== 8) return false;
  if (hasDouble && total > 7) return false;
  return true;
}

export function isValidIp(ip: string): boolean {
  return isValidIpv4(ip) || isValidIpv6(ip);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/validate.test.ts`
Expected: PASS — all 3 suites green.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/validate.ts lib/validate.test.ts
git commit -m "feat: add shared types and ip validation"
```

---

### Task 3: Server-side IP extraction, normalization, classification

**Files:**
- Create: `lib/ip.ts`, `lib/ip.test.ts`

**Interfaces:**
- Consumes: `isValidIp`, `isValidIpv4` from `lib/validate`.
- Produces: `normalizeIp(ip: string): string`, `extractVisitorIp(headers: Headers): string | null`, `classifyIp(ip: string): IpKind`, `isPublicIp(ip: string): boolean`. `IpKind = 'public' | 'private' | 'loopback' | 'linklocal' | 'reserved'`. Consumed by `lib/geo.ts` (classify), `app/page.tsx` (extract), all API routes (extract/normalize).

- [ ] **Step 1: Write the failing test**

`lib/ip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractVisitorIp, normalizeIp, classifyIp, isPublicIp } from './ip';

describe('extractVisitorIp', () => {
  it('takes the first x-forwarded-for entry', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(extractVisitorIp(headers)).toBe('203.0.113.7');
  });
  it('handles a single entry without a comma', () => {
    const headers = new Headers({ 'x-forwarded-for': '8.8.8.8' });
    expect(extractVisitorIp(headers)).toBe('8.8.8.8');
  });
  it('falls back to x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '198.51.100.4' });
    expect(extractVisitorIp(headers)).toBe('198.51.100.4');
  });
  it('returns null when no usable header exists', () => {
    expect(extractVisitorIp(new Headers())).toBeNull();
  });
  it('rejects garbage values', () => {
    const headers = new Headers({ 'x-forwarded-for': 'not-an-ip' });
    expect(extractVisitorIp(headers)).toBeNull();
  });
});

describe('normalizeIp', () => {
  it('converts IPv6-mapped IPv4 to plain IPv4', () => {
    expect(normalizeIp('::ffff:8.8.8.8')).toBe('8.8.8.8');
    expect(normalizeIp('::FFFF:8.8.8.8')).toBe('8.8.8.8');
  });
  it('lowercases IPv6 addresses', () => {
    expect(normalizeIp('2001:0DB8::1')).toBe('2001:0db8::1');
  });
  it('trims surrounding whitespace', () => {
    expect(normalizeIp(' 1.2.3.4 ')).toBe('1.2.3.4');
  });
});

describe('classifyIp', () => {
  it('detects loopback', () => {
    expect(classifyIp('127.0.0.1')).toBe('loopback');
    expect(classifyIp('::1')).toBe('loopback');
  });
  it('detects RFC1918 private ranges', () => {
    expect(classifyIp('10.1.2.3')).toBe('private');
    expect(classifyIp('172.16.0.1')).toBe('private');
    expect(classifyIp('172.31.255.255')).toBe('private');
    expect(classifyIp('192.168.0.1')).toBe('private');
    expect(classifyIp('fc00::1')).toBe('private');
    expect(classifyIp('fd12:3456::1')).toBe('private');
  });
  it('does not treat 172.32.x as private', () => {
    expect(classifyIp('172.32.0.1')).toBe('public');
  });
  it('detects link-local', () => {
    expect(classifyIp('169.254.10.1')).toBe('linklocal');
    expect(classifyIp('fe80::1')).toBe('linklocal');
  });
  it('treats public addresses as public', () => {
    expect(classifyIp('8.8.8.8')).toBe('public');
    expect(classifyIp('2001:4860:4860::8888')).toBe('public');
  });
  it('treats CGNAT and reserved ranges as private/reserved', () => {
    expect(classifyIp('100.64.0.1')).toBe('private');
    expect(classifyIp('224.0.0.1')).toBe('reserved');
  });
});

describe('isPublicIp', () => {
  it('returns true only for publicly routable addresses', () => {
    expect(isPublicIp('8.8.8.8')).toBe(true);
    expect(isPublicIp('192.168.1.1')).toBe(false);
    expect(isPublicIp('junk')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ip.test.ts`
Expected: FAIL — module `./ip` not found.

- [ ] **Step 3: Write `lib/ip.ts`**

```ts
import { isIP } from 'node:net';
import { isValidIp, isValidIpv4 } from './validate';

export type IpKind = 'public' | 'private' | 'loopback' | 'linklocal' | 'reserved';

const IPV4_MAPPED_RE = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/;

export function normalizeIp(ip: string): string {
  const trimmed = ip.trim().toLowerCase();
  const mapped = IPV4_MAPPED_RE.exec(trimmed);
  if (mapped && isValidIpv4(mapped[1])) return mapped[1];
  return trimmed;
}

export function extractVisitorIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (isValidIp(first)) return normalizeIp(first);
  }
  const xri = headers.get('x-real-ip');
  if (xri) {
    const trimmed = xri.trim();
    if (isValidIp(trimmed)) return normalizeIp(trimmed);
  }
  return null;
}

export function classifyIp(ip: string): IpKind {
  const normalized = normalizeIp(ip);
  if (normalized === '::1' || normalized.startsWith('127.')) return 'loopback';
  if (normalized === '0.0.0.0') return 'reserved';
  if (normalized.includes(':')) {
    const first = normalized.split(':')[0].padStart(4, '0');
    if (first >= 'fc00' && first <= 'fdff') return 'private';
    if (first >= 'fe80' && first <= 'febf') return 'linklocal';
    return 'public';
  }
  const parts = normalized.split('.').map((p) => Number(p));
  if (parts[0] === 0) return 'reserved';
  if (parts[0] === 10) return 'private';
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return 'private';
  if (parts[0] === 192 && parts[1] === 168) return 'private';
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return 'private';
  if (parts[0] === 169 && parts[1] === 254) return 'linklocal';
  if (parts[0] >= 224) return 'reserved';
  return 'public';
}

export function isPublicIp(ip: string): boolean {
  return isIP(normalizeIp(ip)) !== 0 && classifyIp(ip) === 'public';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ip.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ip.ts lib/ip.test.ts
git commit -m "feat: add server-side ip extraction and classification"
```

---

### Task 4: Geo lookup pipeline (lib/geo.ts)

**Files:**
- Create: `lib/geo.ts`, `lib/geo.test.ts`

**Interfaces:**
- Consumes: `normalizeIp`, `classifyIp` from `lib/ip`; `IpInfo`, `CityRecord`, `AsnRecord` from `lib/types`.
- Produces: `createReaders(cityPath?: string, asnPath?: string): Readers`, `resetReaders(): void`, `lookupInfo(ip: string, opts?: { hostname?: boolean; readers?: Readers }): Promise<IpInfo>`, `flagEmoji(countryCode: string): string`, `utcOffsetFor(timeZone: string): string | null`. `Readers = { city: ReaderLike | null; asn: ReaderLike | null }`, `ReaderLike = { get(ip: string): unknown }`.

Notes: `mmdb-lib` offers `new mmdb.Reader<T>(buffer)` with `reader.get(ip)`. Real readers auto-fallback to env `MMDB_CITY`/`MMDB_ASN` then `data/dbip-city-lite.mmdb` / `data/dbip-asn-lite.mmdb`; `createReaders()` caches the plain-object result in a module singleton. Tests inject stub `ReaderLike` objects so no network or binary files are needed. `lookupInfo` resolves hostname only when `opts.hostname` is true (default false) via `dns.promises.reverse` with a 600ms race timeout. `utcOffsetFor` derives the offset from `Intl.DateTimeFormat`.

- [ ] **Step 1: Write the failing test**

`lib/geo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lookupInfo, flagEmoji, utcOffsetFor, type Readers } from './geo';

const cityRecords: Record<string, unknown> = {
  '8.8.8.8': {
    country: { iso_code: 'US', names: { en: 'United States' } },
    subdivisions: [{ names: { en: 'California' } }],
    city: { names: { en: 'Mountain View' } },
    location: { latitude: 37.4223, longitude: -122.0848, time_zone: 'America/Los_Angeles' },
  },
  '2001:4860:4860::8888': {
    country: { iso_code: 'US', names: { en: 'United States' } },
    subdivisions: [{ names: { en: 'California' } }],
    city: { names: { en: 'Mountain View' } },
    location: { latitude: 37.4223, longitude: -122.0848, time_zone: 'America/Los_Angeles' },
  },
};

const asnRecords: Record<string, unknown> = {
  '8.8.8.8': { autonomous_system_organization: 'Google LLC', autonomous_system_number: 15169 },
  '2001:4860:4860::8888': { autonomous_system_organization: 'Google LLC', autonomous_system_number: 15169 },
};

const stubReaders: Readers = {
  city: { get: (ip: string) => cityRecords[ip] ?? null },
  asn: { get: (ip: string) => asnRecords[ip] ?? null },
};

describe('flagEmoji', () => {
  it('maps country codes to regional-indicator flag emoji', () => {
    expect(flagEmoji('US')).toBe('🇺🇸');
    expect(flagEmoji('au')).toBe('🇦🇺');
  });
  it('returns a neutral globe for anything else', () => {
    expect(flagEmoji('ZZ')).toBe('🌐');
    expect(flagEmoji('')).toBe('🌐');
  });
});

describe('utcOffsetFor', () => {
  it('returns a ±HH:MM offset for a named zone', () => {
    const offset = utcOffsetFor('America/Los_Angeles');
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
  });
  it('returns null for invalid zones', () => {
    expect(utcOffsetFor('Not/AZone')).toBeNull();
  });
});

describe('lookupInfo', () => {
  it('produces a full normalized payload from city + asn records', async () => {
    const info = await lookupInfo('8.8.8.8', { hostname: false, readers: stubReaders });
    expect(info.ip).toBe('8.8.8.8');
    expect(info.countryCode).toBe('US');
    expect(info.country).toBe('US');
    expect(info.countryName).toBe('United States');
    expect(info.flag).toBe('🇺🇸');
    expect(info.city).toBe('Mountain View');
    expect(info.region).toBe('California');
    expect(info.org).toBe('Google LLC');
    expect(info.asn).toBe('AS15169');
    expect(info.latitude).toBeCloseTo(37.4223);
    expect(info.longitude).toBeCloseTo(-122.0848);
    expect(info.timezone).toBe('America/Los_Angeles');
    expect(info.utcOffset).toMatch(/^[+-]\d{2}:\d{2}$/);
    expect(info.isPrivate).toBe(false);
  });

  it('supports IPv6 addresses', async () => {
    const info = await lookupInfo('2001:4860:4860::8888', { hostname: false, readers: stubReaders });
    expect(info.ip).toBe('2001:4860:4860::8888');
    expect(info.countryCode).toBe('US');
  });

  it('leaves unknown records as nulls instead of throwing', async () => {
    const info = await lookupInfo('5.6.7.8', { hostname: false, readers: stubReaders });
    expect(info.countryCode).toBeNull();
    expect(info.latitude).toBeNull();
  });

  it('marks private ranges and returns no coordinates', async () => {
    const info = await lookupInfo('192.168.1.1', { hostname: false, readers: stubReaders });
    expect(info.isPrivate).toBe(true);
    expect(info.latitude).toBeNull();
    expect(info.countryCode).toBeNull();
  });

  it('keeps hostname null when hostname is disabled', async () => {
    const info = await lookupInfo('8.8.8.8', { hostname: false, readers: stubReaders });
    expect(info.hostname).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/geo.test.ts`
Expected: FAIL — module `./geo` not found.

- [ ] **Step 3: Write `lib/geo.ts`**

```ts
import { promises as dns } from 'node:dns';
import { readFileSync } from 'node:fs';
import * as mmdb from 'mmdb-lib';
import { classifyIp, normalizeIp } from './ip';
import type { AsnRecord, CityRecord, IpInfo } from './types';

export interface ReaderLike {
  get(ip: string): unknown;
}

export interface Readers {
  city: ReaderLike | null;
  asn: ReaderLike | null;
}

const HOSTNAME_TIMEOUT = 600;
let cachedReaders: Readers | null = null;

function loadReader(path: string): ReaderLike | null {
  try {
    const buffer = readFileSync(path);
    return new mmdb.Reader<never>(buffer);
  } catch {
    return null;
  }
}

export function createReaders(
  cityPath = process.env.MMDB_CITY ?? 'data/dbip-city-lite.mmdb',
  asnPath = process.env.MMDB_ASN ?? 'data/dbip-asn-lite.mmdb',
): Readers {
  if (!cachedReaders) {
    cachedReaders = {
      city: loadReader(cityPath),
      asn: loadReader(asnPath),
    };
  }
  return cachedReaders;
}

export function resetReaders(): void {
  cachedReaders = null;
}

export function flagEmoji(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 0x41));
}

export function utcOffsetFor(timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date());
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const cleaned = raw.replace('GMT', '').replace('UTC', '').replace(/\u2212/g, '-').trim();
    return cleaned || null;
  } catch {
    return null;
  }
}

async function reverseLookup(ip: string): Promise<string | null> {
  try {
    const names = await dns.promises.reverse(ip);
    return names[0] ?? null;
  } catch {
    return null;
  }
}

function resolveHostname(ip: string): Promise<string | null> {
  return Promise.race([
    reverseLookup(ip),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), HOSTNAME_TIMEOUT)),
  ]);
}

function emptyIpInfo(ip: string): IpInfo {
  return {
    ip,
    city: null,
    region: null,
    country: null,
    countryCode: null,
    countryName: null,
    flag: null,
    org: null,
    asn: null,
    timezone: null,
    utcOffset: null,
    latitude: null,
    longitude: null,
    hostname: null,
    isPrivate: false,
  };
}

export async function lookupInfo(
  ip: string,
  opts: { hostname?: boolean; readers?: Readers } = {},
): Promise<IpInfo> {
  const normalized = normalizeIp(ip);
  const info = emptyIpInfo(normalized);
  const readers = opts.readers ?? createReaders();
  info.isPrivate = classifyIp(normalized) !== 'public';
  if (info.isPrivate) return info;

  const cityRow = readers.city?.get(normalized) as CityRecord | null | undefined;
  if (cityRow) {
    const cc = cityRow.country?.iso_code ?? null;
    info.countryCode = cc;
    info.country = cc;
    info.countryName = cityRow.country?.names?.en ?? null;
    info.flag = cc ? flagEmoji(cc) : null;
    info.city = cityRow.city?.names?.en ?? null;
    info.region = cityRow.subdivisions?.[0]?.names?.en ?? null;
    if (cityRow.location) {
      info.latitude = cityRow.location.latitude ?? null;
      info.longitude = cityRow.location.longitude ?? null;
      info.timezone = cityRow.location.time_zone ?? null;
      if (info.timezone) info.utcOffset = utcOffsetFor(info.timezone);
    }
  }

  const asnRow = readers.asn?.get(normalized) as AsnRecord | null | undefined;
  if (asnRow) {
    info.asn = asnRow.autonomous_system_number != null ? `AS${asnRow.autonomous_system_number}` : null;
    info.org = asnRow.autonomous_system_organization ?? null;
  }

  if (opts.hostname) {
    info.hostname = await resolveHostname(normalized);
  }
  return info;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/geo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/geo.ts lib/geo.test.ts
git commit -m "feat: add mmdb geo lookup pipeline"
```

---

### Task 5: SQLite lookup log (lib/db.ts) + relative time helper

**Files:**
- Create: `schema.sql`, `lib/db.ts`, `lib/db.test.ts`, `lib/time.ts`, `lib/time.test.ts`

**Interfaces:**
- Consumes: `HistoryEntry` from `lib/types`.
- Produces: `initDb(path?: string): Database.Database` (WAL + idempotent schema, single cached connection), `closeDb(): void`, `insertLookup(ip: string, iso: string | null): { id: number; ts: number }`, `listRecent(limit?: number): HistoryEntry[]`, `countLookups(): number`, `relativeTime(ts: number): string`.

- [ ] **Step 1: Write the failing tests**

`lib/time.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { relativeTime } from './time';

afterEach(() => {
  vi.useRealTimers();
});

describe('relativeTime', () => {
  it('renders seconds, minutes, hours and days', () => {
    vi.setSystemTime(new Date('2026-08-18T00:00:00Z'));
    expect(relativeTime(Date.now() - 3_000)).toBe('just now');
    expect(relativeTime(Date.now() - 40_000)).toBe('40s ago');
    expect(relativeTime(Date.now() - 12 * 60_000)).toBe('12m ago');
    expect(relativeTime(Date.now() - 3 * 3_600_000)).toBe('3h ago');
    expect(relativeTime(Date.now() - 5 * 86_400_000)).toBe('5d ago');
  });
});
```

`lib/db.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb, insertLookup, listRecent, countLookups } from './db';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('sqlite lookup log', () => {
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-db-'));
    initDb(join(dir, 'test.db'));
  });

  afterAll(() => {
    closeDb();
  });

  it('initializes the schema idempotently', () => {
    expect(() => initDb()).not.toThrow();
    expect(countLookups()).toBe(0);
  });

  it('inserts lookups and timestamps them', async () => {
    const before = Date.now();
    const row = insertLookup('8.8.8.8', 'US');
    expect(row.id).toBeGreaterThan(0);
    expect(row.ts).toBeGreaterThanOrEqual(before);
    expect(countLookups()).toBe(1);
    await sleep(5);
  });

  it('lists entries newest first and respects limit', () => {
    insertLookup('1.1.1.1', 'AU');
    const all = listRecent(10);
    expect(all).toHaveLength(2);
    expect(all[0].ip).toBe('1.1.1.1');
    expect(all[0].iso).toBe('AU');
    expect(typeof all[0].ts).toBe('number');
    const one = listRecent(1);
    expect(one).toHaveLength(1);
    expect(one[0].ip).toBe('1.1.1.1');
  });

  it('allows a null iso', () => {
    insertLookup('192.168.0.1', null);
    const rows = listRecent(10);
    expect(rows[0].ip).toBe('192.168.0.1');
    expect(rows[0].iso).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/time.test.ts lib/db.test.ts`
Expected: FAIL — modules `./time` and `./db` not found.

- [ ] **Step 3: Write `schema.sql`**

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS lookups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip  TEXT NOT NULL,
  iso TEXT,
  ts  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lookups_ts ON lookups(ts DESC);
```

- [ ] **Step 4: Write `lib/time.ts`**

```ts
export function relativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}
```

- [ ] **Step 5: Write `lib/db.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { HistoryEntry } from './types';

let db: Database.Database | null = null;

function schemaSql(): string {
  const schemaPath = process.env.SCHEMA_PATH ?? join(process.cwd(), 'schema.sql');
  return readFileSync(schemaPath, 'utf-8');
}

export function initDb(path = process.env.DB_PATH ?? 'echo.db'): Database.Database {
  if (db) return db;
  const instance = new Database(path);
  instance.pragma('journal_mode = WAL');
  instance.exec(schemaSql());
  db = instance;
  return instance;
}

export function getDb(): Database.Database {
  return db ?? initDb();
}

export function closeDb(): void {
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    db = null;
  }
}

export function insertLookup(ip: string, iso: string | null): { id: number; ts: number } {
  const ts = Date.now();
  const result = getDb().prepare('INSERT INTO lookups (ip, iso, ts) VALUES (?, ?, ?)').run(ip, iso, ts);
  return { id: Number(result.lastInsertRowid), ts };
}

export function listRecent(limit = 20): HistoryEntry[] {
  return getDb()
    .prepare('SELECT ip, iso, ts FROM lookups ORDER BY ts DESC LIMIT ?')
    .all(limit) as HistoryEntry[];
}

export function countLookups(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM lookups').get() as { n: number };
  return row.n;
}
```

If `Database.Database` does not type-check against the installed `@types/better-sqlite3`, replace the declaration with `let db: ReturnType<typeof initDb> | null = null;` and drop the type import — the tests still pass.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/time.test.ts lib/db.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add schema.sql lib/db.ts lib/db.test.ts lib/time.ts lib/time.test.ts
git commit -m "feat: add sqlite lookup log"
```

---

### Task 6: API routes

**Files:**
- Create: `app/api/ip/route.ts`, `app/api/ip/route.test.ts`, `app/api/json/route.ts`, `app/api/json/route.test.ts`, `app/api/history/route.ts`, `app/api/history/route.test.ts`

**Interfaces:**
- Consumes: `extractVisitorIp`, `normalizeIp` from `lib/ip`; `isValidIp` from `lib/validate`; `lookupInfo`, `createReaders` from `lib/geo`; `insertLookup`, `listRecent` from `lib/db`.
- Produces: `GET` (and `OPTIONS` where noted) handlers exportable from each route file. Route tests import the handler functions directly and call them with a `Request`.

- [ ] **Step 1: Write the failing tests**

`app/api/ip/route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/ip', () => {
  it('returns the visitor ip as plain text', async () => {
    const req = new Request('http://localhost/api/ip', {
      headers: { 'x-forwarded-for': '8.8.8.8, 10.0.0.1' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('8.8.8.8\n');
  });

  it('returns 400 when no ip is present', async () => {
    const res = await GET(new Request('http://localhost/api/ip'));
    expect(res.status).toBe(400);
  });
});
```

`app/api/json/route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET, OPTIONS } from './route';
import { initDb, closeDb } from '@/lib/db';

describe('GET /api/json', () => {
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-json-'));
    initDb(join(dir, 'test.db'));
  });

  afterAll(() => {
    closeDb();
  });

  it('returns the full payload for the visitor ip', async () => {
    const req = new Request('http://localhost/api/json', {
      headers: { 'x-forwarded-for': '8.8.8.8' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.ip).toBe('8.8.8.8');
    expect(typeof body.isPrivate).toBe('boolean');
  });

  it('supports ?ip= arbitrary lookups', async () => {
    const res = await GET(new Request('http://localhost/api/json?ip=192.168.1.1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ip).toBe('192.168.1.1');
    expect(body.isPrivate).toBe(true);
  });

  it('rejects invalid ip values with 400', async () => {
    const res = await GET(new Request('http://localhost/api/json?ip=not-an-ip'));
    expect(res.status).toBe(400);
  });

  it('answers OPTIONS preflight with CORS headers', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });
});
```

`app/api/history/route.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from './route';
import { initDb, insertLookup } from '@/lib/db';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('GET /api/history', () => {
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-hist-'));
    initDb(join(dir, 'test.db'));
  });

  it('returns recent lookups newest first', async () => {
    insertLookup('8.8.8.8', 'US');
    await sleep(5);
    insertLookup('1.1.1.1', 'AU');
    const res = await GET(new Request('http://localhost/api/history?limit=10'));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].ip).toBe('1.1.1.1');
    expect(body[0].iso).toBe('AU');
    expect(typeof body[0].ts).toBe('number');
  });

  it('caps the limit between 1 and 100', async () => {
    const low = await GET(new Request('http://localhost/api/history?limit=0'));
    expect(await low.json()).toHaveLength(1);
    const defaulted = await GET(new Request('http://localhost/api/history'));
    expect(defaulted.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api`
Expected: FAIL — route modules or handlers not found.

- [ ] **Step 3: Write `app/api/ip/route.ts`**

```ts
import { extractVisitorIp } from '@/lib/ip';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ip = extractVisitorIp(request.headers);
  if (!ip) {
    return new Response('', { status: 400 });
  }
  return new Response(`${ip}\n`, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
```

- [ ] **Step 4: Write `app/api/json/route.ts`**

```ts
import { extractVisitorIp, normalizeIp } from '@/lib/ip';
import { isValidIp } from '@/lib/validate';
import { lookupInfo } from '@/lib/geo';
import { insertLookup } from '@/lib/db';

export const dynamic = 'force-dynamic';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('ip')?.trim() ?? null;
  if (raw && !isValidIp(normalizeIp(raw))) {
    return Response.json({ error: 'invalid ip address' }, { status: 400, headers: corsHeaders });
  }
  const ip = raw ? normalizeIp(raw) : extractVisitorIp(request.headers);
  if (!ip) {
    return Response.json({ error: 'could not determine ip' }, { status: 400, headers: corsHeaders });
  }
  const info = await lookupInfo(ip);
  try {
    insertLookup(info.ip, info.country);
  } catch {
    // keep serving read-only payload if the log is unavailable
  }
  return Response.json(info, { headers: corsHeaders });
}
```

- [ ] **Step 5: Write `app/api/history/route.ts`**

```ts
import { listRecent } from '@/lib/db';

export const dynamic = 'force-dynamic';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('limit');
  let limit = 20;
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      limit = Math.min(Math.max(parsed, 1), 100);
    }
  }
  const rows = listRecent(limit);
  return Response.json(rows, { headers: corsHeaders });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run app/api`
Expected: PASS — all 3 route suites green.

- [ ] **Step 7: Commit**

```bash
git add app/api
git commit -m "feat: add ip, json and history api routes"
```

---

### Task 7: Theming, layout and client islands

**Files:**
- Create: `app/globals.css` (full), `app/layout.tsx` (full), `public/favicon.svg`, `public/favicon.ico`, `public/favicon-32.png`, `public/apple-touch-icon.png`, `components/ui/ThemeToggle.tsx`, `components/ui/CopyButton.tsx`, `components/ui/RefreshButton.tsx`, `components/ui/LookupForm.tsx`, `components/ui/MapModal.tsx`, `components/ui/RecentFeed.tsx` (server-rendered)

**Interfaces:**
- Consumes: `isValidIp` from `lib/validate`, `relativeTime` from `lib/time`, `HistoryEntry` from `lib/types`.
- Produces: styled root layout with theme init + Umami injection; client components `ThemeToggle` (default export), `CopyButton({ value, label })`, `RefreshButton` (default), `LookupForm` (default), `MapModal` (default) + `MapTrigger({ lat, lon })` (named export); server component `RecentFeed({ entries }: { entries: HistoryEntry[] })`.

- [ ] **Step 1: Copy favicons from the existing site**

```bash
mkdir -p public
cp /Users/mojoaar/Development/echo_landing/favicon.ico public/ 2>/dev/null || true
cp /Users/mojoaar/Development/echo_landing/favicon-32.png public/ 2>/dev/null || true
cp /Users/mojoaar/Development/echo_landing/favicon.svg public/ 2>/dev/null || true
cp /Users/mojoaar/Development/echo_landing/apple-touch-icon.png public/ 2>/dev/null || true
```

If any of the source files do not exist, create `public/favicon.svg` manually:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0f1117"/>
  <text x="16" y="22" font-family="Menlo,monospace" font-size="14" fill="#7c6af7" text-anchor="middle">echo</text>
</svg>
```

Verify: `ls public` shows the favicon files.

- [ ] **Step 2: Write the full `app/globals.css`**

```css
:root {
  --radius: 14px;
  --font-mono: var(--font-mono);
  --transition: 200ms ease;
}

[data-theme='dark'] {
  --bg: #0f1117;
  --surface: #161922;
  --surface-2: #1c202c;
  --border: #262c3b;
  --text: #e7e9f0;
  --muted: #9aa3b8;
  --accent: #7c6af7;
  --accent-strong: #9a8cff;
  --accent-glow: rgba(124, 106, 247, 0.28);
  --shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
  color-scheme: dark;
}

[data-theme='light'] {
  --bg: #f5f6fa;
  --surface: #ffffff;
  --surface-2: #f0f2f8;
  --border: #e3e7f0;
  --text: #171a24;
  --muted: #5d6575;
  --accent: #5d4bf0;
  --accent-strong: #4637d6;
  --accent-glow: rgba(93, 75, 240, 0.14);
  --shadow: 0 8px 30px rgba(23, 26, 36, 0.08);
  color-scheme: light;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  background: var(--bg);
}

body {
  font-family: var(--font-mono);
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  transition: background var(--transition), color var(--transition);
}

.font-mono {
  font-family: var(--font-mono);
}

code {
  font-family: var(--font-mono);
}

.shell {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 20px 60px;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent-glow);
}

.brand-name {
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.brand-tag {
  color: var(--muted);
  font-size: 0.78rem;
}

.hero {
  padding: 44px 0 28px;
  text-align: center;
}

.hero-label {
  color: var(--muted);
  font-size: 0.8rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 14px;
}

.ip-hero {
  font-size: clamp(2rem, 6vw, 3.4rem);
  font-weight: 700;
  line-height: 1.1;
  word-break: break-all;
  letter-spacing: -0.01em;
}

.ip-hero.muted {
  color: var(--muted);
}

.hero-actions {
  margin-top: 22px;
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  padding: 9px 16px;
  border-radius: 10px;
  cursor: pointer;
  transition:
    background var(--transition),
    border-color var(--transition),
    box-shadow var(--transition);
}

.btn:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn.primary:hover {
  background: var(--accent-strong);
}

.error {
  margin-top: 16px;
  color: #ff6b6b;
  font-size: 0.85rem;
}

.form {
  display: flex;
  gap: 10px;
  margin: 8px 0 10px;
}

.form input {
  flex: 1;
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.9rem;
  padding: 11px 14px;
  border-radius: 10px;
  transition:
    border-color var(--transition),
    box-shadow var(--transition);
}

.form input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.form-error {
  color: #ff6b6b;
  font-size: 0.78rem;
  margin: 0 0 22px;
}

.lookup-form {
  margin-bottom: 34px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 18px 16px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition:
    transform var(--transition),
    border-color var(--transition);
}

.card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}

.card-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
}

.card-value {
  font-size: 0.95rem;
  word-break: break-word;
}

.card-hint {
  font-size: 0.72rem;
  color: var(--muted);
}

.muted {
  color: var(--muted);
}

.chip {
  align-self: flex-start;
  font-size: 0.68rem;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--accent);
  background: var(--surface-2);
}

.feed {
  margin-top: 40px;
}

.section-title {
  font-size: 1rem;
  margin-bottom: 12px;
  letter-spacing: 0.04em;
}

.feed-list {
  list-style: none;
  display: flex;
  flex-direction: column;
}

.feed-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-bottom: none;
  background: var(--surface);
  font-size: 0.85rem;
}

.feed-row:first-child {
  border-radius: 12px 12px 0 0;
}

.feed-row:last-child {
  border-bottom: 1px solid var(--border);
  border-radius: 0 0 12px 12px;
}

.feed-dot {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 0.68rem;
}

.feed-ip {
  flex: 1;
  overflow-wrap: anywhere;
}

.feed-ts {
  color: var(--muted);
  font-size: 0.75rem;
  white-space: nowrap;
}

footer {
  margin-top: 48px;
  text-align: center;
  color: var(--muted);
  font-size: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.theme-toggle {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 1.15rem;
  padding: 6px 8px;
  border-radius: 8px;
  transition: color var(--transition);
}

.theme-toggle:hover {
  color: var(--accent);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.55);
  z-index: 50;
  padding: 20px;
}

.modal {
  width: min(680px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow);
}

.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}

.modal-map {
  height: 380px;
}

.modal-note {
  padding: 10px 16px;
  font-size: 0.72rem;
  color: var(--muted);
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
```

- [ ] **Step 3: Write the full `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';

export const metadata: Metadata = {
  title: 'echo — what the internet sees when you connect',
  description:
    'See your IP address, location, ISP and more. Echo shows you exactly what the internet sees when you connect.',
  applicationName: 'echo',
  metadataBase: new URL('https://echo.johansen.foo'),
  openGraph: {
    title: 'echo',
    description: 'What the internet sees when you connect.',
    type: 'website',
    url: 'https://echo.johansen.foo',
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const THEME_INIT = `(function(){try{var t=localStorage.getItem('echo-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const umamiUrl = process.env.UMAMI_SCRIPT_URL;
  const umamiId = process.env.UMAMI_WEBSITE_ID;
  return (
    <html lang="en" data-theme="dark" className={jetbrains.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {umamiUrl && umamiId ? (
          <script src={umamiUrl} defer data-website-id={umamiId} />
        ) : null}
      </head>
      <body className="font-mono">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Write `components/ui/ThemeToggle.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const el = document.documentElement;
    const sync = () =>
      setTheme(el.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('echo-theme', next);
    } catch {
      // ignore
    }
  }

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Toggle light and dark mode">
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
```

- [ ] **Step 5: Write `components/ui/CopyButton.tsx`**

```tsx
'use client';
import { useState } from 'react';

export default function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button className="btn" onClick={copy}>
      {copied ? 'Copied' : label}
    </button>
  );
}
```

- [ ] **Step 6: Write `components/ui/RefreshButton.tsx`**

```tsx
'use client';
export default function RefreshButton() {
  return <button className="btn" onClick={() => window.location.reload()}>Refresh</button>;
}
```

- [ ] **Step 7: Write `components/ui/LookupForm.tsx`**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { isValidIp } from '@/lib/validate';

export default function LookupForm() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Enter an IP address.');
      return;
    }
    if (!isValidIp(trimmed)) {
      setError('Enter a valid IPv4 or IPv6 address.');
      return;
    }
    router.push(`/?ip=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="lookup-form">
      <form className="form" onSubmit={submit} role="search">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Look up any IP — e.g. 8.8.8.8 or 2606:4700:4700::1111"
          aria-label="IP address to look up"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="btn primary" type="submit">Lookup</button>
      </form>
      {error && (
        <p className="form-error" role="alert">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Write `components/ui/MapModal.tsx`**

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';

let leafletPromise: Promise<void> | null = null;

type Leaflet = {
  map: (el: HTMLElement, opts: Record<string, unknown>) => { setView: (c: [number, number], z: number) => unknown; remove: () => void };
  tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (map: unknown) => unknown };
  marker: (c: [number, number]) => { addTo: (map: unknown) => { bindPopup: (t: string) => { openPopup: () => unknown } }; };  // eslint-disable-line max-len
};

declare global {
  interface Window {
    L?: Leaflet;
  }
}

function ensureLeaflet(): Promise<void> {
  if (window.L) return Promise.resolve();
  leafletPromise ??= new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('leaflet failed to load'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function tileTheme(): string {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
}

export function MapTrigger({ lat, lon }: { lat: number; lon: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>Open map</button>
      {open && <MapModal lat={lat} lon={lon} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function MapModal({ lat, lon, onClose }: { lat: number; lon: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: { remove: () => void } | null = null;
    let cancelled = false;
    ensureLeaflet()
      .then(() => {
        if (cancelled || !ref.current || !window.L) return;
        const L = window.L;
        map = L.map(ref.current, { scrollWheelZoom: false }).setView([lat, lon], 11) as unknown as { remove: () => void };
        L.tileLayer(tileTheme(), {
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19,
        }).addTo(map);
        L.marker([lat, lon]).addTo(map).bindPopup(`${lat.toFixed(4)}, ${lon.toFixed(4)}`).openPopup();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [lat, lon]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{lat.toFixed(4)}, {lon.toFixed(4)}</span>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div ref={ref} className="modal-map" />
        <div className="modal-note">Approximate location based on IP address — city-level precision.</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Write `components/ui/RecentFeed.tsx` (server component, no 'use client')**

```tsx
import { relativeTime } from '@/lib/time';
import type { HistoryEntry } from '@/lib/types';

export default function RecentFeed({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="feed" aria-label="Recent lookups">
      <h2 className="section-title">Recent lookups</h2>
      <ul className="feed-list">
        {entries.map((e) => (
          <li key={`${e.ip}-${e.ts}`} className="feed-row">
            <span className="feed-dot">{e.iso ?? '·'}</span>
            <span className="feed-ip">{e.ip}</span>
            <span className="feed-ts">{relativeTime(e.ts)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 10: Typecheck**

```bash
npm run lint
```

Expected: exit 0. If tsc does not recognize `next/font/google`, add `"types": ["node"]` is not needed — instead confirm `next-env.d.ts` exists and re-run `npx next build` once (regenerates types). Any error in `MapModal.tsx` about the `Leaflet` type: simplify the local `type Leaflet` declarations to `any`-based until tsc passes — only the function signatures matter, the DOM API is runtime CDN code.

- [ ] **Step 11: Commit**

```bash
git add app/globals.css app/layout.tsx public components
git commit -m "feat: add theme system, layout and ui components"
```

---

### Task 8: The page — server-rendered echo dashboard

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `extractVisitorIp`, `normalizeIp` from `lib/ip`; `isValidIp` from `lib/validate`; `lookupInfo` from `lib/geo`; `insertLookup`, `listRecent` from `lib/db`; `IpInfo`, `HistoryEntry` from `lib/types`; `CopyButton`, `RefreshButton`, `LookupForm`, `MapTrigger`, `RecentFeed` from `components/ui`.
- Produces: async Server Component. `searchParams` prop typed as `Promise<{ ip?: string }>` (Next 16). Exports `dynamic = 'force-dynamic'`.

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import { headers } from 'next/headers';
import { extractVisitorIp, normalizeIp } from '@/lib/ip';
import { isValidIp } from '@/lib/validate';
import { lookupInfo } from '@/lib/geo';
import { insertLookup, listRecent } from '@/lib/db';
import type { HistoryEntry, IpInfo } from '@/lib/types';
import CopyButton from '@/components/ui/CopyButton';
import RefreshButton from '@/components/ui/RefreshButton';
import LookupForm from '@/components/ui/LookupForm';
import { MapTrigger } from '@/components/ui/MapModal';
import RecentFeed from '@/components/ui/RecentFeed';
import ThemeToggle from '@/components/ui/ThemeToggle';

export const dynamic = 'force-dynamic';

type InfoCardProps = {
  label: string;
  value: string | null;
  hint?: string;
  code?: string | null;
  children?: React.ReactNode;
};

function InfoCard({ label, value, hint, code, children }: InfoCardProps) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      {value ? (
        <div className="card-value">{value}</div>
      ) : (
        <div className="card-value muted">unavailable</div>
      )}
      {code ? <span className="chip">{code}</span> : null}
      {hint ? <div className="card-hint">{hint}</div> : null}
      {children}
    </div>
  );
}

function dedupeConsecutive(rows: HistoryEntry[]): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (!last || last.ip !== row.ip || last.iso !== row.iso) out.push(row);
  }
  return out;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ip?: string }>;
}) {
  const params = await searchParams;
  const rawTarget = params.ip?.trim() ?? null;
  const visitorIp = extractVisitorIp(headers());

  let target: string | null = null;
  let error: string | null = null;

  if (rawTarget) {
    const normalized = normalizeIp(rawTarget);
    if (isValidIp(normalized)) {
      target = normalized;
    } else {
      error = `"${rawTarget}" is not a valid IP address.`;
    }
  } else if (visitorIp) {
    target = normalizeIp(visitorIp);
  } else {
    error = 'Could not determine your IP address.';
  }

  let info: IpInfo | null = null;
  if (target) {
    info = await lookupInfo(target, { hostname: true });
    try {
      insertLookup(info.ip, info.country);
    } catch {
      // keep serving if the log is unavailable
    }
  }

  let recent: HistoryEntry[] = [];
  try {
    recent = dedupeConsecutive(listRecent(12));
  } catch {
    // keep serving if the log is unavailable
  }

  const showsOwnIp = !target || !rawTarget;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" aria-hidden="true" />
          <span className="brand-name">echo</span>
          <span className="brand-tag">what the internet sees when you connect</span>
        </div>
        <ThemeToggle />
      </header>

      <main>
        <section className="hero">
          <p className="hero-label">{showsOwnIp ? 'Your IP address' : 'Lookup result'}</p>
          {info ? (
            <>
              <h1 className="ip-hero">
                {info.isPrivate ? 'You are on a private network' : info.ip}
              </h1>
              <div className="hero-actions">
                {!info.isPrivate && <CopyButton value={info.ip} label="Copy" />}
                <CopyButton value={JSON.stringify(info, null, 2)} label="Copy as JSON" />
                {showsOwnIp && <RefreshButton />}
              </div>
            </>
          ) : (
            <h1 className="ip-hero muted">—</h1>
          )}
          {error && <p className="error">{error}</p>}
        </section>

        <LookupForm />

        <section className="cards" aria-label="Lookup details">
          <InfoCard
            label="Location"
            value={info ? [info.city, info.region].filter(Boolean).join(', ') || null : null}
          />
          <InfoCard
            label="Country"
            value={info?.countryName ? `${info.flag ?? ''} ${info.countryName}`.trim() : null}
            code={info?.countryCode ?? null}
          />
          <InfoCard
            label="Coordinates"
            value={
              info?.latitude != null && info?.longitude != null
                ? `${info.latitude.toFixed(4)}, ${info.longitude.toFixed(4)}`
                : null
            }
          >
            {info?.latitude != null && info?.longitude != null ? (
              <MapTrigger lat={info.latitude} lon={info.longitude} />
            ) : null}
          </InfoCard>
          <InfoCard
            label="ISP / ASN"
            value={info ? [info.org, info.asn].filter(Boolean).join(' · ') || null : null}
          />
          <InfoCard
            label="Timezone"
            value={
              info?.timezone
                ? `${info.timezone}${info.utcOffset ? ` (UTC ${info.utcOffset})` : ''}`
                : null
            }
          />
          <InfoCard label="Hostname" value={info?.hostname ?? null} />
        </section>

        <RecentFeed entries={recent} />
      </main>

      <footer>
        <p>echo — IP + geo lookup. Data via db-ip (CC BY 4.0).</p>
        <p>
          <code>curl https://echo.johansen.foo/api/ip</code> ·{' '}
          <code>curl https://echo.johansen.foo/api/json</code>
        </p>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run lint
npm run build
```

Expected: both pass. If the build errors about `searchParams` being a Promise, add `export const dynamic = 'force-dynamic'` (already present) — the error would indicate the Page signature mismatch; double-check params destructure uses `await`.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: render server-side echo dashboard page"
```

---

### Task 9: Delivery — MMDB downloader, Dockerfile, docker-compose, env, verification

**Files:**
- Create: `scripts/fetch-mmdb.mjs`, `Dockerfile`, `docker-compose.yml`, `.env.example`

**Interfaces:**
- Consumes: `scripts/fetch-mmdb.mjs` reads `MMDB_MONTH` (default `2026-08`), writes `data/dbip-city-lite.mmdb` + `data/dbip-asn-lite.mmdb` (validated by MMDB magic bytes `ab cd ef`). Runtime container runs the Next standalone server; DB persists in `/data`; Umami env vars are set by compose.

- [ ] **Step 1: Write `scripts/fetch-mmdb.mjs`**

```js
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

const month = process.env.MMDB_MONTH ?? '2026-08';
const base = 'https://download.db-ip.com/free';

const targets = [
  { url: `${base}/dbip-city-lite-${month}.mmdb.gz`, dest: 'data/dbip-city-lite.mmdb' },
  { url: `${base}/dbip-asn-lite-${month}.mmdb.gz`, dest: 'data/dbip-asn-lite.mmdb' },
];

function hasMmdbMagic(file) {
  if (!existsSync(file)) return false;
  const buf = readFileSync(file);
  return buf.length >= 4 && buf[0] === 0xab && buf[1] === 0xcd && buf[2] === 0xef;
}

function download(url, dest) {
  const tmp = `${dest}.tmp`;
  const out = createWriteStream(tmp);
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          out.destroy();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        pipeline(res, createGunzip(), out)
          .then(() => {
            if (hasMmdbMagic(tmp)) {
              renameSync(tmp, dest);
              console.log(`ok ${dest} (${readFileSync(dest).length} bytes)`);
              resolve();
            } else {
              reject(new Error(`bad mmdb magic in ${tmp}`));
            }
          })
          .catch(reject);
      })
      .on('error', reject);
  });
}

mkdirSync('data', { recursive: true });

for (const target of targets) {
  if (hasMmdbMagic(target.dest)) {
    console.log(`skip ${target.dest} (already present)`);
    continue;
  }
  await download(target.url, target.dest);
}
```

- [ ] **Step 2: Download MMDB files locally (for dev)**

```bash
npm run fetch:mmdb
```

Expected: prints `ok data/dbip-city-lite.mmdb (...)` and `ok data/dbip-asn-lite.mmdb (...)`. Each file is a few MB. If the network is unavailable, dev builds still work (readers degrade to nulls); Docker build will perform this step in-image.

- [ ] **Step 3: Write `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run fetch:mmdb
RUN npx next build

FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DB_PATH=/data/echo.db
ENV SCHEMA_PATH=/app/schema.sql
ENV MMDB_CITY=/app/data/dbip-city-lite.mmdb
ENV MMDB_ASN=/app/data/dbip-asn-lite.mmdb

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/data ./data
COPY --from=build --chown=node:node /app/schema.sql ./schema.sql

RUN mkdir -p /data && chown -R node:node /data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/ip').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
```

- [ ] **Step 4: Write `docker-compose.yml`**

```yaml
services:
  echo:
    build: .
    image: echo:latest
    container_name: echo
    restart: unless-stopped
    ports:
      - "127.0.0.1:3100:3000"
    volumes:
      - echo-data:/data
    environment:
      UMAMI_SCRIPT_URL: ${UMAMI_SCRIPT_URL:-https://umami.johansen.foo/script.js}
      UMAMI_WEBSITE_ID: ${UMAMI_WEBSITE_ID:-2dd1b560-7022-49d1-8063-bd3ccc99f21d}

volumes:
  echo-data:
```

Note: `container_name` is fixed — the site lives behind the user's reverse proxy; no other container uses this name.

- [ ] **Step 5: Write `.env.example`**

```
UMAMI_SCRIPT_URL=https://umami.johansen.foo/script.js
UMAMI_WEBSITE_ID=2dd1b560-7022-49d1-8063-bd3ccc99f21d
```

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-mmdb.mjs Dockerfile docker-compose.yml .env.example
git commit -m "feat: add docker delivery and mmdb downloader"
```

- [ ] **Step 7: Build the image and boot the stack**

```bash
docker compose build
docker compose up -d
docker compose ps
```

Expected: `docker compose ps` shows `echo` Up (healthy) after the healthcheck start period.

- [ ] **Step 8: End-to-end verification via curl**

```bash
curl -s http://127.0.0.1:3100/api/ip
curl -s 'http://127.0.0.1:3100/api/json?ip=8.8.8.8'
curl -s http://127.0.0.1:3100/api/history
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS http://127.0.0.1:3100/api/json
curl -sI http://127.0.0.1:3100/api/json | grep -i access-control-allow-origin
curl -s http://127.0.0.1:3100/ | grep -o '8.8.8.8'
docker compose exec echo ls -la /data
```

Expected: `/api/ip` prints a public IP; `/api/json?ip=8.8.8.8` returns `"country":"US"`, `"asn":"AS15169"`, `"org":"Google LLC"`; `/api/history` includes the entry just logged; OPTIONS returns `204`; the CORS header is `*`; the page HTML contains the looked-up IP; `/data` contains `echo.db` (plus `-wal`/`-shm` files).

Verify the Umami script tag is present in the rendered page:

```bash
curl -s http://127.0.0.1:3100/ | grep -o 'umami.johansen.foo/script.js'
```

Expected: match (both env vars are set in compose).

- [ ] **Step 9: Verify `docker compose down` cleanly stops and the volume persists**

```bash
docker compose down
docker compose up -d
docker compose exec echo ls /data/echo.db
```

Expected: `echo.db` still exists — the lookup log survived the restart.

---

## Self-Review vs. Spec

- **Server-first architecture** → Task 8 (page is async Server Component) + Task 6 (API routes share `lib/geo`). ✓
- **SQLite lookup log, schema, WAL** → Task 5. ✓
- **Bundled db-ip MMDB (City + ASN), build-time download, magic-byte validation** → Task 9 Steps 1–2, geo reads via `mmdb-lib` in `lib/geo.ts` (Task 4). ✓
- **Normalized `IpInfo` payload incl. flag, hostname, utcOffset, IPv6, private-state** → Task 4 + `lib/types.ts` (Task 2). ✓
- **API surface: `/api/ip`, `/api/json` (?ip=, CORS *, OPTIONS, no-store), `/api/history`** → Task 6. ✓
- **Theming: tokens, `data-theme`, anti-FOUC, localStorage `echo-theme`, dark default, JetBrains Mono, favicons, Umami injection, metadata** → Task 7. ✓
- **Docker multi-stage, non-root, HEALTHCHECK, compose with volume + Umami env, `.env.example`, TLS on external proxy** → Task 9. ✓
- **Graceful degradation (geo fail, DB fail, invalid IP)** → Task 4 (nulls), Task 6/8 (try/catch, 400s), Task 8 (inline error + private note). ✓
- **Testing: IP parsing/normalization, geo via stub readers, route tests with temp SQLite, docker E2E with curl** → Tasks 2/3/4/6 + Task 9. ✓
- **No comments in source** → all code blocks are comment-free; only the deliberately marked exception is the type fallback note. ✓