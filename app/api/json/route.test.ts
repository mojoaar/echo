import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET, OPTIONS } from './route';
import { initDb, closeDb } from '@/lib/db';
import { resetRateLimiter } from '@/lib/ratelimit';
import * as db from '@/lib/db';

const { recordActivityEvent } = vi.hoisted(() => ({ recordActivityEvent: vi.fn() }));

vi.mock('@/lib/activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/activity')>()),
  recordActivityEvent,
}));

describe('GET /api/json', () => {
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-json-'));
    initDb(join(dir, 'test.db'));
  });

  afterAll(() => {
    closeDb();
  });

  afterEach(() => {
    recordActivityEvent.mockClear();
  });

  it('returns the full payload for the visitor ip', async () => {
    const req = new Request('http://localhost/api/json', {
      headers: { 'x-forwarded-for': '8.8.8.8', 'user-agent': 'Mozilla/5.0' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.ip).toBe('8.8.8.8');
    expect(typeof body.isPrivate).toBe('boolean');
    expect(recordActivityEvent).toHaveBeenCalledWith(expect.objectContaining({
      ip: '8.8.8.8',
      iso: body.country,
      lookupType: 'geo',
      channel: 'api',
      actor: 'browser',
      target: '8.8.8.8',
      outcome: 'success',
      partial: false,
    }));
  });

  it('supports ?ip= arbitrary lookups', async () => {
    const res = await GET(new Request('http://localhost/api/json?ip=192.168.1.1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ip).toBe('192.168.1.1');
    expect(body.isPrivate).toBe(true);
    expect(recordActivityEvent).toHaveBeenCalledWith(expect.objectContaining({
      lookupType: 'geo',
      target: '192.168.1.1',
      ip: 'unknown',
      outcome: 'partial',
      partial: true,
    }));
  });

  it('rejects invalid ip values with 400', async () => {
    const res = await GET(new Request('http://localhost/api/json?ip=not-an-ip'));
    expect(res.status).toBe(400);
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  it('rejects repeated ?ip= values with stable invalid input', async () => {
    const res = await GET(new Request('http://localhost/api/json?ip=8.8.8.8&ip=1.1.1.1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid ip address', code: 'invalid_input' });
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  it('answers OPTIONS preflight with CORS headers', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });
});

describe('GET /api/json rate limiting', () => {
  const originalMax = process.env.RATE_LIMIT_MAX;
  const req = (ip: string) =>
    new Request('http://localhost/api/json', { headers: { 'x-forwarded-for': ip } });

  beforeAll(() => {
    process.env.RATE_LIMIT_MAX = '2';
    resetRateLimiter();
  });

  afterEach(() => {
    resetRateLimiter();
    recordActivityEvent.mockClear();
  });

  afterAll(() => {
    if (originalMax === undefined) {
      delete process.env.RATE_LIMIT_MAX;
    } else {
      process.env.RATE_LIMIT_MAX = originalMax;
    }
    resetRateLimiter();
  });

  it('returns 200 with limit headers while under the cap', async () => {
    const res = await GET(req('1.1.1.1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ratelimit-limit')).toBe('2');
    expect(res.headers.get('x-ratelimit-remaining')).toBe('1');
  });

  it('returns 429 with retry-after once the cap is exceeded', async () => {
    await GET(req('2.2.2.2'));
    await GET(req('2.2.2.2'));
    const blocked = await GET(req('2.2.2.2'));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(blocked.headers.get('access-control-allow-origin')).toBe('*');
    const body = await blocked.json();
    expect(body.error).toBe('rate limit exceeded');
    expect(body.code).toBe('rate_limited');
    expect(recordActivityEvent).toHaveBeenCalledTimes(2);
  });

  it('keeps separate rate windows per visitor ip', async () => {
    await GET(req('3.3.3.3'));
    await GET(req('3.3.3.3'));
    await GET(req('3.3.3.3'));
    const other = await GET(req('4.4.4.4'));
    expect(other.status).toBe(200);
  });

  it('still answers OPTIONS preflight during a rate-limit block', async () => {
    await GET(req('5.5.5.5'));
    await GET(req('5.5.5.5'));
    await GET(req('5.5.5.5'));
    const res = await OPTIONS();
    expect(res.status).toBe(204);
  });
});
