import { expect, test } from '@playwright/test';

test('permits configured probes and displays independent success, failure, and timeout states', async ({ page }) => {
  let attempt = 0;
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiRequests.push(request.url());
  });
  await page.route('https://ipv4-probe.example.test/probe', async (route) => {
    if (attempt === 0) {
      await route.fulfill({
        status: 200,
        body: 'ok',
        headers: { 'access-control-allow-origin': 'http://127.0.0.1:3001' },
      });
    } else {
      await route.abort('failed');
    }
  });
  await page.route('https://ipv6-probe.example.test/probe', async (route) => {
    if (attempt === 0) {
      await route.fulfill({
        status: 503,
        body: 'unavailable',
        headers: { 'access-control-allow-origin': 'http://127.0.0.1:3001' },
      });
    } else {
      await new Promise((resolve) => setTimeout(resolve, 2_700));
      await route.fulfill({ status: 200, body: 'late' });
    }
  });

  const response = await page.goto('/');
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain('https://ipv4-probe.example.test');
  expect(csp).toContain('https://ipv6-probe.example.test');
  expect(csp).not.toContain('connect-src https:');

  await page.getByRole('button', { name: 'Test connectivity' }).click();
  await expect(page.locator('.connectivity-result').nth(0)).toContainText('Reachable');
  await expect(page.locator('.connectivity-result').nth(1)).toContainText('Unreachable');

  attempt = 1;
  await page.getByRole('button', { name: 'Retry connectivity test' }).click();
  await expect(page.locator('.connectivity-result').nth(0)).toContainText('Unreachable');
  await expect(page.locator('.connectivity-result').nth(1)).toContainText('Timed out');
  expect(apiRequests).toEqual([]);
});
