const { test, expect } = require('@playwright/test');

test.describe('Standby Predictor', () => {
  test('deep link prefill and date change does not show error boundary', async ({ page }) => {
    await page.goto('/?page=standby&from=YYZ&to=YVR');
    await page.getByRole('button', { name: /Sign in with Porter SSO/i }).click();
    await expect(page.locator('[data-page="standby"]')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.locator('#main-content')).toContainText('YYZ');
    await expect(page.locator('#main-content')).toContainText('YVR');
    const dateInput = page.locator('#main-content input[type="date"]').first();
    await dateInput.fill('2026-07-15');
    await expect(page.getByText('SOMETHING WENT WRONG')).toHaveCount(0);
  });
});
