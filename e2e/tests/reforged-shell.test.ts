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

async function waitForRenderedFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.waitForTimeout(500);
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

async function clickLogicalFighterOption(page: Page, index: number, touch: boolean): Promise<void> {
  const center = await page.evaluate((optionIndex) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as { getFighterOptionCenter(index: number): { x: number; y: number } | null };
    return scene.getFighterOptionCenter(optionIndex);
  }, index);
  const canvas = await page.locator('canvas').boundingBox();
  if (!center || !canvas) throw new Error(`Missing rendered Fighters option ${index}`);
  const x = canvas.x + (center.x / 1280) * canvas.width;
  const y = canvas.y + (center.y / 720) * canvas.height;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function clickLogicalChallengeOption(
  page: Page,
  index: number,
  touch: boolean,
): Promise<void> {
  const center = await page.evaluate((optionIndex) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as { getChallengeOptionCenter(index: number): { x: number; y: number } | null };
    return scene.getChallengeOptionCenter(optionIndex);
  }, index);
  const canvas = await page.locator('canvas').boundingBox();
  if (!center || !canvas) throw new Error(`Missing rendered Challenges option ${index}`);
  const x = canvas.x + (center.x / 1280) * canvas.width;
  const y = canvas.y + (center.y / 720) * canvas.height;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function clickLogicalRecordOption(page: Page, index: number, touch: boolean): Promise<void> {
  const center = await page.evaluate((optionIndex) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as { getRecordOptionCenter(index: number): { x: number; y: number } | null };
    return scene.getRecordOptionCenter(optionIndex);
  }, index);
  const canvas = await page.locator('canvas').boundingBox();
  if (!center || !canvas) throw new Error(`Missing rendered Records option ${index}`);
  const x = canvas.x + (center.x / 1280) * canvas.width;
  const y = canvas.y + (center.y / 720) * canvas.height;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function clickLogicalSettingsOption(
  page: Page,
  index: number,
  touch: boolean,
): Promise<void> {
  const center = await page.evaluate((optionIndex) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as { getSettingsOptionCenter(index: number): { x: number; y: number } | null };
    return scene.getSettingsOptionCenter(optionIndex);
  }, index);
  const canvas = await page.locator('canvas').boundingBox();
  if (!center || !canvas) throw new Error(`Missing rendered Settings option ${index}`);
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

async function fightersSnapshot(page: Page): Promise<{
  selectedFighterId: string;
  optionLabels: string[];
  selectedDetail: string;
}> {
  return page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      getFightersSnapshot(): {
        selectedFighterId: string;
        optionLabels: string[];
        selectedDetail: string;
      };
    };
    return scene.getFightersSnapshot();
  });
}

async function challengesSnapshot(page: Page): Promise<{
  view: string;
  optionLabels: string[];
  optionDetails: string[];
  preferences: Record<string, unknown>;
  nicknameReady: boolean;
  status: string;
}> {
  return page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      getChallengesSnapshot(): {
        view: string;
        optionLabels: string[];
        optionDetails: string[];
        preferences: Record<string, unknown>;
        nicknameReady: boolean;
        status: string;
      };
    };
    return scene.getChallengesSnapshot();
  });
}

async function recordsSnapshot(page: Page): Promise<{
  selectedSectionId: string;
  sectionLabels: string[];
  heading: string;
  authority: string;
  columns: [string[], string[]];
}> {
  return page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      getRecordsSnapshot(): {
        selectedSectionId: string;
        sectionLabels: string[];
        heading: string;
        authority: string;
        columns: [string[], string[]];
      };
    };
    return scene.getRecordsSnapshot();
  });
}

