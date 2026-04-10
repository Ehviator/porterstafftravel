const { test, expect } = require('@playwright/test');

async function login(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Sign in with Porter SSO/i }).click();
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 15_000 });
}

test.describe('App shell', () => {
  test('skip link present after login', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('link', { name: /skip to main content/i })).toBeVisible();
  });

  test('hash deep link survives load after login', async ({ page }) => {
    await page.goto('/#/calculator');
    await page.getByRole('button', { name: /Sign in with Porter SSO/i }).click();
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 15_000 });
  });
});
