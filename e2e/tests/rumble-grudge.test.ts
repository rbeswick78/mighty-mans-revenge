import { test, expect } from '../fixtures';

async function waitForLobby(gamePage: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(
      () =>
        gamePage.evaluate(() => {
          const game = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game;
          const lobby = game?.scene.getScene('LobbyScene') as {
            sys?: { settings: { active: boolean } };
          };
          return lobby?.sys?.settings.active ?? false;
        }),
      { timeout: 15000 },
    )
    .toBe(true);
}

test.describe('Rumble Grudge surfaces', () => {
  test('carries a personal target into fighter select', async ({ gamePage }) => {
    await waitForLobby(gamePage);
    await gamePage.evaluate(() => {
      const w = window as unknown as {
        game?: {
          scene: {
            scenes: Array<{
              scene: { start: (key: string, data: unknown) => void };
              sys: { settings: { active: boolean } };
            }>;
          };
        };
      };
      const active = w.game?.scene.scenes.find((scene) => scene.sys.settings.active);
      if (!active) throw new Error('active scene is not ready');
      active.scene.start('CharacterSelectScene', {
        nickname: 'ArenaAlpha',
        matchData: {
          matchId: 'rumble-grudge-select',
          opponents: [
            { id: 'rival-a', nickname: 'Dust Queen' },
            { id: 'rival-b', nickname: 'Nomad' },
          ],
          mapName: 'Scrapyard',
          gameMode: 'koth',
          matchKind: 'rumble',
          characterWins: {},
          rumbleCrown: { holderId: 'rival-b', holderNickname: 'Nomad', wins: 2 },
          rumbleGrudge: { targetId: 'rival-a', targetNickname: 'Dust Queen', knockouts: 3 },
        },
      });
    });

    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('CharacterSelectScene') as {
            sys?: { settings: { active: boolean } };
            children?: {
              list: Array<{
                text?: string;
                visible?: boolean;
                getBounds?: () => { x: number; y: number; width: number; height: number };
              }>;
            };
          };
          const briefing = scene?.children?.list.find((child) => child.text?.includes('GRUDGE:'));
          const bounds = briefing?.getBounds?.();
          return {
            active: scene?.sys?.settings.active ?? false,
            text: briefing?.text,
            visible: briefing?.visible,
            inside:
              bounds !== undefined &&
              bounds.x >= 0 &&
              bounds.y >= 0 &&
              bounds.x + bounds.width <= 960 &&
              bounds.y + bounds.height <= 576,
          };
        }),
      )
      .toEqual({
        active: true,
        text:
          'NEXT: KING OF THE HILL - SCRAPYARD\n' +
          'CROWN: NOMAD \u00b7 2-WIN REIGN\n' +
          'GRUDGE: HUNT DUST QUEEN \u00b7 3 KOS LAST ROUND',
        visible: true,
        inside: true,
      });
  });

  test('sets the local grudge without crowding four-player standings', async ({ gamePage }) => {
    await waitForLobby(gamePage);
    await gamePage.evaluate(() => {
      const w = window as unknown as {
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
      const active = w.game?.scene.scenes.find((scene) => scene.sys.settings.active);
      const lobby = w.game?.scene.getScene('LobbyScene') as {
        gameService?: { getPlayerId: () => string | null };
      };
      if (!active || !lobby.gameService) throw new Error('lobby is not ready');
      lobby.gameService.getPlayerId = () => 'visual-local';
      const stats = {
        kills: 5,
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
          matchId: 'rumble-grudge-results',
          winnerId: 'rival-c',
          playerStats: new Map([
            ['visual-local', stats],
            ['rival-a', { ...stats, kills: 6, deaths: 4 }],
            ['rival-b', { ...stats, kills: 4, deaths: 5 }],
            ['rival-c', { ...stats, kills: 8, deaths: 2 }],
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
          playerCharacters: {
            'visual-local': 'rook',
            'rival-a': 'frost_wizard',
            'rival-b': 'jack',
            'rival-c': 'bubba',
          },
          departedPlayerIds: [],
          awards: [],
          rivalry: null,
          rivalrySet: null,
          rumbleCrown: {
            crown: { holderId: 'rival-c', holderNickname: 'Road Dog', wins: 1 },
            outcome: 'stolen',
            previousHolderId: 'visual-local',
            previousHolderNickname: 'ArenaAlpha',
          },
          rumbleGrudges: {
            'visual-local': {
              targetId: 'rival-a',
              targetNickname: 'Dust Queen',
              knockouts: 3,
            },
          },
          isPractice: false,
          nextMapName: 'Rusted Refinery',
          nextGameMode: 'gun_game',
          wentToOvertime: false,
        },
      });
    });

    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('ResultsScene') as {
            sys?: { settings: { active: boolean } };
            children?: {
              list: Array<{
                text?: string;
                list?: Array<{ text?: string; y?: number; visible?: boolean }>;
              }>;
            };
          };
          const all = (scene?.children?.list ?? []).flatMap((child) => [
            child,
            ...(child.list ?? []),
          ]);
          const grudge = all.find((child) => child.text?.startsWith('GRUDGE SET:'));
          const fourth = all.find((child) => child.text === '4');
          return {
            active: scene?.sys?.settings.active ?? false,
            grudgeText: grudge?.text,
            grudgeY: grudge?.y,
            fourthRowY: fourth?.y,
            fourthVisible: fourth?.visible,
          };
        }),
      )
      .toEqual({
        active: true,
        grudgeText: 'GRUDGE SET: DUST QUEEN GOT YOU 3X',
        grudgeY: 67,
        fourthRowY: 280,
        fourthVisible: true,
      });
  });
});
