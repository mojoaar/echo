import { defineConfig, devices } from '@playwright/test';

const unconfiguredPort = process.env.ECHO_PLAYWRIGHT_PORT ?? '3000';
const unconfiguredDistDir = process.env.ECHO_PLAYWRIGHT_DIST_DIR ?? '.next/playwright-unconfigured';
const configuredPort = process.env.ECHO_PLAYWRIGHT_CONFIGURED_PORT ?? '3001';
const configuredDistDir = process.env.ECHO_PLAYWRIGHT_CONFIGURED_DIST_DIR ?? '.next/playwright-configured';
const adminDesktopPort = process.env.ECHO_PLAYWRIGHT_ADMIN_DESKTOP_PORT ?? '3002';
const adminMobilePort = process.env.ECHO_PLAYWRIGHT_ADMIN_MOBILE_PORT ?? '3003';
const adminDesktopDistDir = process.env.ECHO_PLAYWRIGHT_ADMIN_DESKTOP_DIST_DIR ?? '.next/playwright-admin-desktop';
const adminMobileDistDir = process.env.ECHO_PLAYWRIGHT_ADMIN_MOBILE_DIST_DIR ?? '.next/playwright-admin-mobile';
const unconfiguredDbPath = `${process.cwd()}/.next/playwright-unconfigured/echo.db`;
const configuredDbPath = `${process.cwd()}/.next/playwright-configured/echo.db`;
const adminDesktopDbPath = `${process.cwd()}/.next/playwright-admin-desktop/echo.db`;
const adminMobileDbPath = `${process.cwd()}/.next/playwright-admin-mobile/echo.db`;
const blankCredentialEnv = {
  ADMIN_TOKEN: '',
  HEALTH_TOKEN: '',
  STATS_TOKEN: '',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${unconfiguredPort}`,
    trace: 'on-first-retry',
    serviceWorkers: 'block',
    bypassCSP: false,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /home\.spec\.ts|api\.spec\.ts|docs\.spec\.ts/,
    },
    {
      name: 'admin-desktop',
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${adminDesktopPort}` },
      testMatch: /admin\.spec\.ts/,
      grepInvert: /mobile admin/,
    },
    {
      name: 'mobile-admin',
      use: { ...devices['Pixel 5'], baseURL: `http://127.0.0.1:${adminMobilePort}` },
      testMatch: /admin\.spec\.ts/,
      grep: /mobile admin/,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      testMatch: /mobile\.spec\.ts|docs\.spec\.ts/,
    },
    {
      name: 'configured-probes',
      use: {
        baseURL: `http://127.0.0.1:${configuredPort}`,
        bypassCSP: false,
      },
      testMatch: /configured-connectivity\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --hostname 127.0.0.1 --port ${unconfiguredPort}`,
      url: `http://127.0.0.1:${unconfiguredPort}/api/health`,
      env: {
        NODE_ENV: 'test',
        ...blankCredentialEnv,
        CONNECTIVITY_IPV4_URL: '',
        CONNECTIVITY_IPV6_URL: '',
        NEXT_DIST_DIR: unconfiguredDistDir,
        DB_PATH: unconfiguredDbPath,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --hostname 127.0.0.1 --port ${configuredPort}`,
      url: `http://127.0.0.1:${configuredPort}/api/health`,
      env: {
        NODE_ENV: 'test',
        ...blankCredentialEnv,
        CONNECTIVITY_IPV4_URL: 'https://ipv4-probe.example.test/probe',
        CONNECTIVITY_IPV6_URL: 'https://ipv6-probe.example.test/probe',
        NEXT_DIST_DIR: configuredDistDir,
        DB_PATH: configuredDbPath,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --hostname 127.0.0.1 --port ${adminDesktopPort}`,
      url: `http://127.0.0.1:${adminDesktopPort}/api/health`,
      env: {
        NODE_ENV: 'test',
        ...blankCredentialEnv,
        ADMIN_TOKEN: 'test-admin-token',
        CONNECTIVITY_IPV4_URL: '',
        CONNECTIVITY_IPV6_URL: '',
        NEXT_DIST_DIR: adminDesktopDistDir,
        DB_PATH: adminDesktopDbPath,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --hostname 127.0.0.1 --port ${adminMobilePort}`,
      url: `http://127.0.0.1:${adminMobilePort}/api/health`,
      env: {
        NODE_ENV: 'test',
        ...blankCredentialEnv,
        ADMIN_TOKEN: 'test-admin-token',
        CONNECTIVITY_IPV4_URL: '',
        CONNECTIVITY_IPV6_URL: '',
        NEXT_DIST_DIR: adminMobileDistDir,
        DB_PATH: adminMobileDbPath,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
