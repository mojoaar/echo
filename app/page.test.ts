import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const { lookupInfo } = vi.hoisted(() => ({ lookupInfo: vi.fn() }));

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
  insertLookup: vi.fn(),
  topCountryCodes: vi.fn(() => []),
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
  });

  it('rejects repeated ip parameters instead of looking up the visitor ip', async () => {
    const page = await Page({
      searchParams: Promise.resolve({ ip: ['invalid', '8.8.8.8'] }),
    });

    expect(findText(page, '"invalid,8.8.8.8" is not a valid IP address.')).toBe(true);
    expect(findText(page, 'You are on a private network')).toBe(false);
    expect(lookupInfo).not.toHaveBeenCalled();
  });
});
