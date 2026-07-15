import { expect, test, type Page } from '@playwright/test';

const shellAdvertised = process.env.CAPABILITY_NEW_SHELL === 'true';

async function waitForActiveScene(page: Page, key: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (sceneKey) =>
            (window as unknown as { game?: Phaser.Game }).game?.scene
              .getScenes(true)
              .some((scene) => scene.scene.key === sceneKey) ?? false,
          key,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function clickLogicalTab(page: Page, tabId: string, touch: boolean): Promise<void> {
  const center = await page.evaluate((id) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as { getTabCenter(tab: string): { x: number; y: number } | null };
    return scene.getTabCenter(id);
  }, tabId);
  const canvas = await page.locator('canvas').boundingBox();
  if (!center || !canvas) throw new Error(`Missing rendered tab ${tabId}`);
  const x = canvas.x + (center.x / 1280) * canvas.width;
  const y = canvas.y + (center.y / 720) * canvas.height;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function activeTab(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as { getActiveTabId(): string };
    return scene.getActiveTabId();
  });
}

test('disabled newShell capability preserves the complete legacy Lobby', async ({ page }) => {
  test.skip(shellAdvertised, 'This invocation explicitly advertises the gated shell.');
  await page.goto('/');
  await waitForActiveScene(page, 'LobbyScene');

  const state = await page.evaluate(() => {
    const game = (window as unknown as { game?: Phaser.Game }).game;
    return {
      width: game?.scale.width,
      height: game?.scale.height,
      shellActive: game?.scene.getScene('ReforgedShellScene')?.sys.settings.active ?? false,
    };
  });
  expect(state).toEqual({ width: 960, height: 720, shellActive: false });
});

test('advertised shell is 16:9, safe-area bounded, and navigable across inputs', async ({
  page,
}, testInfo) => {
  test.skip(!shellAdvertised, 'Run with CAPABILITY_NEW_SHELL=true for the gated shell path.');
  await page.goto('/');
  const touch = testInfo.project.name === 'mobile-landscape';
  if (touch) {
    // RFG-003: headless mobile WebKit does not reliably receive the live local
    // WebRTC welcome. Stage that one boundary message, then exercise the real
    // scene, scaling, focus, pointer, keyboard, gamepad, and touch code.
    await waitForActiveScene(page, 'LobbyScene');
    await page.evaluate(() => {
      const lobby = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'LobbyScene',
      ) as unknown as {
        gameService: {
          getNetworkManager(): {
            handleMessage(message: unknown): void;
          };
        };
      };
      lobby.gameService.getNetworkManager().handleMessage({
        type: 'server:welcome',
        playerId: 'staged-mobile-player',
        capabilities: {
          newShell: true,
          schedules: false,
          largeWorlds: false,
          modernArt: false,
          battleRoyale: false,
        },
      });
    });
  }
  await waitForActiveScene(page, 'ReforgedShellScene');

  const layout = await page.evaluate(() => {
    const game = (window as unknown as { game?: Phaser.Game }).game;
    const scene = game?.scene.getScene('ReforgedShellScene') as unknown as {
      getSafeArea(): { left: number; top: number; right: number; bottom: number } | null;
    };
    return { width: game?.scale.width, height: game?.scale.height, safe: scene.getSafeArea() };
  });
  expect(layout.width).toBe(1280);
  expect(layout.height).toBe(720);
  expect(layout.safe?.left).toBeGreaterThanOrEqual(32);
  expect(layout.safe?.top).toBeGreaterThanOrEqual(32);
  expect(layout.safe?.right).toBeLessThanOrEqual(1248);
  expect(layout.safe?.bottom).toBeLessThanOrEqual(688);

  await clickLogicalTab(page, 'fighters', touch);
  await expect.poll(() => activeTab(page)).toBe('fighters');

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect.poll(() => activeTab(page)).toBe('challenges');

  await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as { menuGamepad: { poll(): unknown } };
    const idle = {
      connected: true,
      left: false,
      right: false,
      up: false,
      down: false,
      confirm: false,
      back: false,
      alternate: false,
      menu: false,
      hasAction: false,
    };
    const queue = [
      { ...idle, right: true, hasAction: true },
      { ...idle, confirm: true, hasAction: true },
    ];
    scene.menuGamepad = { poll: () => queue.shift() ?? idle };
  });
  await expect.poll(() => activeTab(page)).toBe('records');

  if (touch) {
    await clickLogicalTab(page, 'settings', true);
    await expect.poll(() => activeTab(page)).toBe('settings');
  } else {
    await page.screenshot({ path: testInfo.outputPath('reforged-shell-desktop.png') });
    // RFG-003 makes staged WebKit canvas pixels untrustworthy. Also inspect
    // the responsive landscape layout in Chromium at the target mobile size.
    await page.setViewportSize({ width: 844, height: 390 });
    await expect
      .poll(async () => {
        const box = await page.locator('canvas').boundingBox();
        return box ? box.width / box.height : 0;
      })
      .toBeCloseTo(16 / 9, 2);
    await clickLogicalTab(page, 'settings', false);
    await expect.poll(() => activeTab(page)).toBe('settings');
    await page.screenshot({ path: testInfo.outputPath('reforged-shell-mobile-chromium.png') });
  }

  await page.screenshot({ path: testInfo.outputPath('reforged-shell.png') });

  await page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      gameService: {
        getNetworkManager(): { connection: { setState(state: string): void } };
      };
    };
    shell.gameService.getNetworkManager().connection.setState('reconnecting');
  });
  await waitForActiveScene(page, 'LobbyScene');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (window as unknown as { game?: Phaser.Game }).game;
        return [game?.scale.width, game?.scale.height];
      }),
    )
    .toEqual([960, 720]);
});
