import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.getByLabel('Admin token').fill('test-admin-token');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
}

test('shows loading and honest activity API errors', async ({ page }) => {
  await signIn(page);
  let release: (() => void) | undefined;
  await page.route('**/api/admin/activity**', async (route) => {
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'database unavailable', code: 'internal_error' }),
    });
  });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('button', { name: 'Loading...' })).toBeVisible();
  release?.();
  await expect(page.getByRole('alert')).toContainText('database unavailable');
});

test('clears stale activity rows when a later activity request fails', async ({ page }) => {
  await signIn(page);
  let activityAttempts = 0;
  await page.route('**/api/admin/activity**', async (route) => {
    activityAttempts += 1;
    if (activityAttempts === 1) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          totalSuccessfulEvents: 1,
          uniqueIps: 1,
          countries: [],
          types: [],
          outcomes: [],
          events: [{
            id: 1,
            source: 'activity',
            ip: '203.0.113.99',
            iso: 'US',
            ts: Date.parse('2026-08-20T10:00:00Z'),
            lookupType: 'dns',
            channel: 'api',
            actor: 'browser',
            target: 'example.com',
            outcome: 'success',
            partial: false,
          }],
          legacy: [],
        }),
      });
      return;
    }
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'activity unavailable' }) });
  });
  await page.route('**/api/admin/resources**', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ current: null, sampler: { enabled: false, running: false, lastSuccessTs: null, lastError: null }, history: [] }) });
  });

  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('203.0.113.99')).toBeVisible();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('alert')).toContainText('activity unavailable');
  await expect(page.getByText('203.0.113.99')).not.toBeVisible();
});

test('distinguishes invalid tokens from login server errors', async ({ page }) => {
  await page.goto('/admin');
  await page.route('**/api/admin/login', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'database unavailable', code: 'internal_error' }) });
  });
  await page.getByLabel('Admin token').fill('wrong-token');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Unable to sign in right now.');

  await page.unroute('**/api/admin/login');
  await page.route('**/api/admin/login', async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found', code: 'not_found' }) });
  });
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid admin token.');
});

test('shows expired sessions, clears stale resources, and catches logout failures', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/admin/activity**', async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found', code: 'not_found' }) });
  });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('alert')).toContainText('Session expired. Log in again.');

  await page.unroute('**/api/admin/activity**');
  let resourceAttempts = 0;
  await page.route('**/api/admin/resources**', async (route) => {
    resourceAttempts += 1;
    if (resourceAttempts === 1) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ current: { localTs: 'known resource' }, sampler: { enabled: true, running: true, lastSuccessTs: null, lastError: null }, history: [] }) });
      return;
    }
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'resource sampler unavailable', code: 'internal_error' }) });
  });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('known resource')).toBeVisible();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('Resource data unavailable: resource sampler unavailable')).toBeVisible();
  await expect(page.getByText('known resource')).not.toBeVisible();

  await page.unroute('**/api/admin/resources**');
  await page.route('**/api/admin/logout', async (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to log out.');
});

test('applies filters and pagination through same-origin admin requests', async ({ page }) => {
  await signIn(page);
  const activityUrls: string[] = [];
  await page.route('**/api/admin/activity**', async (route) => {
    activityUrls.push(route.request().url());
    const url = new URL(route.request().url());
    const events = Array.from({ length: 50 }, (_, index) => ({
      id: index + 1,
      source: 'activity',
      ip: `203.0.113.${index + 1}`,
      iso: 'US',
      ts: Date.parse('2026-08-20T10:00:00Z') - index,
      lookupType: 'dns',
      channel: 'api',
      actor: 'browser',
      target: 'example.com',
      outcome: 'success',
      partial: false,
    }));
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ totalSuccessfulEvents: 50, uniqueIps: 50, countries: [], types: [], outcomes: [], events, legacy: [] }),
    });
    expect(url.pathname).toBe('/api/admin/activity');
  });
  await page.route('**/api/admin/resources**', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ current: null, sampler: { enabled: false, running: false, lastSuccessTs: null, lastError: null }, history: [] }) });
  });
  await page.getByLabel('Lookup type').selectOption('dns');
  await page.getByLabel('Channel').selectOption('api');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('203.0.113.50')).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect.poll(() => activityUrls.at(-1)).toContain('offset=50');
  expect(activityUrls.at(-1)).toContain('type=dns');
  expect(activityUrls.at(-1)).toContain('channel=api');
});

test('keeps the requested page when the resource request fails', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/admin/activity**', async (route) => {
    const events = Array.from({ length: 50 }, (_, index) => ({
      id: index + 1,
      source: 'activity',
      ip: `203.0.113.${index + 1}`,
      iso: 'US',
      ts: Date.parse('2026-08-20T10:00:00Z') - index,
      lookupType: 'dns',
      channel: 'api',
      actor: 'browser',
      target: 'example.com',
      outcome: 'success',
      partial: false,
    }));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ totalSuccessfulEvents: 50, uniqueIps: 50, countries: [], types: [], outcomes: [], events, legacy: [] }) });
  });
  let resourceAttempts = 0;
  await page.route('**/api/admin/resources**', async (route) => {
    resourceAttempts += 1;
    if (resourceAttempts === 1) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ current: null, sampler: { enabled: false, running: false, lastSuccessTs: null, lastError: null }, history: [] }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
  });

  await page.getByRole('button', { name: 'Apply filters' }).click();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Page 2')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Session expired. Log in again.');
});

test('keeps admin controls at least 44px on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const sizes = await page.locator('.admin-shell button, .admin-shell input, .admin-shell select').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(sizes.every(({ width, height }) => width >= 44 && height >= 44)).toBeTruthy();
});
