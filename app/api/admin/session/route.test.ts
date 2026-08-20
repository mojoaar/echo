import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminSession } from '@/lib/admin-auth';
import { resetRateLimiter } from '@/lib/ratelimit';
import { GET } from './route';

const originalAdminToken = process.env.ADMIN_TOKEN;
const originalSessionTtl = process.env.ADMIN_SESSION_TTL_SECONDS;
const originalAdminSessionMax = process.env.RATE_LIMIT_ADMIN_SESSION_MAX;

afterEach(() => {
  if (originalAdminToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = originalAdminToken;
  if (originalSessionTtl === undefined) delete process.env.ADMIN_SESSION_TTL_SECONDS;
  else process.env.ADMIN_SESSION_TTL_SECONDS = originalSessionTtl;
  if (originalAdminSessionMax === undefined) delete process.env.RATE_LIMIT_ADMIN_SESSION_MAX;
  else process.env.RATE_LIMIT_ADMIN_SESSION_MAX = originalAdminSessionMax;
  resetRateLimiter();
  vi.useRealTimers();
});

describe('GET /api/admin/session', () => {
  it('returns 404 without a valid session or when admin is disabled', async () => {
    delete process.env.ADMIN_TOKEN;
    const disabled = await GET(new Request('https://echo.test/api/admin/session'));
    process.env.ADMIN_TOKEN = 'admin-secret';
    const missing = await GET(new Request('https://echo.test/api/admin/session'));

    expect(disabled.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(disabled.headers.get('cache-control')).toBe('no-store');
  });

  it('returns minimal authenticated state for a valid session and no token data', async () => {
    process.env.ADMIN_TOKEN = 'admin-secret';
    const response = await GET(new Request('https://echo.test/api/admin/session', {
      headers: { cookie: `echo_admin_session=${createAdminSession()}` },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects expired sessions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    process.env.ADMIN_TOKEN = 'admin-secret';
    process.env.ADMIN_SESSION_TTL_SECONDS = '1';
    const session = createAdminSession();
    vi.setSystemTime(new Date('2026-08-20T12:00:01.001Z'));
    const response = await GET(new Request('https://echo.test/api/admin/session', {
      headers: { cookie: `echo_admin_session=${session}` },
    }));

    expect(response.status).toBe(404);
  });

  it('rejects malformed cookie encoding as a not-found response', async () => {
    process.env.ADMIN_TOKEN = 'admin-secret';
    const response = await GET(new Request('https://echo.test/api/admin/session', {
      headers: { cookie: 'echo_admin_session=%invalid' },
    }));

    expect(response.status).toBe(404);
  });

  it('rate limits missing, invalid, and malformed sessions without changing their not-found response', async () => {
    process.env.ADMIN_TOKEN = 'admin-secret';
    process.env.RATE_LIMIT_ADMIN_SESSION_MAX = '1';
    const headers = { 'x-real-ip': '203.0.113.20' };

    const missing = await GET(new Request('https://echo.test/api/admin/session', { headers }));
    const invalid = await GET(new Request('https://echo.test/api/admin/session', {
      headers: { ...headers, cookie: 'echo_admin_session=invalid' },
    }));
    resetRateLimiter();
    const malformed = await GET(new Request('https://echo.test/api/admin/session', {
      headers: { ...headers, cookie: 'echo_admin_session=%invalid' },
    }));
    const malformedLimited = await GET(new Request('https://echo.test/api/admin/session', {
      headers: { ...headers, cookie: 'echo_admin_session=%invalid' },
    }));

    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(429);
    expect(malformed.status).toBe(404);
    expect(malformedLimited.status).toBe(429);
  });

  it('does not consume the session limiter while admin is disabled', async () => {
    process.env.RATE_LIMIT_ADMIN_SESSION_MAX = '1';
    const headers = { 'x-real-ip': '203.0.113.21' };
    delete process.env.ADMIN_TOKEN;
    const disabled = await GET(new Request('https://echo.test/api/admin/session', { headers }));
    process.env.ADMIN_TOKEN = 'admin-secret';
    const firstEnabled = await GET(new Request('https://echo.test/api/admin/session', { headers }));
    const secondEnabled = await GET(new Request('https://echo.test/api/admin/session', { headers }));

    expect(disabled.status).toBe(404);
    expect(firstEnabled.status).toBe(404);
    expect(secondEnabled.status).toBe(429);
  });
});
