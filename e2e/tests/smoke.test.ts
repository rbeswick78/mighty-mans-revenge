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
    // 960x720 (4:3): the 960x576 gameboard plus the 144px HUD strip —
    // see client/src/ui/layout.ts (MAP_WIDTH_PX / CANVAS_HEIGHT).
    const ratio = size.width / size.height;
    expect(ratio).toBeCloseTo(960 / 720, 1);
  });
});
