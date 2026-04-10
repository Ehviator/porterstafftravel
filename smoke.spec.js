const { test, expect } = require('@playwright/test');

test.describe('Porter Staff site', () => {
  test('home loads and has main landmark after SSO', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Porter Airlines Staff Travel/i);
    await page.getByRole('button', { name: /Sign in with Porter SSO/i }).click();
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 15_000 });
  });

  test('travel log API returns 400 without employeeId', async ({ request }) => {
    const res = await request.get('/api/travel-log');
    expect(res.status()).toBe(400);
  });
});
