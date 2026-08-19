import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GET, OPTIONS } from './route';
import { resetRateLimiter } from '@/lib/ratelimit';

vi.mock('@/lib/dns', () => ({
  isPublicHostname: (name: string) => /^[a-z0-9.-]+$/i.test(name) && name.includes('.'),
  resolveRecords: vi.fn(async () => ({
    records: {
      a: ['87.104.91.82'],
      aaaa: [],
      mx: [],
      ns: ['ns1.example.com'],
      txt: [],
      soa: [],
    },
    cache: 'miss',
    resolvedAt: '2026-08-19T12:00:00.000Z',
    durationMs: 12,
    partial: false,
  })),
}));

describe('GET /api/dns', () => {
  it('returns dns records for a hostname', async () => {
    const res = await GET(new Request('http://localhost/api/dns?name=johansen.foo'));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = await res.json();
    expect(body.name).toBe('johansen.foo');
    expect(body.records.a).toEqual(['87.104.91.82']);
    expect(body.records.ns).toEqual(['ns1.example.com']);
    expect(body.cache).toBe('miss');
    expect(body.resolvedAt).toBe('2026-08-19T12:00:00.000Z');
    expect(body.durationMs).toBe(12);
    expect(body.partial).toBe(false);
    expect(body).not.toHaveProperty('resolver');
    expect(body).not.toHaveProperty('error');
    expect(res.headers.get('x-ratelimit-limit')).toMatch(/^\d+$/);
  });

  it('rejects an invalid hostname with 400', async () => {
    const res = await GET(new Request('http://localhost/api/dns?name=not a name'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid hostname', code: 'invalid_input' });
  });

  it('returns stable timeout errors with rate headers', async () => {
    const dns = await import('@/lib/dns');
    vi.mocked(dns.resolveRecords).mockRejectedValueOnce({ code: 'upstream_timeout' });
    const res = await GET(new Request('http://localhost/api/dns?name=johansen.foo'));
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: 'dns lookup timed out', code: 'upstream_timeout' });
    expect(res.headers.get('x-ratelimit-remaining')).toMatch(/^\d+$/);
  });

  it('returns stable unavailable errors without resolver details', async () => {
    const dns = await import('@/lib/dns');
    vi.mocked(dns.resolveRecords).mockRejectedValueOnce({ code: 'upstream_unavailable' });
    const res = await GET(new Request('http://localhost/api/dns?name=johansen.foo'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'dns resolver unavailable', code: 'upstream_unavailable' });
  });

  it('answers OPTIONS with CORS headers', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('GET /api/dns rate limiting', () => {
  const originalMax = process.env.RATE_LIMIT_MAX;

  beforeAll(() => {
    process.env.RATE_LIMIT_MAX = '1';
    resetRateLimiter();
  });

  afterEach(() => {
    resetRateLimiter();
  });

  afterAll(() => {
    if (originalMax === undefined) {
      delete process.env.RATE_LIMIT_MAX;
    } else {
      process.env.RATE_LIMIT_MAX = originalMax;
    }
    resetRateLimiter();
  });

  it('returns 429 with retry-after once the cap is exceeded', async () => {
    const req = () =>
      new Request('http://localhost/api/dns?name=johansen.foo', {
        headers: { 'x-forwarded-for': '9.9.9.9' },
      });
    await GET(req());
    const blocked = await GET(req());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await blocked.json()).toEqual({ error: 'rate limit exceeded', code: 'rate_limited' });
  });
});
