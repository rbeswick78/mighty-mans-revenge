import { mkdirSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';

interface FrameBaseline {
  frames: number;
  durationMs: number;
  meanFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  fps: number;
}

const largeWorldsAdvertised = process.env.CAPABILITY_LARGE_WORLDS === 'true';

async function waitForActiveScene(page: Page, sceneKey: string, timeout = 15_000): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((key) => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (name: string) => unknown } } }
          ).game?.scene.getScene(key) as { sys?: { settings?: { active?: boolean } } };
          return scene?.sys?.settings?.active ?? false;
        }, sceneKey),
      { timeout },
    )
    .toBe(true);
}

async function startLivePractice(page: Page): Promise<void> {
  await waitForActiveScene(page, 'LobbyScene');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const lobby = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('LobbyScene') as {
            gameService?: { getPlayerId: () => string | null };
          };
          return lobby.gameService?.getPlayerId() ?? null;
        }),
      { timeout: 15_000 },
    )
    .not.toBeNull();
  await page.evaluate(() => {
    const lobby = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('LobbyScene') as {
      gameService: {
        startPractice: (
          nickname: string,
          difficulty: 'scrapper',
          kind: 'sparring',
          gameMode: 'deathmatch',
        ) => void;
      };
    };
    lobby.gameService.startPractice('FRAME', 'scrapper', 'sparring', 'deathmatch');
  });

  await waitForActiveScene(page, 'CharacterSelectScene');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const selection = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('CharacterSelectScene') as {
            latestSelections?: Array<{
              playerId: string;
              hoveredCharacterId: string | null;
              lockedCharacterId: string | null;
            }>;
            gameService?: {
              getPlayerId: () => string | null;
              sendCharacterLock: (characterId: string) => void;
            };
          };
          const localId = selection.gameService?.getPlayerId();
          const local = selection.latestSelections?.find((entry) => entry.playerId === localId);
          if (!local?.hoveredCharacterId || local.lockedCharacterId) return false;
          selection.gameService?.sendCharacterLock(local.hoveredCharacterId);
          return true;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);

  await waitForActiveScene(page, 'GameScene');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('GameScene') as { matchPhase?: string };
          return scene?.matchPhase ?? 'missing';
        }),
      { timeout: 15_000 },
    )
    .toBe('active');
}

async function startStagedPractice(page: Page): Promise<void> {
  await waitForActiveScene(page, 'LobbyScene');
  await page.evaluate((advertiseLargeWorlds) => {
    const lobby = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('LobbyScene') as {
      scene: { start: (key: string, data: unknown) => void };
      gameService: {
        getNetworkManager: () => {
          getPlayerId: () => string;
          getLocalPlayerState: () => unknown;
          handleMessage: (message: unknown) => void;
        };
      };
    };
    const network = lobby.gameService.getNetworkManager();
    network.handleMessage({
      type: 'server:welcome',
      playerId: 'baseline-local',
      capabilities: {
        newShell: false,
        schedules: false,
        largeWorlds: advertiseLargeWorlds,
        modernArt: false,
        battleRoyale: false,
      },
    });
    network.getPlayerId = () => 'baseline-local';
    network.getLocalPlayerState = () => ({
      id: 'baseline-local',
      nickname: 'FRAME',
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
    lobby.scene.start('GameScene', {
      nickname: 'FRAME',
      matchData: {
        matchId: 'staged-frame-baseline',
        opponents: [{ id: 'baseline-rival', nickname: 'RUSTY' }],
        mapName: 'Scrapyard',
        gameMode: 'deathmatch',
        matchKind: 'practice',
      },
    });
  }, largeWorldsAdvertised);
  await waitForActiveScene(page, 'GameScene');
  await page.evaluate(() => {
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('GameScene') as { matchPhase: string };
    scene.matchPhase = 'active';
  });
}

async function sampleAnimationFrames(page: Page, sampleMs: number): Promise<FrameBaseline> {
  return page.evaluate(
    (duration) =>
      new Promise<FrameBaseline>((resolve) => {
        const deltas: number[] = [];
        const startedAt = performance.now();
        let previous = startedAt;

        const finish = (endedAt: number) => {
          const sorted = [...deltas].sort((a, b) => a - b);
          const percentile = (fraction: number) =>
            sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
          const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
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

test('captures client frame and visual baseline', async ({ gamePage }, testInfo) => {
  test.setTimeout(45_000);
  let sceneSource: 'live' | 'staged';
  if (testInfo.project.name === 'desktop-chromium') {
    await startLivePractice(gamePage);
    sceneSource = 'live';
  } else {
    await startStagedPractice(gamePage);
    sceneSource = 'staged';
  }
  await gamePage.waitForTimeout(500);

  const baseline = await sampleAnimationFrames(gamePage, 3_000);
  const dynamicRendering = await gamePage.evaluate(() => {
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('GameScene') as {
      getDynamicWorldRenderState(): {
        quality: { tier: string };
        map: { chunkCount: number; visibleChunkIds: string[] } | null;
        decals: { resourceCount: number } | null;
        lighting: { width: number; height: number } | null;
      };
    };
    return scene.getDynamicWorldRenderState();
  });
  const artifactDir = process.env.BASELINE_ARTIFACT_DIR;
  const screenshotPath = artifactDir
    ? path.join(artifactDir, `${testInfo.project.name}.png`)
    : testInfo.outputPath(`${testInfo.project.name}.png`);
  if (artifactDir) mkdirSync(artifactDir, { recursive: true });
  await gamePage.screenshot({ path: screenshotPath });
  await testInfo.attach('baseline-visual', { path: screenshotPath, contentType: 'image/png' });

  console.log(
    `BASELINE_CLIENT_FRAME ${JSON.stringify({
      project: testInfo.project.name,
      sceneSource,
      viewport: testInfo.project.use.viewport,
      ...baseline,
      dynamicRendering: {
        quality: dynamicRendering.quality.tier,
        chunks: dynamicRendering.map,
        decalResources: dynamicRendering.decals?.resourceCount ?? 0,
        lighting: dynamicRendering.lighting,
      },
      screenshotPath,
    })}`,
  );

  // This is a recorder, not a hardware gate. Headless projects may use a
  // software renderer, so only assert that requestAnimationFrame advanced.
  expect(baseline.frames).toBeGreaterThan(0);
  expect(baseline.fps).toBeGreaterThan(0);
});
