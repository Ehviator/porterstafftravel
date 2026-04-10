const { test, expect } = require('@playwright/test');

async function login(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Sign in with Porter SSO/i }).click();
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 15_000 });
}

async function goFooterTool(page, nameRegex) {
  const btn = page.getByRole('contentinfo').getByRole('button', { name: nameRegex });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
}

test.describe('Tool workflows', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.put('/api/travel-log', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        employeeId: '9809',
        airlines: [],
        airports: [],
        lastUpdated: Date.now(),
      },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('ZED Calculator shows fare panel for route and airline', async ({ page }) => {
    await login(page);
    await page.keyboard.press('/');
    await expect(page.getByRole('dialog', { name: /command palette/i })).toBeVisible();
    await page.locator('[role="dialog"] input[type="text"]').first().fill('zed');
    await page.getByRole('button', { name: /Open ZED Calculator/i }).click();
    await expect(page.locator('[data-testid="zed-origin-input"]')).toBeVisible({ timeout: 10_000 });
    await page.locator('[data-testid="zed-origin-input"]').fill('YYZ');
    await page.locator('[data-testid="zed-destination-input"]').fill('LAX');
    await page.locator('[data-testid="zed-airline-search"]').fill('WestJet');
    await page.locator('[data-page="calculator"]').getByRole('button', { name: /^WestJet$/ }).first().click();
    await expect(
      page.locator('[data-testid="zed-result-generic"], [data-testid="zed-result-custom"]'),
    ).toBeVisible({ timeout: 12_000 });
  });

  test('Fare Compare shows ready status for valid route', async ({ page }) => {
    await login(page);
    await goFooterTool(page, /^Fare Compare$/i);
    await expect(page.getByRole('heading', { name: /Fare Compare/i })).toBeVisible();
    await page.getByPlaceholder(/From \(YYZ\)/i).fill('YYZ');
    await page.getByPlaceholder(/To \(LAX\)/i).fill('LAX');
    await expect(page.locator('[data-testid="farecompare-status"]')).toContainText(/Ready/i, { timeout: 10_000 });
  });

  test('Fare Compare shows dollar estimates for two selected airlines', async ({ page }) => {
    await login(page);
    await goFooterTool(page, /^Fare Compare$/i);
    await page.getByPlaceholder(/From \(YYZ\)/i).fill('YYZ');
    await page.getByPlaceholder(/To \(LAX\)/i).fill('LAX');
    const airlineInputs = page.locator('.farecompare-airline-input');
    await airlineInputs.nth(0).fill('WestJet');
    await page.locator('[data-page="farecompare"]').getByRole('button', { name: /^WestJet$/ }).first().click();
    await airlineInputs.nth(1).fill('United');
    await page.locator('[data-page="farecompare"]').getByRole('button', { name: /United Airlines/i }).first().click();
    await expect(page.locator('[data-page="farecompare"]').getByText(/\$\d/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('Jumpseat search surfaces Porter agreement', async ({ page }) => {
    await login(page);
    await goFooterTool(page, /^Jumpseat$/i);
    await expect(page.getByRole('heading', { name: /Jumpseat/i })).toBeVisible();
    await page.getByPlaceholder(/Search airline, booking, procedure, or source/i).fill('Porter');
    await expect(page.getByRole('button', { name: /Porter/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Travel Log airports tab toggles airport code', async ({ page }) => {
    await login(page);
    await goFooterTool(page, /^Travel Log$/i);
    await page.getByRole('tab', { name: /Airports/i }).click();
    await page.getByPlaceholder(/Search airports/i).fill('YYZ');
    await page.getByRole('button', { name: /YYZ/i }).click();
    await expect(page.getByRole('button', { name: /YYZ/i })).toBeVisible();
  });

  test('Travel Log toggles airline and persists to API', async ({ page }) => {
    await login(page);
    await goFooterTool(page, /^Travel Log$/i);
    await expect(page.getByRole('heading', { name: /Travel Log/i })).toBeVisible();
    await page.getByPlaceholder(/Search airlines/i).fill('WestJet');
    await page.getByRole('button', { name: /WestJet/i }).click();
    await expect.poll(
      async () => {
        const res = await page.request.get('/api/travel-log?employeeId=9809');
        if (!res.ok()) return false;
        const j = await res.json();
        return Array.isArray(j.airlines) && j.airlines.includes('WestJet');
      },
      { timeout: 15_000 },
    ).toBe(true);
  });

  test('My Trips weekend template opens flight timeline page', async ({ page }) => {
    await login(page);
    await goFooterTool(page, /^My Trips$/i);
    await expect(page.getByRole('heading', { name: /My Trips/i })).toBeVisible();
    await page.getByRole('button', { name: /New Trip/i }).click();
    await page.getByRole('button', { name: /Weekend US city/i }).click();
    await expect(page.getByRole('button', { name: /Open flight timeline/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Open flight timeline/i }).click();
    await expect(page.locator('[data-page="mytrips_timeline"]')).toBeVisible({ timeout: 12_000 });
  });
});
