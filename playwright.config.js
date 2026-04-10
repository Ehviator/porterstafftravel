// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: 'node server.js',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
          ...process.env,
          // Only enable admin API in tests when explicitly set (avoids clobbering a dev admin-site-data.json).
          ADMIN_API_TOKEN: process.env.PLAYWRIGHT_ADMIN_TOKEN || '',
          // Same as token in CI so POST /api/admin/login + cookie auth is covered by e2e.
          ADMIN_PASSWORD:
            process.env.PLAYWRIGHT_ADMIN_PASSWORD || process.env.PLAYWRIGHT_ADMIN_TOKEN || '',
        },
      },
});