async function settingsSnapshot(page: Page): Promise<{
  selectedSectionId: string;
  sectionLabels: string[];
  heading: string;
  authority: string;
  columns: [string[], string[]];
  actionLabels: string[];
  callsign: string;
  editingCallsign: boolean;
  muted: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  connectionState: string;
}> {
  return page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as { getSettingsSnapshot(): Record<string, unknown> };
    return scene.getSettingsSnapshot() as never;
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

async function shellChromeState(page: Page): Promise<{
  background: boolean;
  title: boolean;
  contentPanel: boolean;
  tabs: boolean;
  depths: number[];
  camera: number[];
}> {
  return page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      children: { list: unknown[] };
      background: { visible: boolean; active: boolean; alpha: number; depth: number };
      title: { visible: boolean; active: boolean; alpha: number; depth: number };
      contentPanel: { visible: boolean; active: boolean; alpha: number; depth: number };
      challengesPanel: { depth: number };
      tabButtons: Array<{ visible: boolean; active: boolean; alpha: number; depth: number }>;
      cameras: { main: { scrollX: number; scrollY: number; zoom: number; alpha: number } };
    };
    const listed = shell.children.list;
    const liveAndListed = (object: { visible: boolean; active: boolean; alpha: number }): boolean =>
      object.visible && object.active && object.alpha === 1 && listed.includes(object);
    return {
      background: liveAndListed(shell.background),
      title: liveAndListed(shell.title),
      contentPanel: liveAndListed(shell.contentPanel),
      tabs: shell.tabButtons.every((button) => liveAndListed(button)),
      depths: [
        shell.background.depth,
        shell.title.depth,
        shell.contentPanel.depth,
        shell.challengesPanel.depth,
        shell.tabButtons[0]?.depth ?? -1,
      ],
      camera: [
        shell.cameras.main.scrollX,
        shell.cameras.main.scrollY,
        shell.cameras.main.zoom,
        shell.cameras.main.alpha,
      ],
    };
  });
}

test('disabled newShell capability preserves the complete legacy Lobby', async ({ page }) => {
  test.skip(shellAdvertised, 'This invocation explicitly advertises the gated shell.');
  await page.goto('/');
  await waitForActiveScene(page, 'LobbyScene');

  const state = await page.evaluate(() => {
    const game = (window as unknown as { game?: Phaser.Game }).game;
    const lobby = game?.scene.getScene('LobbyScene') as unknown as Record<
      string,
      { list?: Array<{ text?: string }> }
    >;
    const buttonLabel = (key: string): string =>
      lobby[key]?.list?.find((child) => typeof child.text === 'string')?.text ?? '';
    return {
      width: game?.scale.width,
      height: game?.scale.height,
      shellActive: game?.scene.getScene('ReforgedShellScene')?.sys.settings.active ?? false,
      legacyChallenges: [
        buttonLabel('practiceButton'),
        buttonLabel('rustyRumbleButton'),
        buttonLabel('gauntletButton'),
        buttonLabel('dailyButton'),
        buttonLabel('practiceSetupButton'),
        buttonLabel('buildCodexButton'),
      ],
    };
  });
  expect(state).toEqual({
    width: 960,
    height: 720,
    shellActive: false,
    legacyChallenges: [
      'SPAR',
      'SCRAP PIT',
      'GAUNTLET',
      'DAILY RUN',
      'PRACTICE SETUP',
      'BUILD CODEX: 0/6  //  VIEW',
    ],
  });
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
  await page.addInitScript(() => localStorage.setItem('mmr_fighter_selection', 'frost_wizard'));
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

  // Standard gamepad A confirms the read-only arena. Play consumes the
  // persisted Fighters selection without offering a second roster browser.
  await queueMenuGamepadActions(page, [{ confirm: true }]);
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

  // Standard gamepad B skips the Fighters-owned dependency and edits arena.
  await queueMenuGamepadActions(page, [{ back: true }]);
  await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('arena');
  expect((await playRosterSnapshot(page)).serialized).toBeNull();
  await clickLogicalPlayOption(page, 0, touch);
  await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('review');
  expect((await playRosterSnapshot(page)).serialized?.fighterId).toBe('frost_wizard');

  // Fighters owns selection now and updates an already reviewed Play draft.
  await clickLogicalTab(page, 'fighters', touch);
  await expect.poll(() => activeTab(page)).toBe('fighters');
  await clickLogicalFighterOption(page, 4, touch);
  await expect.poll(async () => (await fightersSnapshot(page)).selectedFighterId).toBe('jack');
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
    await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('composition');
    expect((await playRosterSnapshot(page)).optionLabels).toHaveLength(9);
    await page.screenshot({
      path: testInfo.outputPath('play-roster-options-mobile-chromium.png'),
    });
  }
});

