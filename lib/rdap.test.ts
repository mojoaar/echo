import { describe, expect, it } from 'vitest';
import { parseRdap, queryRdap } from './rdap';

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

  it('returns all-null fields for an empty object payload', async () => {
    const info = await queryRdap('8.8.8.8', async () => jsonResponse({}));
    expect(info).toEqual({
      handle: null,
      name: null,
      startAddress: null,
      endAddress: null,
      country: null,
      cidr: null,
      organization: null,
      registrant: null,
      abuse: null,
    });
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
