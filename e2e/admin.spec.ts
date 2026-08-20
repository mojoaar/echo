import { expect, test } from '@playwright/test';

const ADMIN_TOKEN = 'test-admin-token';
const configuredPort = process.env.ECHO_PLAYWRIGHT_CONFIGURED_PORT ?? '3001';

test.describe.configure({ mode: 'serial' });

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.getByLabel('Admin token').fill(ADMIN_TOKEN);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
}

function adminAlert(page: import('@playwright/test').Page) {
  return page.locator('p[role="alert"]');
}

function activityPayload(events = [
  {
    id: 1,
    source: 'activity',
    ip: '203.0.113.10',
    iso: 'US',
    ts: Date.parse('2026-08-20T10:00:00Z'),
    lookupType: 'dns',
    channel: 'api',
    actor: 'browser',
    target: 'example.com',
    outcome: 'success',
    partial: false,
  },
]) {
  return {
    totalSuccessfulEvents: events.length,
    uniqueIps: events.length,
    countries: [{ iso: 'US', count: events.length }],
    types: [{ value: 'dns', count: events.length }],
    outcomes: [{ value: 'success', count: events.length }],
    events,
    legacy: [],
  };
}

async function stubAdminData(page: import('@playwright/test').Page, resources: unknown = {
  current: null,
  sampler: { enabled: false, running: false, lastSuccessTs: null, lastError: null },
  history: [],
}) {
  await page.route('**/api/admin/activity**', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(activityPayload()) });
  });
  await page.route('**/api/admin/resources**', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(resources) });
  });
}

test('does not expose admin when ADMIN_TOKEN is disabled', async ({ request }) => {
  const response = await request.get(`http://127.0.0.1:${configuredPort}/admin`);
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain(ADMIN_TOKEN);
});

test('rejects invalid login, accepts the test token, and protects the dashboard with a strict cookie', async ({ page, context }) => {
  await page.goto('/admin');
  await page.getByLabel('Admin token').fill('wrong-token');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Invalid admin token.', { exact: true })).toBeVisible();

  await page.getByLabel('Admin token').fill(ADMIN_TOKEN);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
  const cookie = (await context.cookies()).find(({ name }) => name === 'echo_admin_session');
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' });

  await context.clearCookies();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Admin access' })).toBeVisible();
});

test('logs out and returns to the protected login screen', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('heading', { name: 'Admin access' })).toBeVisible();
  await expect(page.getByLabel('Admin token')).toBeVisible();
});

test('applies daily, weekly, monthly, and custom date ranges', async ({ page }) => {
  await signIn(page);
  const activityUrls: string[] = [];
  await page.route('**/api/admin/activity**', async (route) => {
    activityUrls.push(route.request().url());
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(activityPayload()) });
  });
  await page.route('**/api/admin/resources**', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ current: null, sampler: { enabled: false, running: false, lastSuccessTs: null, lastError: null }, history: [] }) });
  });

  const from = page.getByLabel('From');
  const to = page.getByRole('textbox', { name: 'To' });
  for (const preset of ['Daily / 24h', 'Weekly / 7d', 'Monthly / 30d'] as const) {
    await page.getByRole('button', { name: preset }).click();
    await expect.poll(() => activityUrls.length).toBeGreaterThan(0);
    const url = new URL(activityUrls.at(-1) as string);
    expect(url.searchParams.get('from')).toBe(await from.inputValue());
    expect(url.searchParams.get('to')).toBe(await to.inputValue());
  }

  await page.getByRole('button', { name: 'Custom range' }).click();
  await from.fill('2026-08-01');
  await to.fill('2026-08-15');
  await expect(from).toHaveValue('2026-08-01');
  await expect(to).toHaveValue('2026-08-15');
  const customRequest = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/admin/activity');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  const customUrl = new URL((await customRequest).url());
  expect(customUrl.searchParams.get('from')).toBe('2026-08-01');
  expect(customUrl.searchParams.get('to')).toBe('2026-08-15');
});

