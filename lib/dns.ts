import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { isPublicIp, normalizeIp } from './ip';

export interface DnsRecords {
  a: string[];
  aaaa: string[];
  mx: string[];
  ns: string[];
  txt: string[];
  soa: string[];
}

export interface DnsLookupResult {
  records: DnsRecords;
  cache: 'hit' | 'miss';
  resolvedAt: string;
  durationMs: number;
  partial: boolean;
}

export interface DnsResolver {
  resolve(hostname: string, rrtype: string): Promise<unknown>;
  cancel?: () => void;
}

export type DnsErrorCode = 'invalid_input' | 'upstream_timeout' | 'upstream_unavailable';

export class DnsError extends Error {
  readonly code: DnsErrorCode;

  constructor(code: DnsErrorCode) {
    super(code);
    this.name = 'DnsError';
    this.code = code;
  }
}

const DNS_TIMEOUT_MS = 6_000;
const DNS_MAX_CONCURRENCY = 2;
const DNS_CACHE_TTL_MS = 30_000;
const DNS_FAILURE_TTL_MS = 5_000;
const DNS_CACHE_MAX = 100;
const LABEL_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
const RECORD_TYPES = ['a', 'aaaa', 'mx', 'ns', 'txt', 'soa'] as const;
const RRTYPES = { a: 'A', aaaa: 'AAAA', mx: 'MX', ns: 'NS', txt: 'TXT', soa: 'SOA' } as const;
const DISALLOWED_SUFFIXES = [
  '.local',
  '.internal',
  '.localhost',
  '.home.arpa',
  '.test',
  '.invalid',
  '.example',
];

