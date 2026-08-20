# Public /docs Endpoint Design

## Goal

Add a public `/docs` page that documents general usage and the full API reference, drawing layout inspiration from the iCloud Mailflow docs page while adhering to the echo app design template. Slim the README from 287 lines to a short pointer.

## Decisions

- **Single page with a sticky sidebar** of grouped anchor links (mailflow style), not multiple sub-pages.
- **Everything moves out of the README**: API reference, environment-variable table, deployment, Nginx Proxy Manager, connectivity probes, admin dashboard, releasing, data attribution. README keeps intro, features, tech stack, quick start, a `/docs` link, and Data/License.
- **highlight.js** for code blocks, self-hosted in `public/` (pinned build + theme CSS). No CSP changes: `script-src 'self'` already permits same-origin JS and `style-src` permits self-hosted CSS.
- **Entry point:** a `Docs` link in the home page footer only. Topbar unchanged.
- Docs is not a lookup: no activity events, no rate-limit usage, no DB writes. Umami applies via the global layout.

## Architecture

### New files

- `app/docs/page.tsx` — server-rendered single-page docs. `export const dynamic = 'force-dynamic'` (reads runtime `APP_URL` so curl examples reflect the deployed origin, consistent with the home page). Reuses the home topbar markup (`header.topbar` → brand-dot + `echo` + tag + `ThemeToggle`) and the home footer markup (curl lines, db-ip, version link) so `/docs` feels like the same site. Body: `.docs-wrap` with `.docs-sidebar` + `.docs-content`.
- `components/docs/DocsHighlight.tsx` — `'use client'` island. Dynamically injects `/highlight.min.js` (script) and `/hljs.css` (link) once (module-level promise singleton, same pattern as MapModal's `ensureLeaflet()`), then runs `hljs.highlightAll()` on mount. Renders nothing.
- `public/highlight.min.js` — pinned highlight.js browser build, committed to the repo (self-hosted, offline-safe, deterministic).
- `public/hljs.css` — highlight theme CSS scoped under `[data-theme='dark']` / `[data-theme='light']` so highlighting follows the existing theme toggle.
- `e2e/docs.spec.ts` — Playwright coverage (see Testing).

### Modified files

- `app/globals.css` — new docs section using existing design tokens: `.docs-wrap` (flex), `.docs-sidebar` (sticky, `--surface` bg, `--border` right edge, grouped uppercase h3 labels, muted→text hover links), `.docs-content` (flex 1, max-width 900px, padded), h2 sections with bottom border, tables (uppercase th, row separators), `<pre>` blocks, inline `code` chips, `.endpoint` cards with method badges (`GET`/`POST`/`PUT`/`DEL`), responsive collapse of the sidebar into a horizontal wrapping nav below 768px.
- `app/sitemap.ts` — add a `/docs` entry (public, indexable; `robots.ts` already allows `/`).
- `app/page.tsx` — footer gains a `Docs` link next to the curl examples.
- `README.md` — slimmed to intro, features, tech stack, quick start (dev/test commands), a prominent link to `/docs`, Data, and License.

## Content outline

Sidebar groups and anchor sections:

- **Getting Started**: Introduction · What echo does · Lookup any IP (`?ip=`) · Share links (`Copy link`) · Map and copy · Connectivity diagnostics · Privacy model
- **API Reference**: Overview (base URL, CORS, JSON error shape) · Rate limiting and errors · Endpoint cards for `/api/ip`, `/api/json`, `/api/whois`, `/api/dns`, `/api/history`, `/api/stats`, `/api/health`
- **Operations**: Environment variables (full table) · Deployment (compose + GHCR) · Nginx Proxy Manager · Connectivity probe deployment · Private admin dashboard · Releasing · Data and attribution

Endpoint cards follow the mailflow pattern: colored method badge, one-line description, curl example, response JSON. Curl examples interpolate the runtime `APP_URL`.

## Testing

- `e2e/docs.spec.ts` (Playwright, desktop + mobile): page loads; sidebar anchors navigate to sections; endpoint cards render; code blocks present; highlight.js applies (`.hljs` class present); theme toggle flips the highlight theme; home footer `Docs` link navigates to `/docs`.
- Existing unit/lint/coverage thresholds must remain green.
- Manual verification: `docker compose up -d --build`, `curl /docs` 200, browser check of sidebar scroll + highlighting, README diff review.

## Out of scope

- Multiple docs sub-pages.
- Shiki or server-side highlighting.
- Changing the topbar navigation.
- Any change to public API behavior, activity recording, or CSP.

## Constraints

- No code comments in any source file.
- Preserve unrelated generated worktree files: `next-env.d.ts`, `tsconfig.json`, `test-results/` — never stage or revert them.
- Only commit/push when requested.
