const { test, expect } = require('@playwright/test');

test.describe('Travel log API', () => {
  test('rejects invalid employeeId', async ({ request }) => {
    const res = await request.get('/api/travel-log?employeeId=__proto__');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('accepts valid employeeId', async ({ request }) => {
    const res = await request.get('/api/travel-log?employeeId=test-user-1');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('airlines');
    expect(body).toHaveProperty('airports');
  });
});
