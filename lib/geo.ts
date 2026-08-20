import { promises as dns } from 'node:dns';
import { readFileSync } from 'node:fs';
import * as mmdb from 'mmdb-lib';
import tzLookup from '@photostructure/tz-lookup';
import { classifyIp, normalizeIp } from './ip';
import { flagEmoji } from './flags';
import type { AsnRecord, CityRecord, IpInfo } from './types';

export { flagEmoji } from './flags';

export interface ReaderLike {
  get(ip: string): unknown;
}

export interface Readers {
  city: ReaderLike | null;
  asn: ReaderLike | null;
}

const HOSTNAME_TIMEOUT = 600;
const HOSTNAME_TTL_MS = 3_600_000;
const HOSTNAME_MAX_KEYS = 500;
let cachedReaders: Readers | null = null;

function loadReader(path: string): ReaderLike | null {
  try {
    const buffer = readFileSync(path);
    return new mmdb.Reader<never>(buffer);
  } catch {
    return null;
  }
}

export function createReaders(
  cityPath = process.env.MMDB_CITY || 'data/dbip-city-lite.mmdb',
  asnPath = process.env.MMDB_ASN || 'data/dbip-asn-lite.mmdb',
): Readers {
  if (!cachedReaders) {
    cachedReaders = {
      city: loadReader(cityPath),
      asn: loadReader(asnPath),
    };
  }
  return cachedReaders;
}

export function resetReaders(): void {
  cachedReaders = null;
}

export function utcOffsetFor(timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date());
    const raw = (parts.find((p) => p.type === 'timeZoneName')?.value ?? '').replace(/\u2212/g, '-');
    const match = raw.match(/([+-]?)(\d{1,2})(?::(\d{2}))?/);
    if (!match) {
      const exact = raw.trim();
      return exact === 'GMT' || exact === 'UTC' ? '+00:00' : null;
    }
    const hours = Number(match[2]);
    const minutes = match[3] ? Number(match[3]) : 0;
    if (!Number.isInteger(hours) || hours < 0 || hours > 14 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
      return null;
    }
    const sign = hours === 0 && minutes === 0 ? '+' : match[1] === '-' ? '-' : '+';
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

async function reverseLookup(ip: string): Promise<string | null> {
  try {
    const names = await dns.reverse(ip);
    return names[0] ?? null;
  } catch {
    return null;
  }
}

function resolveHostname(ip: string): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), HOSTNAME_TIMEOUT);
  });
  return Promise.race([
    reverseLookup(ip).finally(() => {
      if (timer) clearTimeout(timer);
    }),
    timeout,
  ]);
}

export interface HostnameCache<T> {
  get: (key: string) => Promise<T>;
}

interface CacheEntry<T> {
  value?: T;
  expires: number;
  pending?: Promise<T>;
}

export function createHostnameCache<T>(
  resolve: (key: string) => Promise<T>,
  {
    ttlMs,
    maxKeys,
    maxPending = maxKeys,
    failureTtlMs = 1_000,
  }: { ttlMs: number; maxKeys: number; maxPending?: number; failureTtlMs?: number },
  now: () => number = Date.now,
): HostnameCache<T> {
  const cache = new Map<string, CacheEntry<T>>();
  const pending = new Map<string, Promise<T>>();
  return {
    get(key: string): Promise<T> {
      const t = now();
      const inFlight = pending.get(key);
      if (inFlight) return inFlight;
      const hit = cache.get(key);
      if (hit && hit.expires > t) return Promise.resolve(hit.value as T);
      if (pending.size >= maxPending) return Promise.reject(new Error('too many pending lookups'));
      const request = resolve(key).then((value) => {
        if (pending.get(key) === request) pending.delete(key);
        if (cache.has(key)) cache.delete(key);
        while (cache.size >= maxKeys) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey === undefined) break;
          cache.delete(oldestKey);
        }
        cache.set(key, { value, expires: now() + (value === null ? failureTtlMs : ttlMs) });
        return value;
      }).catch((error: unknown) => {
        if (pending.get(key) === request) pending.delete(key);
        throw error;
      });
      pending.set(key, request);
      return request;
    },
  };
}

const cachedResolveHostname: HostnameCache<string | null> = createHostnameCache(resolveHostname, {
  ttlMs: HOSTNAME_TTL_MS,
  maxKeys: HOSTNAME_MAX_KEYS,
});

function emptyIpInfo(ip: string): IpInfo {
  return {
    ip,
    city: null,
    region: null,
    country: null,
    countryCode: null,
    countryName: null,
    flag: null,
    org: null,
    asn: null,
    timezone: null,
    utcOffset: null,
    latitude: null,
    longitude: null,
    hostname: null,
    isPrivate: false,
  };
}

export async function lookupInfo(
  ip: string,
  opts: {
    hostname?: boolean;
    readers?: Readers;
    hostnameResolver?: (ip: string) => Promise<string | null>;
  } = {},
): Promise<IpInfo> {
  const normalized = normalizeIp(ip);
  const info = emptyIpInfo(normalized);
  const readers = opts.readers ?? createReaders();
  info.isPrivate = classifyIp(normalized) !== 'public';
  if (info.isPrivate) return info;

  const cityRow = readers.city?.get(normalized) as CityRecord | null | undefined;
  if (cityRow) {
    const cc = cityRow.country?.iso_code ?? null;
    info.countryCode = cc;
    info.country = cc;
    info.countryName = cityRow.country?.names?.en ?? null;
    info.flag = cc ? flagEmoji(cc) : null;
    info.city = cityRow.city?.names?.en ?? null;
    info.region = cityRow.subdivisions?.[0]?.names?.en ?? null;
    if (cityRow.location) {
      info.latitude = cityRow.location.latitude ?? null;
      info.longitude = cityRow.location.longitude ?? null;
      info.timezone = cityRow.location.time_zone ?? null;
      if (!info.timezone && info.latitude != null && info.longitude != null) {
        try {
          info.timezone = tzLookup(info.latitude, info.longitude);
        } catch {
          info.timezone = null;
        }
      }
      if (info.timezone) info.utcOffset = utcOffsetFor(info.timezone);
    }
  }

  const asnRow = readers.asn?.get(normalized) as AsnRecord | null | undefined;
  if (asnRow) {
    info.asn = asnRow.autonomous_system_number != null ? `AS${asnRow.autonomous_system_number}` : null;
    info.org = asnRow.autonomous_system_organization ?? null;
  }

  if (opts.hostname) {
    const resolver = opts.hostnameResolver ?? cachedResolveHostname.get;
    info.hostname = await resolver(normalized);
  }
  return info;
}
