import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb, insertLookup } from '@/lib/db';
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

  it('returns 404 for a missing or wrong token', async () => {
    process.env.STATS_TOKEN = 'secret-value';
    const missing = await GET(new Request('http://localhost/api/stats'));
    expect(missing.status).toBe(404);
    const wrong = await GET(new Request('http://localhost/api/stats?token=wrong'));
    expect(wrong.status).toBe(404);
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
});
