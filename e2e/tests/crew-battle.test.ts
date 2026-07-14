import { test, expect } from '../fixtures';

test.describe('Crew Battle 2v2', () => {
  test('launches two server-authored crews and marks the Rusty ally in live play', async ({
    gamePage,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-landscape', 'desktop live-flow coverage');
    test.setTimeout(60000);

    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const scene = (
              window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
            ).game?.scene.getScene('LobbyScene') as {
              sys?: { settings: { active: boolean } };
              connectionState?: string;
            };
            return {
              active: scene?.sys?.settings.active ?? false,
              connection: scene?.connectionState ?? 'missing',
            };
          }),
        { timeout: 20000, message: 'expected the connected lobby' },
      )
      .toEqual({ active: true, connection: 'connected' });

    await gamePage.locator('input[type="text"]').first().fill('Courier');
    const activated = await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('LobbyScene') as {
        crewBattleButton?: { activate: () => boolean };
      };
      return scene.crewBattleButton?.activate() ?? false;
    });
    expect(activated).toBe(true);

    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const scene = (
              window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
            ).game?.scene.getScene('CharacterSelectScene') as {
              sys?: { settings: { active: boolean } };
              matchData?: {
                matchKind?: string;
                practiceKind?: string;
                playerTeams?: Record<string, string>;
              };
              latestSelections?: Array<{ nickname: string; lockedCharacterId: string | null }>;
              children?: { list: Array<{ text?: string }> };
            };
            const teams = Object.values(scene?.matchData?.playerTeams ?? {});
            return {
              active: scene?.sys?.settings.active ?? false,
              matchKind: scene?.matchData?.matchKind ?? null,
              practiceKind: scene?.matchData?.practiceKind ?? null,
              blue: teams.filter((teamId) => teamId === 'blue').length,
              red: teams.filter((teamId) => teamId === 'red').length,
              bots: (scene?.latestSelections ?? [])
                .filter((selection) => selection.nickname !== 'Courier')
                .map((selection) => selection.nickname),
              briefing:
                scene?.children?.list.some(
                  (child) =>
                    child.text?.includes('CREW BATTLE 2V2') &&
                    child.text.includes('FRIENDLY FIRE OFF') &&
                    child.text.includes('FIRST CREW TO 15'),
                ) ?? false,
            };
          }),
        { timeout: 15000, message: 'expected the authoritative Crew Battle select' },
      )
      .toEqual({
        active: true,
        matchKind: 'duos',
        practiceKind: 'crew_battle',
        blue: 2,
        red: 2,
        bots: ['RUSTY', 'SCRAPJAW', 'CLANK'],
        briefing: true,
      });

    await gamePage.keyboard.press('Enter');
    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const scene = (
              window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
            ).game?.scene.getScene('GameScene') as {
              sys?: { settings: { active: boolean } };
              matchPhase?: string;
              matchData?: { playerTeams?: Record<string, string> };
              gameService?: { getPlayerId: () => string | null };
              playerManager?: {
                getRenderer: (playerId: string) => {
                  teammateMarkerText?: { text?: string; visible?: boolean };
                } | null;
              };
              hud?: { scoreText?: { text?: string } };
            };
            const localId = scene?.gameService?.getPlayerId();
            const teams = scene?.matchData?.playerTeams ?? {};
            const localTeam = localId ? teams[localId] : undefined;
            const allyId = Object.keys(teams).find(
              (playerId) => playerId !== localId && teams[playerId] === localTeam,
            );
            const marker = allyId
              ? scene?.playerManager?.getRenderer(allyId)?.teammateMarkerText
              : null;
            return {
              active: scene?.sys?.settings.active ?? false,
              phase: scene?.matchPhase ?? null,
              markerText: marker?.text ?? null,
              markerVisible: marker?.visible ?? false,
              score: scene?.hud?.scoreText?.text ?? null,
            };
          }),
        { timeout: 15000, message: 'expected live Crew Battle team presentation' },
      )
      .toEqual({
        active: true,
        phase: 'active',
        markerText: '[ ALLY ]',
        markerVisible: true,
        score: 'YOUR CREW: 0 | RIVALS: 0',
      });
  });

  test('presents a roster-authentic team victory card', async ({ gamePage }) => {
    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('LobbyScene') as { sys?: { settings: { active: boolean } } };
          return scene?.sys?.settings.active ?? false;
        }),
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
      lobby.gameService.getPlayerId = () => 'local';
      const stats = {
        kills: 7,
        assists: 3,
        deaths: 4,
        shotsFired: 30,
        shotsHit: 15,
        damageDealt: 600,
        damageTaken: 400,
        grenadesThrown: 2,
        killsByWeapon: {
          gun: 7,
          grenade: 0,
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
        nickname: 'Courier',
        matchData: { practiceKind: 'crew_battle' },
        result: {
          matchId: 'crew-result',
          winnerId: null,
          winnerTeamId: 'blue',
          playerTeams: { local: 'blue', ally: 'blue', rivalA: 'red', rivalB: 'red' },
          teamScores: { blue: 15, red: 10 },
          playerStats: new Map([
            ['local', stats],
            ['ally', { ...stats, kills: 8, assists: 1, deaths: 3 }],
            ['rivalA', { ...stats, kills: 6, assists: 2, deaths: 7 }],
            ['rivalB', { ...stats, kills: 4, assists: 4, deaths: 8 }],
          ]),
          duration: 130,
          gameMode: 'deathmatch',
          matchKind: 'duos',
          playerNicknames: {
            local: 'Courier',
            ally: 'Rusty',
            rivalA: 'Scrapjaw',
            rivalB: 'Clank',
          },
          playerCharacters: {
            local: 'mighty_man',
            ally: 'rook',
            rivalA: 'frost_wizard',
            rivalB: 'bubba',
          },
          awards: [],
          rivalry: null,
          rivalrySet: null,
          isPractice: true,
          nextMapName: 'Scrapyard',
          nextGameMode: 'deathmatch',
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
            children?: {
              list: Array<{
                name?: string;
                text?: string;
                visible?: boolean;
                getData?: (key: string) => unknown;
                list?: Array<{
                  name?: string;
                  text?: string;
                  visible?: boolean;
                  getData?: (key: string) => unknown;
                }>;
              }>;
            };
          };
          const all = (scene?.children?.list ?? []).flatMap((child) => [
            child,
            ...(child.list ?? []),
          ]);
          return {
            victory: all.some((child) => child.text === 'VICTORY'),
            crewScore: all.some((child) => child.text?.includes('YOUR CREW\n15 KOs')),
            rivalScore: all.some((child) => child.text?.includes('RIVALS\n10 KOs')),
            portraits: ['local', 'ally', 'rivalA', 'rivalB'].map((playerId) =>
              Boolean(all.find((child) => child.name === `result-fighter-${playerId}`)?.visible),
            ),
          };
        }),
      )
      .toEqual({
        victory: true,
        crewScore: true,
        rivalScore: true,
        portraits: [true, true, true, true],
      });
  });
});
