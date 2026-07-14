import { test, expect } from '../fixtures';

test.describe('Gauntlet route draft', () => {
  test('renders both next-fight routes and locks Route B through pointer input', async ({
    gamePage,
  }, testInfo) => {
    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const game = (
            window as unknown as {
              game?: {
                scene: {
                  scenes: Array<{
                    scene: { key: string };
                    sys: { settings: { active: boolean } };
                  }>;
                };
              };
            }
          ).game;
          return (
            game?.scene.scenes.some(
              (scene) => scene.scene.key === 'LobbyScene' && scene.sys.settings.active,
            ) ?? false
          );
        }),
      )
      .toBe(true);

    await gamePage.evaluate(() => {
      const w = window as unknown as {
        game?: {
          scene: {
            scenes: Array<{
              scene: { key: string; start: (key: string, data: unknown) => void };
              sys: { settings: { active: boolean } };
            }>;
          };
        };
        __selectedGauntletRoute?: string | null;
      };
      const active = w.game?.scene.scenes.find((scene) => scene.sys.settings.active);
      if (!active) throw new Error('no active scene');
      w.__selectedGauntletRoute = null;
      active.scene.start('ResultsScene', {
        nickname: 'Solo',
        result: {
          matchId: 'route-smoke',
          winnerId: null,
          playerStats: new Map(),
          duration: 73,
          gameMode: 'deathmatch',
          awards: [],
          rivalry: null,
          rivalrySet: null,
          isPractice: true,
          nextMapName: 'Overgrown Suburb',
          nextGameMode: 'koth',
          wentToOvertime: false,
          gauntlet: {
            stage: 1,
            totalStages: 3,
            difficulty: 'rookie',
            runScore: 1800,
            opponentCharacterId: 'mighty_man',
            outcome: 'advanced',
            stageScore: 1800,
            contractBonus: 0,
            regulationBonus: 200,
            flawlessBonus: 400,
            paceBonus: 200,
            nextStage: 2,
            nextDifficulty: 'scrapper',
            routeOptions: [
              {
                id: 'route_a',
                mapName: 'Overgrown Suburb',
                gameMode: 'koth',
                opponentCharacterId: 'bruce',
                forecastMutatorId: 'blackout',
                boonId: 'scrap_plating',
              },
              {
                id: 'route_b',
                mapName: 'Scrapyard',
                gameMode: 'gun_game',
                opponentCharacterId: 'frost_wizard',
                forecastMutatorId: 'weapon_roulette',
                boonId: 'quick_charge',
              },
            ],
          },
        },
      });
    });

    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const w = window as unknown as {
            game?: {
              scene: {
                scenes: Array<{ scene: { key: string }; sys: { settings: { active: boolean } } }>;
              };
            };
          };
          return (
            w.game?.scene.scenes.some(
              (scene) => scene.scene.key === 'ResultsScene' && scene.sys.settings.active,
            ) ?? false
          );
        }),
      )
      .toBe(true);

    const layout = await gamePage.evaluate(() => {
      const w = window as unknown as {
        game?: { scene: { getScene: (key: string) => unknown } };
        __selectedGauntletRoute?: string | null;
      };
      const scene = w.game?.scene.getScene('ResultsScene') as {
        gameService: { requestRematch: (routeId?: string) => void };
        rematchButton: { x: number; alpha: number; list: Array<{ text?: string }> };
        alternateRouteButton: { x: number; alpha: number; list: Array<{ text?: string }> };
        lobbyButton: { x: number };
        children: { list: Array<{ text?: string }> };
      };
      scene.gameService.requestRematch = (routeId?: string) => {
        w.__selectedGauntletRoute = routeId ?? null;
      };
      return {
        buttonXs: [scene.rematchButton.x, scene.alternateRouteButton.x, scene.lobbyButton.x],
        routeA: scene.rematchButton.list.some(
          (child) =>
            child.text?.includes('ROUTE A') &&
            child.text.includes('VS BRUCE') &&
            child.text.includes('CHAOS: BLACKOUT +200') &&
            child.text.includes('BOON: SCRAP PLATING // +25 ARMOR/LIFE'),
        ),
        routeB: scene.alternateRouteButton.list.some(
          (child) =>
            child.text?.includes('ROUTE B') &&
            child.text.includes('VS FROST WIZARD') &&
            child.text.includes('CHAOS: WEAPON ROULETTE +200') &&
            child.text.includes('BOON: QUICK CHARGE // 1.5X ABILITY'),
        ),
        teaser: scene.children.list.some((child) => child.text === 'CHOOSE: STAGE 2/3 - SCRAPPER'),
      };
    });
    expect(layout).toEqual({
      buttonXs: [91, 355, 619],
      routeA: true,
      routeB: true,
      teaser: true,
    });

    // ResultsScene fades in for 300 ms; wait until its input camera is fully
    // interactive so the mobile tap is not swallowed by the transition.
    await gamePage.waitForTimeout(400);
    const canvas = gamePage.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not laid out');
    const routeBPosition = { x: box.width / 2, y: (box.height * 653) / 720 };
    if (testInfo.project.name === 'mobile-landscape') {
      await canvas.tap({ position: routeBPosition });
    } else {
      await canvas.click({ position: routeBPosition });
    }

    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const w = window as unknown as {
            game?: { scene: { getScene: (key: string) => unknown } };
            __selectedGauntletRoute?: string | null;
          };
          const scene = w.game?.scene.getScene('ResultsScene') as {
            rematchButton: { alpha: number };
            alternateRouteButton: { alpha: number };
            rematchStatusText: { text: string; visible: boolean };
          };
          return {
            route: w.__selectedGauntletRoute ?? null,
            status: scene.rematchStatusText.text,
            visible: scene.rematchStatusText.visible,
            routeAAlpha: scene.rematchButton.alpha,
            routeBAlpha: scene.alternateRouteButton.alpha,
          };
        }),
      )
      .toEqual({
        route: 'route_b',
        status: 'Route locked. Preparing next fight...',
        visible: true,
        routeAAlpha: 0.5,
        routeBAlpha: 0.5,
      });
  });

  test('discovers a named two-boon build after a full clear', async ({ gamePage }) => {
    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const game = (
            window as unknown as {
              game?: {
                scene: {
                  scenes: Array<{
                    scene: { key: string };
                    sys: { settings: { active: boolean } };
                  }>;
                };
              };
            }
          ).game;
          return (
            game?.scene.scenes.some(
              (scene) => scene.scene.key === 'LobbyScene' && scene.sys.settings.active,
            ) ?? false
          );
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
          };
        };
      };
      const active = w.game?.scene.scenes.find((scene) => scene.sys.settings.active);
      if (!active) throw new Error('no active scene');
      localStorage.removeItem('mmr_gauntlet_build_codex');
      active.scene.start('ResultsScene', {
        nickname: 'Solo',
        result: {
          matchId: 'build-codex-smoke',
          winnerId: null,
          playerStats: new Map(),
          duration: 73,
          gameMode: 'deathmatch',
          awards: [],
          rivalry: null,
          rivalrySet: null,
          isPractice: true,
          wentToOvertime: false,
          gauntlet: {
            stage: 3,
            totalStages: 3,
            difficulty: 'warlord',
            runScore: 6000,
            outcome: 'cleared',
            stageScore: 2000,
            contractBonus: 0,
            regulationBonus: 0,
            flawlessBonus: 0,
            paceBonus: 0,
            nextStage: 1,
            nextDifficulty: 'rookie',
            boonIds: ['quick_charge', 'spawn_rush'],
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
            children?: { list: Array<{ text?: string }> };
          };
          const texts = scene?.children?.list.flatMap((child) =>
            typeof child.text === 'string' ? [child.text] : [],
          );
          return {
            active: scene?.sys?.settings.active ?? false,
            summary: texts?.some((text) => text.includes('BUILD: REDLINE')) ?? false,
            discovery:
              texts?.some((text) =>
                text.includes('NEW BUILD: REDLINE  //  BEST 6,000  //  CODEX 1/6'),
              ) ?? false,
            stored: localStorage.getItem('mmr_gauntlet_build_codex'),
          };
        }),
      )
      .toEqual({
        active: true,
        summary: true,
        discovery: true,
        stored: JSON.stringify({
          discovered: ['quick_charge+spawn_rush'],
          bestScores: { 'quick_charge+spawn_rush': 6000 },
        }),
      });

    await gamePage.evaluate(() => {
      const w = window as unknown as {
        game?: {
          scene: {
            getScene: (key: string) => {
              scene: { restart: (data: unknown) => void };
            };
          };
        };
      };
      w.game?.scene.getScene('ResultsScene').scene.restart({
        nickname: 'Solo',
        result: {
          matchId: 'build-best-smoke',
          winnerId: null,
          playerStats: new Map(),
          duration: 70,
          gameMode: 'deathmatch',
          awards: [],
          rivalry: null,
          rivalrySet: null,
          isPractice: true,
          wentToOvertime: false,
          gauntlet: {
            stage: 3,
            totalStages: 3,
            difficulty: 'warlord',
            runScore: 6500,
            outcome: 'cleared',
            stageScore: 2500,
            contractBonus: 0,
            regulationBonus: 0,
            flawlessBonus: 0,
            paceBonus: 0,
            nextStage: 1,
            nextDifficulty: 'rookie',
            boonIds: ['quick_charge', 'spawn_rush'],
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
            children?: { list: Array<{ text?: string }> };
          };
          const texts = scene?.children?.list.flatMap((child) =>
            typeof child.text === 'string' ? [child.text] : [],
          );
          return {
            best:
              texts?.some((text) =>
                text.includes('NEW BUILD BEST: REDLINE  //  BEST 6,500  //  CODEX 1/6'),
              ) ?? false,
            stored: localStorage.getItem('mmr_gauntlet_build_codex'),
          };
        }),
      )
      .toEqual({
        best: true,
        stored: JSON.stringify({
          discovered: ['quick_charge+spawn_rush'],
          bestScores: { 'quick_charge+spawn_rush': 6500 },
        }),
      });
  });
});
