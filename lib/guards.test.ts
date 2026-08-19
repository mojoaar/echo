import { describe, expect, it } from 'vitest';
import {
  isDnsResponse,
  isIpInfo,
  isRdapResponse,
  isStatsResponse,
} from './guards';

const dnsResponse = {
  name: 'example.com',
  records: {
    a: ['192.0.2.1'],
    aaaa: [],
    mx: ['[10] mail.example.com'],
    ns: [],
    txt: ['v=spf1 -all'],
    soa: [],
  },
};

const rdapResponse = {
  handle: 'NET-EXAMPLE',
  name: 'Example Network',
  startAddress: '192.0.2.0',
  endAddress: '192.0.2.255',
  country: 'US',
  cidr: '192.0.2.0/24',
  organization: 'Example Org',
  registrant: 'Example Org',
  abuse: { email: 'abuse@example.com', phone: null },
};

const statsResponse = {
  total: 12,
  last24h: 4,
  topCountries: [{ iso: 'US', count: 3 }],
  topIps: [{ ip: '192.0.2.1', count: 2 }],
  daily: [{ day: '2026-08-19', count: 4 }],
};

const ipInfo = {
  ip: '192.0.2.1',
  city: null,
  region: null,
  country: 'US',
  countryCode: 'US',
  countryName: 'United States',
  flag: '🇺🇸',
  org: 'Example Org',
  asn: 'AS64500',
  timezone: 'UTC',
  utcOffset: '+00:00',
  latitude: 0,
  longitude: 0,
  hostname: null,
  isPrivate: false,
};

describe('runtime response guards', () => {
  it('accepts valid payloads and ignores extra fields', () => {
    expect(isDnsResponse({ ...dnsResponse, extra: true })).toBe(true);
    expect(isRdapResponse({ ...rdapResponse, extra: true })).toBe(true);
    expect(isStatsResponse({ ...statsResponse, extra: true })).toBe(true);
    expect(isIpInfo({ ...ipInfo, extra: true })).toBe(true);
    expect(isRdapResponse(null)).toBe(true);
  });

  it('rejects DNS payloads with missing arrays or wrong scalar types', () => {
    expect(isDnsResponse({ ...dnsResponse, name: 42 })).toBe(false);
    expect(isDnsResponse({ ...dnsResponse, records: { ...dnsResponse.records, a: '192.0.2.1' } })).toBe(
      false,
    );
    expect(isDnsResponse({ ...dnsResponse, records: { ...dnsResponse.records, txt: undefined } })).toBe(
      false,
    );
  });

  it('rejects RDAP payloads with malformed optional fields', () => {
    expect(isRdapResponse({ ...rdapResponse, organization: 42 })).toBe(false);
    expect(isRdapResponse({ ...rdapResponse, abuse: { email: 'abuse@example.com' } })).toBe(false);
    expect(isRdapResponse({ ...rdapResponse, abuse: 'abuse@example.com' })).toBe(false);
  });

  it('rejects stats payloads with missing arrays or wrong scalar types', () => {
    expect(isStatsResponse({ ...statsResponse, total: '12' })).toBe(false);
    expect(isStatsResponse({ ...statsResponse, topIps: undefined })).toBe(false);
    expect(isStatsResponse({ ...statsResponse, daily: [{ day: 'today', count: '4' }] })).toBe(false);
  });

  it('rejects IP info payloads with wrong nullable and scalar types', () => {
    expect(isIpInfo({ ...ipInfo, city: 42 })).toBe(false);
    expect(isIpInfo({ ...ipInfo, latitude: '0' })).toBe(false);
    expect(isIpInfo({ ...ipInfo, isPrivate: 'false' })).toBe(false);
  });
});
