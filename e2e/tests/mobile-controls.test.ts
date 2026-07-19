import { test, expect } from '../fixtures';

// Ensure the project has touch enabled in case the device preset
// doesn't already imply it.
test.use({ hasTouch: true });

test.describe('Mobile controls', () => {
  test('touch on gameboard dispatches a scene-level pointerdown', async ({ gamePage }) => {
    const canvas = gamePage.locator('canvas');
    await expect(canvas).toBeVisible();
    // Canvas visibility can occur while BootScene is still active. Wait for
    // an interactive scene, but do not infer the active projection from the
    // test process environment: the server-owned capability snapshot can
    // still be negotiating while LobbyScene is accepting input.
    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const w = window as unknown as {
              game?: {
                scene: {
                  scenes: Array<{
                    scene: { key: string };
                    sys: { settings: { active: boolean } };
                  }>;
                };
              };
            };
            return (
              w.game?.scene.scenes.some(
                (scene) => scene.scene.key !== 'BootScene' && scene.sys.settings.active,
              ) ?? false
            );
          }),
        { timeout: 15_000 },
      )
      .toBe(true);

    // Instrument every active scene and keep the probe attached across a
    // capability-owned LobbyScene -> ReforgedShellScene transition. The
    // captured event still comes from a scene input plugin, not a DOM or
    // game-global shortcut.
    const installed = await gamePage.evaluate(() => {
      const w = window as unknown as {
        game?: {
          scene: {
            scenes: Array<{
              scene: { key: string };
              sys: { settings: { active: boolean } };
              input: { on: (evt: string, cb: (p: unknown) => void) => void };
            }>;
          };
        };
        __lastPointerDown?: { x: number; y: number; wasTouch: boolean } | null;
      };
      w.__lastPointerDown = null;
      const attached = new WeakSet<object>();
      const attachActiveScenes = (): void => {
        for (const scene of w.game?.scene.scenes ?? []) {
          if (
            scene.scene.key === 'BootScene' ||
            !scene.sys.settings.active ||
            attached.has(scene)
          ) {
            continue;
          }
          scene.input.on('pointerdown', (pointer: unknown) => {
            const p = pointer as { x: number; y: number; wasTouch: boolean };
            w.__lastPointerDown = {
              x: p.x,
              y: p.y,
              wasTouch: p.wasTouch,
            };
          });
          attached.add(scene);
        }
        if (w.__lastPointerDown === null) requestAnimationFrame(attachActiveScenes);
      };
      attachActiveScenes();
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
            () => (window as unknown as { __lastPointerDown: unknown }).__lastPointerDown,
          ),
        { timeout: 5000 },
      )
      .not.toBeNull();
  });
});
