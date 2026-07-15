import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ResultsInputState {
  focusActive: boolean;
  focusIndex: number;
  focusedAction: 'route_a' | 'route_b' | 'lobby' | null;
  actionCount: number;
  selectedRoute: string | null;
  returnedToLobby: boolean;
  footer: string | null;
  rematchStatus: string;
  bounds: { routeB: Bounds; lobby: Bounds };
}

async function waitForScene(page: Page, key: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((sceneKey) => {
          const game = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game;
          const scene = game?.scene.getScene(sceneKey) as {
            sys?: { settings?: { active?: boolean } };
          };
          return scene?.sys?.settings?.active ?? false;
        }, key),
      { timeout: 15000 },
    )
    .toBe(true);
}

async function startRouteResults(page: Page): Promise<void> {
  await waitForScene(page, 'LobbyScene');
  await page.evaluate(() => {
    const runtime = window as unknown as {
      game?: {
        scene: {
          scenes: Array<{
            scene: { start: (key: string, data: unknown) => void };
            sys: { settings: { active: boolean } };
          }>;
        };
      };
      __resultsSelectedRoute?: string | null;
      __resultsReturnedToLobby?: boolean;
    };
    const active = runtime.game?.scene.scenes.find((scene) => scene.sys.settings.active);
    if (!active) throw new Error('no active scene');
    runtime.__resultsSelectedRoute = null;
    runtime.__resultsReturnedToLobby = false;
    active.scene.start('ResultsScene', {
      nickname: 'Navigator',
      result: {
        matchId: 'results-input-navigation',
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
  await waitForScene(page, 'ResultsScene');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const runtime = window as unknown as {
      game?: { scene: { getScene: (key: string) => unknown } };
      __resultsSelectedRoute?: string | null;
      __resultsReturnedToLobby?: boolean;
    };
    const scene = runtime.game?.scene.getScene('ResultsScene') as {
      gameService: {
        requestRematch: (routeId?: string) => void;
        returnToLobby: () => void;
      };
    };
    scene.gameService.requestRematch = (routeId?: string) => {
      runtime.__resultsSelectedRoute = routeId ?? null;
    };
    scene.gameService.returnToLobby = () => {
      runtime.__resultsReturnedToLobby = true;
    };
  });
}

async function resultsInputState(page: Page): Promise<ResultsInputState> {
  return page.evaluate(() => {
    type RuntimeButton = {
      focused: boolean;
      getBounds: () => Bounds;
    };
    const runtime = window as unknown as {
      game?: { scene: { getScene: (key: string) => unknown } };
      __resultsSelectedRoute?: string | null;
      __resultsReturnedToLobby?: boolean;
    };
    const scene = runtime.game?.scene.getScene('ResultsScene') as {
      children: { list: Array<{ text?: string }> };
      gamepadFocusActive: boolean;
      gamepadFocusIndex: number;
      actionButtons: () => RuntimeButton[];
      rematchButton: RuntimeButton;
      alternateRouteButton: RuntimeButton;
      lobbyButton: RuntimeButton;
      rematchStatusText: { text: string };
    };
    const buttons = scene.actionButtons();
    const focused = buttons.find((button) => button.focused) ?? null;
    return {
      focusActive: scene.gamepadFocusActive,
      focusIndex: scene.gamepadFocusIndex,
      focusedAction:
        focused === scene.rematchButton
          ? 'route_a'
          : focused === scene.alternateRouteButton
            ? 'route_b'
            : focused === scene.lobbyButton
              ? 'lobby'
              : null,
      actionCount: buttons.length,
      selectedRoute: runtime.__resultsSelectedRoute ?? null,
      returnedToLobby: runtime.__resultsReturnedToLobby ?? false,
      footer:
        scene.children.list.find(
          (child) =>
            child.text?.startsWith('TAB / ARROWS') || child.text?.startsWith('TAP REMATCH'),
        )?.text ?? null,
      rematchStatus: scene.rematchStatusText.text,
      bounds: {
        routeB: scene.alternateRouteButton.getBounds(),
        lobby: scene.lobbyButton.getBounds(),
      },
    };
  });
}

async function pressCanvasButton(page: Page, bounds: Bounds, touch: boolean): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('game canvas is not visible');
  const size = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  const x = box.x + ((bounds.x + bounds.width / 2) / size.width) * box.width;
  const y = box.y + ((bounds.y + bounds.height / 2) / size.height) * box.height;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test.describe('Results replay navigation', () => {
  test('keeps every next-action reachable on keyboard, gamepad, pointer, and touch', async ({
    gamePage,
  }, testInfo) => {
    await startRouteResults(gamePage);
    const mobile = testInfo.project.name === 'mobile-landscape';
    const initial = await resultsInputState(gamePage);
    expect(initial).toMatchObject({
      focusActive: false,
      focusedAction: null,
      actionCount: 3,
      selectedRoute: null,
      returnedToLobby: false,
      footer: mobile ? 'TAP REMATCH, ROUTE, OR LOBBY' : 'TAB / ARROWS + ENTER  •  ESC / B LOBBY',
    });

    if (mobile) {
      await pressCanvasButton(gamePage, initial.bounds.routeB, true);
      await expect
        .poll(() => resultsInputState(gamePage))
        .toMatchObject({
          focusActive: false,
          focusedAction: null,
          actionCount: 1,
          selectedRoute: 'route_b',
          rematchStatus: 'Route locked. Preparing next fight...',
        });
      await gamePage.waitForTimeout(150);
      await gamePage.screenshot({ path: testInfo.outputPath('results-touch-actions.png') });
      await pressCanvasButton(gamePage, initial.bounds.lobby, true);
    } else {
      await gamePage.keyboard.press('Tab');
      expect(await resultsInputState(gamePage)).toMatchObject({
        focusActive: true,
        focusIndex: 0,
        focusedAction: 'route_a',
      });
      await gamePage.keyboard.press('ArrowRight');
      expect(await resultsInputState(gamePage)).toMatchObject({
        focusActive: true,
        focusIndex: 1,
        focusedAction: 'route_b',
      });
      await gamePage.screenshot({ path: testInfo.outputPath('results-keyboard-focus.png') });
      await gamePage.keyboard.press('Enter');
      await expect
        .poll(() => resultsInputState(gamePage))
        .toMatchObject({
          focusActive: true,
          focusIndex: 0,
          focusedAction: 'lobby',
          actionCount: 1,
          selectedRoute: 'route_b',
          rematchStatus: 'Route locked. Preparing next fight...',
        });
      await gamePage.keyboard.press('Escape');
    }

    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const runtime = window as unknown as {
            game?: { scene: { getScene: (key: string) => unknown } };
            __resultsReturnedToLobby?: boolean;
          };
          const lobby = runtime.game?.scene.getScene('LobbyScene') as {
            sys?: { settings?: { active?: boolean } };
          };
          return {
            returned: runtime.__resultsReturnedToLobby ?? false,
            lobbyActive: lobby?.sys?.settings?.active ?? false,
          };
        }),
      )
      .toEqual({ returned: true, lobbyActive: true });
  });
});
