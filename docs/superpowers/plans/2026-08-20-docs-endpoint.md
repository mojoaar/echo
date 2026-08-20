# Public /docs Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public server-rendered `/docs` page (mailflow-inspired single page with a sticky sidebar) documenting usage, API reference, and operations, and slim the README into a pointer.

**Architecture:** A new `app/docs/page.tsx` server component renders one page with a sticky sidebar of grouped anchor links plus a content column (intro/usage, API reference with endpoint cards + curl/JSON examples interpolating runtime `APP_URL`, and operations incl. env table, deployment, Nginx Proxy Manager, probes, admin, releasing, data). A `components/docs/DocsHighlight.tsx` client island injects a self-hosted pinned `highlight.js@11.10.0` build + theme CSS (CSP-`'self'`-compatible, no CSP change) and runs `hljs.highlightAll()`. Shared `SiteHeader`/`SiteFooter` components are extracted from the home page and reused on both pages; the footer gains a Docs link. `/docs` is added to the sitemap. The README is slimmed to a short pointer. The docs page performs no lookups, writes nothing, uses no rate limit.

**Tech Stack:** Next.js 16 App Router (server component, `force-dynamic`), React, TypeScript strict, CSS custom properties (existing echo design tokens), highlight.js 11.10.0 (self-hosted, committed), Vitest, Playwright.

## Global Constraints

- NO code comments in any source file (never write `//`, `/* */`, `<!-- -->` in committed code).
- Do NOT stage, revert, or delete these unrelated generated worktree files: modified `next-env.d.ts`, modified `tsconfig.json`, untracked `test-results/`. Always use explicit `git add <paths>` (never `git add -A` / `git add .`).
- The uncommitted pending polish edits (CHANGELOG.md, app/globals.css, app/page.tsx, e2e/home.spec.ts) are committed FIRST as Task 1; do not mix them into later commits.
- Only commit when the task's commit step says to. Do not push, tag, or release unless explicitly requested.
- `/docs` is a plain public page: no activity events recorded, no rate-limit usage, no DB writes, no lookup instrumentation.
- Self-hosted `highlight.min.js` and `hljs.css` are same-origin (`'self'`) — no CSP change is allowed.
- Reuse existing echo design tokens from `app/globals.css` (--bg, --surface, --surface-2, --border, --text, --muted, --accent, --accent-strong, --green, --radius, --transition). Do not introduce new design languages.
- Existing public APIs, `/admin`, rate limiting, and all route behavior are unchanged.
- Run `npm run lint` (= `tsc --noEmit`) after every code change. The pre-existing Vitest `configLoader: 'native'` deprecation warning is known and non-fatal.
- Playwright projects run against `npm run dev`; the known unrelated `mobile-safari` theme-toggle failure in `e2e/mobile.spec.ts` is pre-existing — do not fix it in this plan.

---
## File Structure

| Path | Responsibility |
|------|----------------|
| `app/docs/page.tsx` | New server-rendered docs page (sidebar + content) |
| `components/docs/DocsHighlight.tsx` | Client island injecting highlight.js + theme, runs `highlightAll()` |
| `components/ui/SiteHeader.tsx` | Shared topbar (brand + ThemeToggle), extracted from home |
| `components/ui/SiteFooter.tsx` | Shared footer (db-ip link, curl lines, Docs link, author + version), extracted from home |
| `public/highlight.min.js` | Committed pinned highlight.js 11.10.0 build |
| `public/hljs.css` | highlight.js theme scoped under `[data-theme='dark']` / `[data-theme='light']` |
| `app/globals.css` | Docs layout styles (sidebar, content, endpoint cards, method badges, tables, responsive) |
| `app/sitemap.ts` | Adds `/docs` entry |
| `app/page.tsx` | Refactored to use `SiteHeader`/`SiteFooter` |
| `README.md` | Slimmed to short pointer with `/docs` link |
| `e2e/docs.spec.ts` | Playwright desktop+mobile coverage for the docs page |
| `playwright.config.ts` | Add `docs\.spec\.ts` to desktop-chromium and mobile-safari testMatch |
| `CHANGELOG.md` | `[Unreleased]` entry for the docs page |

---

### Task 1: Commit the pending polish edits (baseline)

**Files:**
- Commit: `CHANGELOG.md`, `app/globals.css`, `app/page.tsx`, `e2e/home.spec.ts` (the currently uncommitted pending edits from a prior session)

**Interfaces:**
- Consumes: nothing.
- Produces: a clean baseline so all later commits contain only docs work.

- [ ] **Step 1: Confirm the exact pending diff**

Run: `git status --porcelain`
Expected: `M CHANGELOG.md`, `M app/globals.css`, `M app/page.tsx`, `M e2e/home.spec.ts`, plus `M next-env.d.ts`, `M tsconfig.json`, `?? test-results/`.

Run: `git diff --stat`
Expected: 4 tracked files changed (the generated `next-env.d.ts`/`tsconfig.json` are NOT part of this commit).

- [ ] **Step 2: Commit only the four intended files**

```bash
git add CHANGELOG.md app/globals.css app/page.tsx e2e/home.spec.ts
git commit -m "fix: polish admin login sizing and connectivity visibility"
```

- [ ] **Step 3: Verify baseline**

Run: `git status --porcelain`
Expected: only `M next-env.d.ts`, `M tsconfig.json`, `?? test-results/` remain.

Run: `npm run lint`
Expected: exit 0 (TypeScript check clean).

---

### Task 2: Add self-hosted highlight.js assets