test('Fighters owns roster detail, mastery, persistent selection, and Play handoff', async ({
  page,
}, testInfo) => {
  test.skip(!shellAdvertised, 'Run with CAPABILITY_NEW_SHELL=true for the gated shell path.');
  await page.addInitScript(() => {
    if (sessionStorage.getItem('batch6-fighter-initialized') === null) {
      localStorage.removeItem('mmr_fighter_selection');
      sessionStorage.setItem('batch6-fighter-initialized', 'true');
    }
  });
  await page.goto('/');
  const touch = testInfo.project.name === 'mobile-landscape';
  if (testInfo.project.name !== 'desktop-chromium') await stageNonChromiumShell(page);
  await waitForActiveScene(page, 'ReforgedShellScene');
  await clickLogicalTab(page, 'fighters', touch);

  expect(await fightersSnapshot(page)).toMatchObject({
    selectedFighterId: 'mighty_man',
    optionLabels: ['MIGHTY MAN', 'BRUCE', 'FROST WIZARD', 'BUBBA', 'JACK', 'ROOK'],
  });
  expect((await fightersSnapshot(page)).selectedDetail).toContain('X-RAY VISION');
  expect((await fightersSnapshot(page)).selectedDetail).toContain('100 HP');
  expect((await fightersSnapshot(page)).selectedDetail).toContain('MASTERY  /  UNTESTED');

  // Pointer or touch selects and persists Jack.
  await clickLogicalFighterOption(page, 4, touch);
  await expect.poll(async () => (await fightersSnapshot(page)).selectedFighterId).toBe('jack');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('mmr_fighter_selection')))
    .toBe('jack');
  expect((await fightersSnapshot(page)).selectedDetail).toContain('AXE THROW');

  // External keyboard and standard gamepad use the same card activation path.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await fightersSnapshot(page)).selectedFighterId).toBe('bubba');
  await queueMenuGamepadActions(page, [{ right: true }, { confirm: true }]);
  await expect.poll(async () => (await fightersSnapshot(page)).selectedFighterId).toBe('jack');

  if (touch) {
    // RFG-003: retain real staged WebKit touch/object assertions; pixels are black.
    await page.screenshot({ path: testInfo.outputPath('fighters-mobile-webkit.png') });
  } else if (testInfo.project.name === 'desktop-chromium') {
    await page.screenshot({ path: testInfo.outputPath('fighters-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: testInfo.outputPath('fighters-mobile-chromium.png') });
  }

  // Scene recreation reads the device preference; no network message is authored.
  await page.reload();
  if (testInfo.project.name !== 'desktop-chromium') await stageNonChromiumShell(page);
  await waitForActiveScene(page, 'ReforgedShellScene');
  await clickLogicalTab(page, 'fighters', touch);
  await expect.poll(async () => (await fightersSnapshot(page)).selectedFighterId).toBe('jack');

  await clickLogicalTab(page, 'challenges', touch);
  await expect.poll(() => activeTab(page)).toBe('challenges');
  expect(
    await page.evaluate(() => {
      const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'ReforgedShellScene',
      ) as unknown as { getFighterOptionCenter(index: number): unknown };
      return scene.getFighterOptionCenter(0);
    }),
  ).toBeNull();
});

