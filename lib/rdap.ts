import { createHostnameCache, type HostnameCache } from './geo';

export interface RdapAbuse {
  email: string | null;
  phone: string | null;
}

export interface RdapInfo {
  handle: string | null;
  name: string | null;
  startAddress: string | null;
  endAddress: string | null;
  country: string | null;
  cidr: string | null;
  organization: string | null;
  registrant: string | null;
  abuse: RdapAbuse | null;
}

const RDAP_BASE = 'https://rdap-bootstrap.arin.net/bootstrap/ip/';
const RDAP_TIMEOUT_MS = 8_000;
const RDAP_TTL_MS = 86_400_000;
const RDAP_MAX_KEYS = 500;

type AnyRecord = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function vcardProps(entity: unknown): unknown[] {
  const arr = (entity as AnyRecord | undefined)?.vcardArray;
  const inner = Array.isArray(arr) ? (arr as unknown[])[1] : undefined;
  return Array.isArray(inner) ? (inner as unknown[]) : [];
}

function vcardValue(entity: unknown, type: string): string | null {
  for (const raw of vcardProps(entity)) {
    const prop = Array.isArray(raw) ? (raw as unknown[]) : [];
    if (prop[0] === type && typeof prop[3] === 'string') return prop[3] as string;
  }
  return null;
}

function entityRoles(entity: unknown): string[] {
  const roles = (entity as AnyRecord | undefined)?.roles;
  return Array.isArray(roles) ? (roles as string[]) : [];
}

function firstEntityFn(
  entities: unknown[],
  roles: string[],
): string | null {
  for (const entity of entities) {
    if (roles.some((role) => entityRoles(entity).includes(role))) {
      const fn = vcardValue(entity, 'fn');
      if (fn) return fn;
    }
  }
  return null;
}

function abuseContact(entities: unknown[]): RdapAbuse | null {
  for (const entity of entities) {
    if (entityRoles(entity).includes('abuse')) {
      const email = vcardValue(entity, 'email');
      const phone = vcardValue(entity, 'tel');
      if (email || phone) return { email, phone };
    }
  }
  return null;
}

function extractCidr(list: unknown): string | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0] as AnyRecord | undefined;
  if (!first) return null;
  const prefix = typeof first.v4prefix === 'string' ? first.v4prefix : first.v6prefix;
  if (typeof prefix === 'string' && Number.isFinite(first.length)) return `${prefix}/${first.length}`;
  return null;
}

export function parseRdap(data: unknown): RdapInfo | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const rec = data as AnyRecord;
  const entities = Array.isArray(rec.entities) ? (rec.entities as unknown[]) : [];
  return {
    handle: str(rec.handle),
    name: str(rec.name),
    startAddress: str(rec.startAddress),
    endAddress: str(rec.endAddress),
    country: str(rec.country),
    cidr: extractCidr(rec.cidr0_cidrs),
    organization: firstEntityFn(entities, ['organization', 'registrant']),
    registrant: firstEntityFn(entities, ['registrant']),
    abuse: abuseContact(entities),
  };
}

export async function queryRdap(
  ip: string,
  doFetch: typeof fetch = fetch,
): Promise<RdapInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);
  try {
    const res = await doFetch(`${RDAP_BASE}${ip}`, {
      headers: { accept: 'application/rdap+json' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return parseRdap(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const cachedRdap: HostnameCache<RdapInfo | null> = createHostnameCache<RdapInfo | null>(
  queryRdap,
  { ttlMs: RDAP_TTL_MS, maxKeys: RDAP_MAX_KEYS },
  Date.now,
);

export async function fetchRdap(ip: string): Promise<RdapInfo | null> {
  return cachedRdap.get(ip);
}