**Files:**
- Create: `public/highlight.min.js`
- Create: `public/hljs.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `public/highlight.min.js` (global `hljs` with `highlightAll()`), `public/hljs.css` (theme under `[data-theme='dark']` and `[data-theme='light']`) — both served same-origin by Next, allowed by existing CSP `script-src 'self'` / `style-src 'self'`.

- [ ] **Step 1: Download the pinned highlight.js 11.10.0 build**

```bash
curl -fsSL https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/highlight.min.js -o public/highlight.min.js
wc -c public/highlight.min.js
```

Expected: file written, size roughly 80000–120000 bytes.

- [ ] **Step 2: Verify the file is the highlight.js library**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('public/highlight.min.js','utf8');if(!s.includes('highlightAll'))process.exit(1);console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Create `public/hljs.css`**

```css
[data-theme='dark'] .hljs {
  color: #e7e9f0;
  background: transparent;
}

[data-theme='dark'] .hljs-comment,
[data-theme='dark'] .hljs-quote {
  color: #9aa3b8;
  font-style: italic;
}

[data-theme='dark'] .hljs-keyword,
[data-theme='dark'] .hljs-selector-tag,
[data-theme='dark'] .hljs-literal {
  color: #9a8cff;
}

[data-theme='dark'] .hljs-string,
[data-theme='dark'] .hljs-regexp,
[data-theme='dark'] .hljs-addition {
  color: #34d399;
}

[data-theme='dark'] .hljs-number,
[data-theme='dark'] .hljs-symbol {
  color: #f0a06b;
}

[data-theme='dark'] .hljs-title,
[data-theme='dark'] .hljs-title.function_,
[data-theme='dark'] .hljs-section {
  color: #7c6af7;
}

[data-theme='dark'] .hljs-attr,
[data-theme='dark'] .hljs-attribute,
[data-theme='dark'] .hljs-variable {
  color: #8ab4f8;
}

[data-theme='dark'] .hljs-built_in,
[data-theme='dark'] .hljs-type,
[data-theme='dark'] .hljs-selector-class {
  color: #e5c07b;
}

[data-theme='dark'] .hljs-meta {
  color: #9aa3b8;
}

[data-theme='dark'] .hljs-deletion {
  color: #f0755f;
}

[data-theme='dark'] .hljs-emphasis {
  font-style: italic;
}

[data-theme='dark'] .hljs-strong {
  font-weight: 700;
}

[data-theme='light'] .hljs {
  color: #171a24;
  background: transparent;
}

[data-theme='light'] .hljs-comment,
[data-theme='light'] .hljs-quote {
  color: #5d6575;
  font-style: italic;
}

[data-theme='light'] .hljs-keyword,
[data-theme='light'] .hljs-selector-tag,
[data-theme='light'] .hljs-literal {
  color: #4637d6;
}

[data-theme='light'] .hljs-string,
[data-theme='light'] .hljs-regexp,
[data-theme='light'] .hljs-addition {
  color: #059669;
}

[data-theme='light'] .hljs-number,
[data-theme='light'] .hljs-symbol {
  color: #b3541e;
}

[data-theme='light'] .hljs-title,
[data-theme='light'] .hljs-title.function_,
[data-theme='light'] .hljs-section {
  color: #5d4bf0;
}

[data-theme='light'] .hljs-attr,
[data-theme='light'] .hljs-attribute,
[data-theme='light'] .hljs-variable {
  color: #1a73e8;
}

[data-theme='light'] .hljs-built_in,
[data-theme='light'] .hljs-type,
[data-theme='light'] .hljs-selector-class {
  color: #9a6b01;
}

[data-theme='light'] .hljs-meta {
  color: #5d6575;
}

[data-theme='light'] .hljs-deletion {
  color: #c53030;
}

[data-theme='light'] .hljs-emphasis {
  font-style: italic;
}

[data-theme='light'] .hljs-strong {
  font-weight: 700;
}
```

- [ ] **Step 4: Verify and commit**

Run: `git add public/highlight.min.js public/hljs.css && git commit -m "chore: add self-hosted highlight.js assets"`

---

### Task 3: Add the docs syntax-highlighting client island

**Files:**
- Create: `components/docs/DocsHighlight.tsx`

**Interfaces:**
- Consumes: `public/highlight.min.js` (Task 2) and `public/hljs.css` (Task 2).
- Produces: default export `DocsHighlight` — a `'use client'` component rendering `null` that injects the two assets once (module-level promise singleton), then calls `window.hljs.highlightAll()` on mount. Used by Task 5's docs page.

- [ ] **Step 1: Create `components/docs/DocsHighlight.tsx`**

```tsx
'use client';
import { useEffect } from 'react';

let highlightPromise: Promise<void> | null = null;

function ensureHighlightJs(): Promise<void> {
  if (window.hljs) return Promise.resolve();
  highlightPromise ??= new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/hljs.css';
    const script = document.createElement('script');
    script.src = '/highlight.min.js';
    let cssLoaded = false;
    let jsLoaded = false;
    const finish = () => {
      if (cssLoaded && jsLoaded) resolve();
    };
    link.onload = () => {
      cssLoaded = true;
      finish();
    };
    link.onerror = () => {
      highlightPromise = null;
      reject(new Error('highlight css failed to load'));
    };
    script.onload = () => {
      jsLoaded = true;
      finish();
    };
    script.onerror = () => {
      highlightPromise = null;
      reject(new Error('highlight failed to load'));
    };
    document.head.appendChild(link);
    document.head.appendChild(script);
  });
  return highlightPromise;
}

declare global {
  interface Window {
    hljs?: { highlightAll: () => void };
  }
}

