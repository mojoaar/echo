# Echo Admin Dashboard Design

## Goal

Add a private, server-rendered `/admin` dashboard for monitoring successful visitor activity and Echo container resources without exposing administrative data publicly or adding a Docker-host dependency.

## Scope And Decisions

- Admin route: `/admin`.
- Authentication secret: `ADMIN_TOKEN`, separate from `STATS_TOKEN`.
- If `ADMIN_TOKEN` is unset, `/admin` and all admin APIs respond with `404` and reveal no administrative capability.
- Session lifetime defaults to eight hours and is configured with `ADMIN_SESSION_TTL_SECONDS`, default `28800`.
- Login uses a server-rendered form and `POST /api/admin/login`.
- Successful login creates a signed opaque `HttpOnly` session cookie. The token is never placed in a URL, local storage, rendered HTML, or API response.
- Cookies use `Secure`, `SameSite=Strict`, and an appropriate restrictive path. Logout invalidates the session.
- Changing `ADMIN_TOKEN` invalidates existing sessions.
- Failed logins are rate-limited independently from public lookup endpoints.
- The dashboard may display exact visitor IPs. Public aggregate history remains unchanged and privacy-safe.
- Metrics use the term `unique IPs`, never unique people.
- Date views are daily/24-hour, weekly/7-day, monthly/30-day, and custom range.
- Date calculations use the container-configured `TZ`, not the browser timezone.
- Ranges cannot exceed `LOOKUP_RETENTION_DAYS`; future dates are rejected or clamped to the available retained range.
- The implementation remains inside the Echo container, uses the existing SQLite volume, and does not mount the Docker socket or elevate privileges.
- Source files remain comment-free, matching the project constraint.

## Architecture

The dashboard is a Next.js server-rendered route with small client components only for login submission, date controls, filtering, pagination, charts, and logout. Authentication and data access stay server-side. Admin APIs return `no-store` responses, use same-origin behavior, do not enable CORS, and require the signed session cookie except for login.

The existing `lookups` table remains unchanged for compatibility. New visitor activity is recorded in a separate `activity_events` table with explicit attribution fields. Existing rows cannot be reconstructed reliably, so the dashboard presents them as `legacy/unclassified` rather than inventing source, actor, or outcome values.

Resource sampling is an in-process service started only when `ADMIN_TOKEN` is configured. It samples the Echo container every five minutes and stores bounded history in `resource_samples`. It reads cgroup and filesystem information available inside the container, never the Docker host. CPU may be unavailable for the first sample because a delta is required; the UI reports that state honestly. Uptime resets when the container restarts.

## Activity Model

### Successful Activity

Only successfully completed lookup activity is counted. Invalid input, failed requests, timeouts, and rate-limited requests do not create visitor activity. Partial-success page, WHOIS, and DNS operations may count with an explicit partial outcome.

Each new event records:

- Exact visitor IP.
- Country code.
- Timestamp in epoch milliseconds.
- Lookup type: `page`, `geo`, `ip`, `whois`, or `dns`.
- Channel: `ui`, `api`, or `unknown`.
- Actor: `browser`, `bot`, or `unknown`, based on a documented User-Agent heuristic.
- Target IP or hostname when applicable.
- Outcome: successful or partial.
- A result/partial indicator suitable for filtering and summary counts.

The following are excluded: health checks, admin requests, static assets, `/api/history`, and `/api/stats`. Admin requests never become visitor activity. Bot classification is heuristic and is labeled as such in the dashboard documentation.

### Storage

Add an idempotent `activity_events` table without changing `lookups`:

- `id` integer primary key.
- `ip` text not null.
- `iso` nullable text.
- `ts` integer not null.
- `lookup_type` text not null.
- `channel` text not null.
- `actor` text not null.
- `target` nullable text.
- `outcome` text not null.
- `partial` integer not null.

Add indexes supporting time-range queries and the dashboard breakdowns: timestamp, lookup type, channel, actor, and IP. Activity retention follows `LOOKUP_RETENTION_DAYS` and is pruned using the existing retention configuration.

## Resource And Storage Monitoring

When `ADMIN_TOKEN` is set, sample every five minutes and retain 30 days independently from visitor activity retention. Store:

- CPU percentage, with unavailable state until a valid two-sample delta exists.
- Memory used and memory limit.
- Persistent `/data` usage.
- `echo.db`, `echo.db-wal`, and `echo.db-shm` sizes.
- Other `/data` usage.
- Database row counts.
- Container uptime and local timestamp in configured `TZ`.
- Sampler status and last successful sample.
- Optional `ECHO_IMAGE_SIZE_BYTES` deployment value.

