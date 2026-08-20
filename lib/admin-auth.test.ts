import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminCookieOptions,
  adminNoStoreHeaders,
  adminNotFound,
  createAdminSession,
  isAdminEnabled,
  verifyAdminSession,
  verifyAdminToken,
} from '@/lib/admin-auth';

const originalAdminToken = process.env.ADMIN_TOKEN;
const originalSessionTtl = process.env.ADMIN_SESSION_TTL_SECONDS;

afterEach(() => {
  if (originalAdminToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = originalAdminToken;
  if (originalSessionTtl === undefined) delete process.env.ADMIN_SESSION_TTL_SECONDS;
  else process.env.ADMIN_SESSION_TTL_SECONDS = originalSessionTtl;
  vi.useRealTimers();
});

describe('admin authentication', () => {
  it('is disabled when ADMIN_TOKEN is unset or empty', () => {
    delete process.env.ADMIN_TOKEN;
    expect(isAdminEnabled()).toBe(false);
    expect(verifyAdminToken('anything')).toBe(false);

    process.env.ADMIN_TOKEN = '';
    expect(isAdminEnabled()).toBe(false);
    expect(verifyAdminToken('')).toBe(false);
  });

  it('compares login tokens exactly and rejects missing or incorrect values', () => {
    process.env.ADMIN_TOKEN = 'admin-secret';
    expect(verifyAdminToken('admin-secret')).toBe(true);
    expect(verifyAdminToken('admin-secret-2')).toBe(false);
    expect(verifyAdminToken(undefined)).toBe(false);
  });

  it('creates an opaque session that verifies with its configured expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    process.env.ADMIN_TOKEN = 'admin-secret';
    process.env.ADMIN_SESSION_TTL_SECONDS = '3600';

    const session = createAdminSession();
    expect(session).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(session).not.toContain('admin-secret');
    expect(verifyAdminSession(session)).toEqual({
      valid: true,
      expiresAt: Date.parse('2026-08-20T13:00:00.000Z'),
    });
  });

  it('uses the default TTL and rejects an expired session', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    process.env.ADMIN_TOKEN = 'admin-secret';
    delete process.env.ADMIN_SESSION_TTL_SECONDS;

    const session = createAdminSession();
    expect(verifyAdminSession(session)).toEqual({
      valid: true,
      expiresAt: Date.parse('2026-08-20T20:00:00.000Z'),
    });
    vi.setSystemTime(new Date('2026-08-20T20:00:00.001Z'));
    expect(verifyAdminSession(session)).toEqual({
      valid: false,
      expiresAt: Date.parse('2026-08-20T20:00:00.000Z'),
    });
  });

  it('falls back to the default TTL for invalid session TTL values', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    process.env.ADMIN_TOKEN = 'admin-secret';
    process.env.ADMIN_SESSION_TTL_SECONDS = '1.5';

    const session = createAdminSession();
    expect(verifyAdminSession(session).expiresAt).toBe(Date.parse('2026-08-20T20:00:00.000Z'));
  });

  it('rejects missing, malformed, tampered, and disabled sessions', () => {
    process.env.ADMIN_TOKEN = 'admin-secret';
    expect(verifyAdminSession(undefined)).toEqual({ valid: false, expiresAt: 0 });
    expect(verifyAdminSession('not-a-session')).toEqual({ valid: false, expiresAt: 0 });
    expect(verifyAdminSession('a.b.c')).toEqual({ valid: false, expiresAt: 0 });

    const session = createAdminSession();
    const separator = session.indexOf('.');
    const tampered = `${session.slice(0, separator + 1)}${session.slice(separator + 1, -1)}x`;
    expect(verifyAdminSession(tampered).valid).toBe(false);

    delete process.env.ADMIN_TOKEN;
    expect(verifyAdminSession(session)).toEqual({ valid: false, expiresAt: 0 });
  });

  it('invalidates sessions after ADMIN_TOKEN rotation', () => {
    process.env.ADMIN_TOKEN = 'first-secret';
    const session = createAdminSession();
    expect(verifyAdminSession(session).valid).toBe(true);

    process.env.ADMIN_TOKEN = 'rotated-secret';
    expect(verifyAdminSession(session)).toEqual({ valid: false, expiresAt: expect.any(Number) });
  });

  it('returns restrictive root-scoped cookie options', () => {
    expect(adminCookieOptions(3600)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 3600,
    });
  });

  it('provides indistinguishable no-store not-found responses', async () => {
    const response = adminNotFound();
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'not found', code: 'not_found' });
    expect(adminNoStoreHeaders()).toEqual({ 'cache-control': 'no-store' });
  });
});
