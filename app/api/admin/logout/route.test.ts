import { afterEach, describe, expect, it } from 'vitest';
import { createAdminSession } from '@/lib/admin-auth';
import { POST } from './route';
import { resetRateLimiter } from '@/lib/ratelimit';

const originalAdminToken = process.env.ADMIN_TOKEN;

afterEach(() => {
  if (originalAdminToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = originalAdminToken;
});

describe('POST /api/admin/logout', () => {
  it('returns disabled 404 before consuming the session limiter', async () => {
    process.env.RATE_LIMIT_ADMIN_SESSION_MAX = '1';
    resetRateLimiter();
    const headers = { 'x-real-ip': '203.0.113.24' };
    delete process.env.ADMIN_TOKEN;
    const disabled = await POST(new Request('https://echo.test/api/admin/logout', { method: 'POST', headers }));
    process.env.ADMIN_TOKEN = 'admin-secret';
    const firstEnabled = await POST(new Request('https://echo.test/api/admin/logout', { method: 'POST', headers }));
    const secondEnabled = await POST(new Request('https://echo.test/api/admin/logout', { method: 'POST', headers }));

    expect(disabled.status).toBe(404);
    expect(firstEnabled.status).toBe(404);
    expect(secondEnabled.status).toBe(429);
    delete process.env.RATE_LIMIT_ADMIN_SESSION_MAX;
    resetRateLimiter();
  });

  it('requires an active admin session', async () => {
    process.env.ADMIN_TOKEN = 'admin-secret';
    const response = await POST(new Request('https://echo.test/api/admin/logout'));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('clears the session cookie with matching security attributes', async () => {
    process.env.ADMIN_TOKEN = 'admin-secret';
    const response = await POST(new Request('https://echo.test/api/admin/logout', {
      headers: { cookie: `echo_admin_session=${createAdminSession()}` },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false });
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('set-cookie')).toBe(
      'echo_admin_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict',
    );

    const afterLogout = await (await import('@/app/api/admin/session/route')).GET(new Request('https://echo.test/api/admin/session', {
      headers: { cookie: `echo_admin_session=${createAdminSession()}` },
    }));
    expect(afterLogout.status).toBe(200);
  });

  it('invalidates the exact logged-out session server-side', async () => {
    process.env.ADMIN_TOKEN = 'admin-secret';
    const session = createAdminSession();
    const response = await POST(new Request('https://echo.test/api/admin/logout', {
      headers: { cookie: `echo_admin_session=${session}` },
    }));

    expect(response.status).toBe(200);
    const sessionResponse = await (await import('@/app/api/admin/session/route')).GET(new Request('https://echo.test/api/admin/session', {
      headers: { cookie: `echo_admin_session=${session}` },
    }));
    expect(sessionResponse.status).toBe(404);
  });
});
