import { describe, expect, it } from 'vitest';
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
  it('caches a singleton across calls', () => {
    resetRateLimiter();
    expect(getRateLimiter()).toBe(getRateLimiter());
  });

  it('rebuilds after resetRateLimiter', () => {
    resetRateLimiter();
    const first = getRateLimiter();
    resetRateLimiter();
    expect(getRateLimiter()).not.toBe(first);
  });

  it('caps the number of tracked keys', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, maxKeys: 2, now: () => 1000 });
    limiter.allow('a');
    limiter.allow('b');
    limiter.allow('c');
    expect(limiter.size()).toBe(2);
  });
});