import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRdap,
  fetchRdapAsn,
  parseRdap,
  parseRdapAsn,
  queryRdap,
  queryRdapAsn,
} from './rdap';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/rdap+json' },
  });
}

const arinFixture = {
  handle: 'NET-8-8-8-0-1',
  name: 'LVLT-GOGL-8-8-8',
  startAddress: '8.8.8.0',
  endAddress: '8.8.8.255',
  country: 'US',
  cidr0_cidrs: [{ v4prefix: '8.8.8.0', length: 24 }],
  entities: [
    {
      roles: ['abuse'],
      vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['email', {}, 'text', 'abuse@example.com']]],
    },
    {
      roles: ['registrant'],
      vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'Google LLC']]],
    },
  ],
};

const asnFixture = {
  handle: 'AS15169',
  name: 'GOOGLE',
  startAutnum: 15169,
  endAutnum: '15169',
  country: 'US',
  entities: [
    {
      roles: ['organization'],
      vcardArray: ['vcard', [['fn', {}, 'text', 'Google LLC']]],
    },
    {
      roles: ['abuse'],
      vcardArray: ['vcard', [['email', {}, 'text', 'abuse@google.com'], ['tel', {}, 'text', '+1-555-0100']]],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('queryRdap', () => {
  it('parses an arin-like rdap response', async () => {
    const info = await queryRdap('8.8.8.8', async () => jsonResponse(arinFixture));
    expect(info).toMatchObject({
      handle: 'NET-8-8-8-0-1',
      name: 'LVLT-GOGL-8-8-8',
      startAddress: '8.8.8.0',
      endAddress: '8.8.8.255',
      country: 'US',
      cidr: '8.8.8.0/24',
      registrant: 'Google LLC',
      abuse: { email: 'abuse@example.com', phone: null },
    });
    expect(info?.organization).toBe('Google LLC');
  });

  it('returns null when the registry responds with a non-2xx status', async () => {
    const info = await queryRdap('8.8.8.8', async () => jsonResponse({}, 404));
    expect(info).toBeNull();
  });

  it('returns null when the fetch rejects', async () => {
    const info = await queryRdap('8.8.8.8', async () => {
      throw new Error('boom');
    });
    expect(info).toBeNull();
  });

  it('returns null for a non-object payload', async () => {
    const info = await queryRdap('8.8.8.8', async () => jsonResponse([1, 2, 3]));
    expect(info).toBeNull();
  });

});

describe('ASN RDAP', () => {
  it('parses ASN registration fields and numeric ranges', async () => {
    const info = await queryRdapAsn(15169, async (url) => {
      expect(url).toContain('/autnum/15169');
      return jsonResponse(asnFixture);
    });
    expect(info).toEqual({
      handle: 'AS15169',
      name: 'GOOGLE',
      startAutnum: 15169,
      endAutnum: 15169,
      country: 'US',
      organization: 'Google LLC',
      abuse: { email: 'abuse@google.com', phone: '+1-555-0100' },
    });
  });

  it('ignores invalid vCards and unsafe ASN ranges', () => {
    expect(parseRdapAsn({
      handle: 'AS1',
      startAutnum: '9007199254740992',
      endAutnum: 'not-a-number',
      entities: [
        { roles: ['organization'], vcardArray: ['vcard', [['fn', {}, 'text', 42]]] },
        { roles: ['abuse'], vcardArray: ['vcard', [['email', {}, 'text', null]]] },
      ],
    })).toEqual({
      handle: 'AS1',
      name: null,
      startAutnum: null,
      endAutnum: null,
      country: null,
      organization: null,
      abuse: null,
    });
  });

  it('returns null for unavailable ASN responses and rejected requests', async () => {
    expect(await queryRdapAsn(15169, async () => jsonResponse({}, 503))).toBeNull();
    expect(await queryRdapAsn(15169, async () => { throw new Error('timeout'); })).toBeNull();
  });

  it('returns null for a successful empty ASN response', async () => {
    expect(await queryRdapAsn(15169, async () => jsonResponse({}))).toBeNull();
  });

  it('returns null for an ASN response with structurally empty entities', async () => {
    expect(await queryRdapAsn(15169, async () => jsonResponse({ entities: [{}] }))).toBeNull();
  });
});

describe('cached RDAP lookups', () => {
  it('shares one pending IP request between concurrent callers', async () => {
    let release!: () => void;
    const response = new Promise<Response>((resolve) => {
      release = () => resolve(jsonResponse(arinFixture));
    });
    const fetch = vi.fn(() => response);
    vi.stubGlobal('fetch', fetch);

    const first = fetchRdap('203.0.113.10');
    const second = fetchRdap('203.0.113.10');
    release();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('serves successful ASN lookups from cache', async () => {
    const fetch = vi.fn(async () => jsonResponse(asnFixture));
    vi.stubGlobal('fetch', fetch);
    await fetchRdapAsn(64500);
    await fetchRdapAsn(64500);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shares one pending ASN request between concurrent callers', async () => {
    let release!: () => void;
    const response = new Promise<Response>((resolve) => {
      release = () => resolve(jsonResponse(asnFixture));
    });
    const fetch = vi.fn(() => response);
    vi.stubGlobal('fetch', fetch);

    const first = fetchRdapAsn(64501);
    const second = fetchRdapAsn(64501);
    release();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries failed IP lookups after the failure ttl', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000);
      const fetch = vi.fn(async () => jsonResponse({}, 503));
      vi.stubGlobal('fetch', fetch);
      const first = fetchRdap('198.51.100.20');
      await expect(first).resolves.toBeNull();
      await expect(fetchRdap('198.51.100.20')).resolves.toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
      vi.setSystemTime(2_001);
      await expect(fetchRdap('198.51.100.20')).resolves.toBeNull();
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries failed ASN lookups after the failure ttl', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000);
      const fetch = vi.fn(async () => jsonResponse({}, 503));
      vi.stubGlobal('fetch', fetch);
      const first = fetchRdapAsn(64502);
      await expect(first).resolves.toBeNull();
      await expect(fetchRdapAsn(64502)).resolves.toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
      vi.setSystemTime(2_001);
      await expect(fetchRdapAsn(64502)).resolves.toBeNull();
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('parseRdap', () => {
  it('prefers the organization role for the organization field', () => {
    const parsed = parseRdap({
      entities: [
        { roles: ['organization'], vcardArray: ['vcard', [['fn', {}, 'text', 'ACME Corp']]] },
        { roles: ['registrant'], vcardArray: ['vcard', [['fn', {}, 'text', 'Jane Doe']]] },
      ],
    });
    expect(parsed?.organization).toBe('ACME Corp');
    expect(parsed?.registrant).toBe('Jane Doe');
  });
});
