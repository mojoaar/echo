import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminSession } from '@/lib/admin-auth';
import { GET } from './route';

const originalAdminToken = process.env.ADMIN_TOKEN;
const originalSessionTtl = process.env.ADMIN_SESSION_TTL_SECONDS;

afterEach(() => {
  if (originalAdminToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = originalAdminToken;
  if (originalSessionTtl === undefined) delete process.env.ADMIN_SESSION_TTL_SECONDS;
  else process.env.ADMIN_SESSION_TTL_SECONDS = originalSessionTtl;
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
});
