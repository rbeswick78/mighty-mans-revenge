import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';

interface FrameEvidence {
  readonly frames: number;
  readonly durationMs: number;
  readonly meanFrameMs: number;
  readonly p95FrameMs: number;
  readonly p99FrameMs: number;
  readonly fps: number;
}

async function waitForActiveScene(page: Page, key: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (sceneKey) =>
            (
              window as unknown as {
                game?: { scene: { getScenes(active: boolean): Array<{ scene: { key: string } }> } };
              }
            ).game?.scene
              .getScenes(true)
              .some((scene) => scene.scene.key === sceneKey) ?? false,
          key,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function waitForAnyActiveScene(page: Page, keys: readonly string[]): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (sceneKeys) =>
            (
              window as unknown as {
                game?: { scene: { getScenes(active: boolean): Array<{ scene: { key: string } }> } };
              }
            ).game?.scene
              .getScenes(true)
              .some((scene) => sceneKeys.includes(scene.scene.key)) ?? false,
          keys,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function sampleFrames(page: Page, sampleMs: number): Promise<FrameEvidence> {
  return page.evaluate(
    (duration) =>
      new Promise<FrameEvidence>((resolve) => {
        const deltas: number[] = [];
        const startedAt = performance.now();
        let previous = startedAt;
        const finish = (endedAt: number) => {
          const sorted = [...deltas].sort((left, right) => left - right);
          const percentile = (fraction: number) =>
            sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
          const mean = deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
          const round = (value: number) => Number(value.toFixed(3));
          resolve({
            frames: deltas.length,
            durationMs: round(endedAt - startedAt),
            meanFrameMs: round(mean),
            p95FrameMs: round(percentile(0.95)),
            p99FrameMs: round(percentile(0.99)),
            fps: round(1_000 / mean),
          });
        };
        const onFrame = (now: number) => {
          deltas.push(now - previous);
          previous = now;
          if (now - startedAt >= duration) finish(now);
          else requestAnimationFrame(onFrame);
        };
        requestAnimationFrame(onFrame);
      }),
    sampleMs,
  );
}

test('profiles the eight-fighter Battle Royale rendering envelope', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === 'desktop-firefox',
    'Batch 50 requires desktop Chromium and mobile-landscape frame evidence; Batch 51 owns the full matrix.',
  );
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem('mmr_nickname', 'Perf50');
    localStorage.setItem('mmr_fighter_selection', 'rook');
  });
  await page.goto('/');
  await page.waitForSelector('canvas');
  await waitForAnyActiveScene(page, ['LobbyScene', 'ReforgedShellScene']);

  await page.evaluate(() => {
    const game = (
      window as unknown as {
        game?: {
          scene: {
            getScenes(active: boolean): Array<{ scene: { key: string } }>;
            getScene(key: string): {
              gameService: {
                getNetworkManager(): {
                  connection: { disconnect(): void; setState(state: string): void };
                  handleMessage(message: unknown): void;
                };
              };
            };
          };
        };
      }
    ).game;
    if (!game) throw new Error('missing game');
    const activeSceneKeys = game.scene.getScenes(true).map((scene) => scene.scene.key);
    const ownerKey = activeSceneKeys.includes('ReforgedShellScene')
      ? 'ReforgedShellScene'
      : 'LobbyScene';
    const owner = game.scene.getScene(ownerKey);
    const manager = owner.gameService.getNetworkManager();
    manager.connection.disconnect();
    manager.connection.setState('connected');
    manager.handleMessage({
      type: 'server:welcome',
      playerId: 'perf-local-50',
      capabilities: {
        newShell: true,
        schedules: false,
        largeWorlds: true,
        modernArt: true,
        battleRoyale: true,
      },
    });
  });
  await waitForActiveScene(page, 'ReforgedShellScene');

  await page.evaluate(() => {
    const shell = (
      window as unknown as {
        game?: {
          scene: {
            getScene(key: string): {
              gameService: {
                getNetworkManager(): { handleMessage(message: unknown): void };
              };
            };
          };
        };
      }
    ).game?.scene.getScene('ReforgedShellScene');
    if (!shell) throw new Error('missing ReforgedShellScene');
    shell.gameService.getNetworkManager().handleMessage({
      type: 'server:matchFound',
      matchId: 'battle-royale-performance-50',
      opponents: Array.from({ length: 7 }, (_, index) => ({
        id: `perf-rival-${index}`,
        nickname: `Rival${index}`,
      })),
      mapName: 'Shatterlands',
      gameMode: 'deathmatch',
      matchKind: 'battle_royale',
      battleRoyale: { participantCount: 8, humanCount: 1, botCount: 7 },
    });
  });
  await waitForActiveScene(page, 'GameScene');

  await page.evaluate(() => {
    const scene = (
      window as unknown as {
        game?: {
          scene: {
            getScene(key: string): {
              gameService: {
                getNetworkManager(): { handleMessage(message: unknown): void };
              };
            };
          };
        };
      }
    ).game?.scene.getScene('GameScene');
    if (!scene) throw new Error('missing GameScene');
    const manager = scene.gameService.getNetworkManager();
    const ids = [
      'perf-local-50',
      ...Array.from({ length: 7 }, (_, index) => `perf-rival-${index}`),
    ];
    const characters = [
      'mighty_man',
      'bruce',
      'frost_wizard',
      'bubba',
      'jack',
      'rook',
      'mighty_man',
      'bruce',
    ];
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical'];
    let tick = 50_000;
    const buildState = () => {
      tick += 1;
      const players = ids.map((id, index) => ({
        id,
        characterId: characters[index],
        position: {
          x: 300 + (index % 4) * 180 + Math.sin(tick / 8 + index) * 8,
          y: 280 + Math.floor(index / 4) * 220,
        },
        velocity: { x: index % 2 === 0 ? 25 : -25, y: 0 },
        aimAngle: (index * Math.PI) / 4,
        health: 100,
        maxHealth: 100,
        armor: index * 4,
        ammo: 0,
        weaponId: 'punch',
        battleRoyaleInventory: { equipped: null, loadedAmmo: 0, reserveAmmo: 0 },
        specialAmmo: 0,
        specialReserve: 0,
        grenades: 3,
        isReloading: false,
        isSprinting: index % 2 === 0,
        stamina: 3,
        isDead: false,
        respawnTimer: 0,
        invulnerableTimer: 0,
        lastProcessedInput: tick,
        score: 0,
        deaths: 0,
        nickname: index === 0 ? 'Perf50' : `Rival${index - 1}`,
        abilityActiveSeconds: 0,
        abilityCooldownSeconds: 0,
        frozenTimer: 0,
        secondWindTimer: 0,
      }));
      const grenades = ids.map((id, index) => ({
        id: `perf-grenade-${index}`,
        position: { x: 520 + index * 70, y: 520 + (index % 2) * 40 },
        velocity: { x: 80 - index * 8, y: -30 },
        safetyFuseTimer: 2.4,
        throwerId: id,
        piercing: false,
      }));
      const rockets = ids.slice(0, 6).map((id, index) => ({
        id: `perf-rocket-${index}`,
        position: { x: 460 + index * 90, y: 660 },
        velocity: { x: 360, y: 0 },
        shooterId: id,
        angle: 0,
        distanceTraveled: 100 + index * 20,
        weaponInstance: {
          instanceId: `perf-rocket-weapon-${index}`,
          weaponId: 'launcher',
          rarity: rarities[index],
        },
      }));
      const droppedWeapons = Array.from({ length: 12 }, (_, index) => ({
        id: `perf-drop-${index}`,
        position: { x: 380 + (index % 6) * 120, y: 820 + Math.floor(index / 6) * 90 },
        weaponInstance: {
          instanceId: `perf-ground-weapon-${index}`,
          weaponId: index % 2 === 0 ? 'rifle' : 'smg',
          rarity: rarities[index % rarities.length],
        },
        loadedAmmo: 18,
        lootSourceId: `perf-source-${index}`,
      }));
      const battleRoyaleContainers = Array.from({ length: 16 }, (_, index) => ({
        id: `perf-container-${index}`,
        position: { x: 150 + (index % 8) * 160, y: 1050 + Math.floor(index / 8) * 90 },
        tile: { col: 2 + index, row: 20 + Math.floor(index / 8) },
        status: index % 3 === 0 ? 'opened' : 'intact',
      }));
      const battleRoyaleSupplyBundles = Array.from({ length: 8 }, (_, index) => ({
        id: `perf-supply-${index}`,
        position: { x: 240 + index * 140, y: 1320 },
        reserveAmmo: 24,
        sustainType: ['bandage', 'armor', 'grenade'][index % 3],
        lootSourceId: `perf-source-${index}`,
        source: 'container',
      }));
      return {
        type: 'server:gameState',
        tick,
        phase: 'active',
        countdownTimer: 0,
        matchTimer: 180,
        players,
        grenades,
        axes: [],
        rockets,
        droppedWeapons,
        battleRoyaleContainers,
        battleRoyaleSupplyBundles,
        bulletTrails:
          tick % 4 === 0
            ? ids.slice(0, 2).map((id, index) => ({
                startPos: players[index].position,
                endPos: { x: players[index].position.x + 180, y: players[index].position.y },
                shooterId: id,
                timestamp: tick,
                weaponId: 'rifle',
                hitPlayerId: null,
                damageApplied: 0,
              }))
            : [],
        barrelExplosions: tick % 20 === 0 ? [{ x: 800, y: 720 }] : [],
        contract: {
          id: 'hot_shot',
          title: 'HOT SHOT',
          objective: 'LAND 8 ATTACKS',
          target: 8,
          players: [],
        },
        punches:
          tick % 10 === 0
            ? ids.slice(0, 2).map((id, index) => ({
                playerId: id,
                weaponId: 'punch',
                position: players[index].position,
                aimAngle: players[index].aimAngle,
                hit: index % 2 === 0,
              }))
            : [],
        pickups: [],
        activeMutators: [],
        isOvertime: false,
        battleRoyaleSafeZone: {
          phaseIndex: 3,
          phase: 'closing',
          center: { x: 1344, y: 816 },
          radius: 760,
          nextCenter: { x: 1180, y: 760 },
          nextRadius: 420,
          phaseSecondsRemaining: 8.4,
          damagePerPulse: 4,
        },
        battleRoyaleSpectator: {
          livingPlayerIds: ids,
          aliveCount: 8,
          standings: ids.map((id) => ({
            playerId: id,
            placement: 8,
            status: 'alive',
            eliminatedBy: null,
            eliminationCause: null,
          })),
        },
      };
    };
    manager.handleMessage(buildState());
    const interval = window.setInterval(() => manager.handleMessage(buildState()), 50);
    (
      window as unknown as {
        __battleRoyalePerformanceStop?: () => void;
      }
    ).__battleRoyalePerformanceStop = () => window.clearInterval(interval);
  });

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = (
            window as unknown as {
              game?: {
                scene: {
                  getScene(key: string): {
                    getBattleRoyalePerformanceRenderState(): Record<string, unknown>;
                  };
                };
              };
            }
          ).game?.scene.getScene('GameScene');
          return scene?.getBattleRoyalePerformanceRenderState();
        }),
      { timeout: 15_000 },
    )
    .toMatchObject({
      fighters: 8,
      grenades: 8,
      rockets: 6,
      droppedWeapons: 12,
      containers: 16,
      supplies: 8,
      safeZoneVisible: true,
    });

  // Long enough for the 30-sample governor window even on the headless
  // software renderer; this is recorder evidence, not a production-device FPS claim.
  const frames = await sampleFrames(page, 12_000);
  const rendering = await page.evaluate(() => {
    const scene = window as unknown as {
      game?: {
        scene: {
          getScene(key: string): {
            getBattleRoyalePerformanceRenderState(): Record<string, unknown>;
            getDynamicWorldRenderState(): {
              map: { chunkCount: number; visibleChunkIds: string[] } | null;
              decals: { resourceCount: number } | null;
              lighting: { width: number; height: number } | null;
            };
          };
        };
      };
      __battleRoyalePerformanceStop?: () => void;
    };
    const gameScene = scene.game?.scene.getScene('GameScene');
    const state = {
      battleRoyale: gameScene?.getBattleRoyalePerformanceRenderState(),
      world: gameScene?.getDynamicWorldRenderState(),
    };
    scene.__battleRoyalePerformanceStop?.();
    return state;
  });
  const screenshotPath = testInfo.outputPath(
    `${testInfo.project.name}-battle-royale-performance.png`,
  );
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach('battle-royale-performance', {
    path: screenshotPath,
    contentType: 'image/png',
  });

  console.log(
    `BATTLE_ROYALE_CLIENT_PERFORMANCE ${JSON.stringify({
      project: testInfo.project.name,
      viewport: testInfo.project.use.viewport,
      frames,
      rendering,
      screenshotPath,
    })}`,
  );

  expect(frames.frames).toBeGreaterThan(0);
  expect(frames.fps).toBeGreaterThan(0);
  expect(rendering.battleRoyale).toMatchObject({
    fighters: 8,
    grenades: 8,
    rockets: 6,
    droppedWeapons: 12,
    containers: 16,
    supplies: 8,
    safeZoneVisible: true,
    combatFeedback: {
      capacity: 32,
      sequence: expect.any(Number),
    },
    quality: { tier: expect.stringMatching(/^(full|reduced)$/) },
  });
  expect(rendering.world?.map?.chunkCount).toBeGreaterThan(0);
  expect(rendering.world?.map?.visibleChunkIds.length).toBeGreaterThan(0);
  expect(rendering.world?.decals?.resourceCount ?? 0).toBeLessThanOrEqual(512);
  expect(rendering.world?.lighting).not.toBeNull();
  expect(
    (
      rendering.battleRoyale as {
        combatFeedback?: { sequence?: number };
      }
    )?.combatFeedback?.sequence ?? 0,
  ).toBeGreaterThan(0);
  const qualityTier = (
    rendering.battleRoyale as {
      quality?: { tier?: string };
    }
  )?.quality?.tier;
  if (frames.fps < 45) expect(qualityTier).toBe('reduced');
  else expect(qualityTier).toMatch(/^(full|reduced)$/);
});
