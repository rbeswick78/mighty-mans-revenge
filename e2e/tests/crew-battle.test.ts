import { test, expect } from '../fixtures';

const shellAdvertised = process.env.CAPABILITY_NEW_SHELL === 'true';

test.describe('Crew Battle 2v2', () => {
  test('opens a readable ally window and lets every project cancel back to the lobby', async ({
    gamePage,
  }) => {
    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const scene = (
              window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
            ).game?.scene.getScene('LobbyScene') as {
              sys?: { settings: { active: boolean } };
            };
            return scene?.sys?.settings.active ?? false;
          }),
        { timeout: 10000, message: 'expected the Crew lobby' },
      )
      .toBe(true);

    await gamePage.locator('input[type="text"]').first().fill('Scout');
    expect(
      await gamePage.evaluate(() => {
        const scene = (
          window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
        ).game?.scene.getScene('LobbyScene') as {
          crewBattleButton?: { activate: () => boolean };
          gameService?: {
            startPractice: (...args: unknown[]) => void;
            cancelMatchmaking: () => void;
          };
          updateConnectionUi?: (state: 'connected') => void;
          onMatchmakingStatus?: (message: {
            type: 'server:matchmakingStatus';
            status: 'queued';
            matchKind: 'duos';
            groupSize: number;
            maxGroupSize: number;
            launchInMs: number;
          }) => void;
        };
        if (!scene.gameService) return false;
        scene.gameService.startPractice = () => {};
        scene.gameService.cancelMatchmaking = () => {};
        scene.updateConnectionUi?.('connected');
        const activated = scene.crewBattleButton?.activate() ?? false;
        scene.onMatchmakingStatus?.({
          type: 'server:matchmakingStatus',
          status: 'queued',
          matchKind: 'duos',
          groupSize: 1,
          maxGroupSize: 2,
          launchInMs: 6000,
        });
        return activated;
      }),
    ).toBe(true);

    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('LobbyScene') as {
            searchingText?: { text: string; visible: boolean; displayWidth: number };
            searchTimerText?: { text: string; visible: boolean; displayWidth: number };
            cancelButton?: { visible: boolean; activate: () => boolean };
          };
          return {
            searching: scene?.searchingText?.text ?? null,
            timer: scene?.searchTimerText?.text ?? null,
            visible:
              Boolean(scene?.searchingText?.visible) &&
              Boolean(scene?.searchTimerText?.visible) &&
              Boolean(scene?.cancelButton?.visible),
            fits:
              (scene?.searchingText?.displayWidth ?? Number.POSITIVE_INFINITY) <= 420 &&
              (scene?.searchTimerText?.displayWidth ?? Number.POSITIVE_INFINITY) <= 420,
          };
        }),
      )
      .toMatchObject({ searching: 'CREWING UP  1/2', visible: true, fits: true });
    expect(
      await gamePage.evaluate(() => {
        const scene = (
          window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
        ).game?.scene.getScene('LobbyScene') as {
          cancelButton?: { activate: () => boolean };
        };
        return scene.cancelButton?.activate() ?? false;
      }),
    ).toBe(true);
    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('LobbyScene') as {
            searchingText?: { visible: boolean };
            crewBattleButton?: { visible: boolean };
          };
          return {
            searching: scene?.searchingText?.visible ?? true,
            crew: scene?.crewBattleButton?.visible ?? false,
          };
        }),
      )
      .toEqual({ searching: false, crew: true });
  });

  test('launches two server-authored crews and marks the Rusty ally in live play', async ({
    gamePage,
  }, testInfo) => {
    test.skip(
      shellAdvertised,
      'The advertised Play roster and party routes own live Crew launch; reforged-shell.test.ts covers that route.',
    );
    test.skip(
      testInfo.project.name !== 'desktop-chromium',
      'One authoritative live-flow browser is sufficient; cross-device Crew UI is covered above.',
    );
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
      localStorage.removeItem('mmr_crew_tour');
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('LobbyScene') as {
        crewBattleButton?: { activate: () => boolean };
        practiceMode?: string | null;
      };
      scene.practiceMode = 'koth';
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
                gameMode?: string;
                playerTeams?: Record<string, string>;
              };
              latestSelections?: Array<{ nickname: string; lockedCharacterId: string | null }>;
              children?: { list: Array<{ text?: string; displayWidth?: number }> };
            };
            const teams = Object.values(scene?.matchData?.playerTeams ?? {});
            const briefingNode = scene?.children?.list.find(
              (child) =>
                child.text?.includes('CREW BATTLE 2V2') &&
                child.text.includes('ALLY: RUSTY // RUSTY FILLED IN') &&
                child.text.includes('CREW TOUR 0/4 // HILL PATCH OPEN'),
            );
            return {
              active: scene?.sys?.settings.active ?? false,
              matchKind: scene?.matchData?.matchKind ?? null,
              practiceKind: scene?.matchData?.practiceKind ?? null,
              gameMode: scene?.matchData?.gameMode ?? null,
              blue: teams.filter((teamId) => teamId === 'blue').length,
              red: teams.filter((teamId) => teamId === 'red').length,
              bots: (scene?.latestSelections ?? [])
                .filter((selection) => selection.nickname !== 'Courier')
                .map((selection) => selection.nickname),
              briefing:
                Boolean(briefingNode?.text?.includes('FRIENDLY FIRE OFF')) &&
                Boolean(briefingNode?.text?.includes('HOLD TOGETHER')) &&
                Boolean(briefingNode?.text?.includes('FIRST CREW TO 60')),
              briefingFits: (briefingNode?.displayWidth ?? Number.POSITIVE_INFINITY) <= 920,
            };
          }),
        { timeout: 15000, message: 'expected the authoritative Crew Battle select' },
      )
      .toEqual({
        active: true,
        matchKind: 'duos',
        practiceKind: 'crew_battle',
        gameMode: 'koth',
        blue: 2,
        red: 2,
        bots: ['RUSTY', 'SCRAPJAW', 'CLANK'],
        briefing: true,
        briefingFits: true,
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
              scoreReadable: /^YOUR CREW: \d+ {2}\| {2}RIVALS: \d+$/.test(
                scene?.hud?.scoreText?.text ?? '',
              ),
            };
          }),
        { timeout: 15000, message: 'expected live Crew Battle team presentation' },
      )
      .toEqual({
        active: true,
        phase: 'active',
        markerText: '[ ALLY ]',
        markerVisible: true,
        scoreReadable: true,
      });
  });

  test('crews up two real friends under the captain settings', async ({
    gamePage,
    context,
  }, testInfo) => {
    test.skip(
      shellAdvertised,
      'The advertised party surface owns two-client Crew setup; reforged-shell.test.ts covers that route.',
    );
    test.skip(
      testInfo.project.name !== 'desktop-chromium',
      'Two-client WebRTC Crew pair-up is pinned to its stable Chromium project.',
    );
    test.setTimeout(60000);
    const pageB = await context.newPage();
    try {
      await pageB.goto('/');
      await pageB.waitForSelector('canvas');
      await expect
        .poll(
          async () =>
            Promise.all(
              [gamePage, pageB].map((page) =>
                page.evaluate(() => {
                  const scene = (
                    window as unknown as {
                      game?: { scene: { getScene: (key: string) => unknown } };
                    }
                  ).game?.scene.getScene('LobbyScene') as {
                    sys?: { settings: { active: boolean } };
                    connectionState?: string;
                  };
                  return {
                    active: scene?.sys?.settings.active ?? false,
                    connected: scene?.connectionState === 'connected',
                  };
                }),
              ),
            ),
          { timeout: 20000, message: 'expected both Crew clients to reach the connected lobby' },
        )
        .toEqual([
          { active: true, connected: true },
          { active: true, connected: true },
        ]);

      await gamePage.locator('input[type="text"]').first().fill('Captain');
      await pageB.locator('input[type="text"]').first().fill('Bravo');
      await gamePage.evaluate(() => {
        const scene = (
          window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
        ).game?.scene.getScene('LobbyScene') as {
          practiceMode?: string | null;
          crewBattleButton?: { activate: () => boolean };
        };
        scene.practiceMode = 'koth';
        if (!scene.crewBattleButton?.activate()) throw new Error('captain could not open Crew');
      });
      await expect
        .poll(() =>
          gamePage.evaluate(() => {
            const scene = (
              window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
            ).game?.scene.getScene('LobbyScene') as { searchingText?: { text: string } };
            return scene?.searchingText?.text ?? null;
          }),
        )
        .toBe('CREWING UP  1/2');
      await pageB.evaluate(() => {
        const scene = (
          window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
        ).game?.scene.getScene('LobbyScene') as {
          practiceMode?: string | null;
          crewBattleButton?: { activate: () => boolean };
        };
        scene.practiceMode = 'deathmatch';
        if (!scene.crewBattleButton?.activate()) throw new Error('ally could not join Crew');
      });

      await expect
        .poll(
          async () =>
            Promise.all(
              [gamePage, pageB].map((page) =>
                page.evaluate(() => {
                  const scene = (
                    window as unknown as {
                      game?: { scene: { getScene: (key: string) => unknown } };
                    }
                  ).game?.scene.getScene('CharacterSelectScene') as {
                    sys?: { settings: { active: boolean } };
                    matchData?: {
                      gameMode: string;
                      playerTeams?: Record<string, string>;
                      opponents: Array<{ id: string; nickname: string }>;
                    };
                    gameService?: { getPlayerId: () => string | null };
                    children?: { list: Array<{ text?: string; displayWidth?: number }> };
                  };
                  const localId = scene?.gameService?.getPlayerId() ?? null;
                  const localTeam = localId ? scene?.matchData?.playerTeams?.[localId] : null;
                  const humanAlly = scene?.matchData?.opponents.find(
                    (opponent) =>
                      !opponent.id.startsWith('bot:') &&
                      scene?.matchData?.playerTeams?.[opponent.id] === localTeam,
                  );
                  const bots = scene?.matchData?.opponents
                    .filter((opponent) => opponent.id.startsWith('bot:'))
                    .map((opponent) => opponent.nickname)
                    .sort();
                  const briefing = scene?.children?.list.find((child) =>
                    child.text?.includes('HUMAN ALLY:'),
                  );
                  return {
                    active: scene?.sys?.settings.active ?? false,
                    mode: scene?.matchData?.gameMode ?? null,
                    ally: humanAlly?.nickname ?? null,
                    bots,
                    briefing: briefing?.text?.includes('CREWED UP') ?? false,
                    fits: (briefing?.displayWidth ?? Number.POSITIVE_INFINITY) <= 920,
                  };
                }),
              ),
            ),
          { timeout: 15000, message: 'expected both friends in Crew character select' },
        )
        .toEqual([
          {
            active: true,
            mode: 'koth',
            ally: 'Bravo',
            bots: ['CLANK', 'SCRAPJAW'],
            briefing: true,
            fits: true,
          },
          {
            active: true,
            mode: 'koth',
            ally: 'Captain',
            bots: ['CLANK', 'SCRAPJAW'],
            briefing: true,
            fits: true,
          },
        ]);
    } finally {
      await pageB.close();
    }
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
      localStorage.removeItem('mmr_crew_tour');
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
          teamScores: { blue: 60, red: 44 },
          playerStats: new Map([
            ['local', stats],
            ['ally', { ...stats, kills: 8, assists: 1, deaths: 3 }],
            ['rivalA', { ...stats, kills: 6, assists: 2, deaths: 7 }],
            ['rivalB', { ...stats, kills: 4, assists: 4, deaths: 8 }],
          ]),
          duration: 130,
          gameMode: 'koth',
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
          nextGameMode: 'kill_confirmed',
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
                x?: number;
                displayWidth?: number;
                getData?: (key: string) => unknown;
                list?: Array<{
                  name?: string;
                  text?: string;
                  visible?: boolean;
                  x?: number;
                  displayWidth?: number;
                  getData?: (key: string) => unknown;
                }>;
              }>;
            };
          };
          const all = (scene?.children?.list ?? []).flatMap((child) => [
            child,
            ...(child.list ?? []),
          ]);
          const tour = all.find((child) => child.text?.startsWith('CREW TOUR'));
          return {
            victory: all.some((child) => child.text === 'VICTORY'),
            nextObjective: all.some(
              (child) => child.text === 'SAME CREWS // NEXT: KILL CONFIRMED @ SCRAPYARD',
            ),
            crewScore: all.some((child) => child.text?.includes('YOUR CREW\n60 PTS')),
            rivalScore: all.some((child) => child.text?.includes('RIVALS\n44 PTS')),
            tour: tour?.text ?? null,
            tourFits:
              (tour?.x ?? 0) - (tour?.displayWidth ?? Number.POSITIVE_INFINITY) / 2 >= 16 &&
              (tour?.x ?? 0) + (tour?.displayWidth ?? Number.POSITIVE_INFINITY) / 2 <= 944,
            stored: localStorage.getItem('mmr_crew_tour'),
            portraits: ['local', 'ally', 'rivalA', 'rivalB'].map((playerId) =>
              Boolean(all.find((child) => child.name === `result-fighter-${playerId}`)?.visible),
            ),
          };
        }),
      )
      .toEqual({
        victory: true,
        nextObjective: true,
        crewScore: true,
        rivalScore: true,
        tour: 'CREW TOUR 1/4 // HILL PATCH SECURED // RUN 1 - NEW BEST',
        tourFits: true,
        stored: expect.stringContaining('"securedModes":["koth"]'),
        portraits: [true, true, true, true],
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
            crewBattleButton?: {
              list: Array<{ text?: string }>;
              getSubtitleText: () => string | null;
            };
          };
          const label = scene?.crewBattleButton?.list.find(
            (child) => typeof child.text === 'string',
          );
          return scene?.sys?.settings.active
            ? {
                text: label?.text ?? null,
                progress: scene.crewBattleButton?.getSubtitleText() ?? null,
                fits: (label as { displayWidth?: number } | undefined)?.displayWidth
                  ? (label as { displayWidth: number }).displayWidth <= 110
                  : false,
              }
            : null;
        }),
      )
      .toEqual({ text: 'CREW 2V2', progress: 'TOUR 1/4', fits: true });
  });
});
