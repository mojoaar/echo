import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDb, getDb, initDb } from '@/lib/db';
import { createAdminSession } from '@/lib/admin-auth';
import * as db from '@/lib/db';
import * as resources from '@/lib/resources';
import { resetRateLimiter } from '@/lib/ratelimit';
import { GET } from './route';

let cookie = '';

beforeAll(() => {
  process.env.ADMIN_TOKEN = 'admin-secret';
  const dir = mkdtempSync(join(tmpdir(), 'echo-admin-resources-'));
  initDb(join(dir, 'test.db'));
  getDb().prepare('INSERT INTO resource_samples (ts, cpu_percent, memory_used_bytes) VALUES (?, ?, ?)').run(Date.parse('2026-08-18T10:00:00Z'), 12.5, 100);
  getDb().prepare('INSERT INTO resource_samples (ts, cpu_percent, memory_used_bytes) VALUES (?, ?, ?)').run(Date.parse('2026-08-19T10:00:00Z'), 15.5, 120);
  cookie = `echo_admin_session=${createAdminSession()}`;
});

afterAll(() => {
  closeDb();
  delete process.env.ADMIN_TOKEN;
});

describe('GET /api/admin/resources', () => {
  it('returns disabled 404 before consuming the session limiter', async () => {
    process.env.RATE_LIMIT_ADMIN_SESSION_MAX = '1';
    resetRateLimiter();
    const headers = { 'x-real-ip': '203.0.113.23' };
    delete process.env.ADMIN_TOKEN;
    const disabled = await GET(new Request('https://echo.test/api/admin/resources', { headers }));
    process.env.ADMIN_TOKEN = 'admin-secret';
    const firstEnabled = await GET(new Request('https://echo.test/api/admin/resources', { headers }));
    const secondEnabled = await GET(new Request('https://echo.test/api/admin/resources', { headers }));

    expect(disabled.status).toBe(404);
    expect(firstEnabled.status).toBe(404);
    expect(secondEnabled.status).toBe(429);
    delete process.env.RATE_LIMIT_ADMIN_SESSION_MAX;
    resetRateLimiter();
  });

  it('returns sampler status and bounded history for an authenticated session', async () => {
    const response = await GET(new Request('https://echo.test/api/admin/resources?from=2026-08-18&to=2026-08-19', { headers: { cookie } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty('sampler');
    expect(body.sampler).toHaveProperty('enabled');
    expect(body.history).toHaveLength(2);
    expect(body.history[0]).toMatchObject({ cpuPercent: 15.5, memoryUsedBytes: 120 });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('rejects resource history ranges over 30 days and future dates', async () => {
    const tooWide = await GET(new Request('https://echo.test/api/admin/resources?from=2026-01-01&to=2026-02-01', { headers: { cookie } }));
    const future = await GET(new Request('https://echo.test/api/admin/resources?to=2999-01-01', { headers: { cookie } }));
    const nearFuture = await GET(new Request('https://echo.test/api/admin/resources?from=2026-08-20&to=2026-08-21', { headers: { cookie } }));

    expect(tooWide.status).toBe(400);
    expect(future.status).toBe(400);
    expect(nearFuture.status).toBe(400);
  });

  it('returns the latest current sample independently of the history range', async () => {
    const response = await GET(new Request(
      'https://echo.test/api/admin/resources?from=2026-08-18&to=2026-08-18',
      { headers: { cookie } },
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.current).toMatchObject({ cpuPercent: 15.5, memoryUsedBytes: 120 });
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({ cpuPercent: 12.5, memoryUsedBytes: 100 });
  });

  it('returns a stable redacted internal error', async () => {
    const read = vi.spyOn(db, 'getDb').mockImplementation(() => {
      throw new Error('private database path');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await GET(new Request('https://echo.test/api/admin/resources', { headers: { cookie } }));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'internal server error', code: 'internal_error' });
      expect(JSON.stringify(error.mock.calls)).not.toContain('private database path');
    } finally {
      read.mockRestore();
      error.mockRestore();
    }
  });

  it('does not expose internal sampler errors', async () => {
    const status = vi.spyOn(resources, 'getResourceSamplerStatus').mockReturnValue({
      enabled: true,
      running: false,
      lastSuccessTs: null,
      lastError: 'sample_failed',
    });
    try {
      const response = await GET(new Request('https://echo.test/api/admin/resources', { headers: { cookie } }));
      expect((await response.json()).sampler.lastError).toBe('sample_failed');
    } finally {
      status.mockRestore();
    }
  });
});
