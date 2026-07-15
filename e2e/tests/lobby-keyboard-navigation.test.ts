import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

interface LobbyKeyboardState {
  active: boolean;
  index: number;
  focusedLabel: string | null;
  footer: string | null;
  callsignFocused: boolean;
  setupOpen: boolean;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function waitForLobby(page: Page, requireConnection: boolean): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((connectedRequired) => {
          const game = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game;
          const scene = game?.scene.getScene('LobbyScene') as {
            sys?: { settings: { active: boolean } };
            connectionState?: string;
          };
          const active = scene?.sys?.settings.active ?? false;
          return connectedRequired ? active && scene?.connectionState === 'connected' : active;
        }, requireConnection),
      { timeout: 20000 },
    )
    .toBe(true);
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

async function keyboardState(page: Page): Promise<LobbyKeyboardState> {
  return page.evaluate(() => {
    type RuntimeButton = {
      focused: boolean;
      list: Array<{ text?: string }>;
    };
    const game = (window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } })
      .game;
    const scene = game?.scene.getScene('LobbyScene') as {
      children: { list: Array<{ text?: string }> };
      nicknameInput: HTMLInputElement | null;
      gamepadFocusActive: boolean;
      gamepadFocusIndex: number;
      gamepadButtons: () => RuntimeButton[];
      practiceSetupMenu: { isOpen: () => boolean };
    };
    const buttons = scene.gamepadButtons();
    const focusedButton = buttons.find((button) => button.focused);
    return {
      active: scene.gamepadFocusActive,
      index: scene.gamepadFocusIndex,
      focusedLabel:
        focusedButton?.list.find((child) => typeof child.text === 'string')?.text ?? null,
      footer:
        scene.children.list.find(
          (child) =>
            child.text?.startsWith('TAB / ARROWS') || child.text?.startsWith('TAP A ROUTE'),
        )?.text ?? null,
      callsignFocused: document.activeElement === scene.nicknameInput,
      setupOpen: scene.practiceSetupMenu.isOpen(),
    };
  });
}

