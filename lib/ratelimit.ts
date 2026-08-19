export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  remaining: number;
  limit: number;
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
export type RateLimiterName = 'json' | 'ip' | 'history' | 'whois' | 'dns' | 'stats-auth';

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

const limiterDefaults: Record<RateLimiterName, { max: number; windowMs: number }> = {
  json: { max: 30, windowMs: 60_000 },
  ip: { max: 60, windowMs: 60_000 },
  history: { max: 30, windowMs: 60_000 },
  whois: { max: 10, windowMs: 60_000 },
  dns: { max: 10, windowMs: 60_000 },
  'stats-auth': { max: 5, windowMs: 60_000 },
};

const limiters = new Map<RateLimiterName, RateLimiter>();

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRateLimiter(name: RateLimiterName): RateLimiter {
  const existing = limiters.get(name);
  if (existing) return existing;
  const envName = name.toUpperCase().replace('-', '_');
  const defaults = limiterDefaults[name];
  const limiter = createRateLimiter({
    max: envNumber(`RATE_LIMIT_${envName}_MAX`, envNumber('RATE_LIMIT_MAX', defaults.max)),
    windowMs: envNumber(
      `RATE_LIMIT_${envName}_WINDOW_MS`,
      envNumber('RATE_LIMIT_WINDOW_MS', defaults.windowMs),
    ),
  });
  limiters.set(name, limiter);
  return limiter;
}

export function resetRateLimiter() {
  limiters.clear();
}
