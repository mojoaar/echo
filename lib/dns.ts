import { promises as dns } from 'node:dns';

export interface DnsRecords {
  a: string[];
  aaaa: string[];
  mx: string[];
  ns: string[];
  txt: string[];
  soa: string[];
}

export interface DnsResolver {
  resolve(hostname: string, rrtype: string): Promise<unknown>;
}

const DNS_TIMEOUT_MS = 6_000;
const LABEL_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

export function isValidHostname(name: string): boolean {
  if (name.length === 0 || name.length > 253) return false;
  const labels = name.split('.');
  if (labels.some((label) => label.length === 0 || label.length > 63)) return false;
  return labels.every((label) => LABEL_RE.test(label));
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

export async function resolveRecords(
  name: string,
  resolver: DnsResolver = dns,
): Promise<DnsRecords> {
  type RecordsKey = keyof DnsRecords;
  const types: RecordsKey[] = ['a', 'aaaa', 'mx', 'ns', 'txt', 'soa'];
  const rrt = { a: 'A', aaaa: 'AAAA', mx: 'MX', ns: 'NS', txt: 'TXT', soa: 'SOA' } as const;

  async function one(type: RecordsKey): Promise<string[]> {
    try {
      return normalize(rrt[type], await resolver.resolve(name, rrt[type]));
    } catch {
      return [];
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const fallback: DnsRecords = empty();
  const timeout = new Promise<DnsRecords>((resolve) => {
    timer = setTimeout(() => resolve(fallback), DNS_TIMEOUT_MS);
  });

  const work = (async () => {
    const results = await Promise.all(types.map((type) => one(type)));
    return {
      a: results[0],
      aaaa: results[1],
      mx: results[2],
      ns: results[3],
      txt: results[4],
      soa: results[5],
    };
  })();

  const result = await Promise.race([work, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}
