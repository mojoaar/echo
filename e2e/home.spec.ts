import { expect, test, type Page } from '@playwright/test';

const publicIp = '8.8.8.8';

async function stubOptionalLookups(page: Page) {
  await page.route('**/api/dns**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        name: 'example.com',
        records: { a: ['93.184.216.34'], aaaa: [], mx: [], ns: [], txt: [], soa: [] },
        cache: 'miss',
        resolvedAt: '2026-08-19T20:15:03',
        durationMs: 12,
        partial: false,
      }),
    });
  });
  await page.route('**/api/whois**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ip: {
          handle: 'NET-8-8-8-0-1',
          name: 'LVLT-GOGL-8-8-8',
          startAddress: '8.8.8.0',
          endAddress: '8.8.8.255',
          country: 'US',
          cidr: '8.8.8.0/24',
          organization: 'Google LLC',
          registrant: 'Google LLC',
          abuse: { email: 'abuse@example.com', phone: null },
        },
        asn: null,
      }),
    });
  });
}

async function stubWhoisWithAsn(page: Page) {
  await page.route('**/api/whois**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ip: {
          handle: 'NET-8-8-8-0-1',
          name: 'LVLT-GOGL-8-8-8',
          startAddress: '8.8.8.0',
          endAddress: '8.8.8.255',
          country: 'US',
          cidr: '8.8.8.0/24',
          organization: 'Google LLC',
          registrant: 'Google LLC',
          abuse: null,
        },
        asn: {
          handle: 'AS15169',
          name: 'GOOGLE',
          startAutnum: 15169,
          endAutnum: 15169,
          country: 'US',
          organization: 'Google Network',
          abuse: null,
        },
      }),
    });
  });
}

