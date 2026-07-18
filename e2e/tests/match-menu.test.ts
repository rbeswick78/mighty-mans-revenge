import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

const shellAdvertised = process.env.CAPABILITY_NEW_SHELL === 'true';
const schedulesAdvertised = process.env.CAPABILITY_SCHEDULES === 'true';
const largeWorldsAdvertised = process.env.CAPABILITY_LARGE_WORLDS === 'true';
const modernArtAdvertised = process.env.CAPABILITY_MODERN_ART === 'true';

async function waitForScene(page: Page, key: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((sceneKey) => {
          const game = (
            window as unknown as {
              game?: {
                scene: {
                  getScene: (key: string) => { sys?: { settings: { active: boolean } } };
                };
              };
            }
          ).game;
          return game?.scene.getScene(sceneKey)?.sys?.settings.active ?? false;
        }, key),
      { timeout: 10000 },
    )
    .toBe(true);
}
async function stageNonChromiumShell(page: Page): Promise<void> {
  await waitForScene(page, 'LobbyScene');
  await page.evaluate(
    ({ advertiseSchedules, advertiseLargeWorlds, advertiseModernArt }) => {
      const lobby = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'LobbyScene',
      ) as unknown as {
        gameService: {
          getNetworkManager(): {
            connection: { setState(state: string): void };
            handleMessage(message: unknown): void;
          };
        };
      };
      const manager = lobby.gameService.getNetworkManager();
      manager.connection.setState('connected');
      manager.handleMessage({
        type: 'server:welcome',
        playerId: 'match-menu-stage',
        capabilities: {
          newShell: true,
          schedules: advertiseSchedules,
          largeWorlds: advertiseLargeWorlds,
          modernArt: advertiseModernArt,
          battleRoyale: false,
        },
      });
    },
    {
      advertiseSchedules: schedulesAdvertised,
      advertiseLargeWorlds: largeWorldsAdvertised,
      advertiseModernArt: modernArtAdvertised,
    },
  );
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function controlBounds(
  page: Page,
  control: 'launcher' | 'primaryButton' | 'secondaryButton',
): Promise<Bounds> {
  return page.evaluate((name) => {
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('GameScene') as {
      matchMenu: Record<string, { getBounds: () => Bounds }>;
    };
    const bounds = scene.matchMenu[name].getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }, control);
}

