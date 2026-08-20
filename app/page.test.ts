import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const { lookupInfo, recordActivityEvent } = vi.hoisted(() => ({ lookupInfo: vi.fn(), recordActivityEvent: vi.fn() }));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-real-ip': '192.168.1.10' })),
}));

vi.mock('@/lib/geo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/geo')>()),
  lookupInfo,
}));

vi.mock('@/lib/db', () => ({
  countLookups: vi.fn(() => 0),
  countSince: vi.fn(() => 0),
  countCountries: vi.fn(() => 0),
  topCountryCodes: vi.fn(() => []),
}));

vi.mock('@/lib/activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/activity')>()),
  recordActivityEvent,
}));

import Page from '@/app/page';

function findText(node: ReactNode, text: string): boolean {
  if (typeof node === 'string') return node === text;
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((child) => findText(child, text));

  const element = node as { props?: { children?: ReactNode } };
  return findText(element.props?.children, text);
}

describe('home page query handling', () => {
  beforeEach(() => {
    lookupInfo.mockReset();
    recordActivityEvent.mockReset();
  });

  it('rejects repeated ip parameters instead of looking up the visitor ip', async () => {
    const page = await Page({
      searchParams: Promise.resolve({ ip: ['invalid', '8.8.8.8'] }),
    });

    expect(findText(page, '"invalid,8.8.8.8" is not a valid IP address.')).toBe(true);
    expect(findText(page, 'You are on a private network')).toBe(false);
    expect(lookupInfo).not.toHaveBeenCalled();
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  it('records a completed page lookup after geo data is available', async () => {
    lookupInfo.mockResolvedValue({
      ip: '8.8.8.8',
      city: 'Mountain View',
      region: 'California',
      country: 'US',
      countryCode: 'US',
      countryName: 'United States',
      flag: 'US',
      org: 'Google LLC',
      asn: 'AS15169',
      timezone: 'America/Los_Angeles',
      utcOffset: '-07:00',
      latitude: 37.4,
      longitude: -122.1,
      hostname: null,
      isPrivate: false,
    });

    await Page({ searchParams: Promise.resolve({ ip: '8.8.8.8' }) });

    expect(recordActivityEvent).toHaveBeenCalledWith(expect.objectContaining({
      ip: '192.168.1.10',
      iso: 'US',
      lookupType: 'page',
      channel: 'ui',
      actor: 'unknown',
      target: '8.8.8.8',
      outcome: 'success',
      partial: false,
    }));
  });

  it('does not record a failed page lookup', async () => {
    lookupInfo.mockRejectedValue(new Error('lookup failed'));

    await expect(Page({ searchParams: Promise.resolve({ ip: '8.8.8.8' }) })).rejects.toThrow('lookup failed');

    expect(recordActivityEvent).not.toHaveBeenCalled();
  });
});
