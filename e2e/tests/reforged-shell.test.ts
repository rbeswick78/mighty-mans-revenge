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

async function clickLogicalPlayOption(page: Page, index: number, touch: boolean): Promise<void> {
  const center = await page.evaluate((optionIndex) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as { getPlayRosterOptionCenter(index: number): { x: number; y: number } | null };
    return scene.getPlayRosterOptionCenter(optionIndex);
  }, index);
  const canvas = await page.locator('canvas').boundingBox();
  if (!center || !canvas) throw new Error(`Missing rendered Play option ${index}`);
  const x = canvas.x + (center.x / 1280) * canvas.width;
  const y = canvas.y + (center.y / 720) * canvas.height;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function stageNonChromiumShell(page: Page): Promise<void> {
  await waitForActiveScene(page, 'LobbyScene');
  await page.evaluate(() => {
    const lobby = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'LobbyScene',
    ) as unknown as {
      gameService: {
        getNetworkManager(): {
          handleMessage(message: unknown): void;
          connection: { setState(state: string): void };
        };
      };
    };
    const manager = lobby.gameService.getNetworkManager();
    // Keep the staged boundary alive past the real five-second WebRTC timeout.
    // Set this before the welcome so the Lobby opens the shell exactly once.
    manager.connection.setState('connected');
    manager.handleMessage({
      type: 'server:welcome',
      playerId: 'staged-shell-player',
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

async function playRosterSnapshot(page: Page): Promise<{
  step: string;
  state: Record<string, unknown>;
  serialized: Record<string, unknown> | null;
  optionLabels: string[];
}> {
  return page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      getPlayRosterSnapshot(): {
        step: string;
        state: Record<string, unknown>;
        serialized: Record<string, unknown> | null;
        optionLabels: string[];
      };
    };
    return scene.getPlayRosterSnapshot();
  });
}

async function queueMenuGamepadActions(
  page: Page,
  actions: readonly Partial<
    Record<'left' | 'right' | 'up' | 'down' | 'confirm' | 'back', boolean>
  >[],
): Promise<void> {
  await page.evaluate((queuedActions) => {
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
    const queue = queuedActions.map((action) => ({ ...idle, ...action, hasAction: true }));
    scene.menuGamepad = { poll: () => queue.shift() ?? idle };
  }, actions);
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
  if (testInfo.project.name !== 'desktop-chromium') {
    // RFG-003: headless Firefox/WebKit do not reliably receive the live local
    // WebRTC welcome. Stage that one boundary message, then exercise the real
    // scene, scaling, focus, pointer, keyboard, gamepad, and touch code.
    await stageNonChromiumShell(page);
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

test('Play roster builder reaches only a valid review across pointer, keyboard, gamepad, and touch', async ({
  page,
}, testInfo) => {
  test.skip(!shellAdvertised, 'Run with CAPABILITY_NEW_SHELL=true for the gated shell path.');
  await page.goto('/');
  const touch = testInfo.project.name === 'mobile-landscape';
  if (testInfo.project.name !== 'desktop-chromium') await stageNonChromiumShell(page);
  await waitForActiveScene(page, 'ReforgedShellScene');

  expect(await playRosterSnapshot(page)).toMatchObject({
    step: 'format',
    state: { format: null },
    serialized: null,
    optionLabels: ['CURATED DUEL', 'WASTELAND RUMBLE', 'CREW BATTLE'],
  });

  // Direct pointer/touch enters the real Play control region.
  await clickLogicalPlayOption(page, 1, touch);
  await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('composition');

  if (touch) {
    // Keep staged WebKit on its real touch path; desktop Chromium owns the
    // external-keyboard assertion and is also resized for mobile visual proof.
    await clickLogicalPlayOption(page, 1, true);
    await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('mode');
    await clickLogicalPlayOption(page, 1, true);
    await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('arena');
  } else {
    // Keyboard uses the same focused button activation path.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('mode');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('arena');
  }

  // Standard gamepad A confirms the read-only arena, then D-pad chooses Frost Wizard.
  await queueMenuGamepadActions(page, [
    { confirm: true },
    { right: true },
    { right: true },
    { confirm: true },
  ]);
  await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('review');
  const review = await playRosterSnapshot(page);
  expect(review.serialized).toEqual({
    format: 'rumble',
    composition: { humanCount: 1, botCount: 2 },
    mode: 'koth',
    arenaName: 'Overgrown Suburb',
    fighterId: 'frost_wizard',
  });
  expect(review.optionLabels).toEqual([]);

  // Standard gamepad B edits instead of serializing a stale review.
  await queueMenuGamepadActions(page, [{ back: true }]);
  await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('fighter');
  expect((await playRosterSnapshot(page)).serialized).toBeNull();
  await clickLogicalPlayOption(page, 4, touch);
  await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('review');
  expect((await playRosterSnapshot(page)).serialized?.fighterId).toBe('jack');

  // Other Batch 4 tabs remain empty and never expose the Play control objects.
  await clickLogicalTab(page, 'fighters', touch);
  await expect.poll(() => activeTab(page)).toBe('fighters');
  const hidden = await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      isPlayRosterVisible(): boolean;
      getPlayRosterOptionCenter(index: number): { x: number; y: number } | null;
    };
    return {
      visible: scene.isPlayRosterVisible(),
      exposedOption: scene.getPlayRosterOptionCenter(0),
    };
  });
  expect(hidden).toEqual({ visible: false, exposedOption: null });

  await clickLogicalTab(page, 'play', touch);
  await expect.poll(() => activeTab(page)).toBe('play');
  expect((await playRosterSnapshot(page)).serialized?.fighterId).toBe('jack');

  if (touch) {
    // RFG-003: retain object/input assertions; this staged WebKit canvas is black.
    await page.screenshot({ path: testInfo.outputPath('play-roster-mobile-webkit.png') });
  } else if (testInfo.project.name === 'desktop-chromium') {
    await page.screenshot({ path: testInfo.outputPath('play-roster-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect
      .poll(async () => {
        const box = await page.locator('canvas').boundingBox();
        return box ? box.width / box.height : 0;
      })
      .toBeCloseTo(16 / 9, 2);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await page.waitForTimeout(500);
    await page.screenshot({ path: testInfo.outputPath('play-roster-mobile-chromium.png') });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('composition');
    expect((await playRosterSnapshot(page)).optionLabels).toHaveLength(9);
    await page.screenshot({
      path: testInfo.outputPath('play-roster-options-mobile-chromium.png'),
    });
  }
});
