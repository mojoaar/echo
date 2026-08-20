import { afterEach, describe, expect, it, vi } from 'vitest';
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
    delete process.env.DNS_CACHE_TTL_MS;
    delete process.env.DNS_FAILURE_TTL_MS;
    delete process.env.DNS_CACHE_MAX;
    vi.useRealTimers();
  });

  it('returns records for each type', async () => {
    const resolver = stubResolver({
      A: ['87.104.91.82'],
      AAAA: ['2606:4700:4700::1111'],
      CNAME: ['www.example.com'],
      MX: [{ exchange: 'mx.example.com', priority: 10 }],
      NS: ['ns1.example.com'],
      SOA: { nsname: 'ns1.example.com', hostmaster: 'hostmaster.example.com' },
      SRV: [{ name: 'mail.example.com', port: 443, priority: 1, weight: 5 }],
      TXT: [['v=spf1 include:_spf.example.com'], ['alpha', 'beta']],
      CAA: [{ critical: false, issue: 'letsencrypt.org' }, { critical: true, issue: 'ca.example.net' }],
    });
    const result = await resolveRecords('example.com', resolver);
    expect(result.records.a).toEqual(['87.104.91.82']);
    expect(result.records.aaaa).toEqual(['2606:4700:4700::1111']);
    expect(result.records.cname).toEqual(['www.example.com']);
    expect(result.records.mx).toEqual(['[10] mx.example.com']);
    expect(result.records.ns).toEqual(['ns1.example.com']);
    expect(result.records.txt).toEqual(['v=spf1 include:_spf.example.com', 'alphabeta']);
    expect(result.records.soa).toEqual(['ns1.example.com hostmaster.example.com']);
    expect(result.records.srv).toEqual(['[1 5] mail.example.com:443']);
    expect(result.records.caa).toEqual(['letsencrypt.org', '[critical] ca.example.net']);
    expect(result.cache).toBe('miss');
    expect(result.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.partial).toBe(false);
  });

  it('returns empty arrays for missing or failing types', async () => {
    const result = await resolveRecords('example.com', stubResolver({}));
    expect(result.records).toEqual({ a: [], aaaa: [], cname: [], mx: [], ns: [], soa: [], srv: [], txt: [], caa: [] });
    expect(result.partial).toBe(false);
  });

  it('filters private and reserved address answers', async () => {
    const result = await resolveRecords(
      'example.com',
      stubResolver({
        A: ['10.0.0.1', '192.0.2.1', '87.104.91.82'],
        AAAA: [
          'fc00::1',
          'fe80::1',
          '0:0:0:0:0:0:0:1',
          '0:0:0:0:0:ffff:c0a8:0101',
          '0:0:0:0:0:ffff:c000:0201',
          '100::1',
          '2001:20::1',
          '3fff::1',
          '2001:0db8:0000:0000:0000:0000:0000:0001',
          'ff00:0000:0000:0000:0000:0000:0000:0001',
          '2606:4700:4700::1111',
          '2001:4860:4860::8888',
        ],
      }),
    );
    expect(result.records.a).toEqual(['87.104.91.82']);
    expect(result.records.aaaa).toEqual(['2606:4700:4700::1111', '2001:4860:4860::8888']);
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

  it('classifies the actual deadline as a timeout and stops queued resolver jobs', async () => {
    process.env.DNS_TIMEOUT_MS = '10';
    process.env.DNS_MAX_CONCURRENCY = '2';
    let calls = 0;
    const rejectActive: Array<(reason?: unknown) => void> = [];
    const resolver: DnsResolver = {
      resolve: () => {
        calls += 1;
        return new Promise((_resolve, reject) => {
          rejectActive.push(reject);
        });
      },
      cancel: () => {
        for (const reject of rejectActive) reject({ code: 'ECANCELLED' });
      },
    };
    await expect(resolveRecords('timeout.example.com', resolver)).rejects.toMatchObject({
      code: 'upstream_timeout',
    });
    await Promise.resolve();
    expect(calls).toBe(2);
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
    expect(calls).toBe(9);
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
    expect(calls).toBe(9);
    expect(first.cache).toBe('miss');
    expect(second.cache).toBe('hit');
  });

  it('keeps active pending work admitted and rejects new keys at cache pressure', async () => {
    process.env.DNS_CACHE_MAX = '1';
    let release!: () => void;
    const pending = new Promise<[]>((resolve) => {
      release = () => resolve([]);
    });
    const resolver: DnsResolver = {
      resolve: () => pending,
    };

    const first = resolveRecords('pending.example.com', resolver);
    const duplicate = resolveRecords('pending.example.com', resolver);
    const rejected = resolveRecords('other.example.com', resolver);

    await expect(rejected).rejects.toMatchObject({ code: 'upstream_unavailable' });
    release();
    await expect(first).resolves.toMatchObject({ cache: 'miss' });
    await expect(duplicate).resolves.toMatchObject({ cache: 'hit' });
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

  it('expires settled results after the result cache TTL', async () => {
    vi.useFakeTimers();
    process.env.DNS_CACHE_TTL_MS = '20';
    let calls = 0;
    const resolver: DnsResolver = {
      async resolve() {
        calls += 1;
        return [];
      },
    };

    await resolveRecords('expiry.example.com', resolver);
    await vi.advanceTimersByTimeAsync(21);
    const result = await resolveRecords('expiry.example.com', resolver);

    expect(result.cache).toBe('miss');
    expect(calls).toBe(18);
  });

  it('expires partial results after the failure cache TTL', async () => {
    vi.useFakeTimers();
    process.env.DNS_FAILURE_TTL_MS = '20';
    let calls = 0;
    const resolver: DnsResolver = {
      async resolve(_name, rrtype) {
        calls += 1;
        if (rrtype === 'A') return ['87.104.91.82'];
        throw new Error('SERVFAIL');
      },
    };

    const first = await resolveRecords('failure-cache.example.com', resolver);
    const cached = await resolveRecords('failure-cache.example.com', resolver);
    await vi.advanceTimersByTimeAsync(21);
    const expired = await resolveRecords('failure-cache.example.com', resolver);

    expect(first.partial).toBe(true);
    expect(cached.cache).toBe('hit');
    expect(expired.cache).toBe('miss');
    expect(calls).toBe(18);
  });

  it('evicts the oldest entry when the cache reaches its maximum size', async () => {
    process.env.DNS_CACHE_MAX = '2';
    let calls = 0;
    const resolver: DnsResolver = {
      async resolve() {
        calls += 1;
        return [];
      },
    };

    await resolveRecords('oldest.example.com', resolver);
    await resolveRecords('middle.example.com', resolver);
    await resolveRecords('newest.example.com', resolver);
    const evicted = await resolveRecords('oldest.example.com', resolver);

    expect(evicted.cache).toBe('miss');
    expect(calls).toBe(36);
  });
});
