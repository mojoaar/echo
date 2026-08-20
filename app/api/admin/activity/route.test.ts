import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDb, getDb, initDb } from '@/lib/db';
import { createAdminSession } from '@/lib/admin-auth';
import * as activity from '@/lib/activity';
import { resetRateLimiter } from '@/lib/ratelimit';
import { GET } from './route';

let cookie = '';

beforeAll(() => {
  process.env.ADMIN_TOKEN = 'admin-secret';
  const dir = mkdtempSync(join(tmpdir(), 'echo-admin-activity-'));
  initDb(join(dir, 'test.db'));
  getDb().prepare(
    'INSERT INTO activity_events (ip, iso, ts, lookup_type, channel, actor, target, outcome, partial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run('203.0.113.10', 'US', Date.parse('2026-08-19T10:00:00Z'), 'dns', 'api', 'bot', 'example.com', 'success', 0);
  getDb().prepare(
    'INSERT INTO activity_events (ip, iso, ts, lookup_type, channel, actor, target, outcome, partial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run('203.0.113.11', 'DK', Date.parse('2026-08-19T11:00:00Z'), 'ip', 'ui', 'browser', null, 'partial', 1);
  cookie = `echo_admin_session=${createAdminSession()}`;
});

afterAll(() => {
  closeDb();
  delete process.env.ADMIN_TOKEN;
});

describe('GET /api/admin/activity', () => {
  it('requires authentication and never enables CORS', async () => {
    const response = await GET(new Request('https://echo.test/api/admin/activity'));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('does not consume the limiter while admin is disabled', async () => {
    const originalMax = process.env.RATE_LIMIT_ADMIN_SESSION_MAX;
    process.env.RATE_LIMIT_ADMIN_SESSION_MAX = '1';
    resetRateLimiter();
    const headers = { 'x-real-ip': '203.0.113.22' };
    delete process.env.ADMIN_TOKEN;
    const disabled = await GET(new Request('https://echo.test/api/admin/activity', { headers }));
    process.env.ADMIN_TOKEN = 'admin-secret';
    const firstEnabled = await GET(new Request('https://echo.test/api/admin/activity', { headers }));
    const secondEnabled = await GET(new Request('https://echo.test/api/admin/activity', { headers }));
    if (originalMax === undefined) delete process.env.RATE_LIMIT_ADMIN_SESSION_MAX;
    else process.env.RATE_LIMIT_ADMIN_SESSION_MAX = originalMax;

    expect(disabled.status).toBe(404);
    expect(firstEnabled.status).toBe(404);
    expect(secondEnabled.status).toBe(429);
  });

  it('validates dates, retention range, and filter values before querying', async () => {
    const invalidDate = await GET(new Request('https://echo.test/api/admin/activity?from=not-a-date', { headers: { cookie } }));
    const impossibleDate = await GET(new Request('https://echo.test/api/admin/activity?from=2026-02-30', { headers: { cookie } }));
    const future = await GET(new Request('https://echo.test/api/admin/activity?to=2999-01-01', { headers: { cookie } }));
    const invalidFilter = await GET(new Request('https://echo.test/api/admin/activity?type=unknown', { headers: { cookie } }));
    const tooWide = await GET(new Request('https://echo.test/api/admin/activity?from=2020-01-01&to=2026-08-20', { headers: { cookie } }));

    expect(invalidDate.status).toBe(400);
    expect(impossibleDate.status).toBe(400);
    expect(future.status).toBe(400);
    expect(invalidFilter.status).toBe(400);
    expect(tooWide.status).toBe(400);
    expect(await invalidDate.json()).toEqual({ error: 'invalid input', code: 'invalid_input' });
  });

  it('applies bounded filters and pagination to activity results', async () => {
    const response = await GET(new Request(
      'https://echo.test/api/admin/activity?from=2026-08-19&to=2026-08-19&type=dns&channel=api&actor=bot&country=us&outcome=success&ip=203.0.113.10&limit=1&offset=0',
      { headers: { cookie } },
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({ ip: '203.0.113.10', lookupType: 'dns', actor: 'bot' });
    expect(body.legacy).toEqual([]);
    expect(body.events[0].partial).toBe(false);
    expect(body.channels).toEqual([{ value: 'api', count: 1 }]);
    expect(body.actors).toEqual([{ value: 'bot', count: 1 }]);
    expect(body.outcomes).toEqual([{ value: 'success', count: 1 }]);
    expect(body.partials).toEqual([{ value: 'complete', count: 1 }]);
    expect(body.trend).toEqual([{ value: '2026-08-19', count: 1 }]);
  });

  it('accepts a zero limit as an empty page', async () => {
    const response = await GET(new Request('https://echo.test/api/admin/activity?limit=0', { headers: { cookie } }));

    expect(response.status).toBe(200);
    expect((await response.json()).events).toEqual([]);
  });

  it('returns a stable redacted internal error', async () => {
    const query = vi.spyOn(activity, 'queryActivity').mockImplementation(() => {
      throw new Error('database path and secret should not leak');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await GET(new Request('https://echo.test/api/admin/activity', { headers: { cookie } }));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'internal server error', code: 'internal_error' });
      expect(JSON.stringify(error.mock.calls)).not.toContain('database path');
    } finally {
      query.mockRestore();
      error.mockRestore();
    }
  });

  it('uses configured timezone boundaries across daylight-saving transitions', async () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    const query = vi.spyOn(activity, 'queryActivity').mockReturnValue({
      totalSuccessfulEvents: 0,
      uniqueIps: 0,
      countries: [],
      types: [],
      outcomes: [],
      channels: [],
      actors: [],
      partials: [],
      events: [],
      legacy: [],
      legacySummary: { count: 0, uniqueIps: 0 },
      trend: [],
    });
    try {
      const response = await GET(new Request(
        'https://echo.test/api/admin/activity?from=2026-03-08&to=2026-03-08',
        { headers: { cookie } },
      ));

      expect(response.status).toBe(200);
      expect(query).toHaveBeenCalledWith(expect.objectContaining({
        from: Date.parse('2026-03-08T05:00:00.000Z'),
        to: Date.parse('2026-03-09T03:59:59.999Z'),
      }));
    } finally {
      query.mockRestore();
      vi.useRealTimers();
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });
});
