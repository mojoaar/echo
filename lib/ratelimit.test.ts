import { afterEach, describe, expect, it } from 'vitest';
import { createRateLimiter, getRateLimiter, resetRateLimiter } from '@/lib/ratelimit';

function fakeClock(initial: number) {
  let time = initial;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('createRateLimiter', () => {
  it('allows requests under the cap', () => {
    const clock = fakeClock(1_000);
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: clock.now });
    expect(limiter.allow('a').allowed).toBe(true);
    expect(limiter.allow('a').allowed).toBe(true);
    expect(limiter.allow('a').allowed).toBe(true);
  });

  it('denies once the cap is exceeded', () => {
    const clock = fakeClock(1_000);
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000, now: clock.now });
    limiter.allow('a');
    limiter.allow('a');
    const denied = limiter.allow('a');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBe(60_000);
  });

  it('resets the window after windowMs elapses', () => {
    const clock = fakeClock(1_000);
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: clock.now });
    limiter.allow('a');
    expect(limiter.allow('a').allowed).toBe(false);
    clock.advance(60_000);
    expect(limiter.allow('a').allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const clock = fakeClock(1_000);
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: clock.now });
    limiter.allow('a');
    expect(limiter.allow('a').allowed).toBe(false);
    expect(limiter.allow('b').allowed).toBe(true);
  });

  it('allows a stale key again after its window expires', () => {
    const clock = fakeClock(1_000);
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: clock.now });
    limiter.allow('old-key');
    expect(limiter.allow('old-key').allowed).toBe(false);
    clock.advance(120_000);
    expect(limiter.allow('old-key').allowed).toBe(true);
  });
});

describe('getRateLimiter', () => {
  afterEach(() => {
    resetRateLimiter();
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.RATE_LIMIT_JSON_MAX;
    delete process.env.RATE_LIMIT_JSON_WINDOW_MS;
    delete process.env.RATE_LIMIT_IP_MAX;
    delete process.env.RATE_LIMIT_IP_WINDOW_MS;
  });

  it('caches each named limiter independently', () => {
    resetRateLimiter();
    const json = getRateLimiter('json');
    const ip = getRateLimiter('ip');
    expect(json).toBe(getRateLimiter('json'));
    expect(ip).toBe(getRateLimiter('ip'));
    expect(json).not.toBe(ip);
    expect(json.allow('same-key').allowed).toBe(true);
    expect(ip.allow('same-key').allowed).toBe(true);
  });

  it('uses legacy global values as fallback for named limiters', () => {
    process.env.RATE_LIMIT_MAX = '1';
    process.env.RATE_LIMIT_WINDOW_MS = '1234';
    const limiter = getRateLimiter('json');
    const first = limiter.allow('key');
    expect(first.limit).toBe(1);
    expect(first.retryAfter).toBe(0);
    expect(limiter.allow('key').retryAfter).toBe(1234);
  });

  it('uses endpoint values before legacy global values', () => {
    process.env.RATE_LIMIT_MAX = '7';
    process.env.RATE_LIMIT_WINDOW_MS = '1234';
    process.env.RATE_LIMIT_JSON_MAX = '1';
    process.env.RATE_LIMIT_JSON_WINDOW_MS = '5678';
    const limiter = getRateLimiter('json');
    const first = limiter.allow('key');
    expect(first.limit).toBe(1);
    expect(first.retryAfter).toBe(0);
    expect(limiter.allow('key').retryAfter).toBe(5678);
  });

  it('rebuilds all named limiters after resetRateLimiter', () => {
    resetRateLimiter();
    const first = getRateLimiter('json');
    resetRateLimiter();
    expect(getRateLimiter('json')).not.toBe(first);
  });

  it('caps the number of tracked keys', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, maxKeys: 2, now: () => 1000 });
    limiter.allow('a');
    limiter.allow('b');
    limiter.allow('c');
    expect(limiter.size()).toBe(2);
  });
});
