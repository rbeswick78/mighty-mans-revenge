import { expect, test } from '../fixtures';

test.describe('Gauntlet Build Codex', () => {
  test('opens the trophy board, renders mastery progress, and returns to the lobby', async ({
    gamePage,
  }, testInfo) => {
    await gamePage.evaluate(() => {
      localStorage.setItem(
        'mmr_gauntlet_build_codex',
        JSON.stringify({
          discovered: ['scrap_plating+kill_salvage', 'quick_charge+spawn_rush'],
          bestScores: {
            'scrap_plating+kill_salvage': 5800,
            'quick_charge+spawn_rush': 6200,
          },
        }),
      );
    });
    await gamePage.reload();

    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const game = (
              window as unknown as {
                game?: {
                  scene: {
                    scenes: Array<{
                      scene: { key: string };
                      sys: { settings: { active: boolean } };
                    }>;
                  };
                };
              }
            ).game;
            return (
              game?.scene.scenes.some(
                (scene) => scene.scene.key === 'LobbyScene' && scene.sys.settings.active,
              ) ?? false
            );
          }),
        { timeout: 15_000 },
      )
      .toBe(true);

    const canvas = gamePage.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not laid out');
    const codexBounds = await gamePage.evaluate(() => {
      const game = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game;
      const scene = game?.scene.getScene('LobbyScene') as {
        buildCodexButton: {
          getBounds: () => { x: number; y: number; width: number; height: number };
        };
      };
      return scene.buildCodexButton.getBounds();
    });
    const canvasSize = await canvas.evaluate((element) => ({
      width: (element as HTMLCanvasElement).width,
      height: (element as HTMLCanvasElement).height,
    }));
    const codexPosition = {
      x: ((codexBounds.x + codexBounds.width / 2) / canvasSize.width) * box.width,
      y: ((codexBounds.y + codexBounds.height / 2) / canvasSize.height) * box.height,
    };
    if (testInfo.project.name === 'mobile-landscape') {
      await canvas.tap({ position: codexPosition });
    } else {
      await canvas.click({ position: codexPosition });
    }

    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const w = window as unknown as {
            game?: { scene: { getScene: (key: string) => unknown } };
          };
          const scene = w.game?.scene.getScene('GauntletCodexScene') as {
            sys?: { settings: { active: boolean } };
            children?: { list: Array<unknown> };
          };
          const texts: string[] = [];
          const visit = (value: unknown): void => {
            if (!value || typeof value !== 'object') return;
            const object = value as { text?: unknown; list?: unknown };
            if (typeof object.text === 'string') texts.push(object.text);
            if (Array.isArray(object.list)) object.list.forEach(visit);
          };
          scene?.children?.list.forEach(visit);
          return {
            active: scene?.sys?.settings.active ?? false,
            progress: texts.includes('2/6 BUILDS DISCOVERED  //  COMBINED BEST 12,000'),
            discoveredNames: ['IRON SCAVENGER', 'REDLINE'].every((name) => texts.includes(name)),
            recordedBests: ['BEST CLEAR 5,800', 'BEST CLEAR 6,200'].every((best) =>
              texts.includes(best),
            ),
            lockedRecipe: texts.includes('SCRAP PLATING + QUICK CHARGE'),
            lockedCount: texts.filter((text) => text === '???').length,
          };
        }),
      )
      .toEqual({
        active: true,
        progress: true,
        discoveredNames: true,
        recordedBests: true,
        lockedRecipe: true,
        lockedCount: 4,
      });

    const backPosition = { x: box.width / 2, y: (box.height * 596) / 720 };
    if (testInfo.project.name === 'mobile-landscape') {
      await canvas.tap({ position: backPosition });
    } else {
      await canvas.click({ position: backPosition });
    }
    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const game = (
            window as unknown as {
              game?: {
                scene: {
                  scenes: Array<{
                    scene: { key: string };
                    sys: { settings: { active: boolean } };
                  }>;
                };
              };
            }
          ).game;
          return (
            game?.scene.scenes.some(
              (scene) => scene.scene.key === 'LobbyScene' && scene.sys.settings.active,
            ) ?? false
          );
        }),
      )
      .toBe(true);
  });
});
