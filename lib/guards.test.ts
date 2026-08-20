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
    cname: [],
    mx: ['[10] mail.example.com'],
    ns: [],
    soa: [],
    srv: [],
    txt: ['v=spf1 -all'],
    caa: [],
  },
};

const rdapResponse = {
  ip: {
    handle: 'NET-EXAMPLE',
    name: 'Example Network',
    startAddress: '192.0.2.0',
    endAddress: '192.0.2.255',
    country: 'US',
    cidr: '192.0.2.0/24',
    organization: 'Example Org',
    registrant: 'Example Org',
    abuse: { email: 'abuse@example.com', phone: null },
  },
  asn: {
    handle: 'AS64500',
    name: 'Example ASN',
    startAutnum: 64500,
    endAutnum: 64500,
    country: 'US',
    organization: 'Example Org',
    abuse: { email: 'abuse@example.com', phone: null },
  },
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
    expect(isRdapResponse({ ip: null, asn: null })).toBe(true);
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
    expect(isRdapResponse({ ...rdapResponse, ip: { ...rdapResponse.ip, organization: 42 } })).toBe(false);
    expect(isRdapResponse({ ...rdapResponse, ip: { ...rdapResponse.ip, abuse: { email: 'abuse@example.com' } } })).toBe(false);
    expect(isRdapResponse({ ...rdapResponse, asn: { ...rdapResponse.asn, abuse: 'abuse@example.com' } })).toBe(false);
  });

  it('rejects ASN ranges that are negative, fractional, or unsafe integers', () => {
    expect(isRdapResponse({ ...rdapResponse, asn: { ...rdapResponse.asn, startAutnum: -1 } })).toBe(false);
    expect(isRdapResponse({ ...rdapResponse, asn: { ...rdapResponse.asn, startAutnum: 1.5 } })).toBe(false);
    expect(isRdapResponse({
      ...rdapResponse,
      asn: { ...rdapResponse.asn, endAutnum: Number.MAX_SAFE_INTEGER + 1 },
    })).toBe(false);
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
