import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';

const largeWorldsAdvertised = process.env.CAPABILITY_LARGE_WORLDS === 'true';

async function waitForScene(page: Page, key: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((sceneKey) => {
          const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
            sceneKey,
          );
          return scene?.sys.settings.active ?? false;
        }, key),
      { timeout: 15_000 },
    )
    .toBe(true);
}

async function stageGameplay(page: Page, largeWorlds: boolean): Promise<void> {
  await page.evaluate((advertiseLargeWorlds) => {
    const game = (window as unknown as { game?: Phaser.Game }).game;
    const lobby = game?.scene.getScene('LobbyScene') as unknown as {
      gameService: {
        getNetworkManager(): {
          connection: {
            disconnect(): void;
            send(message: unknown): void;
            setState(state: string): void;
          };
          getPlayerId(): string;
          getLocalPlayerState(): unknown;
          handleMessage(message: unknown): void;
        };
      };
    };
    const active = game?.scene.getScenes(true)[0];
    if (!active || !lobby.gameService) throw new Error('active menu scene is not ready');

    const manager = lobby.gameService.getNetworkManager();
    manager.connection.disconnect();
    manager.connection.setState('connected');
    manager.connection.send = () => undefined;
    manager.handleMessage({
      type: 'server:welcome',
      playerId: 'viewport-local',
      capabilities: {
        newShell: false,
        schedules: false,
        largeWorlds: advertiseLargeWorlds,
        modernArt: false,
        battleRoyale: false,
      },
    });
    manager.getPlayerId = () => 'viewport-local';
    manager.getLocalPlayerState = () => ({
      id: 'viewport-local',
      nickname: 'VIEWPORT',
      characterId: 'mighty_man',
      position: { x: 144, y: 144 },
      velocity: { x: 0, y: 0 },
      aimAngle: 0,
      health: 100,
      maxHealth: 100,
      armor: 0,
      ammo: 30,
      weaponId: 'rifle',
      specialAmmo: 0,
      specialReserve: 0,
      grenades: 2,
      isReloading: false,
      isSprinting: false,
      stamina: 100,
      isDead: false,
      respawnTimer: 0,
      invulnerableTimer: 0,
      lastProcessedInput: 0,
      score: 0,
      deaths: 0,
      abilityActiveSeconds: 0,
      abilityCooldownSeconds: 0,
      frozenTimer: 0,
      secondWindTimer: 0,
      spawnRushTimer: 0,
    });

    game.scene.getScenes(true)[0]?.scene.start('GameScene', {
      nickname: 'VIEWPORT',
      matchData: {
        matchId: 'batch-18-viewport',
        opponents: [{ id: 'viewport-rival', nickname: 'RIVAL' }],
        mapName: 'Scrapyard',
        gameMode: 'deathmatch',
        matchKind: 'practice',
      },
    });
  }, largeWorlds);
  await waitForScene(page, 'GameScene');
}

async function viewportSnapshot(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const game = (window as unknown as { game?: Phaser.Game }).game;
    const scene = game?.scene.getScene('GameScene') as unknown as {
      cameras: {
        main: { scrollX: number; scrollY: number; zoom: number; worldView: Phaser.Geom.Rectangle };
      };
      getGameplayViewportContract(): {
        viewport: {
          mode: string;
          logicalWidth: number;
          logicalHeight: number;
          worldBounds: { left: number; top: number; width: number; height: number };
        };
        safeArea: { left: number; top: number; right: number; bottom: number } | null;
      };
    };
    const contract = scene.getGameplayViewportContract();
    return {
      scale: [game?.scale.width, game?.scale.height],
      mode: contract.viewport.mode,
      worldBounds: contract.viewport.worldBounds,
      safeArea: contract.safeArea,
      camera: {
        scrollX: scene.cameras.main.scrollX,
        scrollY: scene.cameras.main.scrollY,
        zoom: scene.cameras.main.zoom,
        width: scene.cameras.main.worldView.width,
        height: scene.cameras.main.worldView.height,
      },
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForScene(page, 'LobbyScene');
});

test('capability-off and old-server gameplay retain the exact legacy surface', async ({ page }) => {
  test.skip(largeWorldsAdvertised, 'This invocation explicitly advertises large-world gameplay.');
  await stageGameplay(page, false);

  expect(await viewportSnapshot(page)).toEqual({
    scale: [960, 720],
    mode: 'legacy',
    worldBounds: { left: 0, top: 0, width: 960, height: 576 },
    safeArea: null,
    camera: { scrollX: 0, scrollY: 0, zoom: 1, width: 960, height: 720 },
  });
});

test('gated gameplay keeps one 16:9 logical view across desktop and mobile', async ({
  page,
}, testInfo) => {
  test.skip(!largeWorldsAdvertised, 'Run with CAPABILITY_LARGE_WORLDS=true.');
  await stageGameplay(page, true);

  const initial = await viewportSnapshot(page);
  expect(initial).toMatchObject({
    scale: [1280, 720],
    mode: 'large-world',
    worldBounds: { left: 0, top: 0, width: 960, height: 576 },
    camera: { scrollX: 0, scrollY: 0, zoom: 1, width: 1280, height: 720 },
  });
  expect(initial.safeArea).toMatchObject({ left: 32, top: 32, right: 1248, bottom: 688 });

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  if (testInfo.project.name === 'mobile-landscape')
    await canvas.tap({ position: { x: 24, y: 24 } });
  else await canvas.click({ position: { x: 24, y: 24 } });
  await expect.poll(async () => (await viewportSnapshot(page)).mode).toBe('large-world');

  await page.screenshot({ path: testInfo.outputPath('gameplay-viewport.png') });
  if (testInfo.project.name === 'desktop-chromium') {
    await page.setViewportSize({ width: 844, height: 390 });
    await expect
      .poll(async () => {
        const box = await canvas.boundingBox();
        return box ? box.width / box.height : 0;
      })
      .toBeCloseTo(16 / 9, 2);
    expect(await viewportSnapshot(page)).toMatchObject({
      scale: [1280, 720],
      mode: 'large-world',
      camera: { width: 1280, height: 720 },
    });
    await page.screenshot({ path: testInfo.outputPath('gameplay-viewport-mobile-chromium.png') });
  }
});

test('Results and connection recovery restore legacy scene sizing', async ({ page }) => {
  test.skip(!largeWorldsAdvertised, 'Run with CAPABILITY_LARGE_WORLDS=true.');
  await stageGameplay(page, true);

  await page.evaluate(() => {
    const game = (window as unknown as { game?: Phaser.Game }).game;
    game?.scene.getScene('GameScene').scene.start('ResultsScene', { nickname: 'VIEWPORT' });
  });
  await waitForScene(page, 'ResultsScene');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (window as unknown as { game?: Phaser.Game }).game;
        return [game?.scale.width, game?.scale.height];
      }),
    )
    .toEqual([960, 720]);

  await stageGameplay(page, true);
  await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      gameService: { getNetworkManager(): { connection: { setState(state: string): void } } };
    };
    scene.gameService.getNetworkManager().connection.setState('reconnecting');
  });
  await waitForScene(page, 'LobbyScene');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (window as unknown as { game?: Phaser.Game }).game;
        return [game?.scale.width, game?.scale.height];
      }),
    )
    .toEqual([960, 720]);
});
