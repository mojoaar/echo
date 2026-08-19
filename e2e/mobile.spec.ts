import { expect, test } from '@playwright/test';

test('mobile layout has no horizontal overflow and keeps controls at 44px', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/');
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);

  const appControls = page.locator('button.btn:visible, button.theme-toggle:visible');
  const count = await appControls.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await appControls.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('mobile theme control remains keyboard accessible', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': '192.168.1.10' });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Toggle light and dark mode' });
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
