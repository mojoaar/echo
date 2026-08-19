import { describe, expect, it } from 'vitest';
import { isValidHostname, resolveRecords, type DnsResolver } from './dns';

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

describe('resolveRecords', () => {
  it('returns records for each type', async () => {
    const resolver = stubResolver({
      A: ['87.104.91.82'],
      AAAA: ['2606:4700:4700::1111'],
      MX: [{ exchange: 'mx.example.com', priority: 10 }],
      NS: ['ns1.example.com'],
      TXT: [['v=spf1 include:_spf.example.com'], ['alpha', 'beta']],
      SOA: { nsname: 'ns1.example.com', hostmaster: 'hostmaster.example.com' },
    });
    const records = await resolveRecords('example.com', resolver);
    expect(records.a).toEqual(['87.104.91.82']);
    expect(records.aaaa).toEqual(['2606:4700:4700::1111']);
    expect(records.mx).toEqual(['[10] mx.example.com']);
    expect(records.ns).toEqual(['ns1.example.com']);
    expect(records.txt).toEqual(['v=spf1 include:_spf.example.com', 'alphabeta']);
    expect(records.soa).toEqual(['ns1.example.com hostmaster.example.com']);
  });

  it('returns empty arrays for missing or failing types', async () => {
    const records = await resolveRecords('example.com', stubResolver({}));
    expect(records).toEqual({ a: [], aaaa: [], mx: [], ns: [], txt: [], soa: [] });
  });
});
