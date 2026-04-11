import { Page } from '@playwright/test';

export async function waitForGameState(page: Page, timeout = 10000): Promise<void> {
  await page.waitForSelector('canvas', { timeout });
}

export async function simulateKeyboard(page: Page, key: string, duration = 100): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(duration);
  await page.keyboard.up(key);
}

export async function simulateTouch(page: Page, x: number, y: number, _duration = 100): Promise<void> {
  await page.touchscreen.tap(x, y);
}

export async function getCanvasSize(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return { width: canvas?.width || 0, height: canvas?.height || 0 };
  });
}
