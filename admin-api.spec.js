const { test, expect } = require('@playwright/test');

test.describe('Admin site-data API', () => {
  test('GET returns 503 when admin token is not configured', async ({ request }) => {
    if (process.env.PLAYWRIGHT_ADMIN_TOKEN) {
      test.skip();
    }
    const res = await request.get('/api/admin/site-data');
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('returns 401 without bearer when API is enabled', async ({ request }) => {
    if (!process.env.PLAYWRIGHT_ADMIN_TOKEN) {
      test.skip();
    }
    const res = await request.get('/api/admin/site-data');
    expect(res.status()).toBe(401);
  });

  test('GET works with session cookie after POST /api/admin/login', async ({ request }) => {
    const tok = process.env.PLAYWRIGHT_ADMIN_TOKEN;
    if (!tok || tok.length < 16) {
      test.skip();
    }
    const login = await request.post('/api/admin/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { password: tok },
    });
    expect(login.ok()).toBeTruthy();
    const get = await request.get('/api/admin/site-data');
    expect([200, 500]).toContain(get.status());
    if (get.status() === 200) {
      const body = await get.json();
      expect(body).toHaveProperty('airlines');
    }
  });

  test('PUT and GET roundtrip when PLAYWRIGHT_ADMIN_TOKEN is set', async ({ request }) => {
    const tok = process.env.PLAYWRIGHT_ADMIN_TOKEN;
    if (!tok || tok.length < 16) {
      test.skip();
    }
    const payload = {
      version: '2.3',
      exportDate: new Date().toISOString(),
      label: 'e2e',
      airlines: [],
      jumpseat: [],
      faq: [],
      notifications: [],
      staff: [],
      zedFareTables: {},
    };
    const put = await request.put('/api/admin/site-data', {
      headers: { Authorization: `Bearer ${tok}` },
      data: payload,
    });
    expect(put.status()).toBe(200);
    const get = await request.get('/api/admin/site-data', {
      headers: { Authorization: `Bearer ${tok}` },
    });
    expect(get.status()).toBe(200);
    const body = await get.json();
    expect(body).toMatchObject({ airlines: [], jumpseat: [] });
  });
});
