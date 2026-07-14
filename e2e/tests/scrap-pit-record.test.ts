import { test, expect } from '../fixtures';

test.describe('Scrap Pit Records', () => {
  test('banks an authoritative win and brings the new target back to the lobby', async ({
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
        { timeout: 15000, message: 'expected the lobby before staging Scrap Pit results' },
      )
      .toBe(true);

    await gamePage.evaluate(() => {
      localStorage.removeItem('mmr_scrap_pit_record');
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
      const localPlayerId = 'pit-local';
      lobby.gameService.getPlayerId = () => localPlayerId;
      const stats = {
        kills: 7,
        assists: 2,
        deaths: 3,
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
      const rivals = ['pit-rusty', 'pit-scrapjaw', 'pit-clank'];
      active.scene.start('ResultsScene', {
        nickname: 'PitHero',
        matchData: {
          matchId: 'pit-record-1',
          opponents: rivals.map((id) => ({ id, nickname: id })),
          mapName: 'Scrapyard',
          gameMode: 'deathmatch',
          matchKind: 'rumble',
          practiceKind: 'rusty_rumble',
          characterWins: {},
        },
        result: {
          matchId: 'pit-record-1',
          winnerId: localPlayerId,
          playerStats: new Map([
            [localPlayerId, stats],
            [rivals[0], { ...stats, kills: 4, assists: 0, deaths: 5 }],
            [rivals[1], { ...stats, kills: 3, assists: 1, deaths: 5 }],
            [rivals[2], { ...stats, kills: 2, assists: 0, deaths: 6 }],
          ]),
          duration: 120,
          gameMode: 'deathmatch',
          matchKind: 'rumble',
          scores: {
            [localPlayerId]: 7,
            [rivals[0]]: 4,
            [rivals[1]]: 3,
            [rivals[2]]: 2,
          },
          playerNicknames: {
            [localPlayerId]: 'PitHero',
            [rivals[0]]: 'Rusty',
            [rivals[1]]: 'Scrapjaw',
            [rivals[2]]: 'Clank',
          },
          departedPlayerIds: [],
          awards: [],
          rivalry: null,
          rivalrySet: null,
          isPractice: true,
          nextMapName: 'Collapsed Overpass',
          nextGameMode: 'koth',
          wentToOvertime: false,
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
            children?: { list: Array<{ text?: string; y?: number; visible?: boolean }> };
          };
          const record = scene?.children?.list.find((child) =>
            child.text?.startsWith('PIT RECORD:'),
          );
          return {
            active: scene?.sys?.settings.active ?? false,
            text: record?.text,
            y: record?.y,
            stored: localStorage.getItem('mmr_scrap_pit_record'),
          };
        }),
      )
      .toMatchObject({
        active: true,
        text: 'PIT RECORD: 1W / 1  //  FIRST WIN  //  RUN 1',
        y: 476,
        stored: expect.stringContaining('"lastMatchId":"pit-record-1"'),
      });

    await gamePage.evaluate(() => {
      const game = (
        window as unknown as {
          game?: {
            scene: {
              scenes: Array<{
                scene: { start: (key: string) => void };
                sys: { settings: { active: boolean } };
              }>;
            };
          };
        }
      ).game;
      const active = game?.scene.scenes.find((scene) => scene.sys.settings.active);
      if (!active) throw new Error('results scene is not ready');
      active.scene.start('LobbyScene');
    });

    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            }
          ).game?.scene.getScene('LobbyScene') as {
            sys?: { settings: { active: boolean } };
            rustyRumbleButton?: { list: Array<{ text?: string }> };
          };
          return scene?.sys?.settings.active
            ? (scene.rustyRumbleButton?.list.find((child) => typeof child.text === 'string')
                ?.text ?? null)
            : null;
        }),
      )
      .toBe('SCRAP PIT\n1W · BEST 1');
  });
});
