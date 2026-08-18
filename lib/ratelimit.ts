export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  remaining: number;
  limit: number;
}

interface RateLimiterOptions {
  max: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}

interface WindowEntry {
  start: number;
  count: number;
}

export function createRateLimiter({ max, windowMs, now = Date.now, maxKeys = 10_000 }: RateLimiterOptions) {
  const entries = new Map<string, WindowEntry>();

  function sweep(current: number) {
    for (const [key, entry] of entries) {
      if (current - entry.start >= windowMs) {
        entries.delete(key);
      }
    }
  }

  return {
    allow(key: string): RateLimitResult {
      const current = now();
      const entry = entries.get(key);
      if (!entry || current - entry.start >= windowMs) {
        if (entries.size >= maxKeys) {
          let oldestKey: string | undefined;
          let oldestStart = Infinity;
          for (const [existingKey, existingEntry] of entries) {
            if (existingEntry.start < oldestStart) {
              oldestStart = existingEntry.start;
              oldestKey = existingKey;
            }
          }
          if (oldestKey) entries.delete(oldestKey);
        }
        entries.set(key, { start: current, count: 1 });
        sweep(current);
        return { allowed: true, retryAfter: 0, remaining: max - 1, limit: max };
      }
      if (entry.count < max) {
        entry.count += 1;
        return { allowed: true, retryAfter: 0, remaining: max - entry.count, limit: max };
      }
      return { allowed: false, retryAfter: entry.start + windowMs - current, remaining: 0, limit: max };
    },
    size(): number {
      return entries.size;
    },
  };
}

let limiter: ReturnType<typeof createRateLimiter> | null = null;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRateLimiter() {
  if (!limiter) {
    limiter = createRateLimiter({
      max: envNumber('RATE_LIMIT_MAX', 30),
      windowMs: envNumber('RATE_LIMIT_WINDOW_MS', 60_000),
    });
  }
  return limiter;
}

export function resetRateLimiter() {
  limiter = null;
}