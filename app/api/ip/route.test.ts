import { describe, expect, it } from 'vitest';
import { GET } from './route';

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
  });
});