test('Challenges preserves setup, progress, authority, and every established entry path', async ({
  page,
}, testInfo) => {
  test.skip(!shellAdvertised, 'Run with CAPABILITY_NEW_SHELL=true for the gated shell path.');
  await page.addInitScript(() => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem('mmr_nickname', 'Batch7');
    localStorage.setItem('mmr_bot_difficulty', 'warlord');
    localStorage.setItem('mmr_practice_mode', 'koth');
    localStorage.setItem('mmr_practice_rival', 'bruce');
    localStorage.setItem('mmr_practice_mutator', 'blackout');
    localStorage.setItem(
      'mmr_scrap_pit_record',
      JSON.stringify({
        rounds: 5,
        wins: 3,
        currentStreak: 2,
        bestStreak: 3,
        lastMatchId: 'pit-5',
      }),
    );
    localStorage.setItem('mmr_gauntlet_best_clear', '4200');
    localStorage.setItem(
      'mmr_daily_gauntlet_progress',
      JSON.stringify({ challengeKey: today, bestScore: 3600, lastClearKey: today, streak: 4 }),
    );
    localStorage.setItem(
      'mmr_gauntlet_build_codex',
      JSON.stringify({
        discovered: ['scrap_plating+kill_salvage'],
        bestScores: { 'scrap_plating+kill_salvage': 4200 },
      }),
    );
  });
  await page.goto('/');
  const touch = testInfo.project.name === 'mobile-landscape';
  if (testInfo.project.name !== 'desktop-chromium') await stageNonChromiumShell(page);
  await waitForActiveScene(page, 'ReforgedShellScene');
  await clickLogicalTab(page, 'challenges', touch);

  expect(await challengesSnapshot(page)).toMatchObject({
    view: 'challenges',
    optionLabels: ['SPAR', 'SCRAP PIT', 'GAUNTLET', 'DAILY RUN', 'PRACTICE SETUP', 'BUILD CODEX'],
    preferences: {
      difficulty: 'warlord',
      mode: 'koth',
      rival: 'bruce',
      mutator: 'blackout',
    },
    nicknameReady: true,
  });
  const details = (await challengesSnapshot(page)).optionDetails;
  expect(details[1]).toContain('3W');
  expect(details[2]).toContain('4,200');
  expect(details[3]).toContain('3,600');
  expect(details[5]).toContain('1/6');

  // Pointer/touch opens the established setup, keyboard and gamepad cycle the
  // same persisted values, and mode compatibility remains centralized.
  await clickLogicalChallengeOption(page, 4, touch);
  await expect.poll(async () => (await challengesSnapshot(page)).view).toBe('setup');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('mmr_bot_difficulty')))
    .toBe('rookie');
  await queueMenuGamepadActions(page, [{ right: true }, { confirm: true }]);
  await expect
    .poll(async () => (await challengesSnapshot(page)).preferences.rival)
    .toBe('frost_wizard');
  await clickLogicalChallengeOption(page, 2, touch);
  await expect.poll(async () => (await challengesSnapshot(page)).preferences.mode).toBe('gun_game');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await challengesSnapshot(page)).view).toBe('challenges');

  await page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      gameService: { startPractice: (...args: unknown[]) => void };
    };
    const calls: unknown[][] = [];
    (window as unknown as { batch7ChallengeCalls?: unknown[][] }).batch7ChallengeCalls = calls;
    shell.gameService.startPractice = (...args: unknown[]) => calls.push(args);
  });

  for (const index of [0, 1, 2, 3]) await clickLogicalChallengeOption(page, index, touch);
  expect(
    await page.evaluate(
      () => (window as unknown as { batch7ChallengeCalls?: unknown[][] }).batch7ChallengeCalls,
    ),
  ).toEqual([
    ['Batch7', 'rookie', 'sparring', 'gun_game', 'frost_wizard', 'blackout'],
    ['Batch7', 'rookie', 'rusty_rumble', 'gun_game', 'frost_wizard', 'blackout'],
    ['Batch7', 'rookie', 'gauntlet', undefined, undefined, undefined],
    ['Batch7', 'rookie', 'daily', undefined, undefined, undefined],
  ]);
  await page.evaluate(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
  });

  await clickLogicalChallengeOption(page, 5, touch);
  await expect.poll(async () => (await challengesSnapshot(page)).view).toBe('codex');
  expect((await challengesSnapshot(page)).optionLabels).toEqual(['BACK TO CHALLENGES']);

  if (touch) {
    // RFG-003: staged WebKit retains real touch/object assertions; pixels are black.
    await page.screenshot({ path: testInfo.outputPath('challenges-mobile-webkit.png') });
  } else if (testInfo.project.name === 'desktop-chromium') {
    await page.screenshot({ path: testInfo.outputPath('challenges-codex-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await waitForRenderedFrames(page);
    expect(await shellChromeState(page)).toEqual({
      background: true,
      title: true,
      contentPanel: true,
      tabs: true,
      depths: [0, 10, 10, 20, 30],
      camera: [0, 0, 1, 1],
    });
    await page.screenshot({ path: testInfo.outputPath('challenges-codex-mobile-chromium.png') });
    await clickLogicalChallengeOption(page, 0, false);
    await expect.poll(async () => (await challengesSnapshot(page)).view).toBe('challenges');
    await page.screenshot({ path: testInfo.outputPath('challenges-grid-mobile-chromium.png') });
    await clickLogicalChallengeOption(page, 4, false);
    await expect.poll(async () => (await challengesSnapshot(page)).view).toBe('setup');
    expect(await shellChromeState(page)).toEqual({
      background: true,
      title: true,
      contentPanel: true,
      tabs: true,
      depths: [0, 10, 10, 20, 30],
      camera: [0, 0, 1, 1],
    });
    await waitForRenderedFrames(page);
    await page.screenshot({ path: testInfo.outputPath('challenges-setup-mobile-chromium.png') });
  }

  // The server-authored matchFound event retains the existing Character Select
  // route and restores the untouched legacy gameplay logical size.
  await page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      gameService: {
        getNetworkManager(): { handleMessage(message: unknown): void };
      };
    };
    shell.gameService.getNetworkManager().handleMessage({
      type: 'server:matchFound',
      matchId: 'batch-7-route',
      opponents: [{ id: 'bot:rusty', nickname: 'Rusty' }],
      mapName: 'Wasteland Outpost',
      gameMode: 'deathmatch',
      matchKind: 'practice',
      practiceKind: 'sparring',
    });
  });
  await waitForActiveScene(page, 'CharacterSelectScene');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (window as unknown as { game?: Phaser.Game }).game;
        return [game?.scale.width, game?.scale.height];
      }),
    )
    .toEqual([960, 720]);
});

