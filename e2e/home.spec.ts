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
        resolvedAt: '2026-08-19T12:00:00.000Z',
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
    '/?ip=8.8.8.8',
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

  await page.getByRole('button', { name: 'Load WHOIS data' }).click();
  await expect(page.locator('.whois-value').filter({ hasText: 'Google LLC' }).first()).toBeVisible();
  await expect(page.getByText('NET-8-8-8-0-1')).toBeVisible();
});

test('shows unconfigured connectivity diagnostics, retries independently, and makes no lookup call', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Connectivity diagnostic' })).toBeVisible();
  await expect(page.locator('.connectivity-result').nth(0)).toContainText('IPv4Not configured');
  await expect(page.locator('.connectivity-result').nth(1)).toContainText('IPv6Not configured');
  await expect(page.getByText('Browser reachability only. This does not measure or change the IP recorded by the server.')).toBeVisible();

  await page.getByRole('button', { name: 'Test connectivity' }).click();
  const retry = page.getByRole('button', { name: 'Retry connectivity test' });
  await retry.click();
  await expect(retry).toBeVisible();
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
