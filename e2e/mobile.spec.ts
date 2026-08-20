import { expect, test } from '@playwright/test';

test('mobile layout has no horizontal overflow and keeps controls at 44px', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/?ip=8.8.8.8');
  await page.getByRole('textbox', { name: 'Hostname to resolve' }).fill('');
  await page.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);

  const appControls = page.locator(
    '.shell button:visible, .shell input:visible, .shell select:visible, .shell textarea:visible, .shell .text-button:visible',
  );
  const count = await appControls.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await appControls.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('mobile theme control remains keyboard accessible', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Toggle light and dark mode' });
  await expect.poll(async () => {
    const theme = await page.locator('html').getAttribute('data-theme');
    if (theme === 'dark') {
      await toggle.focus();
      await page.keyboard.press('Enter');
    }
    return theme;
  }).toBe('light');
});
