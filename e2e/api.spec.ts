import { expect, test } from '@playwright/test';

test('health route exposes public liveness without lookup data', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  await expect(response).toBeOK();
  await expect(response.json()).resolves.toEqual({ status: 'ok' });
});

test('DNS error and partial states are deterministic through route interception', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.route('**/api/dns**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('name') === 'partial.example.com') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: 'partial.example.com',
          records: { a: ['192.0.2.1'], aaaa: [], mx: [], ns: [], txt: [], soa: [] },
          cache: 'hit',
          resolvedAt: '2026-08-19T12:00:00.000Z',
          durationMs: 3,
          partial: true,
        }),
      });
      return;
    }
    if (url.searchParams.get('name') === 'error.example.com') {
      await route.fulfill({
        status: 504,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'dns lookup timed out', code: 'upstream_timeout' }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto('/');

  await page.getByRole('textbox', { name: 'Hostname to resolve' }).fill('partial.example.com');
  await page.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByText('Cached result')).toBeVisible();
  await expect(page.getByText('Some record types could not be resolved.')).toBeVisible();

  await page.getByRole('textbox', { name: 'Hostname to resolve' }).fill('error.example.com');
  await page.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.locator('p[role="alert"]').filter({ hasText: 'DNS lookup timed out.' })).toBeVisible();
});

test('WHOIS failure exposes retry state before a successful retry', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  let attempts = 0;
  await page.route('**/api/whois**', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'whois unavailable', code: 'upstream_unavailable' }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ip: null, asn: null }),
    });
  });
  await page.goto('/?ip=8.8.8.8');
  await page.getByRole('button', { name: 'Load WHOIS data' }).click();
  await expect(page.locator('p[role="alert"]').filter({ hasText: 'Could not load WHOIS data.' })).toBeVisible();
  await page.getByRole('button', { name: 'Load WHOIS data' }).click();
  await expect(page.getByText('Registration data is unavailable. Retry to check again.')).toBeVisible();
});
