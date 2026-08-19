import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GET, OPTIONS } from './route';
import { resetRateLimiter } from '@/lib/ratelimit';

const arinFixture = {
  handle: 'NET-8-8-8-0-1',
  name: 'LVLT-GOGL-8-8-8',
  startAddress: '8.8.8.0',
  endAddress: '8.8.8.255',
  country: 'US',
  cidr0_cidrs: [{ v4prefix: '8.8.8.0', length: 24 }],
  entities: [
    {
      roles: ['registrant'],
      vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'Google LLC']]],
    },
  ],
};

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(arinFixture), { status: 200 })),
  );
}

describe('GET /api/whois', () => {
  beforeAll(() => {
    stubFetch();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('returns rdap info for a looked-up ip', async () => {
    const res = await GET(new Request('http://localhost/api/whois?ip=8.8.8.8'));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = await res.json();
    expect(body.handle).toBe('NET-8-8-8-0-1');
    expect(body.organization).toBe('Google LLC');
  });

  it('rejects an invalid ip with 400', async () => {
    const res = await GET(new Request('http://localhost/api/whois?ip=not-an-ip'));
    expect(res.status).toBe(400);
  });

  it('answers OPTIONS with CORS headers', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('GET /api/whois rate limiting', () => {
  const originalMax = process.env.RATE_LIMIT_MAX;

  beforeAll(() => {
    process.env.RATE_LIMIT_MAX = '1';
    resetRateLimiter();
    stubFetch();
  });

  afterEach(() => {
    resetRateLimiter();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    if (originalMax === undefined) {
      delete process.env.RATE_LIMIT_MAX;
    } else {
      process.env.RATE_LIMIT_MAX = originalMax;
    }
    resetRateLimiter();
  });

  it('returns 429 with retry-after once the cap is exceeded', async () => {
    const req = () =>
      new Request('http://localhost/api/whois?ip=9.9.9.9', {
        headers: { 'x-forwarded-for': '9.9.9.9' },
      });
    await GET(req());
    const blocked = await GET(req());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toMatch(/^\d+$/);
  });
});
