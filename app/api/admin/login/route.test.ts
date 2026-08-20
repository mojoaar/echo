import { afterEach, describe, expect, it } from 'vitest';
import { POST } from './route';
import { resetRateLimiter } from '@/lib/ratelimit';

const originalAdminToken = process.env.ADMIN_TOKEN;
const originalAdminLoginMax = process.env.RATE_LIMIT_ADMIN_LOGIN_MAX;

afterEach(() => {
  if (originalAdminToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = originalAdminToken;
  if (originalAdminLoginMax === undefined) delete process.env.RATE_LIMIT_ADMIN_LOGIN_MAX;
  else process.env.RATE_LIMIT_ADMIN_LOGIN_MAX = originalAdminLoginMax;
  resetRateLimiter();
});

function request(token: string | null, headers?: Record<string, string>) {
  const body = token === null ? '' : new URLSearchParams({ token }).toString();
  return new Request('https://echo.test/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body,
  });
}

describe('POST /api/admin/login', () => {
  it('returns an indistinguishable no-store 404 when admin is disabled or the token is wrong', async () => {
    delete process.env.ADMIN_TOKEN;
    const disabled = await POST(request('wrong'));
    process.env.ADMIN_TOKEN = 'correct-token';
    const wrong = await POST(request('wrong'));

    expect(disabled.status).toBe(404);
    expect(wrong.status).toBe(404);
    expect(await disabled.json()).toEqual({ error: 'not found', code: 'not_found' });
    expect(await wrong.json()).toEqual({ error: 'not found', code: 'not_found' });
    expect(disabled.headers.get('cache-control')).toBe('no-store');
    expect(disabled.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(disabled.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('sets only an opaque secure session cookie on successful form login', async () => {
    process.env.ADMIN_TOKEN = 'correct-token';
    const response = await POST(request('correct-token'));
    const body = response.clone();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('set-cookie')).toMatch(
      /^echo_admin_session=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; Max-Age=28800; Path=\/; HttpOnly; Secure; SameSite=Strict$/,
    );
    expect(await response.json()).toEqual({ authenticated: true });
    expect(JSON.stringify(await body.json())).not.toContain('correct-token');
  });

  it('uses the configured session lifetime in the cookie', async () => {
    process.env.ADMIN_TOKEN = 'correct-token';
    process.env.ADMIN_SESSION_TTL_SECONDS = '120';
    const response = await POST(request('correct-token'));

    expect(response.headers.get('set-cookie')).toContain('Max-Age=120');
  });

  it('rate limits failed logins by trusted visitor identity without querying the database', async () => {
    process.env.ADMIN_TOKEN = 'correct-token';
    process.env.RATE_LIMIT_ADMIN_LOGIN_MAX = '1';
    const headers = { 'x-real-ip': '203.0.113.9' };
    const first = await POST(request('wrong', headers));
    const second = await POST(request('wrong', headers));

    expect(first.status).toBe(404);
    expect(second.status).toBe(429);
    expect(second.headers.get('cache-control')).toBe('no-store');
    expect(second.headers.get('x-ratelimit-limit')).toBe('1');
    expect(second.headers.get('retry-after')).toMatch(/^\d+$/);
  });

  it('does not consume the failed-login limiter while admin is disabled', async () => {
    delete process.env.ADMIN_TOKEN;
    process.env.RATE_LIMIT_ADMIN_LOGIN_MAX = '1';
    const headers = { 'x-real-ip': '203.0.113.10' };

    const disabled = await POST(request('wrong', headers));
    process.env.ADMIN_TOKEN = 'correct-token';
    const firstEnabledFailure = await POST(request('wrong', headers));
    const secondEnabledFailure = await POST(request('wrong', headers));

    expect(disabled.status).toBe(404);
    expect(firstEnabledFailure.status).toBe(404);
    expect(secondEnabledFailure.status).toBe(429);
  });
});