async function stubLeaflet(page: Page) {
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', async (route) => {
    await route.fulfill({ contentType: 'text/css', body: '' });
  });
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.L={map:function(el){return {setView:function(){return this},remove:function(){},invalidateSize:function(){},el:el}},tileLayer:function(){return {addTo:function(){}}},divIcon:function(opts){return opts},marker:function(coords,opts){return {addTo:function(map){var node=document.createElement('div');node.innerHTML=opts.icon.html;map.el.appendChild(node.firstElementChild);return {bindPopup:function(){return {openPopup:function(){}}}}}}}};`,
    });
  });
}

test('renders the private-network home state and accessible controls', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'You are on a private network' })).toBeVisible();
  await expect(page.getByText('Your IP address')).toBeVisible();
  await expect(page.getByRole('search', { name: '' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Toggle light and dark mode' })).toBeVisible();
  await expect(page.locator('main')).toBeVisible();
});

test('navigates to IPv4 and IPv6 lookup query links', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'IP address to look up' });

  await input.fill(publicIp);
  await page.getByRole('button', { name: 'Lookup' }).click();
  await expect(page).toHaveURL(/\/?\?ip=8\.8\.8\.8$/);

  await input.fill('2001:4860:4860::8888');
  await page.getByRole('button', { name: 'Lookup' }).click();
  await expect(page).toHaveURL(/\?ip=2001%3A4860%3A4860%3A%3A8888$/);
});

test('copies the IP and JSON payload and reports clipboard failure honestly', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/?ip=8.8.8.8');
  await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copy as JSON', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toHaveCount(2);

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('clipboard denied'); } },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
});

test('copies the share link and reports share-link failure honestly', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as unknown as { copiedText: string }).copiedText = value;
        },
      },
    });
  });
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/?ip=8.8.8.8');

  const copyLink = page.getByRole('button', { name: 'Copy link', exact: true });
  await copyLink.click();
  await expect(page.getByRole('button', { name: 'Link copied', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { copiedText: string }).copiedText)).toBe(
    `${new URL(page.url()).origin}/?ip=8.8.8.8`,
  );

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('clipboard denied'); } },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy link failed', exact: true })).toBeVisible();
});

test('adds noindex lookup metadata and keeps the home metadata indexable', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/?ip=2001%3A4860%3A4860%3A%3A8888');

  await expect(page).toHaveTitle(/IP lookup: 2001:4860:4860::8888 \| echo/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /2001:4860:4860::8888/,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://echo.johansen.foo');

  await page.goto('/');
  await expect(page).toHaveTitle('echo | what the internet sees when you connect');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test('leaves invalid lookup metadata as the home metadata', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/?ip=not-an-ip');

  await expect(page).toHaveTitle('echo | what the internet sees when you connect');
  await expect(page.getByText('"not-an-ip" is not a valid IP address.')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test('rejects repeated lookup parameters instead of falling back to the visitor IP', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/?ip=invalid&ip=8.8.8.8');

  await expect(page.getByText('"invalid,8.8.8.8" is not a valid IP address.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You are on a private network' })).toHaveCount(0);
  await expect(page).toHaveTitle('echo | what the internet sees when you connect');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test('switches themes and persists the selected theme', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Toggle light and dark mode' });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('shows deterministic DNS and WHOIS success states', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await stubOptionalLookups(page);
  await page.goto('/?ip=8.8.8.8');

  await page.getByRole('textbox', { name: 'Hostname to resolve' }).fill('example.com');
  await page.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByText('93.184.216.34')).toBeVisible();
  await expect(page.getByText('Fresh result')).toBeVisible();
  await expect(page.locator('.dns-meta')).toContainText(/2026-08-19T20:15:03[+-]\d{2}:\d{2}/);

  await page.getByRole('button', { name: 'Load WHOIS data' }).click();
  await expect(page.locator('.whois-value').filter({ hasText: 'Google LLC' }).first()).toBeVisible();
  await expect(page.getByText('NET-8-8-8-0-1')).toBeVisible();
  await expect(page.getByRole('region', { name: 'WHOIS registration' })).toBeVisible();
});

test('renders IP and ASN registration independently without absent contact fields', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await stubWhoisWithAsn(page);
  await page.goto('/?ip=8.8.8.8');

  await page.getByRole('button', { name: 'Load WHOIS data' }).click();

  const registration = page.getByRole('region', { name: 'WHOIS registration' });
  await expect(registration).toContainText('IP netblock');
  await expect(registration).toContainText('NET-8-8-8-0-1');
  await expect(registration).toContainText('ASN organization');
  await expect(registration).toContainText('Google Network');
  await expect(registration).toContainText('AS15169');
  await expect(page.getByText('Abuse contact')).toHaveCount(0);
});

test('hides connectivity diagnostics when no probe is configured', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Connectivity diagnostic' })).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

test('renders the map modal with the CSS marker and restores focus', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await stubLeaflet(page);
  await page.goto('/?ip=8.8.8.8');
  const trigger = page.getByRole('button', { name: 'Open map' });
  await trigger.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const modalSize = await dialog.locator('.modal').evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    viewportWidth: window.innerWidth,
  }));
  expect(modalSize.width).toBeGreaterThan(0);
  expect(modalSize.width).toBeLessThanOrEqual(680);
  expect(modalSize.width).toBeLessThanOrEqual(modalSize.viewportWidth - 40);
  await expect(dialog.locator('.modal-map')).toBeVisible();
  await expect.poll(() => page.locator('.map-pin').count()).toBeGreaterThan(0);
  await expect(page.locator('.map-pin')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('switches the lookup statistics range selector', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/');
  const stats = page.getByRole('region', { name: 'Lookup statistics' });
  await expect(stats).toBeVisible();

  await expect(stats.getByRole('button', { name: '24h' })).toHaveAttribute('aria-pressed', 'true');
  await expect(stats).toContainText('in the last 24h');

  await stats.getByRole('button', { name: '7 days' }).click();
  await expect(stats.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
  await expect(stats).toContainText('in the last 7 days');

  await stats.getByRole('button', { name: '30 days' }).click();
  await expect(stats.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
  await expect(stats).toContainText('in the last 30 days');

  await stats.getByRole('button', { name: 'All' }).click();
  await expect(stats.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  await expect(stats).toContainText('total ·');
});
