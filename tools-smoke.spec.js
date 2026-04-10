const { test, expect } = require('@playwright/test');

async function login(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Sign in with Porter SSO/i }).click();
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 15_000 });
}

test.describe('Tools smoke', () => {
  test('command palette opens ZED Calculator', async ({ page }) => {
    await login(page);
    await page.keyboard.press('/');
    await expect(page.getByRole('dialog', { name: /command palette/i })).toBeVisible();
    const input = page.locator('[role="dialog"] input[type="text"]').first();
    await input.fill('calc');
    await page.getByRole('button', { name: /Open ZED Calculator/i }).click();
    await expect(page.locator('[data-page="calculator"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /ZED Calculator/i }).first()).toBeVisible();
  });

  test('French locale toggle sets html lang', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /^Fran\u00e7ais$/i }).first().click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr', { timeout: 5000 });
  });
});
