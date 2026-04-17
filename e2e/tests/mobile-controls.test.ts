import { test, expect } from '../fixtures';

// Ensure the project has touch enabled in case the device preset
// doesn't already imply it.
test.use({ hasTouch: true });

test.describe('Mobile controls', () => {
  test('touch on gameboard dispatches a scene-level pointerdown', async ({
    gamePage,
  }) => {
    const canvas = gamePage.locator('canvas');
    await expect(canvas).toBeVisible();

    // Instrument the active scene: capture any pointerdown the scene
    // receives so we can verify Phaser dispatches it under touch emulation.
    const installed = await gamePage.evaluate(() => {
      const w = window as unknown as {
        game?: { scene: { scenes: Array<{ sys: { settings: { active: boolean } }; input: { on: (evt: string, cb: (p: unknown) => void) => void } }> } };
        __lastPointerDown?: { x: number; y: number; wasTouch: boolean } | null;
      };
      w.__lastPointerDown = null;
      const scenes = w.game?.scene.scenes ?? [];
      const active = scenes.find((s) => s.sys.settings.active);
      if (!active) return false;
      active.input.on('pointerdown', (pointer: unknown) => {
        const p = pointer as { x: number; y: number; wasTouch: boolean };
        w.__lastPointerDown = {
          x: p.x,
          y: p.y,
          wasTouch: p.wasTouch,
        };
      });
      return true;
    });

    expect(installed).toBe(true);

    // Tap in the center of the viewport — above the HUD strip on the
    // mobile-landscape project (844x390). The lobby also routes through
    // the scene pointer system, so this works whether or not matchmaking
    // has completed.
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not laid out');
    const tapX = box.x + box.width / 2;
    const tapY = box.y + box.height / 3;

    await gamePage.touchscreen.tap(tapX, tapY);

    await expect
      .poll(
        () =>
          gamePage.evaluate(
            () =>
              (window as unknown as { __lastPointerDown: unknown })
                .__lastPointerDown,
          ),
        { timeout: 5000 },
      )
      .not.toBeNull();
  });
});
