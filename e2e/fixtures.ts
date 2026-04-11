import { test as base, Page } from '@playwright/test';

type GameFixtures = {
  gamePage: Page;
  lobbyPage: Page;
};

export const test = base.extend<GameFixtures>({
  gamePage: async ({ page }, use) => {
    await page.goto('/');
    // Wait for Phaser canvas to be ready
    await page.waitForSelector('canvas', { timeout: 10000 });
    // Wait a bit for boot scene to complete
    await page.waitForTimeout(2000);
    await use(page);
  },

  lobbyPage: async ({ page }, use) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });
    // Wait for lobby scene (after boot)
    await page.waitForTimeout(3000);
    await use(page);
  },
});

export { expect } from '@playwright/test';