export default function DocsHighlight() {
  useEffect(() => {
    let cancelled = false;
    ensureHighlightJs()
      .then(() => {
        if (!cancelled && window.hljs) window.hljs.highlightAll();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run lint`
Expected: exit 0. Note: `window.hljs` is typed via the `declare global` block above; `document`/`window` are only referenced inside functions (safe for the client bundle).

- [ ] **Step 3: Commit**

```bash
git add components/docs/DocsHighlight.tsx
git commit -m "feat: add docs syntax highlighting island"
```

---

### Task 4: Style the docs page

**Files:**
- Modify: `app/globals.css` (append a docs section at the end of the file)

**Interfaces:**
- Consumes: existing design tokens.
- Produces: class names used by `app/docs/page.tsx` (Task 5): `.docs-wrap`, `.docs-sidebar`, `.docs-nav-group`, `.docs-nav-link`, `.docs-content`, `.method-badge` / `.method-get` / `.method-post` / `.method-put` / `.method-del`, `.endpoint`, `.endpoint-desc`. Also styles headings/tables/pre inside `.docs-content`. Responsive collapse below 768px.

- [ ] **Step 1: Append the docs styles to `app/globals.css`**

```css
.docs-wrap {
  display: flex;
  align-items: flex-start;
  gap: 28px;
  padding-top: 28px;
}

.docs-sidebar {
  position: sticky;
  top: 20px;
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
}

.docs-nav-group {
  margin: 16px 0 4px;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.docs-nav-link {
  color: var(--muted);
  font-size: 0.82rem;
  text-decoration: none;
  padding: 5px 8px;
  border-radius: 6px;
  transition: color var(--transition), background var(--transition);
}

.docs-nav-link:hover {
  color: var(--text);
  background: var(--surface-2);
}

.docs-content {
  flex: 1;
  min-width: 0;
  max-width: 900px;
}

.docs-content h2 {
  font-size: 1.3rem;
  margin: 40px 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  scroll-margin-top: 20px;
}

.docs-content h3 {
  font-size: 1rem;
  margin: 24px 0 8px;
}

.docs-content p {
  color: var(--muted);
  margin-bottom: 12px;
}

.docs-content ul,
.docs-content ol {
  margin: 0 0 12px 1.2em;
  color: var(--muted);
}

.docs-content li {
  margin-bottom: 4px;
}

.docs-content a {
  color: var(--accent);
  text-decoration: none;
}

.docs-content a:hover {
  text-decoration: underline;
}

.docs-content code {
  background: var(--surface-2);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.82rem;
}

.docs-content pre {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  overflow-x: auto;
  margin-bottom: 16px;
}

.docs-content pre code {
  background: none;
  padding: 0;
  color: var(--text);
}

.docs-content table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  font-size: 0.85rem;
}

.docs-content th {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 0.72rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
}

.docs-content td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
  color: var(--muted);
}

.method-badge {
  display: inline-block;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 2px 7px;
  border-radius: 4px;
  vertical-align: middle;
}

.method-get {
  background: rgba(52, 211, 153, 0.16);
  color: var(--green);
}

.method-post {
  background: rgba(124, 106, 247, 0.16);
  color: var(--accent);
}

.method-put {
  background: rgba(240, 160, 107, 0.16);
  color: #d99a3d;
}

.method-del {
  background: rgba(240, 117, 95, 0.16);
  color: #f0755f;
}

.endpoint {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 18px;
  margin-bottom: 14px;
}

.endpoint h4 {
  margin-bottom: 8px;
  font-size: 0.9rem;
}

.endpoint h4 code {
  background: none;
  padding: 0;
}

.endpoint-desc {
  color: var(--muted);
  font-size: 0.85rem;
  margin-bottom: 10px;
}

@media (max-width: 768px) {
  .docs-wrap {
    flex-direction: column;
  }

  .docs-sidebar {
    position: static;
    width: 100%;
    max-height: none;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
  }

  .docs-nav-group {
    width: 100%;
  }
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: exit 0 (CSS is not typechecked, but the command must stay clean).

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: style the public docs page"
```

---

### Task 5: Add the public docs page

**Files:**
- Create: `app/docs/page.tsx`

**Interfaces:**
- Consumes: `DocsHighlight` (Task 3), `SiteHeader`/`SiteFooter` (Task 6 — see note below), `ThemeToggle` not needed directly (SiteHeader includes it).
- Produces: the `/docs` route. `export const dynamic = 'force-dynamic'`; page-level `metadata` (title `Docs — echo`, description). Reads `process.env.APP_URL || 'https://echo.johansen.foo'` at render for curl examples.

> IMPORTANT ordering note: Task 6 creates `SiteHeader`/`SiteFooter`. If this task is implemented before Task 6 is complete, temporarily use the inline topbar/footer markup from `app/page.tsx` and swap them for the shared components in Task 6. To keep the plan self-contained, Task 6 is implemented first-in-sequence by the controller; if Task 5 runs before Task 6, import the components from `@/components/ui/SiteHeader` and `@/components/ui/SiteFooter` and create those files in this task instead (Task 6 then only wires `app/page.tsx`). The final committed state must use the shared components.

- [ ] **Step 1: Create `app/docs/page.tsx`**

```tsx
import type { Metadata } from 'next';
import DocsHighlight from '@/components/docs/DocsHighlight';
import SiteFooter from '@/components/ui/SiteFooter';
import SiteHeader from '@/components/ui/SiteHeader';

export const dynamic = 'force-dynamic';

const defaultSiteUrl = 'https://echo.johansen.foo';

export const metadata: Metadata = {
  title: 'Docs — echo',
  description: 'General usage, API reference and deployment notes for echo.',
};

function MethodBadge({ method }: { method: string }) {
  return <span className={`method-badge method-${method.toLowerCase()}`}>{method}</span>;
}

function Endpoint({
  method,
  path,
  desc,
  children,
}: {
  method: string;
  path: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="endpoint">
      <h4>
        <MethodBadge method={method} /> <code>{path}</code>
      </h4>
      <p className="endpoint-desc">{desc}</p>
      {children}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre>
      <code>{children}</code>
    </pre>
  );
}

function NavGroup({ label }: { label: string }) {
  return <div className="docs-nav-group">{label}</div>;
}

export default function DocsPage() {
  const siteUrl = process.env.APP_URL || defaultSiteUrl;

  return (
    <div className="shell">
      <DocsHighlight />
      <SiteHeader />

      <main className="docs-wrap">
        <aside className="docs-sidebar" aria-label="Documentation navigation">
          <NavGroup label="Getting started" />
          <a className="docs-nav-link" href="#introduction">Introduction</a>
          <a className="docs-nav-link" href="#what-echo-does">What echo does</a>
          <a className="docs-nav-link" href="#lookup">Lookup any IP</a>
          <a className="docs-nav-link" href="#share">Share links</a>
          <a className="docs-nav-link" href="#map-and-copy">Map and copy</a>
          <a className="docs-nav-link" href="#connectivity">Connectivity diagnostics</a>
          <a className="docs-nav-link" href="#privacy">Privacy model</a>

          <NavGroup label="API reference" />
          <a className="docs-nav-link" href="#overview">Overview</a>
          <a className="docs-nav-link" href="#rate-limiting">Rate limiting and errors</a>
          <a className="docs-nav-link" href="#api-ip">/api/ip</a>
          <a className="docs-nav-link" href="#api-json">/api/json</a>
          <a className="docs-nav-link" href="#api-whois">/api/whois</a>
          <a className="docs-nav-link" href="#api-dns">/api/dns</a>
          <a className="docs-nav-link" href="#api-history">/api/history</a>
          <a className="docs-nav-link" href="#api-stats">/api/stats</a>
          <a className="docs-nav-link" href="#api-health">/api/health</a>

          <NavGroup label="Operations" />
          <a className="docs-nav-link" href="#environment">Environment variables</a>
          <a className="docs-nav-link" href="#deployment">Deployment</a>
          <a className="docs-nav-link" href="#nginx">Nginx Proxy Manager</a>
          <a className="docs-nav-link" href="#probes">Connectivity probes</a>
          <a className="docs-nav-link" href="#admin">Private admin dashboard</a>
          <a className="docs-nav-link" href="#releasing">Releasing</a>
          <a className="docs-nav-link" href="#data">Data and attribution</a>
        </aside>

        <div className="docs-content">
          <h1>Documentation</h1>
          <p>
            echo shows you exactly what the internet sees when you connect: your IP
            address, location, ISP and more. This page covers general usage, the public
            API, and running it yourself.
          </p>

          <h2 id="introduction">Introduction</h2>
          <p>
            echo is a server-side IP and geo lookup tool. When you open the site it
            detects your public IP, looks it up against a bundled geo database, and
            shows location, country, coordinates, ISP/ASN, timezone and hostname. You
            can also look up any IP address, resolve DNS records, and query WHOIS
            registration data — all without a client-side geo call.
          </p>

          <h2 id="what-echo-does">What echo does</h2>
          <ul>
            <li>Shows your public IP and geo information from a bundled database</li>
            <li>Looks up any IP via <code>?ip=</code> on the home page or the API</li>
            <li>Resolves forward DNS records (A, AAAA, MX, NS, TXT, SOA)</li>
            <li>Queries WHOIS/RDAP registration and ASN data on demand</li>
            <li>Runs an optional IPv4/IPv6 connectivity diagnostic from your browser</li>
            <li>Logs aggregate lookup statistics — never raw visitor IPs publicly</li>
          </ul>

          <h2 id="lookup">Lookup any IP</h2>
          <p>
            Add <code>?ip=8.8.8.8</code> to the home page URL to look up any public IP:
          </p>
          <Code>{`${siteUrl}/?ip=8.8.8.8`}</Code>
          <p>
            Both IPv4 and IPv6 are supported. The page shows the lookup result instead
            of your own details and the copy and share actions work for the looked-up
            address.
          </p>

          <h2 id="share">Share links</h2>
          <p>
            Use the copy link button to get a shareable <code>?ip=</code> URL. It uses
            the configured <code>APP_URL</code> when set, otherwise the address you are
            viewing from. Lookup pages set <code>noindex</code> metadata so search
            engines do not index query-specific URLs.
          </p>

          <h2 id="map-and-copy">Map and copy</h2>
          <p>
            The coordinates card opens a Leaflet map centred on the approximate
            city-level location. Copy and copy-as-JSON buttons put the IP or the full
            lookup payload on your clipboard. Clipboard failures are reported honestly.
          </p>

          <h2 id="connectivity">Connectivity diagnostics</h2>
          <p>
            When <code>CONNECTIVITY_IPV4_URL</code> or <code>CONNECTIVITY_IPV6_URL</code>{' '}
            are configured, a connectivity section lets your browser probe each
            endpoint and report IPv4/IPv6 reachability with latency. This measures
            browser reachability only — it never changes the IP recorded by the server.
            The section is hidden when no probe URL is configured.
          </p>

          <h2 id="privacy">Privacy model</h2>
          <p>
            The public site never exposes raw visitor IPs. Recent lookups are shown as
            aggregate totals and top countries. Exact IPs are visible only in the
            token-protected admin dashboard. Lookup rows are pruned after{' '}
            <code>LOOKUP_RETENTION_DAYS</code> (default 90 days). No cookies are used
            except the optional admin session cookie.
          </p>

          <h2 id="overview">Overview</h2>
          <p>
            All public endpoints are <code>GET</code>, return JSON with{' '}
            <code>Access-Control-Allow-Origin: *</code>, and are rate limited per
            visitor IP. The visitor IP is read from <code>X-Real-IP</code> first, then{' '}
            <code>X-Forwarded-For</code>; your reverse proxy must overwrite these
            headers with the verified client address.
          </p>
          <p>JSON errors use a stable shape:</p>
          <Code>{`{ "error": "human readable message", "code": "stable_code" }`}</Code>

          <h2 id="rate-limiting">Rate limiting and errors</h2>
          <p>
            Each public endpoint has its own fixed-window budget (defaults below). A
            response carries <code>x-ratelimit-limit</code> and{' '}
            <code>x-ratelimit-remaining</code>. When a budget is exhausted the API
            returns HTTP 429 with a <code>retry-after</code> header in seconds.
          </p>
          <table>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Default budget (per 60s)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>/api/ip</td><td>60</td></tr>
              <tr><td>/api/json</td><td>30</td></tr>
              <tr><td>/api/history</td><td>30</td></tr>
              <tr><td>/api/whois</td><td>10</td></tr>
              <tr><td>/api/dns</td><td>10</td></tr>
            </tbody>
          </table>

          <Endpoint method="GET" path="/api/ip" desc="Returns the visitor IP as plain text, or a specific IP when ?ip= is provided.">
            <Code>{`curl ${siteUrl}/api/ip`}</Code>
            <Code>{`203.0.113.7`}</Code>
            <Code>{`curl "${siteUrl}/api/ip?ip=8.8.8.8"`}</Code>
            <Code>{`8.8.8.8`}</Code>
          </Endpoint>

          <Endpoint method="GET" path="/api/json" desc="Returns the full normalized lookup payload for the visitor or for ?ip=.">
            <Code>{`curl "${siteUrl}/api/json?ip=8.8.8.8"`}</Code>
            <Code>{`{
  "ip": "8.8.8.8",
  "city": "Mountain View",
  "region": "California",
  "country": "US",
  "countryName": "United States",
  "flag": "🇺🇸",
  "org": "Google LLC",
  "asn": "AS15169",
  "timezone": "America/Los_Angeles",
  "utcOffset": "-07:00",
  "latitude": 37.422,
  "longitude": -122.085,
  "hostname": "dns.google",
  "isPrivate": false
}`}</Code>
          </Endpoint>

          <Endpoint method="GET" path="/api/whois" desc="Returns WHOIS/RDAP registration and ASN data for ?ip= (on demand, cached).">
            <Code>{`curl "${siteUrl}/api/whois?ip=8.8.8.8"`}</Code>
            <Code>{`{
  "ip": {
    "handle": "NET-8-8-8-0-2",
    "name": "GOGL",
    "startAddress": "8.8.8.0",
    "endAddress": "8.8.8.255",
    "country": "US",
    "cidr": "8.8.8.0/24",
    "organization": "Google LLC",
    "registrant": "Google LLC",
    "abuse": null
  },
  "asn": {
    "handle": "AS15169",
    "name": "GOOGLE",
    "country": "US",
    "organization": "Google LLC"
  }
}`}</Code>
          </Endpoint>

          <Endpoint method="GET" path="/api/dns" desc="Resolves A, AAAA, MX, NS, TXT and SOA records for ?name= with cache metadata.">
            <Code>{`curl "${siteUrl}/api/dns?name=example.com"`}</Code>
            <Code>{`{
  "name": "example.com",
  "records": {
    "a": ["93.184.216.34"],
    "aaaa": [],
    "mx": [],
    "ns": ["a.iana-servers.net"],
    "txt": [],
    "soa": ["a.iana-servers.net hostmaster.iana.org"]
  },
  "cache": "miss",
  "resolvedAt": "2026-08-20T10:00:00.000Z",
  "durationMs": 42,
  "partial": false
}`}</Code>
          </Endpoint>

          <Endpoint method="GET" path="/api/history" desc="Returns aggregate lookup statistics: totals and top countries, never raw IPs.">
            <Code>{`curl ${siteUrl}/api/history`}</Code>
            <Code>{`{
  "total": 1234,
  "last24h": 56,
  "topCountries": [
    { "iso": "US", "count": 42 },
    { "iso": "DE", "count": 7 }
  ]
}`}</Code>
          </Endpoint>

          <Endpoint method="GET" path="/api/stats" desc="Private owner analytics guarded by STATS_TOKEN. Pass ?token= or an Authorization: Bearer header.">
            <Code>{`curl -H "Authorization: Bearer $STATS_TOKEN" ${siteUrl}/api/stats`}</Code>
            <Code>{`{
  "total": 1234,
  "last24h": 56,
  "topCountries": [],
  "topIps": [{ "ip": "203.0.113.7", "count": 12 }],
  "daily": [{ "day": "2026-08-20", "count": 56 }]
}`}</Code>
          </Endpoint>

          <Endpoint method="GET" path="/api/health" desc="Public liveness check returning {status:ok}. Readiness detail requires the HEALTH_TOKEN.">
            <Code>{`curl ${siteUrl}/api/health`}</Code>
            <Code>{`{ "status": "ok" }`}</Code>
          </Endpoint>

          <h2 id="environment">Environment variables</h2>
          <table>
            <thead>
              <tr>
                <th>Variable</th>
                <th>Default</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>APP_URL</td><td>https://echo.johansen.foo</td><td>Public origin used for metadata, sitemap and share links</td></tr>
              <tr><td>TZ</td><td>Europe/Copenhagen</td><td>Container timezone for logs and admin timestamps</td></tr>
              <tr><td>RATE_LIMIT_MAX</td><td>(per endpoint)</td><td>Legacy global fallback for request budget per window</td></tr>
              <tr><td>RATE_LIMIT_WINDOW_MS</td><td>60000</td><td>Legacy global fallback window</td></tr>
              <tr><td>RATE_LIMIT_&lt;ENDPOINT&gt;_MAX</td><td>ip 60, json 30, history 30, whois 10, dns 10, stats-auth 5</td><td>Per-endpoint budget</td></tr>
              <tr><td>RATE_LIMIT_&lt;ENDPOINT&gt;_WINDOW_MS</td><td>60000</td><td>Per-endpoint window</td></tr>
              <tr><td>DNS_TIMEOUT_MS</td><td>6000</td><td>Overall DNS resolution deadline</td></tr>
              <tr><td>DNS_MAX_CONCURRENCY</td><td>2</td><td>Concurrent resolver jobs</td></tr>
              <tr><td>DNS_CACHE_TTL_MS</td><td>30000</td><td>Successful DNS cache lifetime</td></tr>
              <tr><td>DNS_FAILURE_TTL_MS</td><td>5000</td><td>Failed DNS cache lifetime</td></tr>
              <tr><td>DNS_CACHE_MAX</td><td>100</td><td>Maximum cached hostnames</td></tr>
              <tr><td>LOOKUP_RETENTION_DAYS</td><td>90</td><td>How long lookup rows are kept</td></tr>
              <tr><td>STATS_TOKEN</td><td>(unset)</td><td>Secret protecting /api/stats; endpoint disabled when unset</td></tr>
              <tr><td>HEALTH_TOKEN</td><td>(unset)</td><td>Secret protecting authenticated readiness detail</td></tr>
              <tr><td>ADMIN_TOKEN</td><td>(unset)</td><td>Secret enabling the /admin dashboard; hidden when unset</td></tr>
              <tr><td>ADMIN_SESSION_TTL_SECONDS</td><td>28800</td><td>Admin session lifetime in seconds</td></tr>
              <tr><td>CONNECTIVITY_IPV4_URL</td><td>(unset)</td><td>IPv4 probe endpoint used by the browser diagnostic</td></tr>
              <tr><td>CONNECTIVITY_IPV6_URL</td><td>(unset)</td><td>IPv6 probe endpoint used by the browser diagnostic</td></tr>
              <tr><td>ECHO_IMAGE_SIZE_BYTES</td><td>(unset)</td><td>Optional deployed image size shown in admin resources</td></tr>
              <tr><td>UMAMI_SCRIPT_URL</td><td>https://umami.johansen.foo/script.js</td><td>Umami script URL; analytics only when set</td></tr>
              <tr><td>UMAMI_WEBSITE_ID</td><td>(unset)</td><td>Umami website id; analytics only when set</td></tr>
            </tbody>
          </table>

          <h2 id="deployment">Deployment</h2>
          <p>
            Images are published to GitHub Container Registry. Copy{' '}
            <code>docker-compose.yml</code> to your host, configure a <code>.env</code>{' '}
            next to it, then:
          </p>
          <Code>{`docker compose pull
docker compose up -d`}</Code>
          <p>
            The service listens on port 3100. Keep the host firewall closed to direct
            access if a reverse proxy is the only intended entry point; TLS terminates
            at the proxy. Data persists in the <code>echo-data</code> volume.
          </p>

          <h2 id="nginx">Nginx Proxy Manager</h2>
          <p>
            NPM 2.x Proxy Hosts automatically set <code>X-Real-IP</code>,{' '}
            <code>X-Forwarded-For</code>, <code>X-Forwarded-Proto</code> and{' '}
            <code>X-Forwarded-Host</code>, so a single-hop setup needs no manual
            configuration. echo trusts <code>X-Real-IP</code> first.
          </p>
          <p>
            With Cloudflare in front, open the Advanced tab and add:{' '}
            <code>set_real_ip_from</code> for each Cloudflare range, then{' '}
            <code>real_ip_header CF-Connecting-IP;</code>. For an intermediate proxy,
            use <code>set_real_ip_from</code> with that proxy's range and{' '}
            <code>real_ip_header X-Forwarded-For;</code> with{' '}
            <code>real_ip_recursive on;</code>.
          </p>

          <h2 id="probes">Connectivity probes</h2>
          <p>
            The connectivity diagnostic needs two lightweight endpoints reachable from
            browsers: one over IPv4 only and one over IPv6 only. Configure{' '}
            <code>CONNECTIVITY_IPV4_URL</code> and <code>CONNECTIVITY_IPV6_URL</code>{' '}
            with those URLs. The probe responses should be CORS-enabled and return a
            minimal payload; they are never used for lookups or logged as visitor
            activity.
          </p>

          <h2 id="admin">Private admin dashboard</h2>
          <p>
            Set <code>ADMIN_TOKEN</code> to enable <code>/admin</code>. The dashboard
            shows exact visitor activity (type, channel, actor, country, IP, target),
            aggregate breakdowns, and resource sampling (CPU, memory, storage). Sessions
            are signed HttpOnly cookies; logout revokes the session server-side. When{' '}
            <code>ADMIN_TOKEN</code> is unset the whole area returns 404.
          </p>

          <h2 id="releasing">Releasing</h2>
          <p>
            Releases use <code>npm run release:patch</code>,{' '}
            <code>npm run release:minor</code> or <code>npm run release:major</code>.
            The script bumps the version, moves the Unreleased changelog into a dated
            section, commits and tags. Pushing the tag triggers CI to build and publish
            the image to GitHub Container Registry.
          </p>

          <h2 id="data">Data and attribution</h2>
          <p>
            Geo data comes from db-ip and is licensed under CC BY 4.0. Attribution is
            shown in the site footer.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: exit 0.

Run: `npx next build`
Expected: build succeeds; `/docs` appears as a route (search output for `docs`). The known `lib/db.ts` fs-tracing and Edge-instrumentation warnings may appear — they are pre-existing.

- [ ] **Step 3: Commit**

```bash
git add app/docs/page.tsx
git commit -m "feat: add public docs page"
```

---

### Task 6: Extract shared SiteHeader/SiteFooter and add the Docs footer link

**Files:**
- Create: `components/ui/SiteHeader.tsx`
- Create: `components/ui/SiteFooter.tsx`
- Modify: `app/page.tsx` (replace inline topbar/footer with the shared components; remove now-unused imports and the `appVersion`/`baseUrl` uses that only the footer needed)

**Interfaces:**
- Consumes: `ThemeToggle`, `getVersion` from `@/lib/version`.
- Produces: `SiteHeader` (brand + ThemeToggle) and `SiteFooter` (db-ip link, curl lines with `baseUrl`, Docs link, built-by + version link) server components, used by both `app/page.tsx` and `app/docs/page.tsx`.

- [ ] **Step 1: Create `components/ui/SiteHeader.tsx`**

```tsx
import ThemeToggle from '@/components/ui/ThemeToggle';

export default function SiteHeader() {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-dot" aria-hidden="true" />
        <span className="brand-name">echo</span>
        <span className="brand-tag">what the internet sees when you connect</span>
      </div>
      <ThemeToggle />
    </header>
  );
}
```

- [ ] **Step 2: Create `components/ui/SiteFooter.tsx`**

```tsx
import { getVersion } from '@/lib/version';

const defaultSiteUrl = 'https://echo.johansen.foo';

export default function SiteFooter() {
  const baseUrl = process.env.APP_URL || defaultSiteUrl;
  const appVersion = getVersion();
  return (
    <footer>
      <p>
        echo — IP + geo lookup. Data via{' '}
        <a href="https://db-ip.com/" target="_blank" rel="noreferrer">
          db-ip
        </a>{' '}
        (CC BY 4.0).
      </p>
      <p>
        <code>curl {baseUrl}/api/ip</code> · <code>curl {baseUrl}/api/json</code> ·{' '}
        <a href="/docs" rel="noreferrer">Docs</a>
      </p>
      <p>
        Built with{' '}
        <span title="Love" aria-hidden="true">❤️</span>{' '}&{' '}
        <span title="AI" aria-hidden="true">🤖</span> by{' '}
        <a href="https://johansen.foo/" target="_blank" rel="noreferrer">
          Morten Johansen
        </a>{' '}
        (
        <a href="https://github.com/mojoaar/echo" target="_blank" rel="noreferrer">
          v{appVersion}
        </a>
        )
      </p>
    </footer>
  );
}
```

- [ ] **Step 3: Modify `app/page.tsx` to use the shared components**

Replace the inline `<header className="topbar">…</header>` block (currently lines 182-189) with `<SiteHeader />`. Replace the inline `<footer>…</footer>` block (currently lines 270-299) with `<SiteFooter />`. Add the import lines:

```tsx
import SiteFooter from '@/components/ui/SiteFooter';
import SiteHeader from '@/components/ui/SiteHeader';
```

Remove the now-unused `import ThemeToggle from '@/components/ui/ThemeToggle';` and `import { getVersion } from '@/lib/version';` plus the module-level `const appVersion = getVersion();` if no longer referenced. Keep the `const baseUrl = process.env.APP_URL || defaultSiteUrl;` only if still referenced elsewhere in the page (the jsonLd block uses `baseUrl` — verify with grep after the edit).

Run: `grep -n "baseUrl\|appVersion\|ThemeToggle\|getVersion" app/page.tsx`
Expected: `baseUrl` still appears in the jsonLd block; `ThemeToggle`, `getVersion`, `appVersion` no longer appear (they now live in the shared components).

- [ ] **Step 4: Verify**

Run: `npm run lint`
Expected: exit 0.

Run: `npx next build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/ui/SiteHeader.tsx components/ui/SiteFooter.tsx app/page.tsx
git commit -m "feat: share site chrome and link docs from the footer"
```

---

### Task 7: Add /docs to the sitemap and slim the README

**Files:**
- Modify: `app/sitemap.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: `/docs` indexed in `sitemap.xml`; a slim README pointing to `/docs`.

- [ ] **Step 1: Modify `app/sitemap.ts`**

```ts
import type { MetadataRoute } from 'next';

const siteUrl = process.env.APP_URL ?? 'https://echo.johansen.foo';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/docs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];
}
```

- [ ] **Step 2: Replace `README.md` with a slim pointer**

Read the current README first, then write the following (keep the full env/API/deployment detail on `/docs`):

```markdown
# echo

See exactly what the internet sees when you connect: your IP address, location, ISP
and more — plus WHOIS, DNS and connectivity diagnostics.

## Features

- Server-side IP + geo lookup with bundled data (no client-side geo calls)
- Lookup any IP with `?ip=`, shareable links, copy as JSON
- On-demand WHOIS/RDAP and forward DNS resolution
- Optional IPv4/IPv6 connectivity diagnostic
- Aggregate-only public statistics (raw IPs stay private)
- Private `/admin` dashboard with resource sampling
- Rate limited public API, SQLite storage, hardened Docker image
- Light and dark theme, PWA support, Umami analytics

## Documentation

Full documentation — usage, API reference, environment variables, deployment,
Nginx Proxy Manager setup and releasing — lives at
**[https://echo.johansen.foo/docs](https://echo.johansen.foo/docs)**
(or `/docs` on your own deployment).

## Tech stack

Next.js 16 (App Router), TypeScript, better-sqlite3, mmdb-lib, tz-lookup,
Vitest, Playwright, Docker.

## Quick start

```bash
npm install
npm run fetch:mmdb
npm run dev
```

```bash
npm test
npm run lint
```

## Deploying

Images are published to GitHub Container Registry. Copy `docker-compose.yml` to
your host, configure a `.env`, then:

```bash
docker compose pull
docker compose up -d
```

See the docs for full deployment and reverse-proxy guidance.

## Data

Geo data via [db-ip](https://db-ip.com/) (CC BY 4.0).

## License

MIT © 2026 Morten Johansen (johansen.foo)
```

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: exit 0.

Run: `grep -c "docs" README.md`
Expected: at least 3 (the pointer plus the quick-start link).

- [ ] **Step 4: Commit**

```bash
git add app/sitemap.ts README.md
git commit -m "docs: slim the readme into a pointer to the docs page"
```

---

### Task 8: Add browser coverage for the docs page

**Files:**
- Create: `e2e/docs.spec.ts`
- Modify: `playwright.config.ts` (add `docs\.spec\.ts` to the `desktop-chromium` and `mobile-safari` projects' `testMatch`)

**Interfaces:**
- Consumes: the `/docs` route (Task 5) and the footer Docs link (Task 6).
- Produces: Playwright coverage that runs in the existing `desktop-chromium` and `mobile-safari` projects.

- [ ] **Step 1: Modify `playwright.config.ts`**

Change the two `testMatch` lines:

```ts
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /home\.spec\.ts|api\.spec\.ts|docs\.spec\.ts/,
```

```ts
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      testMatch: /mobile\.spec\.ts|docs\.spec\.ts/,
```

- [ ] **Step 2: Create `e2e/docs.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

test('renders the docs page with sidebar navigation and endpoint cards', async ({ page }) => {
  await page.goto('/docs');
  await expect(page.getByRole('heading', { name: 'Documentation' })).toBeVisible();
  await expect(page.locator('.docs-sidebar')).toBeVisible();
  await expect(page.locator('.docs-content')).toBeVisible();
  await expect(page.locator('.endpoint').first()).toBeVisible();
});

test('sidebar anchors navigate to the matching sections', async ({ page }) => {
  await page.goto('/docs');
  await page.locator('.docs-nav-link', { hasText: '/api/json' }).click();
  await expect(page.locator('#api-json')).toBeVisible();
});

test('applies syntax highlighting to code blocks', async ({ page }) => {
  await page.goto('/docs');
  await expect(page.locator('.hljs').first()).toBeVisible();
});

test('theme toggle re-colors the highlighted code', async ({ page }) => {
  await page.goto('/docs');
  const toggle = page.getByRole('button', { name: 'Toggle light and dark mode' });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.hljs').first()).toBeVisible();
});

test('home footer links to the docs page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Docs', exact: true }).click();
  await expect(page).toHaveURL(/\/docs$/);
});
```

- [ ] **Step 3: Run the docs browser suite**

Run: `npx playwright test e2e/docs.spec.ts --project=desktop-chromium`
Expected: 5 passed. Existing service-worker-blocked warnings are known.

Run: `npx playwright test e2e/docs.spec.ts --project=mobile-safari`
Expected: 5 passed.

- [ ] **Step 4: Add the changelog entry**

Append under `## [Unreleased]` → `### Added` in `CHANGELOG.md`:

```markdown
- Public `/docs` page with usage, API reference, environment variables and deployment notes
```

- [ ] **Step 5: Full verification**

Run:
```bash
npm run lint
npm test
npm run coverage
git diff --check
```

Expected: lint exit 0; all unit tests pass (known Vite deprecation warning only); coverage above thresholds (statements/lines/functions 80%, branches 70%); `git diff --check` clean.

- [ ] **Step 6: Commit**

```bash
git add e2e/docs.spec.ts playwright.config.ts CHANGELOG.md
git commit -m "test: cover the public docs page in the browser"
```

---

## Self-Review vs. Spec

**Spec coverage:**
- `/docs` single-page server component — Task 5.
- Sticky sidebar grouped anchors + content column — Tasks 4 & 5.
- highlight.js pinned self-hosted + theme + no CSP change — Tasks 2, 3.
- DocsHighlight island injects assets + `highlightAll()` — Task 3.
- Shared SiteHeader/SiteFooter + footer Docs link — Task 6.
- sitemap `/docs` entry — Task 7.
- README slimmed to pointer — Task 7.
- e2e/docs.spec.ts desktop + mobile — Task 8.
- Not a lookup / no activity / no rate limit / no DB writes — enforced by construction (page performs no imports from lib/activity, lib/ratelimit, lib/db).
- Method badges GET/POST/PUT/DEL — Task 4/5 (badges for GET endpoints; classes defined for all four).
- No code comments — all snippets above are comment-free.
- Preserve unrelated generated files — enforced by explicit `git add <paths>` in every commit step.

**Placeholder scan:** No TBD/TODO/placeholder content; every step contains exact code.

**Type consistency:** `DocsHighlight` default export matches Task 5 import; `SiteHeader`/`SiteFooter` default exports match both pages; `getVersion` imported in SiteFooter; `ThemeToggle` imported in SiteHeader; `Endpoint`/`Code`/`NavGroup`/`MethodBadge` are file-local in `app/docs/page.tsx` and used consistently.
