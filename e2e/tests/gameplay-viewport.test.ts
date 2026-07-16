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
      getGameplayCoordinateSpace(): {
        screenToWorld(point: { space: 'screen'; x: number; y: number }): {
          space: 'world';
          x: number;
          y: number;
        };
        worldToScreen(point: { space: 'world'; x: number; y: number }): {
          space: 'screen';
          x: number;
          y: number;
        };
      };
      getCameraController(): {
        getState(): unknown;
      } | null;
      kothHillRenderer: { gfx: { scrollFactorX: number; scrollFactorY: number } };
      coreRunRenderer: { container: { scrollFactorX: number; scrollFactorY: number } };
      radiationStormRenderer: {
        boundary: { scrollFactorX: number; scrollFactorY: number };
        wash: { scrollFactorX: number; scrollFactorY: number };
      };
      scrapstormRenderer: {
        warning: { scrollFactorX: number; scrollFactorY: number };
        localWarning: { scrollFactorX: number; scrollFactorY: number };
      };
      xrayFx: { tintRect: { scrollFactorX: number; scrollFactorY: number } };
      impactFx: { sparkPool: Array<{ img: { scrollFactorX: number; scrollFactorY: number } }> };
      explosionFx: { pool: Array<{ img: { scrollFactorX: number; scrollFactorY: number } }> };
      playerManager: {
        getRenderer(playerId: string):
          | {
              getContainer(): { scrollFactorX: number; scrollFactorY: number };
            }
          | undefined;
      };
    };
    const contract = scene.getGameplayViewportContract();
    const coordinates = scene.getGameplayCoordinateSpace();
    const cameraController = scene.getCameraController();
    const playerMarkerOwner = scene.playerManager.getRenderer('viewport-local')?.getContainer();
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
      cameraController: cameraController?.getState() ?? null,
      coordinates: {
        screenToWorld: coordinates.screenToWorld({ space: 'screen', x: 480, y: 288 }),
        worldToScreen: coordinates.worldToScreen({ space: 'world', x: 480, y: 288 }),
      },
      domains: {
        kothObjective: [
          scene.kothHillRenderer.gfx.scrollFactorX,
          scene.kothHillRenderer.gfx.scrollFactorY,
        ],
        coreMarker: [
          scene.coreRunRenderer.container.scrollFactorX,
          scene.coreRunRenderer.container.scrollFactorY,
        ],
        playerMarkers: playerMarkerOwner
          ? [playerMarkerOwner.scrollFactorX, playerMarkerOwner.scrollFactorY]
          : null,
        impactParticles: [
          scene.impactFx.sparkPool[0]?.img.scrollFactorX,
          scene.impactFx.sparkPool[0]?.img.scrollFactorY,
        ],
        explosionParticles: [
          scene.explosionFx.pool[0]?.img.scrollFactorX,
          scene.explosionFx.pool[0]?.img.scrollFactorY,
        ],
        radiationBoundary: [
          scene.radiationStormRenderer.boundary.scrollFactorX,
          scene.radiationStormRenderer.boundary.scrollFactorY,
        ],
        radiationOverlay: [
          scene.radiationStormRenderer.wash.scrollFactorX,
          scene.radiationStormRenderer.wash.scrollFactorY,
        ],
        scrapBoundary: [
          scene.scrapstormRenderer.warning.scrollFactorX,
          scene.scrapstormRenderer.warning.scrollFactorY,
        ],
        scrapOverlay: [
          scene.scrapstormRenderer.localWarning.scrollFactorX,
          scene.scrapstormRenderer.localWarning.scrollFactorY,
        ],
        xrayOverlay: [scene.xrayFx.tintRect.scrollFactorX, scene.xrayFx.tintRect.scrollFactorY],
      },
    };
  });
}

