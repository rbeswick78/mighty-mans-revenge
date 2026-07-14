import { expect, test } from '../fixtures';

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

test.describe('Rumble assist surfaces', () => {
  test('celebrates local assist credit in the live combat lane', async ({ gamePage }) => {
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
              getScene: (key: string) => unknown;
            };
          };
        }
      ).game;
      const active = game?.scene.scenes.find((scene) => scene.sys.settings.active);
      const lobby = game?.scene.getScene('LobbyScene') as {
        gameService?: {
          getNetworkManager: () => { getPlayerId: () => string | null };
        };
      };
      if (!active || !lobby.gameService) throw new Error('lobby is not ready');
      lobby.gameService.getNetworkManager().getPlayerId = () => 'visual-local';
      active.scene.start('GameScene', {
        nickname: 'ArenaAlpha',
        matchData: {
          matchId: 'rumble-assist-live',
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
    await waitForScene(gamePage, 'GameScene');

    const presentation = await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        gameService: { emit: (event: string, value: unknown) => void };
        hud: {
          combatCalloutText: {
            text: string;
            visible: boolean;
            alpha: number;
            getBounds: () => { x: number; y: number; width: number; height: number };
          };
        };
      };
      scene.gameService.emit('playerKilled', {
        killerId: 'rival-a',
        victimId: 'rival-b',
        weapon: 'gun',
        timestamp: 1,
        assistId: 'visual-local',
        assistDamage: 42,
      });
      const callout = scene.hud.combatCalloutText;
      const bounds = callout.getBounds();
      return {
        text: callout.text,
        visible: callout.visible,
        alpha: callout.alpha,
        inside:
          bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= 960 &&
          bounds.y + bounds.height <= 576,
      };
    });

    expect(presentation).toEqual({
      text: 'ASSIST!\n42 DAMAGE ON THE TAKEDOWN',
      visible: true,
      alpha: 1,
      inside: true,
    });
  });

  test('renders four-player K/A/D and the Wingman award without crowding results', async ({
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
              getScene: (key: string) => unknown;
            };
          };
        }
      ).game;
      const active = game?.scene.scenes.find((scene) => scene.sys.settings.active);
      const lobby = game?.scene.getScene('LobbyScene') as {
        gameService?: { getPlayerId: () => string | null };
      };
      if (!active || !lobby.gameService) throw new Error('lobby is not ready');
      lobby.gameService.getPlayerId = () => 'visual-local';
      const stats = {
        kills: 5,
        assists: 3,
        deaths: 3,
        shotsFired: 30,
        shotsHit: 15,
        damageDealt: 600,
        damageTaken: 420,
        grenadesThrown: 1,
        killsByWeapon: {
          gun: 5,
          grenade: 0,
          fire: 0,
          shotgun: 0,
          axe: 0,
          pistol: 0,
          punch: 0,
          bat: 0,
          barrel: 0,
        },
        longestKillStreak: 2,
        distanceTraveled: 900,
        hillSeconds: 0,
      };
      active.scene.start('ResultsScene', {
        nickname: 'ArenaAlpha',
        result: {
          matchId: 'rumble-assist-results',
          winnerId: 'rival-c',
          playerStats: new Map([
            ['visual-local', stats],
            ['rival-a', { ...stats, kills: 6, assists: 1, deaths: 4 }],
            ['rival-b', { ...stats, kills: 4, assists: 2, deaths: 5 }],
            ['rival-c', { ...stats, kills: 8, assists: 0, deaths: 2 }],
          ]),
          duration: 120,
          gameMode: 'deathmatch',
          matchKind: 'rumble',
          scores: { 'visual-local': 5, 'rival-a': 6, 'rival-b': 4, 'rival-c': 8 },
          playerNicknames: {
            'visual-local': 'ArenaAlpha',
            'rival-a': 'Dust Queen',
            'rival-b': 'Nomad',
            'rival-c': 'Road Dog',
          },
          departedPlayerIds: [],
          awards: [
            {
              id: 'wingman',
              playerId: 'visual-local',
              nickname: 'ArenaAlpha',
              detail: '3 ASSISTS',
            },
          ],
          rivalry: null,
          rivalrySet: null,
          isPractice: false,
          nextMapName: 'Rusted Refinery',
          nextGameMode: 'gun_game',
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
            children?: {
              list: Array<{
                text?: string;
                visible?: boolean;
                list?: Array<{
                  text?: string;
                  visible?: boolean;
                  getBounds?: () => { x: number; y: number; width: number; height: number };
                }>;
              }>;
            };
          };
          const all = (scene?.children?.list ?? []).flatMap((child) => [
            child,
            ...(child.list ?? []),
          ]);
          const heading = all.find((child) => child.text === 'K/A/D');
          const localKad = all.find((child) => child.text === '5/3/3');
          const wingman = all.find((child) => child.text === 'WINGMAN');
          const bounds = localKad?.getBounds?.();
          return {
            heading: heading?.text,
            localKad: localKad?.text,
            wingman: wingman?.text,
            visible: localKad?.visible,
            inside:
              bounds !== undefined &&
              bounds.x >= 0 &&
              bounds.y >= 0 &&
              bounds.x + bounds.width <= 960 &&
              bounds.y + bounds.height <= 720,
          };
        }),
      )
      .toEqual({
        heading: 'K/A/D',
        localKad: '5/3/3',
        wingman: 'WINGMAN',
        visible: true,
        inside: true,
      });
  });
});