test('Records consolidates authoritative snapshots and device records with a Battle Royale zero state', async ({
  page,
}, testInfo) => {
  test.skip(!shellAdvertised, 'Run with CAPABILITY_NEW_SHELL=true for the gated shell path.');
  await page.addInitScript(() => {
    localStorage.setItem('mmr_nickname', 'Batch8');
    localStorage.setItem(
      'mmr_scrap_pit_record',
      JSON.stringify({
        rounds: 8,
        wins: 5,
        currentStreak: 2,
        bestStreak: 4,
        lastMatchId: 'pit-8',
      }),
    );
    localStorage.setItem('mmr_gauntlet_best_clear', '7200');
    localStorage.setItem(
      'mmr_daily_gauntlet_progress',
      JSON.stringify({
        challengeKey: '2026-07-15',
        bestScore: 6500,
        lastClearKey: '2026-07-15',
        streak: 3,
      }),
    );
    localStorage.setItem(
      'mmr_gauntlet_build_codex',
      JSON.stringify({
        discovered: ['scrap_plating+kill_salvage'],
        bestScores: { 'scrap_plating+kill_salvage': 7200 },
      }),
    );
    localStorage.setItem(
      'mmr_crew_tour',
      JSON.stringify({
        toursCompleted: 1,
        securedModes: ['deathmatch', 'koth'],
        wins: 8,
        currentWinStreak: 2,
        bestWinStreak: 5,
        lastMatchId: 'crew-8',
      }),
    );
  });
  await page.goto('/');
  const touch = testInfo.project.name === 'mobile-landscape';
  if (testInfo.project.name !== 'desktop-chromium') await stageNonChromiumShell(page);
  await waitForActiveScene(page, 'ReforgedShellScene');

  await page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      gameService: {
        latestCharacterWins: Record<string, number>;
        latestArenaWins: Record<string, number>;
        lastMatchResult: Record<string, unknown>;
        getPlayerId(): string | null;
        getNetworkManager(): { handleMessage(message: unknown): void };
      };
    };
    const playerId = shell.gameService.getPlayerId() ?? 'staged-shell-player';
    shell.gameService.latestCharacterWins = {
      mighty_man: 15,
      bruce: 7,
      frost_wizard: 3,
      bubba: 1,
      jack: 4,
      rook: 9,
    };
    shell.gameService.latestArenaWins = {
      'Wasteland Outpost': 15,
      'Overgrown Suburb': 7,
      Scrapyard: 3,
      'Collapsed Overpass': 1,
      'Checkpoint Zero': 4,
      'Rusted Refinery': 9,
    };
    shell.gameService.lastMatchResult = {
      matchId: 'batch-8-result',
      winnerId: playerId,
      playerStats: new Map(),
      duration: 120,
      gameMode: 'deathmatch',
      awards: [],
      rivalry: {
        nicknameA: 'Batch8',
        nicknameB: 'Rival',
        winsA: 7,
        winsB: 5,
        draws: 2,
      },
      rivalrySet: {
        winsToClinch: 3,
        roundsPlayed: 2,
        players: [
          { playerId, nickname: 'Batch8', wins: 2 },
          { playerId: 'rival', nickname: 'Rival', wins: 0 },
        ],
        championId: null,
      },
      isPractice: false,
      nextMapName: null,
      nextGameMode: null,
      wentToOvertime: false,
      contract: {
        id: 'hot_shot',
        title: 'Hot Shot',
        objective: 'Land hits',
        target: 1,
        players: [],
        careerCompletions: { [playerId]: 9 },
      },
      winStreaks: {
        [playerId]: { current: 3, best: 6, previous: 2, previousBest: 6 },
      },
    };
    const manager = shell.gameService.getNetworkManager();
    manager.handleMessage({
      type: 'server:leaderboard',
      entries: [
        {
          nickname: 'Other',
          wins: 20,
          losses: 4,
          draws: 1,
          kills: 200,
          matches: 25,
          contractsCompleted: 18,
        },
        {
          nickname: 'Batch8',
          wins: 12,
          losses: 8,
          draws: 2,
          kills: 144,
          matches: 22,
          contractsCompleted: 9,
        },
      ],
    });
    manager.handleMessage({
      type: 'server:dailyGauntletLeaderboard',
      challengeKey: '2026-07-15',
      entries: [
        { nickname: 'DailyAce', score: 8000 },
        { nickname: 'Batch8', score: 6500 },
      ],
    });
  });

  await clickLogicalTab(page, 'records', touch);
  expect(await recordsSnapshot(page)).toMatchObject({
    selectedSectionId: 'career',
    sectionLabels: ['CAREER', 'BOARDS', 'RIVALRY', 'FIGHTERS', 'ARENAS', 'CHALLENGE', 'BR FUTURE'],
    heading: 'CAREER / BATCH8',
  });
  expect((await recordsSnapshot(page)).columns.flat()).toContain('ALL-TIME TOP 5 / #2');

  // Pointer/touch, keyboard, and standard gamepad all select the same
  // read-only section controls without authoring a record or request.
  await clickLogicalRecordOption(page, 1, touch);
  expect(await recordsSnapshot(page)).toMatchObject({ selectedSectionId: 'leaderboards' });
  expect((await recordsSnapshot(page)).columns.flat()).toEqual(
    expect.arrayContaining(['#1 OTHER / 20W 4L 1D / 200 KOs', '#2 BATCH8 / 6,500']),
  );
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  expect(await recordsSnapshot(page)).toMatchObject({ selectedSectionId: 'rivalry' });
  expect((await recordsSnapshot(page)).columns.flat()).toContain('BATCH8 7 - 5 RIVAL');
  await queueMenuGamepadActions(page, [{ right: true }, { confirm: true }]);
  await expect.poll(async () => (await recordsSnapshot(page)).selectedSectionId).toBe('fighters');
  expect((await recordsSnapshot(page)).columns.flat()).toContain('MIGHTY MAN / MASTER / 15 WINS');

  await clickLogicalRecordOption(page, 4, touch);
  expect((await recordsSnapshot(page)).columns.flat()).toContain(
    'WASTELAND OUTPOST / HOME TURF / 15 WINS',
  );
  await clickLogicalRecordOption(page, 5, touch);
  expect((await recordsSnapshot(page)).columns.flat()).toEqual(
    expect.arrayContaining([
      '5 WINS / 8 ROUNDS',
      'BEST CLEAR / 7,200',
      '1/6 DISCOVERED',
      '1 TOURS / 2/4 PATCHES',
    ]),
  );
  await clickLogicalRecordOption(page, 6, touch);
  expect(await recordsSnapshot(page)).toMatchObject({
    selectedSectionId: 'battle_royale',
    authority: 'EXPLICIT ZERO STATE / BATCH 49 OWNS FUTURE PERSISTENCE',
  });
  expect((await recordsSnapshot(page)).columns.flat()).toEqual(
    expect.arrayContaining(['MATCHES / --', 'BEST PLACEMENT / --', 'NOT RECORDED OR INFERRED']),
  );

  if (touch) {
    await page.screenshot({ path: testInfo.outputPath('records-mobile-webkit.png') });
  } else if (testInfo.project.name === 'desktop-chromium') {
    await clickLogicalRecordOption(page, 1, false);
    await waitForRenderedFrames(page);
    await page.screenshot({ path: testInfo.outputPath('records-leaderboards-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await waitForRenderedFrames(page);
    await clickLogicalRecordOption(page, 5, false);
    await page.screenshot({ path: testInfo.outputPath('records-challenges-mobile-chromium.png') });
  }

  await clickLogicalTab(page, 'settings', touch);
  const settings = await page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      contentState: { visible: boolean; text: string };
      recordsPanel: { visible: boolean };
      settingsPanel: { visible: boolean };
    };
    return {
      placeholderVisible: shell.contentState.visible,
      placeholder: shell.contentState.text,
      recordsVisible: shell.recordsPanel.visible,
      settingsVisible: shell.settingsPanel.visible,
    };
  });
  expect(settings).toEqual({
    placeholderVisible: false,
    placeholder: 'NAVIGATION FOUNDATION READY',
    recordsVisible: false,
    settingsVisible: true,
  });
});

