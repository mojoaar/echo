import { afterEach, describe, expect, it } from 'vitest';
import { createAdminSession } from '@/lib/admin-auth';
import { POST } from './route';

const originalAdminToken = process.env.ADMIN_TOKEN;

afterEach(() => {
  if (originalAdminToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = originalAdminToken;
});

describe('POST /api/admin/logout', () => {
  it('requires an active admin session', async () => {
    process.env.ADMIN_TOKEN = 'admin-secret';
    const response = await POST(new Request('https://echo.test/api/admin/logout'));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('clears the session cookie with matching security attributes', async () => {
    process.env.ADMIN_TOKEN = 'admin-secret';
    const response = await POST(new Request('https://echo.test/api/admin/logout', {
      headers: { cookie: `echo_admin_session=${createAdminSession()}` },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false });
    expect(response.headers.get('set-cookie')).toBe(
      'echo_admin_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict',
    );
  });
});
