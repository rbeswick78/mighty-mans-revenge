import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function waitForLobby(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (
          window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
        ).game;
        const scene = game?.scene.getScene('LobbyScene') as {
          sys?: { settings: { active: boolean } };
        };
        return scene?.sys?.settings.active ?? false;
      }),
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

test.describe('Practice setup overlay', () => {
  test('keeps the lobby readable and supports pointer, touch, keyboard, and gamepad focus', async ({
    lobbyPage,
  }, testInfo) => {
    test.skip(
      process.env.CAPABILITY_NEW_SHELL === 'true',
      'The enabled Challenges tab owns practice setup; reforged-shell.test.ts covers that surface.',
    );
    await lobbyPage.evaluate(() => localStorage.removeItem('mmr_bot_difficulty'));
    await lobbyPage.reload();
    await waitForLobby(lobbyPage);

    const initial = await lobbyPage.evaluate(() => {
      const game = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game;
      const scene = game?.scene.getScene('LobbyScene') as {
        children: { list: Array<{ text?: string; getBounds?: () => Bounds }> };
        practiceSetupButton: {
          getBounds: () => Bounds;
          getSubtitleText: () => string | null;
          list: Array<{ text?: string }>;
        };
        practiceSetupMenu: {
          difficultyButton: unknown;
          rivalButton: unknown;
          modeButton: unknown;
          mutatorButton: unknown;
        };
        buildCodexButton: { getBounds: () => Bounds };
        gamepadButtons: () => unknown[];
      };
      const footer = scene.children.list.find(
        (child) => child.text?.startsWith('TAB / ARROWS') || child.text?.startsWith('TAP A ROUTE'),
      );
      const gamepadButtons = scene.gamepadButtons();
      return {
        setupBounds: scene.practiceSetupButton.getBounds(),
        setupLabel:
          scene.practiceSetupButton.list.find((child) => child.text === 'PRACTICE SETUP')?.text ??
          null,
        setupSubtitle: scene.practiceSetupButton.getSubtitleText(),
        codexBounds: scene.buildCodexButton.getBounds(),
        footerBounds: footer?.getBounds?.() ?? null,
        setupGamepadReachable: gamepadButtons.includes(scene.practiceSetupButton),
        selectorsRemovedFromMainFocus: [
          scene.practiceSetupMenu.difficultyButton,
          scene.practiceSetupMenu.rivalButton,
          scene.practiceSetupMenu.modeButton,
          scene.practiceSetupMenu.mutatorButton,
        ].every((button) => !gamepadButtons.includes(button)),
      };
    });

    expect(initial).toMatchObject({
      setupLabel: 'PRACTICE SETUP',
      setupSubtitle: 'LEVEL · RIVAL · MODE · CHAOS',
      setupGamepadReachable: true,
      selectorsRemovedFromMainFocus: true,
    });
    expect(initial.footerBounds).not.toBeNull();
    expect(initial.codexBounds.y + initial.codexBounds.height).toBeLessThan(
      initial.footerBounds?.y ?? 0,
    );

    await lobbyPage.screenshot({ path: testInfo.outputPath('lobby-practice-setup-launcher.png') });
    await pressCanvasButton(
      lobbyPage,
      initial.setupBounds,
      testInfo.project.name === 'mobile-landscape',
    );

    const open = await lobbyPage.evaluate(() => {
      const game = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game;
      const scene = game?.scene.getScene('LobbyScene') as {
        nicknameDom: { visible: boolean };
        practiceSetupMenu: {
          isOpen: () => boolean;
          getFocusedIndex: () => number;
          difficultyButton: { getBounds: () => Bounds; list: Array<{ text?: string }> };
          rivalButton: { getBounds: () => Bounds };
          modeButton: { getBounds: () => Bounds };
          mutatorButton: { getBounds: () => Bounds };
        };
      };
      const menu = scene.practiceSetupMenu;
      return {
        open: menu.isOpen(),
        nicknameVisible: scene.nicknameDom.visible,
        focusedIndex: menu.getFocusedIndex(),
        difficultyBounds: menu.difficultyButton.getBounds(),
        difficultyLabel:
          menu.difficultyButton.list.find((child) => child.text?.startsWith('LEVEL:'))?.text ??
          null,
        selectorBounds: [
          menu.difficultyButton,
          menu.rivalButton,
          menu.modeButton,
          menu.mutatorButton,
        ].map((button) => button.getBounds()),
      };
    });
    expect(open).toMatchObject({
      open: true,
      nicknameVisible: false,
      focusedIndex: 0,
      difficultyLabel: 'LEVEL: SCRAPPER',
    });
    expect(open.selectorBounds.every((bounds) => bounds.width >= 380 && bounds.height >= 48)).toBe(
      true,
    );

    await lobbyPage.screenshot({ path: testInfo.outputPath('practice-setup-open.png') });
    await pressCanvasButton(
      lobbyPage,
      open.difficultyBounds,
      testInfo.project.name === 'mobile-landscape',
    );
    await expect
      .poll(() => lobbyPage.evaluate(() => localStorage.getItem('mmr_bot_difficulty')))
      .toBe('warlord');

    await lobbyPage.keyboard.press('Escape');
    await expect
      .poll(() =>
        lobbyPage.evaluate(() => {
          const game = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game;
          const scene = game?.scene.getScene('LobbyScene') as {
            nicknameDom: { visible: boolean };
            practiceSetupMenu: { isOpen: () => boolean };
          };
          return {
            open: scene.practiceSetupMenu.isOpen(),
            nicknameVisible: scene.nicknameDom.visible,
          };
        }),
      )
      .toEqual({ open: false, nicknameVisible: true });
  });
});