async function transformedCameraSnapshot(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      cameras: {
        main: {
          scrollX: number;
          scrollY: number;
          zoom: number;
          rotation: number;
          preRender(): void;
        };
      };
      getGameplayViewportContract(): {
        viewport: { worldBounds: { left: number; top: number; width: number; height: number } };
      };
      getGameplayCoordinateSpace(): {
        screenToWorld(point: { space: 'screen'; x: number; y: number }): {
          space: 'world';
          x: number;
          y: number;
        };
        worldToScreen(point: { space: 'world'; x: number; y: number }): {
          space: 'screen';
          x: number;
          y: number;
        };
        aimAngle(
          player: { space: 'world'; x: number; y: number },
          target: { space: 'screen'; x: number; y: number },
        ): number;
      };
      getCameraController(): {
        setWorldBounds(bounds: { left: number; top: number; width: number; height: number }): void;
        setBaseZoom(zoom: number): void;
        setTarget(target: {
          kind: 'local-player' | 'respawn' | 'spectator';
          position: { space: 'world'; x: number; y: number };
        }): void;
        triggerKick(angle: number): void;
        triggerShake(durationMs: number, intensity: number): void;
        triggerZoomPulse(): void;
        triggerRoll(sign: -1 | 1): void;
        update(deltaMs: number): void;
        getState(): {
          base: { scrollX: number; scrollY: number; zoom: number };
          transient: {
            kickX: number;
            kickY: number;
            shakeX: number;
            shakeY: number;
            zoomMultiplier: number;
            roll: number;
          };
          composed: { scrollX: number; scrollY: number; zoom: number; rotation: number };
        };
        reset(): void;
      } | null;
    };
    const controller = scene.getCameraController();
    if (!controller) throw new Error('camera controller is not ready');
    const coordinates = scene.getGameplayCoordinateSpace();
    const originalBounds = scene.getGameplayViewportContract().viewport.worldBounds;
    const syntheticLargeBounds = { left: 0, top: 0, width: 2560, height: 1440 };

    controller.setWorldBounds(syntheticLargeBounds);
    controller.setBaseZoom(1.25);
    controller.setTarget({
      kind: 'local-player',
      position: { space: 'world', x: 1500, y: 900 },
    });
    controller.update(0);
    scene.cameras.main.preRender();

    const screen = { space: 'screen', x: 800, y: 300 } as const;
    const targetWorld = coordinates.screenToWorld(screen);
    const roundTrip = coordinates.worldToScreen(targetWorld);
    const aim = coordinates.aimAngle({ space: 'world', x: 1500, y: 900 }, screen);
    const expectedAim = Math.atan2(targetWorld.y - 900, targetWorld.x - 1500);
    const targetScreen = coordinates.worldToScreen({
      space: 'world',
      x: 1500,
      y: 900,
    });
    const base = controller.getState();

    controller.setTarget({
      kind: 'respawn',
      position: { space: 'world', x: 100, y: 80 },
    });
    controller.update(0);
    const respawn = controller.getState();
    controller.setTarget({
      kind: 'spectator',
      position: { space: 'world', x: 2400, y: 1300 },
    });
    controller.triggerKick(0);
    controller.triggerShake(200, 0.01);
    controller.triggerZoomPulse();
    controller.triggerRoll(1);
    controller.update(16);
    const composed = controller.getState();

    controller.reset();
    controller.setWorldBounds(originalBounds);
    controller.setTarget({
      kind: 'local-player',
      position: { space: 'world', x: 144, y: 144 },
    });
    controller.update(0);

    return {
      base,
      respawn,
      composed,
      transform: { targetWorld, targetScreen, roundTrip, aim, expectedAim },
      restoredCamera: {
        scrollX: scene.cameras.main.scrollX,
        scrollY: scene.cameras.main.scrollY,
        zoom: scene.cameras.main.zoom,
        rotation: scene.cameras.main.rotation,
      },
    };
  });
}

