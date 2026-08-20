import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { ReactNode } from 'react';

const { cookies, noStore, notFound, verifyAdminSession } = vi.hoisted(() => ({
  cookies: vi.fn(),
  noStore: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  }),
  verifyAdminSession: vi.fn(() => ({ valid: false, expiresAt: 0 })),
}));

vi.mock('next/headers', () => ({ cookies }));
vi.mock('next/cache', () => ({ unstable_noStore: noStore }));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('@/lib/admin-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin-auth')>()),
  verifyAdminSession,
}));

import Page, { metadata } from '@/app/admin/page';
import AdminControls, { dateRangeForPreset, sameOriginAdminPath } from '@/components/admin/AdminControls';
import ActivityTable from '@/components/admin/ActivityTable';
import ResourceCards from '@/components/admin/ResourceCards';

const emptyActivity = {
  totalSuccessfulEvents: 0,
  uniqueIps: 0,
  countries: [],
  types: [],
  outcomes: [],
  events: [],
  legacy: [],
};

const emptyResources = {
  current: null,
  sampler: { enabled: false, running: false, lastSuccessTs: null, lastError: null },
  history: [],
};

afterEach(() => {
  delete process.env.ADMIN_TOKEN;
  cookies.mockReset();
  noStore.mockReset();
  notFound.mockClear();
  verifyAdminSession.mockReset();
  verifyAdminSession.mockReturnValue({ valid: false, expiresAt: 0 });
});

function pageCookies(value?: string) {
  cookies.mockResolvedValue({ get: () => (value ? { value } : undefined) });
}

function hasText(node: ReactNode, text: string): boolean {
  if (typeof node === 'string') return node.includes(text);
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((child) => hasText(child, text));
  const element = node as { props?: { children?: ReactNode } };
  return hasText(element.props?.children, text);
}

describe('admin page', () => {
  it('returns a not-found response when admin is disabled', async () => {
    pageCookies();

    await expect(Page()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(notFound).toHaveBeenCalledOnce();
  });

  it('renders the compact login state without exposing the configured token', async () => {
    process.env.ADMIN_TOKEN = 'do-not-render-this';
    pageCookies();

    const page = await Page();
    const html = renderToStaticMarkup(page);

    expect(html).toContain('Admin access');
    expect(html).toContain('name="token"');
    expect(html).not.toContain('do-not-render-this');
    expect(noStore).toHaveBeenCalledOnce();
  });

  it('renders the authenticated dashboard shell without token data', async () => {
    process.env.ADMIN_TOKEN = 'do-not-render-this';
    pageCookies('valid-session');
    verifyAdminSession.mockReturnValue({ valid: true, expiresAt: Date.now() + 1_000 });

    const page = await Page();
    const html = renderToStaticMarkup(page);

    expect(html).toContain('Admin dashboard');
    expect(html).toContain('unique IPs');
    expect(html).toContain('Daily / 24h');
    expect(html).not.toContain('do-not-render-this');
  });

  it('marks the page as non-indexable', () => {
    expect(metadata).toMatchObject({ robots: { index: false, follow: false } });
  });
});

describe('admin controls and data states', () => {
  it('builds container-date ranges for daily, weekly, and monthly presets', () => {
    expect(dateRangeForPreset('daily', '2026-08-20')).toEqual({ from: '2026-08-20', to: '2026-08-20' });
    expect(dateRangeForPreset('weekly', '2026-08-20')).toEqual({ from: '2026-08-14', to: '2026-08-20' });
    expect(dateRangeForPreset('monthly', '2026-08-20')).toEqual({ from: '2026-07-22', to: '2026-08-20' });
  });

  it('keeps custom ranges and API paths same-origin', () => {
    expect(dateRangeForPreset('custom', '2026-08-20', '2026-08-01', '2026-08-03')).toEqual({
      from: '2026-08-01',
      to: '2026-08-03',
    });
    expect(sameOriginAdminPath('/api/admin/activity?from=2026-08-20')).toBe('/api/admin/activity?from=2026-08-20');
    expect(sameOriginAdminPath('https://example.test/api/admin/activity')).toBeNull();
  });

  it('renders empty activity and unavailable resource states', () => {
    const activityHtml = renderToStaticMarkup(
      createElement(ActivityTable, { result: emptyActivity }),
    );
    const resourceHtml = renderToStaticMarkup(
      createElement(ResourceCards, { resources: emptyResources, timezone: 'Europe/Copenhagen' }),
    );

    expect(activityHtml).toContain('No activity for this range.');
    expect(activityHtml).toContain('unique IPs');
    expect(resourceHtml).toContain('Resource data unavailable');
    expect(resourceHtml).toContain('CPU unavailable until the second sample');
    expect(resourceHtml).toContain('Europe/Copenhagen');
  });

  it('labels legacy rows and heuristic bot classification clearly', () => {
    const html = renderToStaticMarkup(
      createElement(ActivityTable, {
        result: {
          ...emptyActivity,
          events: [{
            id: 1,
            source: 'activity',
            ip: '203.0.113.10',
            iso: 'US',
            ts: Date.parse('2026-08-20T10:00:00Z'),
            lookupType: 'dns',
            channel: 'api',
            actor: 'bot',
            target: 'example.com',
            outcome: 'success',
            partial: false,
          }],
          legacy: [{
            id: null,
            source: 'legacy',
            ip: '203.0.113.11',
            iso: null,
            ts: Date.parse('2026-08-20T09:00:00Z'),
            lookupType: 'legacy',
            channel: 'unknown',
            actor: 'unknown',
            target: null,
            outcome: 'success',
            partial: false,
          }],
        },
      }),
    );

    expect(html).toContain('203.0.113.10');
    expect(html).toContain('legacy/unclassified');
    expect(html).toContain('Bot labels are heuristic');
  });

  it('includes controls required for date, filters, pagination, and logout', () => {
    const html = renderToStaticMarkup(
      createElement(AdminControls, {
        today: '2026-08-20',
        initialActivity: emptyActivity,
        initialResources: emptyResources,
        timezone: 'UTC',
      }),
    );

    expect(html).toContain('Daily / 24h');
    expect(html).toContain('Weekly / 7d');
    expect(html).toContain('Monthly / 30d');
    expect(html).toContain('Custom range');
    expect(html).toContain('Lookup type');
    expect(html).toContain('Previous page');
    expect(html).toContain('Log out');
  });
});