test.describe('Lobby keyboard navigation', () => {
  test('makes every route reachable without stealing callsign editing or touch control', async ({
    lobbyPage,
  }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile-landscape';
    await waitForLobby(lobbyPage, false);
    if (!mobile) {
      // This regression owns menu navigation, not WebRTC. Detach transient
      // connection callbacks and stage the connected presentation so every
      // online and local route remains deterministically enumerable.
      await lobbyPage.evaluate(() => {
        const game = (
          window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
        ).game;
        const scene = game?.scene.getScene('LobbyScene') as {
          gameService: { off: (event: string, callback: (() => void) | null) => void };
          onConnecting: (() => void) | null;
          onConnected: (() => void) | null;
          onReconnecting: (() => void) | null;
          onDisconnected: (() => void) | null;
          updateConnectionUi: (state: 'connected') => void;
        };
        scene.gameService.off('connecting', scene.onConnecting);
        scene.gameService.off('connected', scene.onConnected);
        scene.gameService.off('reconnecting', scene.onReconnecting);
        scene.gameService.off('disconnected', scene.onDisconnected);
        scene.updateConnectionUi('connected');
      });
    }

    const initial = await keyboardState(lobbyPage);
    expect(initial).toMatchObject({
      active: false,
      focusedLabel: null,
      setupOpen: false,
    });
    expect(initial.footer).toBe(
      mobile ? 'TAP A ROUTE  •  LANDSCAPE' : 'TAB / ARROWS + ENTER  •  ESC / B BACK',
    );

    if (mobile) {
      const setupBounds = await lobbyPage.evaluate(() => {
        const game = (
          window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
        ).game;
        const scene = game?.scene.getScene('LobbyScene') as {
          practiceSetupButton: { getBounds: () => Bounds };
        };
        return scene.practiceSetupButton.getBounds();
      });
      await pressCanvasButton(lobbyPage, setupBounds, true);
      await expect.poll(() => keyboardState(lobbyPage)).toMatchObject({ setupOpen: true });
      await lobbyPage.waitForTimeout(150);
      await lobbyPage.screenshot({ path: testInfo.outputPath('lobby-touch-route.png') });
      const doneBounds = await lobbyPage.evaluate(() => {
        const game = (
          window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
        ).game;
        const scene = game?.scene.getScene('LobbyScene') as {
          practiceSetupMenu: { doneButton: { getBounds: () => Bounds } };
        };
        return scene.practiceSetupMenu.doneButton.getBounds();
      });
      await pressCanvasButton(lobbyPage, doneBounds, true);
      await expect.poll(() => keyboardState(lobbyPage)).toMatchObject({ setupOpen: false });
      return;
    }

    expect(initial.callsignFocused).toBe(true);

    // Callsign editing retains ordinary caret keys. Tab intentionally enters
    // the route menu at its first action.
    await lobbyPage.keyboard.press('ArrowLeft');
    expect(await keyboardState(lobbyPage)).toMatchObject({
      active: false,
      callsignFocused: true,
    });
    await lobbyPage.keyboard.press('Tab');
    expect(await keyboardState(lobbyPage)).toMatchObject({
      active: true,
      index: 0,
      focusedLabel: 'QUICK MATCH',
      callsignFocused: false,
    });

    const expectedRoutes = [
      'RUMBLE 2-4',
      'SPAR',
      'SCRAP PIT',
      'CREW 2V2',
      'GAUNTLET',
      'DAILY RUN',
      'PRACTICE SETUP',
      'BUILD CODEX: 0/6  //  VIEW',
      'AUDIO ON  ·  F2',
    ];
    const reachedRoutes: Array<string | null> = [];
    for (const expectedRoute of expectedRoutes) {
      await lobbyPage.keyboard.press('Tab');
      const state = await keyboardState(lobbyPage);
      reachedRoutes.push(state.focusedLabel);
      expect(state.focusedLabel).toBe(expectedRoute);
    }
    expect(reachedRoutes).toEqual(expectedRoutes);
    await lobbyPage.screenshot({ path: testInfo.outputPath('lobby-keyboard-focus.png') });

    // Return to the local Practice Setup route and prove Enter activates the
    // focused action without depending on an online queue or fullscreen.
    await lobbyPage.keyboard.press('ArrowLeft');
    await lobbyPage.keyboard.press('ArrowLeft');
    expect(await keyboardState(lobbyPage)).toMatchObject({
      active: true,
      index: 7,
      focusedLabel: 'PRACTICE SETUP',
    });
    await lobbyPage.keyboard.press('Enter');
    await expect.poll(() => keyboardState(lobbyPage)).toMatchObject({ setupOpen: true });

    // Escape closes the nested menu, then returns keyboard ownership to the
    // callsign field on the next press while preserving the selected route.
    await lobbyPage.keyboard.press('Escape');
    await expect
      .poll(() => keyboardState(lobbyPage))
      .toMatchObject({
        active: true,
        focusedLabel: 'PRACTICE SETUP',
        setupOpen: false,
      });
    await lobbyPage.keyboard.press('Escape');
    expect(await keyboardState(lobbyPage)).toMatchObject({
      active: false,
      focusedLabel: null,
      callsignFocused: true,
    });

    // Arrow navigation wraps from the first to the final local action, and a
    // pointer press cleanly takes over instead of leaving two highlighted.
    await lobbyPage.keyboard.press('Tab');
    await lobbyPage.keyboard.press('ArrowLeft');
    expect(await keyboardState(lobbyPage)).toMatchObject({
      active: true,
      focusedLabel: 'AUDIO ON  ·  F2',
    });
    const setupBounds = await lobbyPage.evaluate(() => {
      const game = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game;
      const scene = game?.scene.getScene('LobbyScene') as {
        practiceSetupButton: { getBounds: () => Bounds };
      };
      return scene.practiceSetupButton.getBounds();
    });
    await pressCanvasButton(lobbyPage, setupBounds, false);
    await expect
      .poll(() => keyboardState(lobbyPage))
      .toMatchObject({
        active: false,
        focusedLabel: null,
        setupOpen: true,
      });
  });
});
