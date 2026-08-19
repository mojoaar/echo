import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './route';
import { resetRateLimiter } from '@/lib/ratelimit';

describe('GET /api/ip', () => {
  it('returns the visitor ip as plain text', async () => {
    const req = new Request('http://localhost/api/ip', {
      headers: { 'x-forwarded-for': '8.8.8.8, 10.0.0.1' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('8.8.8.8\n');
  });

  it('returns 400 when no ip is present', async () => {
    const res = await GET(new Request('http://localhost/api/ip'));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns a looked-up ip as plain text when ?ip= is given', async () => {
    const res = await GET(new Request('http://localhost/api/ip?ip=8.8.8.8'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('8.8.8.8\n');
  });

  it('returns 400 for an invalid ?ip= value', async () => {
    const res = await GET(new Request('http://localhost/api/ip?ip=not-an-ip'));
    expect(res.status).toBe(400);
  });

  it('rate limits requests from the same visitor', async () => {
    process.env.RATE_LIMIT_MAX = '1';
    resetRateLimiter();
    const first = await GET(
      new Request('http://localhost/api/ip', { headers: { 'x-forwarded-for': '8.8.8.8' } }),
    );
    const second = await GET(
      new Request('http://localhost/api/ip', { headers: { 'x-forwarded-for': '8.8.8.8' } }),
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get('content-type')).toContain('text/plain');
    expect(second.headers.get('retry-after')).toBeTruthy();
  });
});

afterEach(() => {
  delete process.env.RATE_LIMIT_MAX;
  resetRateLimiter();
});