type RecordsKey = keyof DnsRecords;
type CacheEntry = {
  promise: Promise<DnsLookupResult>;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export function clearDnsCache(): void {
  cache.clear();
}

function envNumber(name: string, fallback: number, minimum: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

function config() {
  return {
    timeoutMs: envNumber('DNS_TIMEOUT_MS', DNS_TIMEOUT_MS, 1),
    maxConcurrency: Math.min(envNumber('DNS_MAX_CONCURRENCY', DNS_MAX_CONCURRENCY, 1), RECORD_TYPES.length),
    cacheTtlMs: envNumber('DNS_CACHE_TTL_MS', DNS_CACHE_TTL_MS, 0),
    failureTtlMs: envNumber('DNS_FAILURE_TTL_MS', DNS_FAILURE_TTL_MS, 0),
    cacheMax: envNumber('DNS_CACHE_MAX', DNS_CACHE_MAX, 1),
  };
}

export function isValidHostname(name: string): boolean {
  if (name.length === 0 || name.length > 253) return false;
  const labels = name.split('.');
  if (labels.some((label) => label.length === 0 || label.length > 63)) return false;
  return labels.every((label) => LABEL_RE.test(label));
}

export function isPublicHostname(name: string): boolean {
  const normalized = name.toLowerCase();
  if (isIP(name) !== 0) return false;
  if (!isValidHostname(normalized) || normalized.split('.').length < 2) return false;
  if (normalized === 'localhost' || normalized.split('.').some((label) => label === 'localhost')) {
    return false;
  }
  return !DISALLOWED_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function empty(): DnsRecords {
  return { a: [], aaaa: [], mx: [], ns: [], txt: [], soa: [] };
}

function normalize(rrtype: string, value: unknown): string[] {
  if (rrtype === 'MX' && Array.isArray(value)) {
    return (value as Array<{ exchange: string; priority: number }>).map(
      (m) => `[${m.priority}] ${m.exchange}`,
    );
  }
  if (rrtype === 'TXT' && Array.isArray(value)) {
    return (value as string[][]).map((chunks) => chunks.join(''));
  }
  if (rrtype === 'SOA' && value && typeof value === 'object') {
    const soa = value as { nsname?: string; hostmaster?: string };
    return [soa.nsname && soa.hostmaster ? `${soa.nsname} ${soa.hostmaster}` : ''].filter(Boolean);
  }
  return Array.isArray(value) ? (value as string[]) : [];
}

function isExpectedMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return ['ENODATA', 'ENOTFOUND', 'NODATA'].includes(String(candidate.code ?? candidate.message ?? ''));
}

function isSafeAddress(value: string): boolean {
  const normalized = normalizeIp(value);
  if (!isPublicIp(normalized)) return false;
  if (isIP(normalized) === 4) {
    const parts = normalized.split('.').map(Number);
    const [first, second, third] = parts;
    if (first === 192 && second === 0 && third === 0) return false;
    if (first === 192 && second === 0 && third === 2) return false;
    if (first === 192 && second === 88 && third === 99) return false;
    if (first === 198 && second === 18) return false;
    if (first === 198 && second === 19) return false;
    if (first === 198 && second === 51 && third === 100) return false;
    if (first === 203 && second === 0 && third === 113) return false;
    return true;
  }
  const lower = normalized.toLowerCase();
  return !lower.startsWith('2001:db8:') && !lower.startsWith('2001:10:');
}

async function resolveUncached(
  name: string,
  injectedResolver: DnsResolver | undefined,
): Promise<DnsLookupResult> {
  const startedAt = Date.now();
  const settings = config();
  let resolver: DnsResolver;
  try {
    resolver = injectedResolver ?? new dns.Resolver();
  } catch {
    throw new DnsError('upstream_unavailable');
  }

  async function one(type: RecordsKey): Promise<{ values: string[]; partial: boolean }> {
    try {
      const values = normalize(RRTYPES[type], await resolver.resolve(name, RRTYPES[type]));
      if (type === 'a' || type === 'aaaa') {
        return { values: values.filter(isSafeAddress), partial: false };
      }
      return { values, partial: false };
    } catch (error) {
      return { values: [], partial: !isExpectedMissing(error) };
    }
  }

  const results: Array<{ values: string[]; partial: boolean }> = [];
  let next = 0;
  const worker = async () => {
    while (next < RECORD_TYPES.length) {
      const index = next;
      next += 1;
      results[index] = await one(RECORD_TYPES[index]);
    }
  };
  const work = Promise.all(
    Array.from({ length: settings.maxConcurrency }, () => worker()),
  ).then(() => results);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), settings.timeoutMs);
  });
  const completed = await Promise.race([work, timeout]);
  if (timer) clearTimeout(timer);
  if (completed === null) {
    resolver.cancel?.();
    return {
      records: empty(),
      cache: 'miss',
      resolvedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      partial: true,
    };
  }
  const values = completed.map((result) => result.values);
  return {
    records: {
      a: values[0],
      aaaa: values[1],
      mx: values[2],
      ns: values[3],
      txt: values[4],
      soa: values[5],
    },
    cache: 'miss',
    resolvedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    partial: completed.some((result) => result.partial),
  };
}

export async function resolveRecords(
  name: string,
  resolver?: DnsResolver,
): Promise<DnsLookupResult> {
  const normalized = name.toLowerCase();
  if (!isPublicHostname(normalized)) throw new DnsError('invalid_input');
  const now = Date.now();
  const existing = cache.get(normalized);
  if (existing && existing.expiresAt > now) {
    return existing.promise.then((result) => ({ ...result, cache: 'hit' }));
  }
  if (existing) cache.delete(normalized);
  const settings = config();
  while (cache.size >= settings.cacheMax) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  const entry = { promise: Promise.resolve(null as unknown as DnsLookupResult), expiresAt: Number.POSITIVE_INFINITY };
  entry.promise = resolveUncached(normalized, resolver).then(
    (result) => {
      entry.expiresAt = Date.now() + (result.partial ? settings.failureTtlMs : settings.cacheTtlMs);
      return result;
    },
    (error) => {
      entry.expiresAt = Date.now() + settings.failureTtlMs;
      throw error;
    },
  );
  cache.set(normalized, entry);
  return entry.promise;
}
