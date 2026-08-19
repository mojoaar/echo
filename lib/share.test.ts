import { afterEach, describe, expect, it } from 'vitest';
import { generateMetadata } from '@/app/page';
import { buildLookupUrl } from '@/lib/share';

const originalAppUrl = process.env.APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
});

describe('buildLookupUrl', () => {
  it('builds an encoded IPv4 lookup URL', () => {
    expect(buildLookupUrl('https://echo.example', '8.8.8.8')).toBe(
      'https://echo.example/?ip=8.8.8.8',
    );
  });

  it('builds an encoded compressed IPv6 lookup URL', () => {
    expect(buildLookupUrl('https://echo.example', '2001:4860:4860::8888')).toBe(
      'https://echo.example/?ip=2001%3A4860%3A4860%3A%3A8888',
    );
  });

  it('encodes arbitrary query values through URL search params', () => {
    expect(buildLookupUrl('https://echo.example/path?source=test', 'hello world')).toBe(
      'https://echo.example/?ip=hello+world',
    );
  });

  it('rejects an invalid base URL', () => {
    expect(() => buildLookupUrl('not a URL', '8.8.8.8')).toThrow();
  });
});

describe('lookup metadata', () => {
  it('keeps the home page indexable', async () => {
    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) });

    expect(metadata).toEqual({});
  });

  it('describes valid lookup queries and points canonical metadata at the main site', async () => {
    process.env.APP_URL = 'https://configured.example';
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ ip: '2001:4860:4860::8888' }),
    });

    expect(metadata.title).toContain('2001:4860:4860::8888');
    expect(metadata.description).toContain('2001:4860:4860::8888');
    expect(metadata.alternates?.canonical).toBe('https://configured.example/');
    expect(metadata.robots).toMatchObject({ index: false, follow: true });
  });

  it('does not add lookup metadata for invalid query values', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ ip: 'not-an-ip' }),
    });

    expect(metadata).toEqual({});
  });
});
