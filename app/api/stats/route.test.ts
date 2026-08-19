import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb, insertLookup } from '@/lib/db';
import * as db from '@/lib/db';
import { resetRateLimiter } from '@/lib/ratelimit';
import { GET } from './route';

describe('GET /api/stats', () => {
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-stats-'));
    initDb(join(dir, 'test.db'));
    insertLookup('8.8.8.8', 'US');
    insertLookup('1.1.1.1', 'AU');
  });

  afterAll(() => {
    delete process.env.STATS_TOKEN;
    resetRateLimiter();
    closeDb();
  });

  it('returns 404 when STATS_TOKEN is not set', async () => {
    delete process.env.STATS_TOKEN;
    const res = await GET(new Request('http://localhost/api/stats?token=x'));
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-ratelimit-limit')).toBeTruthy();
    expect(res.headers.get('x-ratelimit-remaining')).toBeTruthy();
    expect(await res.json()).toEqual({ error: 'not found', code: 'not_found' });
  });

  it('returns the same 404 for missing and wrong credentials', async () => {
    process.env.STATS_TOKEN = 'secret-value';
    const missing = await GET(new Request('http://localhost/api/stats'));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not found', code: 'not_found' });
    const wrong = await GET(new Request('http://localhost/api/stats?token=wrong'));
    expect(wrong.status).toBe(404);
    expect(await wrong.json()).toEqual({ error: 'not found', code: 'not_found' });
  });

  it('throttles invalid credentials before querying the database', async () => {
    const originalMax = process.env.RATE_LIMIT_STATS_AUTH_MAX;
    process.env.STATS_TOKEN = 'secret-value';
    process.env.RATE_LIMIT_STATS_AUTH_MAX = '1';
    resetRateLimiter();
    const countLookups = vi.spyOn(db, 'countLookups');
    const countSince = vi.spyOn(db, 'countSince');
    const topCountryCodes = vi.spyOn(db, 'topCountryCodes');
    const topIps = vi.spyOn(db, 'topIps');
    const dailyCounts = vi.spyOn(db, 'dailyCounts');
    try {
      const request = () =>
        new Request('http://localhost/api/stats?token=wrong', {
          headers: { 'x-real-ip': '203.0.113.7' },
        });
      const first = await GET(request());
      const second = await GET(request());
      expect(first.status).toBe(404);
      expect(second.status).toBe(429);
      expect(second.headers.get('x-ratelimit-limit')).toBe('1');
      expect(second.headers.get('x-ratelimit-remaining')).toBe('0');
      expect(second.headers.get('retry-after')).toMatch(/^\d+$/);
      expect(countLookups).not.toHaveBeenCalled();
      expect(countSince).not.toHaveBeenCalled();
      expect(topCountryCodes).not.toHaveBeenCalled();
      expect(topIps).not.toHaveBeenCalled();
      expect(dailyCounts).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      resetRateLimiter();
      if (originalMax === undefined) {
        delete process.env.RATE_LIMIT_STATS_AUTH_MAX;
      } else {
        process.env.RATE_LIMIT_STATS_AUTH_MAX = originalMax;
      }
    }
  });

  it('returns aggregate stats for a valid query token', async () => {
    process.env.STATS_TOKEN = 'secret-value';
    const res = await GET(new Request('http://localhost/api/stats?token=secret-value'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(typeof body.last24h).toBe('number');
    expect(Array.isArray(body.topCountries)).toBe(true);
    expect(Array.isArray(body.topIps)).toBe(true);
    expect(Array.isArray(body.daily)).toBe(true);
    expect(body.topCountries.some((c: { iso: string }) => c.iso === 'US')).toBe(true);
  });

  it('accepts a bearer token header', async () => {
    process.env.STATS_TOKEN = 'secret-value';
    const res = await GET(
      new Request('http://localhost/api/stats', {
        headers: { authorization: 'Bearer secret-value' },
      })
    );
    expect(res.status).toBe(200);
  });

  it('returns a stable no-store internal error when authenticated database reads fail', async () => {
    process.env.STATS_TOKEN = 'secret-value';
    const count = vi.spyOn(db, 'countLookups').mockImplementation(() => {
      throw new Error('database unavailable');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await GET(new Request('http://localhost/api/stats', {
        headers: { authorization: 'Bearer secret-value', 'x-real-ip': '198.51.100.12' },
      }));
      expect(res.status).toBe(500);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-ratelimit-limit')).toBeNull();
      expect(await res.json()).toEqual({ error: 'internal server error', code: 'internal_error' });
      expect(error).toHaveBeenCalledTimes(1);
      expect(JSON.parse(error.mock.calls[0]?.[0] as string)).toEqual({
        category: 'database_read',
        endpoint: '/api/stats',
        status: 500,
        durationMs: expect.any(Number),
      });
      expect(error.mock.calls[0]?.[0]).not.toContain('database unavailable');
    } finally {
      count.mockRestore();
      error.mockRestore();
    }
  });

  it('prefers a valid bearer token over an invalid query token', async () => {
    process.env.STATS_TOKEN = 'secret-value';
    const res = await GET(
      new Request('http://localhost/api/stats?token=wrong', {
        headers: { authorization: 'Bearer secret-value' },
      }),
    );
    expect(res.status).toBe(200);
  });
});
