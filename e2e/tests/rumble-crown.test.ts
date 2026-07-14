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
      { timeout: 15000, message: 'expected the lobby before staging the crown story' },
    )
    .toBe(true);
}

test.describe('Rumble Crown surfaces', () => {
  test('briefs the field on the reigning champion before a rematch', async ({ gamePage }) => {
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
          matchId: 'rumble-crown-select',
          opponents: [{ id: 'visual-rival', nickname: 'ArenaBravo' }],
          mapName: 'Wasteland Outpost',
          gameMode: 'deathmatch',
          matchKind: 'rumble',
          characterWins: {},
          rumbleCrown: { holderId: 'visual-local', holderNickname: 'ArenaAlpha', wins: 3 },
        },
      });
    });

    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const w = window as unknown as {
            game?: { scene: { getScene: (key: string) => unknown } };
          };
          const scene = w.game?.scene.getScene('CharacterSelectScene') as {
            sys?: { settings: { active: boolean } };
            children?: { list: Array<{ text?: string; y?: number; visible?: boolean }> };
          };
          const crown = scene?.children?.list.find((child) => child.text?.includes('CROWN:'));
          return {
            active: scene?.sys?.settings.active ?? false,
            text: crown?.text,
            visible: crown?.visible,
            y: crown?.y,
          };
        }),
      )
      .toEqual({
        active: true,
        text: 'NEXT: DEATHMATCH - WASTELAND OUTPOST\nCROWN: ARENAALPHA · 3-WIN REIGN',
        visible: true,
        y: 142,
      });
  });

  test('renders a crown steal inside two-to-four-player standings', async ({ gamePage }) => {
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
        kills: 6,
        deaths: 2,
        shotsFired: 30,
        shotsHit: 16,
        damageDealt: 740,
        damageTaken: 320,
        grenadesThrown: 1,
        killsByWeapon: {
          gun: 5,
          grenade: 1,
          fire: 0,
          shotgun: 0,
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
          matchId: 'rumble-crown-results',
          winnerId: 'visual-local',
          playerStats: new Map([
            ['visual-local', stats],
            ['visual-rival', { ...stats, kills: 4, deaths: 6 }],
          ]),
          duration: 120,
          gameMode: 'deathmatch',
          matchKind: 'rumble',
          scores: { 'visual-local': 6, 'visual-rival': 4 },
          playerNicknames: { 'visual-local': 'ArenaAlpha', 'visual-rival': 'ArenaBravo' },
          departedPlayerIds: [],
          awards: [],
          rivalry: null,
          rivalrySet: null,
          rumbleCrown: {
            crown: { holderId: 'visual-local', holderNickname: 'ArenaAlpha', wins: 1 },
            outcome: 'stolen',
            previousHolderId: 'visual-rival',
            previousHolderNickname: 'ArenaBravo',
          },
          isPractice: false,
          nextMapName: 'Scrapyard',
          nextGameMode: 'gun_game',
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
            children?: {
              list: Array<{
                text?: string;
                x?: number;
                y?: number;
                visible?: boolean;
                list?: Array<{ text?: string; x?: number; y?: number; visible?: boolean }>;
              }>;
            };
          };
          const root = scene?.children?.list ?? [];
          const crown = root
            .flatMap((child) => [child, ...(child.list ?? [])])
            .find((child) => child.text?.includes('STEALS THE CROWN'));
          return {
            active: scene?.sys?.settings.active ?? false,
            text: crown?.text,
            visible: crown?.visible,
            x: crown?.x,
            y: crown?.y,
          };
        }),
      )
      .toEqual({
        active: true,
        text: 'ARENAALPHA STEALS THE CROWN FROM ARENABRAVO',
        visible: true,
        x: 190,
        y: 49,
      });
  });
});