The root filesystem is read-only and is not presented as a changing storage metric. Exact image size is not queried from inside the container because that would require Docker-host access. Resource samples are pruned by timestamp and the sampler must not run when `ADMIN_TOKEN` is unset.

## Authentication And Routes

Implement these routes:

- `POST /api/admin/login`: accepts the login form token, validates `ADMIN_TOKEN`, applies failed-login rate limiting, and sets the signed opaque session cookie on success.
- `POST /api/admin/logout`: requires a valid session and clears it.
- `GET /api/admin/session`: requires a valid session and returns minimal authenticated state, never the token.
- `GET /api/admin/activity`: requires a valid session; accepts the selected date range, filters, and pagination; returns summaries and detailed private events.
- `GET /api/admin/resources`: requires a valid session; returns current resource values, sampler state, and bounded resource history.

All admin responses use `Cache-Control: no-store`, no CORS, and non-indexable behavior. Missing configuration, invalid sessions, and invalid credentials use indistinguishable `404` responses where capability discovery would otherwise be possible. Login failures never disclose whether the secret is configured.

Session signing uses a server-only key derived from the configured admin secret and a fixed purpose string. The cookie payload is opaque and includes an expiry; verification rejects expired or malformed values. Rotating `ADMIN_TOKEN` changes the signing material and invalidates prior sessions. Login and admin endpoints do not write visitor activity.

## Dashboard UX

`/admin` renders a login screen when no valid session exists and the dashboard after authentication. The dashboard includes:

- Logout control.
- Daily/24-hour, weekly/7-day, monthly/30-day, and custom date-range controls.
- Total successful events and `unique IPs` summaries.
- Breakdown by lookup type, channel, actor, country, outcome, and partial status.
- Paginated and filterable private activity table with exact IP, country, timestamp, lookup type, channel, actor, target, and outcome.
- Explicit `legacy/unclassified` treatment for rows from the old `lookups` table.
- Resource cards for CPU, memory, `/data`, database/WAL/SHM, row counts, uptime, and sampler status.
- Bounded 30-day charts for resource history and activity trends.
- Local container timestamps and the configured timezone displayed clearly.
- Honest unavailable, empty, partial, expired-session, and sampler-not-ready states.

The UI uses the existing visual language and mobile-friendly 44px controls. No client-side geo calls or cookies are introduced beyond the admin session cookie.

## Data And Error Contracts

Admin activity queries operate against the container timezone and retained data boundary. The API validates date ranges, filters, sort values, and pagination before querying SQLite. Queries use parameter binding and bounded limits.

Responses distinguish authentication failure, invalid range/filter input, empty results, expired sessions, unavailable resources, and internal database failure without leaking paths, tokens, SQL, or exception details. Operational logs are structured and redacted; they do not contain admin tokens, full IPs, or activity payloads.

Existing public `/api/stats` behavior remains available through `STATS_TOKEN`; the new dashboard uses `ADMIN_TOKEN` and does not weaken or merge the two authentication surfaces.

## Verification

### Authentication

- Disabled admin configuration returns `404` for the page and every admin API.
- Wrong and missing login tokens are indistinguishable and rate-limited.
- Successful login sets `HttpOnly`, `Secure`, `SameSite=Strict`, restrictive path, and expiry attributes.
- Session endpoint never returns the token.
- Logout clears the cookie and invalidates access.
- Expired sessions and `ADMIN_TOKEN` rotation invalidate access.

### Activity

- Successful page, geo, IP, WHOIS, and DNS activity records the correct type.
- UI/API/unknown channels and browser/bot/unknown actor heuristics are recorded.
- Exact IP, country, target, timestamp, partial, and outcome fields are preserved.
- Invalid, failed, timed-out, rate-limited, health, admin, static, history, and stats requests do not create activity events.
- Legacy lookup rows remain visible as `legacy/unclassified`.
- Date boundaries, future dates, retention cutoff, custom ranges, unique IP counts, empty data, and pagination are deterministic.

### Resources

- Sampling is disabled without `ADMIN_TOKEN`.
- CPU first-sample unavailability, cgroup fallbacks, memory, filesystem, SQLite/WAL/SHM sizing, row counts, and configured timezone are covered.
- Five-minute sampling and 30-day pruning are covered.
- Uptime resets after process/container restart.
- Optional image-size configuration is displayed without requiring Docker socket access.

### Browser And Delivery

- Desktop and mobile Playwright coverage covers login, logout, range controls, activity filters, tables, resource cards, charts, expired sessions, and responsive layout.
- Existing unit, typecheck, coverage, Docker, security scan, and CI checks remain green.
- Admin routes are verified as no-store, noindex, same-origin, and non-CORS.
- The production container remains non-root, read-only, and free of Docker-host mounts.