async function activateCanvasControl(page: Page, bounds: Bounds, touch: boolean): Promise<void> {
  const canvas = page.locator('canvas');
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('canvas is not laid out');
  const canvasSize = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  const x = canvasBox.x + ((bounds.x + bounds.width / 2) / canvasSize.width) * canvasBox.width;
  const y = canvasBox.y + ((bounds.y + bounds.height / 2) / canvasSize.height) * canvasBox.height;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test.describe('Live match menu', () => {
  test('resumes safely and confirms a leave across pointer, touch, keyboard, and gamepad', async ({
    gamePage,
  }, testInfo) => {
    if (shellAdvertised && testInfo.project.name !== 'desktop-chromium') {
      await stageNonChromiumShell(gamePage);
    }
    await waitForScene(gamePage, shellAdvertised ? 'ReforgedShellScene' : 'LobbyScene');
    await gamePage.evaluate((useReforgedShell) => {
      const game = (
        window as unknown as {
          game?: {
            scene: {
              scenes: Array<{
                scene: { key: string; start: (key: string, data: unknown) => void };
                sys: { settings: { active: boolean; key: string } };
              }>;
              getScene: (key: string) => { scene: { start: (key: string, data: unknown) => void } };
            };
          };
        }
      ).game;
      const active = game?.scene.getScene(useReforgedShell ? 'ReforgedShellScene' : 'LobbyScene');
      if (!active) throw new Error('active scene is not ready');
      active.scene.start('GameScene', {
        nickname: 'MenuTester',
        matchData: {
          matchId: 'match-menu-smoke',
          opponents: [{ id: 'rival-a', nickname: 'Rusty' }],
          mapName: 'Scrapyard',
          gameMode: 'deathmatch',
          matchKind: 'duel',
        },
      });
    }, shellAdvertised);
    await waitForScene(gamePage, 'GameScene');
    const preFightLauncherVisible = await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        gameService: {
          off: (event: string, callback: () => void) => void;
          returnToLobby: () => void;
        };
        matchMenu: { launcher: { visible: boolean } };
        onConnectionLost: () => void;
      };
      (window as unknown as { matchMenuLeaveCalls?: number }).matchMenuLeaveCalls = 0;
      scene.gameService.off('reconnecting', scene.onConnectionLost);
      scene.gameService.off('disconnected', scene.onConnectionLost);
      scene.gameService.returnToLobby = () => {
        const state = window as unknown as { matchMenuLeaveCalls?: number };
        state.matchMenuLeaveCalls = (state.matchMenuLeaveCalls ?? 0) + 1;
      };
      return scene.matchMenu.launcher.visible;
    });
    expect(preFightLauncherVisible).toBe(false);
    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as { gameService: { emit: (event: string) => void } };
      scene.gameService.emit('matchStart');
    });

    const touch = testInfo.project.name === 'mobile-landscape';
    const launcher = await controlBounds(gamePage, 'launcher');
    expect(launcher).toMatchObject(
      largeWorldsAdvertised
        ? { x: 1120, y: 24, width: 128, height: 58 }
        : { x: 816, y: 6, width: 128, height: 58 },
    );
    await activateCanvasControl(gamePage, launcher, touch);

    const opened = await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        matchMenu: {
          isOpen: () => boolean;
          getView: () => string;
          launcher: { getSubtitleText: () => string | null };
          title: { text: string };
          headline: { text: string };
          detail: { text: string };
        };
        inputManager?: { touchInput?: { gameplayEnabled?: boolean } };
      };
      return {
        open: scene.matchMenu.isOpen(),
        view: scene.matchMenu.getView(),
        subtitle: scene.matchMenu.launcher.getSubtitleText(),
        gameplayEnabled: scene.inputManager?.touchInput?.gameplayEnabled ?? null,
        title: scene.matchMenu.title.text,
        headline: scene.matchMenu.headline.text,
        detail: scene.matchMenu.detail.text,
      };
    });
    expect(opened).toMatchObject({
      open: true,
      view: 'menu',
      title: 'MATCH MENU',
      headline: 'COMBAT DOES NOT PAUSE',
      detail: 'THE FIGHT KEEPS MOVING WHILE THIS MENU IS OPEN.',
    });
    expect(opened.subtitle).toBe(touch ? 'TAP TO OPEN' : 'ESC / START');
    if (touch) expect(opened.gameplayEnabled).toBe(false);

    await gamePage.waitForTimeout(150);
    await gamePage.screenshot({ path: testInfo.outputPath('match-menu.png') });

    await activateCanvasControl(gamePage, await controlBounds(gamePage, 'secondaryButton'), touch);
    const confirmation = await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        matchMenu: {
          getView: () => string;
          getFocusedIndex: () => number;
          title: { text: string };
          headline: { text: string };
          detail: { text: string };
        };
      };
      return {
        view: scene.matchMenu.getView(),
        focus: scene.matchMenu.getFocusedIndex(),
        title: scene.matchMenu.title.text,
        headline: scene.matchMenu.headline.text,
        detail: scene.matchMenu.detail.text,
      };
    });
    expect(confirmation).toMatchObject({
      view: 'confirm',
      focus: 0,
      title: 'CONFIRM LEAVE',
      headline: 'FORFEIT THIS FIGHT?',
      detail: 'YOUR OPPONENT WILL TAKE THE WIN. THIS CANNOT BE UNDONE.',
    });
    await gamePage.waitForTimeout(100);
    await gamePage.screenshot({ path: testInfo.outputPath('match-menu-confirm.png') });

    await gamePage.keyboard.press('Escape');
    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('GameScene') as { matchMenu: { getView: () => string } };
          return scene.matchMenu.getView();
        }),
      )
      .toBe('menu');
    // A real second press cannot arrive in the same render frame. Give the
    // touch-emulated browser one frame to settle the first Escape keyup.
    await gamePage.waitForTimeout(100);
    await gamePage.keyboard.press('Escape');
    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('GameScene') as {
            matchMenu: { isOpen: () => boolean };
            inputManager?: { touchInput?: { gameplayEnabled?: boolean } };
          };
          return {
            open: scene.matchMenu.isOpen(),
            gameplayEnabled: scene.inputManager?.touchInput?.gameplayEnabled ?? null,
          };
        }),
      )
      .toMatchObject({ open: false, ...(touch ? { gameplayEnabled: true } : {}) });

    const leaveCalls = await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        matchMenuGamepad: { poll: () => unknown };
        update: (time: number, delta: number) => void;
      };
      const neutral = {
        connected: true,
        left: false,
        right: false,
        up: false,
        down: false,
        confirm: false,
        back: false,
        alternate: false,
        menu: false,
        hasAction: true,
      };
      const actions = [
        { ...neutral, menu: true },
        { ...neutral, down: true },
        { ...neutral, confirm: true },
        { ...neutral, down: true },
        { ...neutral, confirm: true },
      ];
      scene.matchMenuGamepad = {
        poll: () => actions.shift() ?? { ...neutral, hasAction: false },
      };
      for (let i = 0; i < 5; i++) scene.update(i * 16, 16);
      return (window as unknown as { matchMenuLeaveCalls?: number }).matchMenuLeaveCalls ?? 0;
    });
    expect(leaveCalls).toBe(1);

    await waitForScene(gamePage, shellAdvertised ? 'ReforgedShellScene' : 'LobbyScene');
  });
});
