import { defineConfig, devices } from '@playwright/test';

const serverPort = Number.parseInt(process.env.E2E_SERVER_PORT ?? '3000', 10);
const clientPort = Number.parseInt(process.env.E2E_CLIENT_PORT ?? '5173', 10);
const useIsolatedPorts =
  process.env.E2E_SERVER_PORT !== undefined || process.env.E2E_CLIENT_PORT !== undefined;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Game tests can't easily run in parallel
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html'], ['list']],
  timeout: 30000,

  use: {
    baseURL: `http://localhost:${clientPort}`,
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-landscape',
      use: {
        ...devices['iPhone 14 Pro'],
        viewport: { width: 844, height: 390 }, // landscape
      },
    },
  ],

  webServer: [
    {
      // Keep Playwright's server as one non-watching process. `tsx watch`
      // can orphan its restarted child when Playwright tears the shell down,
      // letting a forced smoke server unexpectedly reclaim port 3000 later.
      command: 'node --import tsx src/index.ts',
      port: serverPort,
      reuseExistingServer: !process.env.CI && !useIsolatedPorts,
      cwd: '../server',
      env: {
        PORT: String(serverPort),
        HEALTH_PORT: String(serverPort + 1),
      },
    },
    {
      command: `pnpm --filter @game/client dev --port ${clientPort}`,
      port: clientPort,
      reuseExistingServer: !process.env.CI && !useIsolatedPorts,
      cwd: '..',
      env: {
        VITE_SERVER_URL: `http://localhost:${serverPort}`,
      },
    },
  ],
});
