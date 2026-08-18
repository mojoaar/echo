import { describe, it, expect } from 'vitest';
import { lookupInfo, flagEmoji, utcOffsetFor, type Readers } from './geo';

const cityRecords: Record<string, unknown> = {
  '8.8.8.8': {
    country: { iso_code: 'US', names: { en: 'United States' } },
    subdivisions: [{ names: { en: 'California' } }],
    city: { names: { en: 'Mountain View' } },
    location: { latitude: 37.4223, longitude: -122.0848, time_zone: 'America/Los_Angeles' },
  },
  '2001:4860:4860::8888': {
    country: { iso_code: 'US', names: { en: 'United States' } },
    subdivisions: [{ names: { en: 'California' } }],
    city: { names: { en: 'Mountain View' } },
    location: { latitude: 37.4223, longitude: -122.0848, time_zone: 'America/Los_Angeles' },
  },
  '1.1.1.1': {
    country: { iso_code: 'AU', names: { en: 'Australia' } },
    city: { names: { en: 'Brisbane' } },
    location: { latitude: -27.4679, longitude: 153.0278 },
  },
  '9.9.9.9': {
    country: { iso_code: 'US', names: { en: 'United States' } },
    location: { latitude: 200, longitude: 200 },
  },
};

const asnRecords: Record<string, unknown> = {
  '8.8.8.8': { autonomous_system_organization: 'Google LLC', autonomous_system_number: 15169 },
  '2001:4860:4860::8888': { autonomous_system_organization: 'Google LLC', autonomous_system_number: 15169 },
};

const stubReaders: Readers = {
  city: { get: (ip: string) => cityRecords[ip] ?? null },
  asn: { get: (ip: string) => asnRecords[ip] ?? null },
};

describe('flagEmoji', () => {
  it('maps country codes to regional-indicator flag emoji', () => {
    expect(flagEmoji('US')).toBe('🇺🇸');
    expect(flagEmoji('au')).toBe('🇦🇺');
  });
  it('returns a neutral globe for anything else', () => {
    expect(flagEmoji('ZZ')).toBe('🌐');
    expect(flagEmoji('')).toBe('🌐');
  });
});

describe('utcOffsetFor', () => {
  it('returns a ±HH:MM offset for a named zone', () => {
    const offset = utcOffsetFor('America/Los_Angeles');
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
  });
  it('zero-pads and signs single-digit offsets', () => {
    const offset = utcOffsetFor('Asia/Kolkata');
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
    expect(offset?.startsWith('+')).toBe(true);
  });
  it('returns +00:00 for zero-offset zones', () => {
    expect(utcOffsetFor('UTC')).toBe('+00:00');
    expect(utcOffsetFor('Etc/UTC')).toBe('+00:00');
    expect(utcOffsetFor('GMT')).toBe('+00:00');
    expect(utcOffsetFor('Etc/GMT')).toBe('+00:00');
  });
  it('returns null for invalid zones', () => {
    expect(utcOffsetFor('Not/AZone')).toBeNull();
  });
  it('returns null for an empty zone', () => {
    expect(utcOffsetFor('')).toBeNull();
  });
  it('does not coerce a malformed gmt string to +00:00', () => {
    expect(utcOffsetFor('GMT+xx')).toBeNull();
  });
});

describe('lookupInfo', () => {
  it('produces a full normalized payload from city + asn records', async () => {
    const info = await lookupInfo('8.8.8.8', { hostname: false, readers: stubReaders });
    expect(info.ip).toBe('8.8.8.8');
    expect(info.countryCode).toBe('US');
    expect(info.country).toBe('US');
    expect(info.countryName).toBe('United States');
    expect(info.flag).toBe('🇺🇸');
    expect(info.city).toBe('Mountain View');
    expect(info.region).toBe('California');
    expect(info.org).toBe('Google LLC');
    expect(info.asn).toBe('AS15169');
    expect(info.latitude).toBeCloseTo(37.4223);
    expect(info.longitude).toBeCloseTo(-122.0848);
    expect(info.timezone).toBe('America/Los_Angeles');
    expect(info.utcOffset).toMatch(/^[+-]\d{2}:\d{2}$/);
    expect(info.isPrivate).toBe(false);
  });

  it('supports IPv6 addresses', async () => {
    const info = await lookupInfo('2001:4860:4860::8888', { hostname: false, readers: stubReaders });
    expect(info.ip).toBe('2001:4860:4860::8888');
    expect(info.countryCode).toBe('US');
  });

  it('leaves unknown records as nulls instead of throwing', async () => {
    const info = await lookupInfo('5.6.7.8', { hostname: false, readers: stubReaders });
    expect(info.countryCode).toBeNull();
    expect(info.latitude).toBeNull();
  });

  it('marks private ranges and returns no coordinates', async () => {
    const info = await lookupInfo('192.168.1.1', { hostname: false, readers: stubReaders });
    expect(info.isPrivate).toBe(true);
    expect(info.latitude).toBeNull();
    expect(info.countryCode).toBeNull();
  });

  it('keeps hostname null when hostname is disabled', async () => {
    const info = await lookupInfo('8.8.8.8', { hostname: false, readers: stubReaders });
    expect(info.hostname).toBeNull();
  });

  it('derives timezone from coordinates when the city record has no time_zone', async () => {
    const info = await lookupInfo('1.1.1.1', { hostname: false, readers: stubReaders });
    expect(info.timezone).toBe('Australia/Brisbane');
    expect(info.utcOffset).toMatch(/^[+-]\d{2}:\d{2}$/);
  });

  it('keeps timezone null when coordinates are invalid', async () => {
    const info = await lookupInfo('9.9.9.9', { hostname: false, readers: stubReaders });
    expect(info.timezone).toBeNull();
    expect(info.utcOffset).toBeNull();
  });
});