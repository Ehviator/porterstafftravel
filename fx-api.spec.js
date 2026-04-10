const { test, expect } = require('@playwright/test');

test.describe('FX API', () => {
  test('GET /api/fx/usd-cad returns numeric rate and date', async ({ request }) => {
    const res = await request.get('/api/fx/usd-cad');
    expect(res.ok()).toBeTruthy();
    const j = await res.json();
    expect(typeof j.rate).toBe('number');
    expect(Number.isFinite(j.rate)).toBeTruthy();
    expect(j.rate).toBeGreaterThan(0.5);
    expect(j.rate).toBeLessThan(3);
    expect(typeof j.date).toBe('string');
    expect(j.date.length).toBeGreaterThanOrEqual(10);
  });
});
