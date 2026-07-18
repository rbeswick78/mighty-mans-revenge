import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

async function waitForScene(page: Page, key: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((sceneKey) => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene(sceneKey) as { sys?: { settings?: { active?: boolean } } };
          return scene?.sys?.settings?.active ?? false;
        }, key),
      { timeout: 15_000 },
    )
    .toBe(true);
}

test.describe('Battle Royale Results foundation', () => {
  test('projects eight authoritative placements and exposes leave without rematch or spectate', async ({
    gamePage,
  }) => {
    await waitForScene(gamePage, 'LobbyScene');
    await gamePage.evaluate(() => {
      const runtime = window as unknown as {
        game?: {
          scene: {
            scenes: Array<{
              scene: { start: (key: string, data: unknown) => void };
              sys: { settings: { active: boolean } };
            }>;
            getScene: (key: string) => unknown;
          };
        };
      };
      const active = runtime.game?.scene.scenes.find((scene) => scene.sys.settings.active);
      const lobby = runtime.game?.scene.getScene('LobbyScene') as {
        gameService?: { getPlayerId: () => string | null };
      };
      if (!active || !lobby.gameService) throw new Error('lobby is not ready');
      lobby.gameService.getPlayerId = () => 'player-3';
      const stats = {
        kills: 0,
        assists: 0,
        deaths: 1,
        shotsFired: 0,
        shotsHit: 0,
        damageDealt: 0,
        damageTaken: 0,
        grenadesThrown: 0,
        killsByWeapon: {
          gun: 0,
          grenade: 0,
          fire: 0,
          shotgun: 0,
          axe: 0,
          pistol: 0,
          punch: 0,
          bat: 0,
          barrel: 0,
        },
        longestKillStreak: 0,
        distanceTraveled: 0,
        hillSeconds: 0,
      };
      const placements = Array.from({ length: 8 }, (_, index) => ({
        playerId: `player-${index}`,
        placement: index + 1,
        status: index === 0 ? 'winner' : index === 6 ? 'departed' : 'eliminated',
      }));
      active.scene.start('ResultsScene', {
        nickname: 'Player 3',
        result: {
          matchId: 'battle-royale-results',
          winnerId: 'player-0',
          playerStats: new Map(placements.map((placement) => [placement.playerId, { ...stats }])),
          duration: 180,
          gameMode: 'deathmatch',
          matchKind: 'battle_royale',
          battleRoyale: {
            placements,
            terminalReason: 'last_survivor',
            actions: { canLeave: true, canSpectate: false },
          },
          playerNicknames: Object.fromEntries(
            placements.map((placement) => [placement.playerId, `Fighter ${placement.placement}`]),
          ),
          awards: [],
          rivalry: null,
          rivalrySet: null,
          isPractice: false,
          nextMapName: null,
          nextGameMode: null,
          wentToOvertime: false,
        },
      });
    });
    await waitForScene(gamePage, 'ResultsScene');
    await gamePage.waitForTimeout(400);

    const state = await gamePage.evaluate(() => {
      type RuntimeButton = { activate: () => void };
      const runtime = window as unknown as {
        game?: { scene: { getScene: (key: string) => unknown } };
        __battleRoyaleLeft?: boolean;
      };
      const scene = runtime.game?.scene.getScene('ResultsScene') as {
        children: {
          list: Array<{ name?: string; text?: string; list?: Array<{ text?: string }> }>;
        };
        gameService: { returnToLobby: () => void };
        actionButtons: () => RuntimeButton[];
        rematchButton: RuntimeButton | null;
      };
      scene.gameService.returnToLobby = () => {
        runtime.__battleRoyaleLeft = true;
      };
      const nodes = scene.children.list.flatMap((node) => [node, ...(node.list ?? [])]);
      const actionButtons = scene.actionButtons();
      actionButtons[0]?.activate();
      return {
        title: nodes.find((node) => node.name === 'battle-royale-results-title')?.text ?? null,
        placements: Array.from(
          { length: 8 },
          (_, index) =>
            nodes.find((node) => node.name === `battle-royale-placement-player-${index}`)?.text,
        ),
        localLabel:
          nodes.find((node) => node.name === 'battle-royale-fighter-player-3')?.text ?? null,
        actionCount: actionButtons.length,
        hasRematch: scene.rematchButton !== null,
        left: runtime.__battleRoyaleLeft ?? false,
      };
    });

    expect(state).toEqual({
      title: 'BATTLE ROYALE PLACEMENTS',
      placements: ['1', '2', '3', '4', '5', '6', '7', '8'],
      localLabel: 'FIGHTER 4  (YOU)',
      actionCount: 1,
      hasRematch: false,
      left: true,
    });
  });

  test('keeps an old-server Battle Royale result reachable without invented placements', async ({
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
      if (!active) throw new Error('active scene is unavailable');
      active.scene.start('ResultsScene', {
        result: {
          matchId: 'old-server-battle-royale',
          winnerId: null,
          playerStats: new Map(),
          duration: 0,
          gameMode: 'deathmatch',
          matchKind: 'battle_royale',
          awards: [],
          rivalry: null,
          rivalrySet: null,
          isPractice: false,
          nextMapName: null,
          nextGameMode: null,
          wentToOvertime: false,
        },
      });
    });
    await waitForScene(gamePage, 'ResultsScene');
    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('ResultsScene') as {
            children?: { list: Array<{ text?: string; list?: Array<{ text?: string }> }> };
            actionButtons: () => unknown[];
          };
          const texts = (scene.children?.list ?? [])
            .flatMap((node) => [node, ...(node.list ?? [])])
            .map((node) => node.text);
          return {
            fallback: texts.includes('PLACEMENTS UNAVAILABLE'),
            actionCount: scene.actionButtons().length,
          };
        }),
      )
      .toEqual({ fallback: true, actionCount: 1 });
  });
});
