import { describe, expect, it } from 'vitest';
import { apiError, withRateHeaders } from '@/lib/api';

const errorCodes = [
  'invalid_input',
  'rate_limited',
  'upstream_timeout',
  'upstream_unavailable',
  'not_found',
  'internal_error',
] as const;

describe('apiError', () => {
  it.each(errorCodes)('returns the stable %s error contract', async (code) => {
    const response = apiError(400, 'message', code, {
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'message', code });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('converts denied milliseconds to delta-seconds with Math.ceil', () => {
    const headers = withRateHeaders(
      { 'cache-control': 'no-store' },
      { allowed: false, retryAfter: 59_900, remaining: 0, limit: 10 },
    );

    expect(headers.get('cache-control')).toBe('no-store');
    expect(headers.get('retry-after')).toBe('60');
    expect(headers.get('x-ratelimit-limit')).toBe('10');
    expect(headers.get('x-ratelimit-remaining')).toBe('0');
  });
});
