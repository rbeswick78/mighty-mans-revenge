import { expect, test } from '../fixtures';

const shellAdvertised = process.env.CAPABILITY_NEW_SHELL === 'true';

async function waitForScene(gamePage: import('@playwright/test').Page, key: string): Promise<void> {
  await expect
    .poll(
      () =>
        gamePage.evaluate((sceneKey) => {
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
      { timeout: 15000 },
    )
    .toBe(true);
}

test.describe('Wasteland signal recovery', () => {
  test('makes retry state and disabled play actions legible in the live lobby', async ({
    gamePage,
  }) => {
    await waitForScene(gamePage, 'LobbyScene');

    const presentation = await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('LobbyScene') as {
        gameService: {
          emit: (event: string) => void;
          retryConnection: () => void;
        };
        connectionStatusText: {
          text: string;
          getBounds: () => { x: number; y: number; width: number; height: number };
        };
        retryConnectionButton: {
          visible: boolean;
          alpha: number;
          activate: () => boolean;
        };
        quickMatchButton: { alpha: number; activate: () => boolean };
      };

      scene.gameService.emit('reconnecting');
      const retryBounds = scene.connectionStatusText.getBounds();
      const lost = {
        text: scene.connectionStatusText.text,
        retryVisible: scene.retryConnectionButton.visible,
        playAlpha: scene.quickMatchButton.alpha,
        playActivated: scene.quickMatchButton.activate(),
        inside:
          retryBounds.x >= 0 &&
          retryBounds.y >= 0 &&
          retryBounds.x + retryBounds.width <= 960 &&
          retryBounds.y + retryBounds.height <= 720,
      };

      let retryCalls = 0;
      scene.gameService.retryConnection = () => {
        retryCalls++;
        scene.gameService.emit('connecting');
      };
      const retryActivated = scene.retryConnectionButton.activate();
      const linkingText = scene.connectionStatusText.text;
      scene.gameService.emit('connected');

      return {
        lost,
        retryActivated,
        retryCalls,
        linkingText,
        onlineText: scene.connectionStatusText.text,
        onlinePlayAlpha: scene.quickMatchButton.alpha,
        retryHiddenOnline: !scene.retryConnectionButton.visible,
      };
    });

    expect(presentation).toEqual({
      lost: {
        text: 'SIGNAL LOST // AUTO-RETRYING',
        retryVisible: true,
        playAlpha: 0.5,
        playActivated: false,
        inside: true,
      },
      retryActivated: true,
      retryCalls: 1,
      linkingText: 'LINKING TO OUTPOST...',
      onlineText: 'SIGNAL ONLINE',
      onlinePlayAlpha: 1,
      retryHiddenOnline: true,
    });
  });

  test('shows a clear signal-loss beat before returning an interrupted match to the lobby', async ({
    gamePage,
  }) => {
    await waitForScene(gamePage, 'LobbyScene');
    await gamePage.evaluate(() => {
      const game = (
        window as unknown as {
          game?: {
            scene: {
              scenes: Array<{
                scene: { start: (key: string, data: unknown) => void };
                sys: { settings: { active: boolean } };
              }>;
            };
          };
        }
      ).game;
      const active = game?.scene.scenes.find((scene) => scene.sys.settings.active);
      if (!active) throw new Error('active scene is not ready');
      active.scene.start('GameScene', {
        nickname: 'SignalRunner',
        matchData: {
          matchId: 'signal-recovery-live',
          opponents: [{ id: 'rival-a', nickname: 'Dust Queen' }],
          mapName: 'Scrapyard',
          gameMode: 'deathmatch',
          matchKind: 'duel',
        },
      });
    });
    await waitForScene(gamePage, 'GameScene');

    const overlay = await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        gameService: { emit: (event: string) => void };
        children: { list: Array<{ text?: string }> };
      };
      scene.gameService.emit('reconnecting');
      return scene.children.list
        .map((child) => child.text)
        .filter((text): text is string => typeof text === 'string');
    });

    expect(overlay).toContain('SIGNAL LOST');
    expect(overlay).toContain('RETURNING TO THE OUTPOST...');
    await waitForScene(gamePage, shellAdvertised ? 'ReforgedShellScene' : 'LobbyScene');
  });
});
