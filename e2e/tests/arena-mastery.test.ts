import { test, expect } from '../fixtures';

test.describe('Arena Mastery results', () => {
  test('celebrates a newly claimed arena without crowding the next-draft teaser', async ({
    gamePage,
  }) => {
    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const game = (
              window as unknown as {
                game?: { scene: { getScene: (key: string) => unknown } };
              }
            ).game;
            const lobby = game?.scene.getScene('LobbyScene') as {
              sys?: { settings: { active: boolean } };
            };
            return lobby?.sys?.settings.active ?? false;
          }),
        { timeout: 15000, message: 'expected the lobby before staging results' },
      )
      .toBe(true);

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
      const localPlayerId = 'visual-local';
      lobby.gameService.getPlayerId = () => localPlayerId;

      const stats = {
        kills: 7,
        deaths: 4,
        shotsFired: 30,
        shotsHit: 16,
        damageDealt: 740,
        damageTaken: 520,
        grenadesThrown: 2,
        killsByWeapon: {
          gun: 5,
          grenade: 1,
          fire: 0,
          shotgun: 1,
          axe: 0,
          pistol: 0,
          punch: 0,
          bat: 0,
          barrel: 0,
        },
        longestKillStreak: 3,
        distanceTraveled: 900,
        hillSeconds: 0,
      };
      active.scene.start('ResultsScene', {
        nickname: 'ArenaAlpha',
        result: {
          matchId: 'arena-mastery-smoke',
          winnerId: localPlayerId,
          playerStats: new Map([
            [localPlayerId, stats],
            ['visual-rival', { ...stats, kills: 4, deaths: 7, shotsHit: 11 }],
          ]),
          duration: 120,
          gameMode: 'deathmatch',
          awards: [],
          rivalry: null,
          rivalrySet: null,
          isPractice: false,
          nextMapName: null,
          nextGameMode: null,
          wentToOvertime: false,
          arenaMastery: {
            [localPlayerId]: { mapName: 'Scrapyard', previousWins: 2, wins: 3 },
          },
        },
      });
    });

    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const w = window as unknown as {
            game?: { scene: { getScene: (key: string) => unknown } };
          };
          const scene = w.game?.scene.getScene('ResultsScene') as {
            sys?: { settings: { active: boolean } };
            children?: { list: Array<{ text?: string; y?: number }> };
          };
          const texts = scene?.children?.list ?? [];
          return {
            active: scene?.sys?.settings.active ?? false,
            masteryY: texts.find((child) => child.text === 'NEW CLAIMED · SCRAPYARD · 3 WINS')?.y,
            teaserY: texts.find((child) => child.text?.startsWith('NEXT:'))?.y,
          };
        }),
      )
      .toEqual({ active: true, masteryY: 104, teaserY: 120 });
  });
});
