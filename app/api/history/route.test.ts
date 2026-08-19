import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from './route';
import { closeDb, initDb, insertLookup } from '@/lib/db';
import { resetRateLimiter } from '@/lib/ratelimit';
import * as db from '@/lib/db';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('GET /api/history', () => {
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-hist-'));
    initDb(join(dir, 'test.db'));
  });

  afterAll(() => {
    resetRateLimiter();
    closeDb();
  });

  it('returns aggregate lookup stats', async () => {
    insertLookup('8.8.8.8', 'US');
    insertLookup('1.1.1.1', 'AU');
    await sleep(5);
    insertLookup('9.9.9.9', 'US');
    const res = await GET(
      new Request('http://localhost/api/history', { headers: { 'x-real-ip': '203.0.113.5' } })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('x-ratelimit-limit')).toBeTruthy();
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(Object.prototype.hasOwnProperty.call(body, 'ip')).toBe(false);
    expect(Array.isArray(body.topCountries)).toBe(true);
    const us = body.topCountries.find((c: { iso: string; count: number }) => c.iso === 'US');
    expect(us.count).toBe(2);
  });

  it('rate limits when exceeding the cap', async () => {
    process.env.RATE_LIMIT_MAX = '1';
    resetRateLimiter();
    const first = await GET(
      new Request('http://localhost/api/history', { headers: { 'x-real-ip': '198.51.100.9' } })
    );
    expect(first.status).toBe(200);
    const second = await GET(
      new Request('http://localhost/api/history', { headers: { 'x-real-ip': '198.51.100.9' } })
    );
    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).toBeTruthy();
    expect(await second.json()).toEqual({ error: 'rate limit exceeded', code: 'rate_limited' });
    delete process.env.RATE_LIMIT_MAX;
    resetRateLimiter();
  });

  it('returns a stable no-store internal error when database reads fail', async () => {
    const count = vi.spyOn(db, 'countLookups').mockImplementation(() => {
      throw new Error('database unavailable');
    });
    try {
      const res = await GET(new Request('http://localhost/api/history', {
        headers: { 'x-real-ip': '198.51.100.11' },
      }));
      expect(res.status).toBe(500);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('x-ratelimit-limit')).toBeTruthy();
      expect(await res.json()).toEqual({ error: 'internal server error', code: 'internal_error' });
    } finally {
      count.mockRestore();
    }
  });
});