test('filters activity and renders the table, resource cards, and charts', async ({ page }) => {
  await signIn(page);
  const activityUrls: string[] = [];
  const events = [
    {
      id: 1,
      source: 'activity',
      ip: '203.0.113.42',
      iso: 'GB',
      ts: Date.parse('2026-08-20T10:00:00Z'),
      lookupType: 'dns',
      channel: 'api',
      actor: 'bot',
      target: 'example.net',
      outcome: 'partial',
      partial: true,
    },
  ];
  const resources = {
    current: {
      ts: Date.parse('2026-08-20T10:00:00Z'),
      cpuPercent: 12.5,
      memoryUsedBytes: 5 * 1024 * 1024,
      memoryLimitBytes: 64 * 1024 * 1024,
      dataUsedBytes: 7 * 1024 * 1024,
      databaseBytes: 2 * 1024 * 1024,
      walBytes: 1024,
      shmBytes: 2048,
      otherDataBytes: 1024,
      lookupRows: 12,
      activityRows: 8,
      uptimeSeconds: 3661,
      localTs: '2026-08-20 12:00:00',
      imageSizeBytes: 32 * 1024 * 1024,
    },
    sampler: { enabled: true, running: true, lastSuccessTs: Date.parse('2026-08-20T10:00:00Z'), lastError: null },
    history: [
      { ts: 1, memoryUsedBytes: 1024, dataUsedBytes: 2048 },
      { ts: 2, memoryUsedBytes: 2048, dataUsedBytes: 4096 },
    ],
  };
  await page.route('**/api/admin/activity**', async (route) => {
    activityUrls.push(route.request().url());
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...activityPayload(events), types: [{ value: 'dns', count: 1 }], countries: [{ iso: 'GB', count: 1 }], outcomes: [{ value: 'partial', count: 1 }] }) });
  });
  await page.route('**/api/admin/resources**', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(resources) });
  });

  await page.getByLabel('Lookup type').selectOption('dns');
  await page.getByLabel('Channel').selectOption('api');
  await page.getByLabel('Actor').selectOption('bot');
  await page.getByLabel('Country').fill('gb');
  await page.getByLabel('Outcome').selectOption('partial');
  await page.getByRole('textbox', { name: 'IP' }).fill('203.0.113.42');
  await expect(page.getByLabel('Lookup type')).toHaveValue('dns');
  await expect(page.getByLabel('Channel')).toHaveValue('api');
  await expect(page.getByLabel('Actor')).toHaveValue('bot');
  await expect(page.getByLabel('Country')).toHaveValue('GB');
  await expect(page.getByLabel('Outcome')).toHaveValue('partial');
  await expect(page.getByRole('textbox', { name: 'IP' })).toHaveValue('203.0.113.42');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('cell', { name: '203.0.113.42' })).toBeVisible();
  await expect(page.getByText('partial', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('12.5%')).toBeVisible();
  await expect(page.getByText('5.0 MB')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Memory history' })).toBeVisible();
  await expect(page.getByRole('img', { name: '/data history' })).toBeVisible();
  await expect.poll(() => activityUrls.some((value) => new URL(value).searchParams.get('type') === 'dns')).toBeTruthy();
  const url = new URL(activityUrls.find((value) => new URL(value).searchParams.get('type') === 'dns') as string);
  expect(url.searchParams.get('type')).toBe('dns');
  expect(url.searchParams.get('channel')).toBe('api');
  expect(url.searchParams.get('actor')).toBe('bot');
  expect(url.searchParams.get('country')).toBe('GB');
  expect(url.searchParams.get('outcome')).toBe('partial');
  expect(url.searchParams.get('ip')).toBe('203.0.113.42');
});

test('does not include the admin token in HTML or network response bodies', async ({ page }) => {
  const responseBodies: Promise<string>[] = [];
  page.on('requestfinished', (request) => {
    if ((request.resourceType() === 'fetch' || request.resourceType() === 'xhr') && new URL(request.url()).pathname.startsWith('/api/admin/')) {
      responseBodies.push(request.response().then((response) => response?.text() ?? '').catch(() => ''));
    }
  });
  await signIn(page);
  await stubAdminData(page);
  const activityResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/activity');
  const resourcesResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/resources');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await Promise.all([activityResponse, resourcesResponse]);
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  expect(await page.content()).not.toContain(ADMIN_TOKEN);
  for (const body of await Promise.all(responseBodies)) expect(body).not.toContain(ADMIN_TOKEN);
});

test.describe('mobile admin', () => {
  test('supports responsive login, controls, tables, charts, and logout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin access' })).toBeVisible();
    await expect(page.locator('.admin-login-card')).toHaveCSS('width', /^(3[0-9]{2}|390)px$/);
    await signIn(page);
    await stubAdminData(page, {
      current: {
        ts: 1, cpuPercent: 1, memoryUsedBytes: 1024, memoryLimitBytes: 2048, dataUsedBytes: 1024,
        databaseBytes: 1024, walBytes: 1024, shmBytes: 1024, otherDataBytes: 1024, lookupRows: 1,
        activityRows: 1, uptimeSeconds: 60, localTs: 'now', imageSizeBytes: null,
      },
      sampler: { enabled: false, running: false, lastSuccessTs: null, lastError: null },
      history: [{ ts: 1, memoryUsedBytes: 1, dataUsedBytes: 1 }, { ts: 2, memoryUsedBytes: 2, dataUsedBytes: 2 }],
    });
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('cell', { name: '203.0.113.10' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Memory history' })).toBeVisible();
    await expect(page.getByRole('img', { name: '/data history' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    const controls = page.locator('.admin-shell button:visible, .admin-shell input:visible, .admin-shell select:visible');
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await controls.nth(index).boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('heading', { name: 'Admin access' })).toBeVisible();
  });
});

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
  await expect(adminAlert(page)).toContainText('database unavailable');
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
  await expect(adminAlert(page)).toContainText('activity unavailable');
  await expect(page.getByText('203.0.113.99')).not.toBeVisible();
});

test('distinguishes invalid tokens from login server errors', async ({ page }) => {
  await page.goto('/admin');
  await page.route('**/api/admin/login', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'database unavailable', code: 'internal_error' }) });
  });
  await page.getByLabel('Admin token').fill('wrong-token');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(adminAlert(page)).toHaveText('Unable to sign in right now.');

  await page.unroute('**/api/admin/login');
  await page.route('**/api/admin/login', async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found', code: 'not_found' }) });
  });
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(adminAlert(page)).toHaveText('Invalid admin token.');
});

test('shows expired sessions, clears stale resources, and catches logout failures', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/admin/activity**', async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found', code: 'not_found' }) });
  });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(adminAlert(page)).toContainText('Session expired. Log in again.');

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
  await expect(page.getByText('Unable to log out.', { exact: true })).toBeVisible();
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
  await expect(page.getByLabel('Lookup type')).toHaveValue('dns');
  await expect(page.getByLabel('Channel')).toHaveValue('api');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('cell', { name: '203.0.113.50' })).toBeVisible();
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
  await expect(adminAlert(page)).toContainText('Session expired. Log in again.');
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
