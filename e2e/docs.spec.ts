import { expect, test } from '@playwright/test';

test('renders the docs page with sidebar navigation and endpoint cards', async ({ page }) => {
  await page.goto('/docs');
  await expect(page.getByRole('heading', { name: 'Documentation' })).toBeVisible();
  await expect(page.locator('.docs-sidebar')).toBeVisible();
  await expect(page.locator('.docs-content')).toBeVisible();
  await expect(page.locator('.endpoint').first()).toBeVisible();
});

test('sidebar anchors navigate to the matching sections', async ({ page }) => {
  await page.goto('/docs');
  await page.locator('.docs-nav-link', { hasText: '/api/json' }).click();
  await expect(page.locator('#api-json')).toBeVisible();
});

test('applies syntax highlighting to code blocks', async ({ page }) => {
  await page.goto('/docs');
  await expect(page.locator('.hljs').first()).toBeVisible();
});

test('theme toggle re-colors the highlighted code', async ({ page }) => {
  await page.goto('/docs');
  const toggle = page.getByRole('button', { name: 'Toggle light and dark mode' });
  await expect.poll(async () => {
    const theme = await page.locator('html').getAttribute('data-theme');
    if (theme === 'dark') await toggle.click();
    return theme;
  }).toBe('light');
  await expect(page.locator('.hljs').first()).toBeVisible();
});

test('home footer links to the docs page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Docs', exact: true }).click();
  await expect(page).toHaveURL(/\/docs$/);
});

test('brand links back home from the docs page', async ({ page }) => {
  await page.goto('/docs');
  await page.getByRole('link', { name: 'echo home' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.topbar')).toBeVisible();
});
