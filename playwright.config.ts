import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    serviceWorkers: 'block',
    bypassCSP: false,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /home\.spec\.ts|api\.spec\.ts/,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      testMatch: /mobile\.spec\.ts/,
    },
    {
      name: 'configured-probes',
      use: {
        baseURL: 'http://127.0.0.1:3001',
        bypassCSP: false,
      },
      testMatch: /configured-connectivity\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
      url: 'http://127.0.0.1:3000/api/health',
      env: {
        CONNECTIVITY_IPV4_URL: '',
        CONNECTIVITY_IPV6_URL: '',
        NEXT_DIST_DIR: '.next/playwright-unconfigured',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --hostname 127.0.0.1 --port 3001',
      url: 'http://127.0.0.1:3001/api/health',
      env: {
        CONNECTIVITY_IPV4_URL: 'https://ipv4-probe.example.test/probe',
        CONNECTIVITY_IPV6_URL: 'https://ipv6-probe.example.test/probe',
        NEXT_DIST_DIR: '.next/playwright-configured',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