async function coordinateInputSnapshot(
  page: Page,
  mobile: boolean,
): Promise<Record<string, unknown>> {
  return page.evaluate((useTouch) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      input: { activePointer: { x: number; y: number } };
      getGameplayCoordinateSpace(): {
        aimAngle(
          player: { space: 'world'; x: number; y: number },
          target: { space: 'screen'; x: number; y: number },
        ): number;
        screenDirectionAngle(direction: { space: 'screen'; x: number; y: number }): number;
      };
      crosshair: {
        sprite: { x: number; y: number; scrollFactorX: number; scrollFactorY: number };
        update(enabled?: boolean): void;
      } | null;
      inputManager: {
        keyboardMouseInput: {
          getInput(position: { x: number; y: number }, hasGrenade: boolean): { aimAngle: number };
        };
        touchInput: {
          setGameplayEnabled(enabled: boolean): void;
          onPointerDown(pointer: Phaser.Input.Pointer): void;
          onPointerMove(pointer: Phaser.Input.Pointer): void;
          onPointerUp(pointer: Phaser.Input.Pointer): void;
          getInput(hasGrenade: boolean): { aimAngle: number };
          rightJoystick: { active: boolean };
        };
      };
    };
    const coordinates = scene.getGameplayCoordinateSpace();

    if (!useTouch) {
      const pointer = scene.input.activePointer;
      const raw = scene.inputManager.keyboardMouseInput.getInput({ x: 144, y: 144 }, false);
      scene.crosshair?.update(true);
      return {
        rawAim: raw.aimAngle,
        expectedAim: coordinates.aimAngle(
          { space: 'world', x: 144, y: 144 },
          { space: 'screen', x: pointer.x, y: pointer.y },
        ),
        crosshair: scene.crosshair
          ? [
              scene.crosshair.sprite.x,
              scene.crosshair.sprite.y,
              scene.crosshair.sprite.scrollFactorX,
              scene.crosshair.sprite.scrollFactorY,
            ]
          : null,
        pointer: [pointer.x, pointer.y],
      };
    }

    const touch = scene.inputManager.touchInput;
    touch.setGameplayEnabled(true);
    const down = { id: 41, x: 900, y: 300 } as Phaser.Input.Pointer;
    const moved = { id: 41, x: 950, y: 300 } as Phaser.Input.Pointer;
    touch.onPointerDown(down);
    touch.onPointerMove(moved);
    const raw = touch.getInput(false);
    touch.onPointerUp(moved);
    const blocked = { id: 42, x: 900, y: 600 } as Phaser.Input.Pointer;
    touch.onPointerDown(blocked);
    return {
      rawAim: raw.aimAngle,
      expectedAim: coordinates.screenDirectionAngle({ space: 'screen', x: 1, y: 0 }),
      fixedMapRejectsOutsideWorldY: !touch.rightJoystick.active,
    };
  }, mobile);
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
    cameraController: {
      target: {
        kind: 'local-player',
        position: { space: 'world', x: 144, y: 144 },
      },
      base: { scrollX: 0, scrollY: 0, zoom: 1 },
      transient: {
        kickX: 0,
        kickY: 0,
        shakeX: 0,
        shakeY: 0,
        zoomMultiplier: 1,
        roll: 0,
      },
      composed: { scrollX: 0, scrollY: 0, zoom: 1, rotation: 0 },
    },
    coordinates: {
      screenToWorld: { space: 'world', x: 480, y: 288 },
      worldToScreen: { space: 'screen', x: 480, y: 288 },
    },
    domains: {
      kothObjective: [1, 1],
      coreMarker: [1, 1],
      playerMarkers: [1, 1],
      impactParticles: [1, 1],
      explosionParticles: [1, 1],
      radiationBoundary: [1, 1],
      radiationOverlay: [0, 0],
      scrapBoundary: [1, 1],
      scrapOverlay: [0, 0],
      xrayOverlay: [0, 0],
    },
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
    cameraController: {
      target: { kind: 'local-player' },
      base: { scrollX: 0, scrollY: 0, zoom: 1 },
      composed: { scrollX: 0, scrollY: 0, zoom: 1, rotation: 0 },
    },
  });
  expect(initial.safeArea).toMatchObject({ left: 32, top: 32, right: 1248, bottom: 688 });
  expect(initial.coordinates).toEqual({
    screenToWorld: { space: 'world', x: 480, y: 288 },
    worldToScreen: { space: 'screen', x: 480, y: 288 },
  });
  expect(initial.domains).toEqual({
    kothObjective: [1, 1],
    coreMarker: [1, 1],
    playerMarkers: [1, 1],
    impactParticles: [1, 1],
    explosionParticles: [1, 1],
    radiationBoundary: [1, 1],
    radiationOverlay: [0, 0],
    scrapBoundary: [1, 1],
    scrapOverlay: [0, 0],
    xrayOverlay: [0, 0],
  });

  const transformed = await transformedCameraSnapshot(page);
  expect(transformed).toMatchObject({
    base: {
      target: { kind: 'local-player' },
      base: { scrollX: 860, scrollY: 540, zoom: 1.25 },
    },
    respawn: {
      target: { kind: 'respawn' },
      base: { scrollX: -128, scrollY: -72, zoom: 1.25 },
    },
    composed: {
      target: { kind: 'spectator' },
      base: { scrollX: 1408, scrollY: 792, zoom: 1.25 },
    },
    restoredCamera: { scrollX: 0, scrollY: 0, zoom: 1, rotation: 0 },
  });
  const transformedDetail = transformed as {
    composed: {
      transient: {
        kickX: number;
        shakeX: number;
        shakeY: number;
        zoomMultiplier: number;
        roll: number;
      };
    };
    transform: {
      targetScreen: { x: number; y: number };
      roundTrip: { x: number; y: number };
      aim: number;
      expectedAim: number;
    };
  };
  expect(transformedDetail.composed.transient.kickX).toBeGreaterThan(0);
  expect(
    Math.abs(transformedDetail.composed.transient.shakeX) +
      Math.abs(transformedDetail.composed.transient.shakeY),
  ).toBeGreaterThan(0);
  expect(transformedDetail.composed.transient.zoomMultiplier).toBeGreaterThan(1);
  expect(transformedDetail.composed.transient.roll).toBeGreaterThan(0);
  expect(transformedDetail.transform.targetScreen.x).toBeCloseTo(640, 6);
  expect(transformedDetail.transform.targetScreen.y).toBeCloseTo(360, 6);
  expect(transformedDetail.transform.roundTrip.x).toBeCloseTo(800, 6);
  expect(transformedDetail.transform.roundTrip.y).toBeCloseTo(300, 6);
  expect(transformedDetail.transform.aim).toBeCloseTo(transformedDetail.transform.expectedAim, 6);

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  if (testInfo.project.name === 'mobile-landscape')
    await canvas.tap({ position: { x: 24, y: 24 } });
  else await canvas.click({ position: { x: 24, y: 24 } });
  await expect.poll(async () => (await viewportSnapshot(page)).mode).toBe('large-world');

  if (testInfo.project.name !== 'mobile-landscape') {
    const box = await canvas.boundingBox();
    if (!box) throw new Error('gameplay canvas is missing');
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.4);
  }
  const input = await coordinateInputSnapshot(page, testInfo.project.name === 'mobile-landscape');
  expect(input.rawAim).toBeCloseTo(input.expectedAim as number, 6);
  if (testInfo.project.name === 'mobile-landscape') {
    expect(input.fixedMapRejectsOutsideWorldY).toBe(true);
  } else {
    expect(input.crosshair).toEqual([...(input.pointer as number[]), 0, 0]);
  }

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
