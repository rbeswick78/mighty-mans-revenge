import { test, expect } from '../fixtures';

async function waitForActiveScene(
  page: import('@playwright/test').Page,
  key: string,
  timeout = 15000,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((sceneKey) => {
          const game = (
            window as unknown as {
              game?: {
                scene: {
                  getScene: (key: string) => { sys?: { settings?: { active?: boolean } } };
                };
              };
            }
          ).game;
          return game?.scene.getScene(sceneKey).sys?.settings?.active ?? false;
        }, key),
      { timeout },
    )
    .toBe(true);
}

test('composes Rumble lead drama in the live HUD', async ({ gamePage }, testInfo) => {
  test.setTimeout(45000);
  await waitForActiveScene(gamePage, 'LobbyScene', 20000);
  if (testInfo.project.name !== 'desktop-chromium') {
    // Headless Firefox/mobile WebRTC setup is intentionally outside this
    // composition check. Start the real GameScene/HUD with a synthetic local
    // identity; Chromium below still exercises the authoritative path.
    await gamePage.evaluate(() => {
      const lobby = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('LobbyScene') as {
        scene: { start: (key: string, data: unknown) => void };
        gameService: {
          getNetworkManager: () => { getPlayerId: () => string | null };
        };
      };
      lobby.gameService.getNetworkManager().getPlayerId = () => 'staged-local';
      lobby.scene.start('GameScene', {
        nickname: 'Lead Tester',
        matchData: {
          matchId: 'rumble-lead-mobile',
          opponents: [
            { id: 'rival-a', nickname: 'Dust Queen' },
            { id: 'rival-b', nickname: 'Nomad' },
          ],
          mapName: 'Scrapyard',
          gameMode: 'deathmatch',
          matchKind: 'rumble',
        },
      });
    });
    await waitForActiveScene(gamePage, 'GameScene', 10000);
  } else {
    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const lobby = (
              window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
            ).game?.scene.getScene('LobbyScene') as {
              gameService?: { getPlayerId: () => string | null };
            };
            return lobby.gameService?.getPlayerId() ?? null;
          }),
        { timeout: 15000 },
      )
      .not.toBeNull();

    await gamePage.evaluate(() => {
      const lobby = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('LobbyScene') as {
        gameService: {
          startPractice: (nickname: string, difficulty: string, kind: string) => void;
        };
      };
      lobby.gameService.startPractice('Lead Tester', 'scrapper', 'sparring');
    });
    await waitForActiveScene(gamePage, 'CharacterSelectScene', 10000);

    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const scene = (
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
            const localId = scene.gameService?.getPlayerId();
            const local = scene.latestSelections?.find(
              (selection) => selection.playerId === localId,
            );
            if (!local || !local.hoveredCharacterId || local.lockedCharacterId) return false;
            scene.gameService?.sendCharacterLock(local.hoveredCharacterId);
            return true;
          }),
        { timeout: 10000 },
      )
      .toBe(true);

    await waitForActiveScene(gamePage, 'GameScene', 10000);
    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const scene = (
              window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
            ).game?.scene.getScene('GameScene') as { matchPhase?: string };
            return scene.matchPhase ?? null;
          }),
        { timeout: 10000 },
      )
      .toBe('active');
  }
  const presentation = await gamePage.evaluate(() => {
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('GameScene') as {
      gameService: {
        getPlayerId: () => string | null;
        emit: (event: string, ...args: unknown[]) => void;
      };
      hud: {
        combatCalloutText: {
          text: string;
          visible: boolean;
          alpha: number;
          getBounds: () => { x: number; y: number; width: number; height: number };
        };
      };
    };
    const localId = scene.gameService.getPlayerId();
    if (!localId) throw new Error('local fighter missing');
    scene.gameService.emit('rumbleLeadChanged', { leaderIds: [localId], sequence: 1 }, [
      { id: localId, nickname: 'Lead Tester' },
      { id: 'rival-a', nickname: 'Dust Queen' },
      { id: 'rival-b', nickname: 'Nomad' },
    ]);
    const callout = scene.hud.combatCalloutText;
    const bounds = callout.getBounds();
    return {
      text: callout.text,
      visible: callout.visible,
      alpha: callout.alpha,
      bounds: {
        x: bounds.x,
        y: bounds.y,
        right: bounds.x + bounds.width,
        bottom: bounds.y + bounds.height,
      },
    };
  });

  expect(presentation).toMatchObject({
    text: 'YOU TAKE THE LEAD!\nTHE FIELD IS CHASING YOU',
    visible: true,
  });
  expect(presentation.alpha).toBeGreaterThan(0.9);
  expect(presentation.bounds.x).toBeGreaterThanOrEqual(0);
  expect(presentation.bounds.right).toBeLessThanOrEqual(960);
  expect(presentation.bounds.y).toBeGreaterThanOrEqual(0);
  expect(presentation.bounds.bottom).toBeLessThanOrEqual(576);

  if (process.env.VERIFY_RUMBLE_LEAD_SCREENSHOT === '1') {
    // Freeze the short 1.4s callout tween so slow mobile screenshot capture
    // records the asserted composition instead of its fully faded last frame.
    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        tweens: { killTweensOf: (target: unknown) => void };
        hud: {
          combatCalloutText: {
            setAlpha: (alpha: number) => unknown;
            setScale: (scale: number) => unknown;
            setVisible: (visible: boolean) => unknown;
          };
        };
      };
      const callout = scene.hud.combatCalloutText;
      scene.tweens.killTweensOf(callout);
      callout.setAlpha(1);
      callout.setScale(1);
      callout.setVisible(true);
    });
    await gamePage.screenshot({ path: testInfo.outputPath('rumble-lead.png') });
  }
});
