import { afterEach, describe, expect, it } from 'vitest';
import {
  clearDnsCache,
  isPublicHostname,
  isValidHostname,
  resolveRecords,
  type DnsResolver,
} from './dns';

function stubResolver(records: Partial<Record<string, unknown>>): DnsResolver {
  return {
    async resolve(name: string, rrtype: string): Promise<unknown> {
      if (Object.prototype.hasOwnProperty.call(records, rrtype)) return records[rrtype];
      return Promise.reject(new Error('ENOTFOUND'));
    },
  };
}

describe('isValidHostname', () => {
  it('accepts a valid domain', () => {
    expect(isValidHostname('johansen.foo')).toBe(true);
    expect(isValidHostname('a-b.example.com')).toBe(true);
  });

  it('rejects empty, over-long and malformed labels', () => {
    expect(isValidHostname('')).toBe(false);
    expect(isValidHostname('-.bad')).toBe(false);
    expect(isValidHostname('bad..double')).toBe(false);
    expect(isValidHostname(`${'a'.repeat(64)}.com`)).toBe(false);
  });
});

describe('isPublicHostname', () => {
  it('rejects IP literals, local names, and single-label names', () => {
    expect(isPublicHostname('127.0.0.1')).toBe(false);
    expect(isPublicHostname('::1')).toBe(false);
    expect(isPublicHostname('localhost')).toBe(false);
    expect(isPublicHostname('printer')).toBe(false);
    expect(isPublicHostname('printer.local')).toBe(false);
    expect(isPublicHostname('service.internal')).toBe(false);
  });

  it('accepts normalized public fully qualified names', () => {
    expect(isPublicHostname('WWW.Example.COM')).toBe(true);
    expect(isPublicHostname('example.com.')).toBe(false);
    expect(isPublicHostname('bad..example.com')).toBe(false);
    expect(isPublicHostname('example_com.example')).toBe(false);
  });
});

describe('resolveRecords', () => {
  afterEach(() => {
    clearDnsCache();
    delete process.env.DNS_TIMEOUT_MS;
    delete process.env.DNS_MAX_CONCURRENCY;
  });

  it('returns records for each type', async () => {
    const resolver = stubResolver({
      A: ['87.104.91.82'],
      AAAA: ['2606:4700:4700::1111'],
      MX: [{ exchange: 'mx.example.com', priority: 10 }],
      NS: ['ns1.example.com'],
      TXT: [['v=spf1 include:_spf.example.com'], ['alpha', 'beta']],
      SOA: { nsname: 'ns1.example.com', hostmaster: 'hostmaster.example.com' },
    });
    const result = await resolveRecords('example.com', resolver);
    expect(result.records.a).toEqual(['87.104.91.82']);
    expect(result.records.aaaa).toEqual(['2606:4700:4700::1111']);
    expect(result.records.mx).toEqual(['[10] mx.example.com']);
    expect(result.records.ns).toEqual(['ns1.example.com']);
    expect(result.records.txt).toEqual(['v=spf1 include:_spf.example.com', 'alphabeta']);
    expect(result.records.soa).toEqual(['ns1.example.com hostmaster.example.com']);
    expect(result.cache).toBe('miss');
    expect(result.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.partial).toBe(false);
  });

  it('returns empty arrays for missing or failing types', async () => {
    const result = await resolveRecords('example.com', stubResolver({}));
    expect(result.records).toEqual({ a: [], aaaa: [], mx: [], ns: [], txt: [], soa: [] });
    expect(result.partial).toBe(false);
  });

  it('filters private and reserved address answers', async () => {
    const result = await resolveRecords(
      'example.com',
      stubResolver({
        A: ['10.0.0.1', '192.0.2.1', '87.104.91.82'],
        AAAA: ['fc00::1', 'fe80::1', '2001:db8::1', '2606:4700:4700::1111'],
      }),
    );
    expect(result.records.a).toEqual(['87.104.91.82']);
    expect(result.records.aaaa).toEqual(['2606:4700:4700::1111']);
  });

  it('marks results partial when a resolver family fails unexpectedly', async () => {
    const resolver: DnsResolver = {
      async resolve(_name, rrtype) {
        if (rrtype === 'A') return ['87.104.91.82'];
        if (rrtype === 'AAAA') throw new Error('temporary resolver failure');
        return [];
      },
    };
    const result = await resolveRecords('partial.example.com', resolver);
    expect(result.records.a).toEqual(['87.104.91.82']);
    expect(result.partial).toBe(true);
  });

  it('classifies an overall deadline as partial and cancels the resolver', async () => {
    process.env.DNS_TIMEOUT_MS = '20';
    let cancelled = false;
    const resolver: DnsResolver = {
      resolve: () => new Promise(() => undefined),
      cancel: () => {
        cancelled = true;
      },
    };
    const result = await resolveRecords('timeout.example.com', resolver);
    expect(result.records).toEqual({ a: [], aaaa: [], mx: [], ns: [], txt: [], soa: [] });
    expect(result.partial).toBe(true);
    expect(cancelled).toBe(true);
  });

  it('returns a cache hit for settled results', async () => {
    let calls = 0;
    const resolver: DnsResolver = {
      async resolve(_name, rrtype) {
        calls += 1;
        return rrtype === 'A' ? ['87.104.91.82'] : [];
      },
    };
    const first = await resolveRecords('cached.example.com', resolver);
    const second = await resolveRecords('cached.example.com', resolver);
    expect(first.cache).toBe('miss');
    expect(second.cache).toBe('hit');
    expect(second.records).toEqual(first.records);
    expect(calls).toBe(6);
  });

  it('deduplicates concurrent lookups for the same normalized name', async () => {
    let calls = 0;
    const resolver: DnsResolver = {
      async resolve(_name, rrtype) {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return rrtype === 'A' ? ['87.104.91.82'] : [];
      },
    };
    const [first, second] = await Promise.all([
      resolveRecords('Concurrent.Example.COM', resolver),
      resolveRecords('concurrent.example.com', resolver),
    ]);
    expect(calls).toBe(6);
    expect(first.cache).toBe('miss');
    expect(second.cache).toBe('hit');
  });

  it('does not exceed configured resolver concurrency', async () => {
    process.env.DNS_MAX_CONCURRENCY = '2';
    let active = 0;
    let maximum = 0;
    const resolver: DnsResolver = {
      async resolve() {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return [];
      },
    };
    await resolveRecords('bounded.example.com', resolver);
    expect(maximum).toBe(2);
  });
});