test('Settings reuses callsign, audio, controls, graphics, fullscreen, and signal recovery', async ({
  page,
}, testInfo) => {
  test.skip(!shellAdvertised, 'Run with CAPABILITY_NEW_SHELL=true for the gated shell path.');
  await page.addInitScript(() => {
    if (sessionStorage.getItem('batch9-missing-callsign') !== 'true') {
      localStorage.setItem('mmr_nickname', 'Batch9');
    }
    localStorage.setItem('mmr_audio_master', '0.75');
    localStorage.setItem('mmr_audio_sfx', '0.5');
    localStorage.setItem('mmr_audio_music', '0.25');
    localStorage.setItem('mmr_audio_muted', 'false');
  });
  await page.goto('/');
  const touch = testInfo.project.name === 'mobile-landscape';
  if (testInfo.project.name !== 'desktop-chromium') await stageNonChromiumShell(page);
  await waitForActiveScene(page, 'ReforgedShellScene');
  await clickLogicalTab(page, 'settings', touch);

  expect(await settingsSnapshot(page)).toMatchObject({
    selectedSectionId: 'profile',
    sectionLabels: ['CALLSIGN', 'AUDIO', 'CONTROLS', 'GRAPHICS', 'DISPLAY', 'SIGNAL'],
    callsign: 'Batch9',
    editingCallsign: false,
    authority: 'DEVICE LOCAL / NO ACCOUNT',
    actionLabels: ['EDIT CALLSIGN'],
  });
  await expect(page.locator('#reforged-callsign-input')).toBeHidden();

  // A stored callsign is presented without prompting. Pointer/touch opens the
  // established input, whose allowlist and key remain shared with the Lobby.
  await clickLogicalSettingsOption(page, 6, touch);
  await expect(page.locator('#reforged-callsign-input')).toBeVisible();
  await page.locator('#reforged-callsign-input').fill('New Pilot!');
  await page.locator('#reforged-callsign-input').press('Enter');
  expect(await settingsSnapshot(page)).toMatchObject({
    callsign: 'NewPilot',
    editingCallsign: false,
  });
  expect(await page.evaluate(() => localStorage.getItem('mmr_nickname'))).toBe('NewPilot');

  await clickLogicalTab(page, 'challenges', touch);
  expect(await challengesSnapshot(page)).toMatchObject({
    nicknameReady: true,
    status: 'CALLSIGN NEWPILOT  /  SERVER-AUTHORITATIVE ENTRY',
  });
  await clickLogicalTab(page, 'settings', touch);

  // Audio actions delegate to the existing manager and preserve its four keys.
  await clickLogicalSettingsOption(page, 1, touch);
  expect(await settingsSnapshot(page)).toMatchObject({
    selectedSectionId: 'audio',
    muted: false,
    masterVolume: 0.75,
    sfxVolume: 0.5,
    musicVolume: 0.25,
  });
  await clickLogicalSettingsOption(page, 6, touch);
  await clickLogicalSettingsOption(page, 7, touch);
  expect(await settingsSnapshot(page)).toMatchObject({ muted: true, masterVolume: 1 });
  expect(
    await page.evaluate(() => ({
      muted: localStorage.getItem('mmr_audio_muted'),
      master: localStorage.getItem('mmr_audio_master'),
      sfx: localStorage.getItem('mmr_audio_sfx'),
      music: localStorage.getItem('mmr_audio_music'),
    })),
  ).toEqual({ muted: 'true', master: '1', sfx: '0.5', music: '0.25' });
  await page.keyboard.press('F2');
  await expect.poll(async () => (await settingsSnapshot(page)).muted).toBe(false);

  // Keyboard and gamepad traverse the same section controls. Both surfaces
  // remain read-only because input takeover and graphics semantics are fixed.
  await clickLogicalTab(page, 'settings', touch);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  expect(await settingsSnapshot(page)).toMatchObject({
    selectedSectionId: 'controls',
    authority: 'READ ONLY / NO MODE TOGGLE',
  });
  await queueMenuGamepadActions(page, [{ right: true }, { confirm: true }]);
  await expect.poll(async () => (await settingsSnapshot(page)).selectedSectionId).toBe('graphics');
  expect((await settingsSnapshot(page)).columns.flat()).toEqual(
    expect.arrayContaining(['FULL CURRENT EFFECTS', 'QUALITY SEMANTICS UNCHANGED']),
  );

  // Fullscreen remains a best-effort request on this physical user gesture.
  await page.evaluate(() => {
    (window as unknown as { batch9FullscreenCalls?: number }).batch9FullscreenCalls = 0;
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    const target = document.getElementById('game-container');
    if (target) {
      target.requestFullscreen = () => {
        (window as unknown as { batch9FullscreenCalls?: number }).batch9FullscreenCalls =
          ((window as unknown as { batch9FullscreenCalls?: number }).batch9FullscreenCalls ?? 0) +
          1;
        return Promise.resolve();
      };
    }
  });
  await clickLogicalSettingsOption(page, 4, touch);
  await clickLogicalSettingsOption(page, 6, touch);
  expect(
    await page.evaluate(
      () => (window as unknown as { batch9FullscreenCalls?: number }).batch9FullscreenCalls,
    ),
  ).toBe(1);

  // Signal copy and Retry Now reuse the legacy presentation and exact service action.
  await clickLogicalSettingsOption(page, 5, touch);
  expect(await settingsSnapshot(page)).toMatchObject({
    selectedSectionId: 'signal',
    connectionState: 'connected',
    actionLabels: ['SIGNAL ONLINE'],
  });
  await page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      settingsPanel: { setConnectionState(state: string): void };
      gameService: { retryConnection(): void };
    };
    (window as unknown as { batch9RetryCalls?: number }).batch9RetryCalls = 0;
    shell.gameService.retryConnection = () => {
      (window as unknown as { batch9RetryCalls?: number }).batch9RetryCalls =
        ((window as unknown as { batch9RetryCalls?: number }).batch9RetryCalls ?? 0) + 1;
    };
    shell.settingsPanel.setConnectionState('reconnecting');
  });
  expect(await settingsSnapshot(page)).toMatchObject({
    heading: 'WASTELAND SIGNAL / SIGNAL LOST // AUTO-RETRYING',
    actionLabels: ['RETRY NOW'],
  });
  await clickLogicalSettingsOption(page, 6, touch);
  expect(
    await page.evaluate(
      () => (window as unknown as { batch9RetryCalls?: number }).batch9RetryCalls,
    ),
  ).toBe(1);

  if (touch) {
    await page.screenshot({ path: testInfo.outputPath('settings-mobile-webkit.png') });
  } else if (testInfo.project.name === 'desktop-chromium') {
    await waitForRenderedFrames(page);
    await page.screenshot({ path: testInfo.outputPath('settings-signal-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await waitForRenderedFrames(page);
    await page.screenshot({ path: testInfo.outputPath('settings-signal-mobile-chromium.png') });
  }

  // Removing the device value is the only state that automatically opens the editor.
  await page.evaluate(() => {
    sessionStorage.setItem('batch9-missing-callsign', 'true');
    localStorage.removeItem('mmr_nickname');
  });
  await page.reload();
  if (testInfo.project.name !== 'desktop-chromium') await stageNonChromiumShell(page);
  await waitForActiveScene(page, 'ReforgedShellScene');
  await clickLogicalTab(page, 'settings', touch);
  expect(await settingsSnapshot(page)).toMatchObject({
    callsign: '',
    editingCallsign: true,
    heading: 'CALLSIGN REQUIRED',
  });
  await expect(page.locator('#reforged-callsign-input')).toBeVisible();
});
