import { test, expect } from '../fixtures';

test.describe('Game loads', () => {
  test('canvas renders', async ({ gamePage }) => {
    const canvas = gamePage.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('canvas has correct aspect ratio', async ({ gamePage }) => {
    const size = await gamePage.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return { width: canvas?.width || 0, height: canvas?.height || 0 };
    });
    // Should be 960x540 or proportional (16:9)
    const ratio = size.width / size.height;
    expect(ratio).toBeCloseTo(16 / 9, 1);
  });
});
