import { expect, test, type Page } from '@playwright/test';

const shellAdvertised = process.env.CAPABILITY_NEW_SHELL === 'true';
const schedulesAdvertised = process.env.CAPABILITY_SCHEDULES === 'true';
const largeWorldsAdvertised = process.env.CAPABILITY_LARGE_WORLDS === 'true';
const modernArtAdvertised = process.env.CAPABILITY_MODERN_ART === 'true';
const battleRoyaleAdvertised = process.env.CAPABILITY_BATTLE_ROYALE === 'true';

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

async function reachDuelPartyReview(page: Page, touch: boolean): Promise<void> {
  await clickLogicalPlayOption(page, 0, touch);
  await clickLogicalPlayOption(page, 1, touch);
  await clickLogicalPlayOption(page, 0, touch);
  await clickLogicalPlayOption(page, 0, touch);
  await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('review');
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

async function stageNonChromiumShell(page: Page, playerId = 'staged-shell-player'): Promise<void> {
  await waitForActiveScene(page, 'LobbyScene');
  await page.evaluate(
    ({
      advertiseSchedules,
      advertiseLargeWorlds,
      advertiseModernArt,
      advertiseBattleRoyale,
      stagedPlayerId,
    }) => {
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
        playerId: stagedPlayerId,
        capabilities: {
          newShell: true,
          schedules: advertiseSchedules,
          largeWorlds: advertiseLargeWorlds,
          modernArt: advertiseModernArt,
          battleRoyale: advertiseBattleRoyale,
        },
      });
      if (advertiseSchedules) {
        manager.handleMessage({
          type: 'server:lobbyConfig',
          serverTime: 1_000_000,
          schedules: [
            'deathmatch',
            'koth',
            'gun_game',
            'last_stand',
            'kill_confirmed',
            'one_in_the_chamber',
            'core_run',
            'bounty_hunt',
          ].map((mode, index) => ({
            mode,
            mapName: [
              'Wasteland Outpost',
              'Overgrown Suburb',
              'Scrapyard',
              'Collapsed Overpass',
              'Checkpoint Zero',
              'Rusted Refinery',
            ][index % 6],
            rotationEndsAt: 1_240_000,
          })),
        });
      }
    },
    {
      advertiseSchedules: schedulesAdvertised,
      advertiseLargeWorlds: largeWorldsAdvertised,
      advertiseModernArt: modernArtAdvertised,
      advertiseBattleRoyale: battleRoyaleAdvertised,
      stagedPlayerId: playerId,
    },
  );
}

async function playRosterSnapshot(page: Page): Promise<{
  step: string;
  state: Record<string, unknown>;
  serialized: Record<string, unknown> | null;
  optionLabels: string[];
  arenaStatus: string | null;
  entryEnabled: boolean;
  queued: boolean;
  battleRoyaleQueue: Record<string, unknown> | null;
  partyState: {
    partyId: string;
    code: string;
    lifecycle: string;
    members: Array<{ nickname: string; fighterId: string; ready: boolean }>;
    slots: Array<{ status: string }>;
    botFillOffer?: { status: string; openSlotCount: number };
  } | null;
  partyError: string | null;
  reviewBottom: number | null;
  optionsTop: number | null;
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
        arenaStatus: string | null;
        entryEnabled: boolean;
        queued: boolean;
        battleRoyaleQueue: Record<string, unknown> | null;
        partyState: {
          partyId: string;
          code: string;
          lifecycle: string;
          members: Array<{ nickname: string; fighterId: string; ready: boolean }>;
          slots: Array<{ status: string }>;
          botFillOffer?: { status: string; openSlotCount: number };
        } | null;
        partyError: string | null;
        reviewBottom: number | null;
        optionsTop: number | null;
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
      getModernUiRenderState(): { enabled: boolean };
    };
    return {
      width: game?.scale.width,
      height: game?.scale.height,
      safe: scene.getSafeArea(),
      modernUi: scene.getModernUiRenderState().enabled,
    };
  });
  expect(layout.width).toBe(1280);
  expect(layout.height).toBe(720);
  expect(layout.safe?.left).toBeGreaterThanOrEqual(32);
  expect(layout.safe?.top).toBeGreaterThanOrEqual(32);
  expect(layout.safe?.right).toBeLessThanOrEqual(1248);
  expect(layout.safe?.bottom).toBeLessThanOrEqual(688);
  expect(layout.modernUi).toBe(modernArtAdvertised);

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

  const resetState = await page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      gameService: {
        getNetworkManager(): {
          connection: { setState(state: string): void };
          getArenaSchedule(): unknown;
        };
      };
    };
    const manager = shell.gameService.getNetworkManager();
    manager.connection.setState('reconnecting');
    return manager.getArenaSchedule();
  });
  expect(resetState).toBeNull();
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

test('modern UI atlas maps shell, queue, focus, and mobile-safe chrome without changing recovery', async ({
  page,
}, testInfo) => {
  test.skip(
    !shellAdvertised || !modernArtAdvertised,
    'Run with CAPABILITY_NEW_SHELL=true and CAPABILITY_MODERN_ART=true.',
  );
  await page.goto('/');
  const touch = testInfo.project.name === 'mobile-landscape';
  if (testInfo.project.name !== 'desktop-chromium') await stageNonChromiumShell(page);
  await waitForActiveScene(page, 'ReforgedShellScene');
  await waitForRenderedFrames(page);

  const initial = await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      getModernUiRenderState(): {
        enabled: boolean;
        contentFrame: string | null;
        tabFrames: (string | null)[];
      };
      getSafeArea(): { left: number; top: number; right: number; bottom: number };
    };
    return { chrome: scene.getModernUiRenderState(), safe: scene.getSafeArea() };
  });
  expect(initial.chrome).toEqual({
    enabled: true,
    contentFrame: 'ui.chrome.states/000',
    tabFrames: [
      'ui.chrome.states/006',
      'ui.chrome.states/004',
      'ui.chrome.states/004',
      'ui.chrome.states/004',
      'ui.chrome.states/004',
    ],
  });
  expect(initial.safe.left).toBeGreaterThanOrEqual(32);
  expect(initial.safe.top).toBeGreaterThanOrEqual(32);
  expect(initial.safe.right).toBeLessThanOrEqual(1248);
  expect(initial.safe.bottom).toBeLessThanOrEqual(688);

  await clickLogicalTab(page, 'fighters', touch);
  await expect.poll(() => activeTab(page)).toBe('fighters');
  const selectedFrames = await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as { getModernUiRenderState(): { tabFrames: (string | null)[] } };
    return scene.getModernUiRenderState().tabFrames;
  });
  expect(selectedFrames[1]).toBe('ui.chrome.states/006');

  await clickLogicalTab(page, 'play', touch);
  const queueIcon = await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      playRosterPanel: {
        setQueued(queued: boolean): void;
        getSnapshot(): { statusIcon: string | null };
      };
    };
    scene.playRosterPanel.setQueued(true);
    return scene.playRosterPanel.getSnapshot().statusIcon;
  });
  expect(queueIcon).toBe('queue');

  await page.screenshot({ path: testInfo.outputPath('batch-27-modern-shell.png') });
  if (testInfo.project.name === 'desktop-chromium') {
    await page.setViewportSize({ width: 844, height: 390 });
    await waitForRenderedFrames(page);
    await page.screenshot({ path: testInfo.outputPath('batch-27-modern-shell-mobile-size.png') });
  }

  await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      gameService: { getNetworkManager(): { connection: { setState(state: string): void } } };
    };
    scene.gameService.getNetworkManager().connection.setState('reconnecting');
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
  await page.addInitScript(() => {
    localStorage.setItem('mmr_fighter_selection', 'frost_wizard');
    localStorage.setItem('mmr_nickname', 'Batch11');
  });
  await page.goto('/');
  const touch = testInfo.project.name === 'mobile-landscape';
  if (testInfo.project.name !== 'desktop-chromium') await stageNonChromiumShell(page);
  await waitForActiveScene(page, 'ReforgedShellScene');

  expect(await playRosterSnapshot(page)).toMatchObject({
    step: 'format',
    state: { format: null },
    serialized: null,
    optionLabels: ['CURATED DUEL', 'WASTELAND RUMBLE', 'CREW BATTLE'],
    ...(battleRoyaleAdvertised
      ? {
          optionLabels: ['CURATED DUEL', 'WASTELAND RUMBLE', 'CREW BATTLE', 'BATTLE ROYALE'],
        }
      : {}),
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
  expect(review.serialized).toMatchObject({
    format: 'rumble',
    composition: { humanCount: 1, botCount: 2 },
    mode: 'koth',
    fighterId: 'frost_wizard',
  });
  if (schedulesAdvertised) {
    expect(review.arenaStatus).toMatch(/^ROTATES IN \d+:\d{2} {2}\/ {2}SERVER CLOCK$/);
    expect([
      'Wasteland Outpost',
      'Overgrown Suburb',
      'Scrapyard',
      'Collapsed Overpass',
      'Checkpoint Zero',
      'Rusted Refinery',
    ]).toContain(review.serialized?.arenaName);
  } else {
    expect(review.serialized?.arenaName).toBe('Overgrown Suburb');
    expect(review.arenaStatus).toBeNull();
  }
  expect(review.optionLabels).toEqual(['ENTER MATCH', 'CREATE PARTY', 'JOIN PARTY']);
  expect(review.entryEnabled).toBe(schedulesAdvertised);
  expect(review.queued).toBe(false);

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

test('Battle Royale entry projects the authoritative eight-slot wait and direct launch', async ({
  page,
}, testInfo) => {
  test.skip(
    !shellAdvertised || !battleRoyaleAdvertised,
    'Run with CAPABILITY_NEW_SHELL=true and CAPABILITY_BATTLE_ROYALE=true.',
  );
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    localStorage.setItem('mmr_fighter_selection', 'rook');
    localStorage.setItem('mmr_nickname', 'Royale41');
  });
  await page.goto('/');
  const touch = testInfo.project.name === 'mobile-landscape';
  const liveChromium = testInfo.project.name === 'desktop-chromium';
  if (!liveChromium) await stageNonChromiumShell(page, `battle-royale-${testInfo.project.name}`);
  await waitForActiveScene(page, 'ReforgedShellScene');
  expect((await playRosterSnapshot(page)).optionLabels).toContain('BATTLE ROYALE');

  if (!liveChromium) {
    await page.evaluate(() => {
      const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'ReforgedShellScene',
      ) as unknown as {
        gameService: { getNetworkManager(): { connection: { send(message: unknown): void } } };
      };
      shell.gameService.getNetworkManager().connection.send = (message: unknown): void => {
        (window as unknown as { battleRoyaleJoin?: unknown }).battleRoyaleJoin = message;
      };
    });
  }
  await clickLogicalPlayOption(page, 3, touch);

  if (!liveChromium) {
    expect(
      await page.evaluate(
        () => (window as unknown as { battleRoyaleJoin?: unknown }).battleRoyaleJoin,
      ),
    ).toEqual({
      type: 'client:joinBattleRoyale',
      nickname: 'Royale41',
      fighterId: 'rook',
    });
    await page.evaluate(() => {
      const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'ReforgedShellScene',
      ) as unknown as {
        gameService: { getNetworkManager(): { handleMessage(message: unknown): void } };
      };
      shell.gameService.getNetworkManager().handleMessage({
        type: 'server:matchmakingStatus',
        status: 'queued',
        matchKind: 'battle_royale',
        groupSize: 1,
        maxGroupSize: 8,
        botFillCount: 7,
        launchInMs: 15_000,
      });
    });
  }

  await expect.poll(async () => (await playRosterSnapshot(page)).queued).toBe(true);
  expect(await playRosterSnapshot(page)).toMatchObject({
    optionLabels: ['CANCEL BATTLE ROYALE'],
    battleRoyaleQueue: {
      matchKind: 'battle_royale',
      groupSize: 1,
      maxGroupSize: 8,
      botFillCount: 7,
    },
  });

  if (!liveChromium) {
    await page.evaluate(() => {
      const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'ReforgedShellScene',
      ) as unknown as {
        gameService: { getNetworkManager(): { handleMessage(message: unknown): void } };
      };
      shell.gameService.getNetworkManager().handleMessage({
        type: 'server:matchFound',
        matchId: 'battle-royale-41',
        opponents: Array.from({ length: 7 }, (_, index) => ({
          id: `br-opponent-${index}`,
          nickname: `Opponent${index}`,
        })),
        mapName: 'Shatterlands',
        gameMode: 'deathmatch',
        matchKind: 'battle_royale',
        battleRoyale: { participantCount: 8, humanCount: 1, botCount: 7 },
      });
    });
  }
  await waitForActiveScene(page, 'GameScene');
  const arena = await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      getReforgedEnvironmentState(): { families: readonly string[] } | null;
      getMinimapRenderState(): {
        worldBounds: { width: number; height: number };
        regions: readonly { id: string; displayName: string; biome: string }[];
        containers: readonly { id: string; col: number; row: number }[];
        landmarks: readonly { id: string; label?: string }[];
        interactive: false;
      } | null;
    };
    return {
      environment: scene.getReforgedEnvironmentState(),
      minimap: scene.getMinimapRenderState(),
    };
  });
  expect(arena.environment?.families).toEqual([
    'industrial',
    'irradiated',
    'overgrown',
    'wasteland',
  ]);
  expect(arena.minimap).toMatchObject({
    worldBounds: { width: 2688, height: 1632 },
    regions: [
      { id: 'dust-basin', displayName: 'DUST BASIN', biome: 'wasteland' },
      { id: 'greenward', displayName: 'GREENWARD', biome: 'overgrown' },
      { id: 'ironworks', displayName: 'IRONWORKS', biome: 'industrial' },
      { id: 'glass-wastes', displayName: 'GLASS WASTES', biome: 'irradiated' },
    ],
    interactive: false,
  });
  expect(arena.minimap?.containers).toHaveLength(16);
  expect(new Set(arena.minimap?.containers.map(({ id }) => id)).size).toBe(16);
  expect(arena.minimap?.landmarks.map(({ label }) => label).sort()).toEqual([
    'GLASSFALL CRATER',
    'REDLINE FOUNDRY',
    'SUNKEN RELAY',
    'VINEBOUND HOMES',
  ]);
});

test('Battle Royale projects authoritative rarity and launcher flight into the scene', async ({
  page,
}, testInfo) => {
  test.skip(
    !shellAdvertised || !battleRoyaleAdvertised,
    'Run with CAPABILITY_NEW_SHELL=true and CAPABILITY_BATTLE_ROYALE=true.',
  );
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    localStorage.setItem('mmr_fighter_selection', 'rook');
    localStorage.setItem('mmr_nickname', 'Rarity42');
  });
  await page.goto('/');
  const liveChromium = testInfo.project.name === 'desktop-chromium';
  if (!liveChromium) await stageNonChromiumShell(page, `battle-weapon-${testInfo.project.name}`);
  await waitForActiveScene(page, 'ReforgedShellScene');

  const localId = await page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      gameService: {
        getNetworkManager(): {
          getPlayerId(): string | null;
          handleMessage(message: unknown): void;
        };
      };
    };
    const manager = shell.gameService.getNetworkManager();
    const playerId = manager.getPlayerId();
    if (!playerId) throw new Error('missing local Battle Royale player');
    manager.handleMessage({
      type: 'server:matchFound',
      matchId: 'battle-weapon-42',
      opponents: Array.from({ length: 7 }, (_, index) => ({
        id: `battle-weapon-opponent-${index}`,
        nickname: `Opponent${index}`,
      })),
      mapName: 'Wasteland Outpost',
      gameMode: 'deathmatch',
      matchKind: 'battle_royale',
      battleRoyale: { participantCount: 8, humanCount: 1, botCount: 7 },
    });
    return playerId;
  });
  await waitForActiveScene(page, 'GameScene');

  await page.evaluate((playerId) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      gameService: { getNetworkManager(): { handleMessage(message: unknown): void } };
    };
    const instance = {
      instanceId: 'weapon:browser:42',
      weaponId: 'launcher',
      rarity: 'epic',
    };
    scene.gameService.getNetworkManager().handleMessage({
      type: 'server:gameState',
      tick: 42,
      phase: 'active',
      countdownTimer: 0,
      matchTimer: 120,
      players: [
        {
          id: playerId,
          characterId: 'rook',
          position: { x: 320, y: 256 },
          velocity: { x: 0, y: 0 },
          aimAngle: 0,
          health: 100,
          maxHealth: 100,
          armor: 0,
          ammo: 30,
          weaponId: 'launcher',
          weaponInstance: instance,
          specialAmmo: 1,
          specialReserve: 2,
          grenades: 3,
          isReloading: false,
          isSprinting: false,
          stamina: 3,
          isDead: false,
          respawnTimer: 0,
          invulnerableTimer: 0,
          lastProcessedInput: 0,
          score: 0,
          deaths: 0,
          nickname: 'Rarity42',
          abilityActiveSeconds: 0,
          abilityCooldownSeconds: 0,
          frozenTimer: 0,
          secondWindTimer: 0,
        },
      ],
      grenades: [],
      axes: [],
      rockets: [
        {
          id: 'rocket-browser-42',
          position: { x: 352, y: 256 },
          velocity: { x: 420, y: 0 },
          shooterId: playerId,
          angle: 0,
          distanceTraveled: 32,
          weaponInstance: instance,
        },
      ],
      bulletTrails: [],
      barrelExplosions: [],
      contract: {
        id: 'hot_shot',
        title: 'HOT SHOT',
        objective: 'LAND 8 ATTACKS',
        target: 8,
        players: [],
      },
      punches: [],
      pickups: [],
      activeMutators: [],
      isOvertime: false,
    });
  }, localId);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
          'GameScene',
        ) as unknown as {
          gameService: {
            getNetworkManager(): {
              getLocalPlayerState(): {
                weaponId: string;
                weaponInstance?: { rarity: string };
              } | null;
              getActiveRockets(): unknown[];
            };
          };
          hud: {
            specialWeaponLabel: Phaser.GameObjects.Text;
          };
          rocketRenderer: { sprites: Map<string, unknown> };
        };
        const manager = scene.gameService.getNetworkManager();
        return {
          weaponId: manager.getLocalPlayerState()?.weaponId,
          rarity: manager.getLocalPlayerState()?.weaponInstance?.rarity,
          rockets: manager.getActiveRockets().length,
          renderedRockets: scene.rocketRenderer.sprites.size,
          label: scene.hud.specialWeaponLabel.text,
          labelVisible: scene.hud.specialWeaponLabel.visible,
          labelColor: scene.hud.specialWeaponLabel.style.color,
        };
      }),
    )
    .toEqual({
      weaponId: 'launcher',
      rarity: 'epic',
      rockets: 1,
      renderedRockets: 1,
      label: '◆ EPIC LAUNCHER',
      labelVisible: true,
      labelColor: '#a884f3',
    });

  await waitForRenderedFrames(page);
  if (liveChromium) {
    await page.screenshot({ path: testInfo.outputPath('battle-weapon-rarity-42.png') });
  }
});

test('Battle Royale projects one-slot inventory, loot, and contextual reload input', async ({
  page,
}, testInfo) => {
  test.skip(
    !shellAdvertised || !battleRoyaleAdvertised,
    'Run with CAPABILITY_NEW_SHELL=true and CAPABILITY_BATTLE_ROYALE=true.',
  );
  test.setTimeout(60_000);
  const gamepadProject = testInfo.project.name === 'desktop-firefox';
  await page.addInitScript((mockGamepad) => {
    if (!mockGamepad) return;
    const state = {
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    const pad = {
      id: 'Batch 43 Standard Gamepad',
      index: 0,
      connected: true,
      mapping: 'standard',
      get axes() {
        return state.axes;
      },
      get buttons() {
        return state.buttons;
      },
      timestamp: 0,
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad],
    });
    (window as unknown as { __battleInventoryGamepad?: typeof state }).__battleInventoryGamepad =
      state;
  }, gamepadProject);
  await page.addInitScript(() => {
    localStorage.setItem('mmr_fighter_selection', 'rook');
    localStorage.setItem('mmr_nickname', 'Inventory43');
  });
  await page.goto('/');
  const liveChromium = testInfo.project.name === 'desktop-chromium';
  if (!liveChromium) await stageNonChromiumShell(page, `battle-inventory-${testInfo.project.name}`);
  await waitForActiveScene(page, 'ReforgedShellScene');

  const localId = await page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      gameService: {
        getNetworkManager(): {
          getPlayerId(): string | null;
          handleMessage(message: unknown): void;
        };
      };
    };
    const manager = shell.gameService.getNetworkManager();
    const playerId = manager.getPlayerId();
    if (!playerId) throw new Error('missing local Battle Royale inventory player');
    manager.handleMessage({
      type: 'server:matchFound',
      matchId: 'battle-inventory-43',
      opponents: Array.from({ length: 7 }, (_, index) => ({
        id: `battle-inventory-opponent-${index}`,
        nickname: `Opponent${index}`,
      })),
      mapName: 'Wasteland Outpost',
      gameMode: 'deathmatch',
      matchKind: 'battle_royale',
      battleRoyale: { participantCount: 8, humanCount: 1, botCount: 7 },
    });
    return playerId;
  });
  await waitForActiveScene(page, 'GameScene');

  await page.evaluate((playerId) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      gameService: {
        sendInput(input: { reload: boolean; firePressed: boolean }): void;
        getNetworkManager(): { handleMessage(message: unknown): void };
      };
    };
    const captured: Array<{ reload: boolean; firePressed: boolean }> = [];
    (window as unknown as { __battleInventoryInputs?: typeof captured }).__battleInventoryInputs =
      captured;
    scene.gameService.sendInput = (input) =>
      captured.push({ reload: input.reload, firePressed: input.firePressed });
    const equipped = { instanceId: 'weapon:held:43', weaponId: 'pistol', rarity: 'rare' };
    const candidate = { instanceId: 'weapon:ground:43', weaponId: 'shotgun', rarity: 'epic' };
    scene.gameService.getNetworkManager().handleMessage({
      type: 'server:gameState',
      tick: 43,
      phase: 'active',
      countdownTimer: 0,
      matchTimer: 120,
      players: [
        {
          id: playerId,
          characterId: 'rook',
          position: { x: 320, y: 256 },
          velocity: { x: 0, y: 0 },
          aimAngle: 0,
          health: 100,
          maxHealth: 100,
          armor: 0,
          ammo: 7,
          weaponId: 'pistol',
          weaponInstance: equipped,
          battleRoyaleInventory: {
            equipped,
            loadedAmmo: 7,
            reserveAmmo: 29,
            swapCandidateId: 'drop-browser-43',
          },
          specialAmmo: 7,
          specialReserve: 29,
          grenades: 3,
          isReloading: false,
          isSprinting: false,
          stamina: 3,
          isDead: false,
          respawnTimer: 0,
          invulnerableTimer: 0,
          lastProcessedInput: 0,
          score: 0,
          deaths: 0,
          nickname: 'Inventory43',
          abilityActiveSeconds: 0,
          abilityCooldownSeconds: 0,
          frozenTimer: 0,
          secondWindTimer: 0,
        },
      ],
      grenades: [],
      axes: [],
      droppedWeapons: [
        {
          id: 'drop-browser-43',
          position: { x: 336, y: 256 },
          weaponInstance: candidate,
          loadedAmmo: 2,
          lootSourceId: 'br-container:browser-44',
        },
      ],
      battleRoyaleContainers: [
        {
          id: 'br-container:browser-44',
          position: { x: 420, y: 256 },
          tile: { col: 8, row: 5 },
          status: 'intact',
        },
      ],
      battleRoyaleSupplyBundles: [
        {
          id: 'br-supply:browser-44',
          position: { x: 336, y: 256 },
          reserveAmmo: 18,
          sustainType: 'armor',
          lootSourceId: 'br-container:browser-44',
          source: 'container',
        },
      ],
      bulletTrails: [],
      barrelExplosions: [],
      contract: {
        id: 'hot_shot',
        title: 'HOT SHOT',
        objective: 'LAND 8 ATTACKS',
        target: 8,
        players: [],
      },
      punches: [],
      pickups: [],
      activeMutators: [],
      isOvertime: false,
    });
    scene.gameService.getNetworkManager().handleMessage({
      type: 'server:matchStart',
      matchEndsInMs: 120_000,
    });
  }, localId);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
          'GameScene',
        ) as unknown as {
          gameService: {
            getNetworkManager(): {
              getLocalPlayerState(): {
                battleRoyaleInventory?: { loadedAmmo: number; reserveAmmo: number };
              } | null;
              getDroppedWeapons(): unknown[];
              getBattleRoyaleContainers(): unknown[];
              getBattleRoyaleSupplyBundles(): unknown[];
            };
          };
          hud: { weaponSwapLabel: Phaser.GameObjects.Text };
          droppedWeaponRenderer: {
            sprites: Map<
              string,
              {
                comparison: Phaser.GameObjects.Text;
                aura: Phaser.GameObjects.Graphics;
              }
            >;
          };
          battleRoyaleLootRenderer: {
            containers: Map<string, { label: Phaser.GameObjects.Text }>;
            supplies: Map<string, { label: Phaser.GameObjects.Text }>;
          };
          inputManager: {
            touchInput: {
              reloadButton: Phaser.GameObjects.Arc;
              reloadButtonText: Phaser.GameObjects.Text;
            };
          };
        };
        const manager = scene.gameService.getNetworkManager();
        return {
          inventory: manager.getLocalPlayerState()?.battleRoyaleInventory,
          drops: manager.getDroppedWeapons().length,
          renderedDrops: scene.droppedWeaponRenderer.sprites.size,
          comparison: scene.droppedWeaponRenderer.sprites.get('drop-browser-43')?.comparison.text,
          auraVisible: scene.droppedWeaponRenderer.sprites.get('drop-browser-43')?.aura.visible,
          containers: manager.getBattleRoyaleContainers().length,
          supplies: manager.getBattleRoyaleSupplyBundles().length,
          renderedContainers: scene.battleRoyaleLootRenderer.containers.size,
          renderedSupplies: scene.battleRoyaleLootRenderer.supplies.size,
          containerLabel:
            scene.battleRoyaleLootRenderer.containers.get('br-container:browser-44')?.label.text,
          supplyLabel:
            scene.battleRoyaleLootRenderer.supplies.get('br-supply:browser-44')?.label.text,
          swapLabel: scene.hud.weaponSwapLabel.text,
          swapVisible: scene.hud.weaponSwapLabel.visible,
          touchReloadVisible: scene.inputManager.touchInput.reloadButton.visible,
          touchReloadLabel: scene.inputManager.touchInput.reloadButtonText.text,
        };
      }),
    )
    .toMatchObject({
      inventory: { loadedAmmo: 7, reserveAmmo: 29 },
      drops: 1,
      renderedDrops: 1,
      comparison: '▲',
      auraVisible: true,
      containers: 1,
      supplies: 1,
      renderedContainers: 1,
      renderedSupplies: 1,
      containerLabel: 'ATTACK',
      supplyLabel: '+18 · AR',
      swapLabel: 'RELOAD: SWAP FOR EPIC SHOTGUN · 2',
      swapVisible: true,
      touchReloadVisible: testInfo.project.name === 'mobile-landscape',
      touchReloadLabel: 'RELOAD',
    });

  if (testInfo.project.name === 'mobile-landscape') {
    const center = await page.evaluate(() => {
      const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'GameScene',
      ) as unknown as {
        inputManager: { touchInput: { reloadButton: Phaser.GameObjects.Arc } };
        input: Phaser.Input.InputPlugin;
        scale: Phaser.Scale.ScaleManager;
      };
      scene.input.once('pointerdown', (pointer: Phaser.Input.Pointer) => {
        (
          window as unknown as {
            __battleInventoryTouch?: { x: number; y: number };
          }
        ).__battleInventoryTouch = { x: pointer.x, y: pointer.y };
      });
      return {
        x: scene.inputManager.touchInput.reloadButton.x,
        y: scene.inputManager.touchInput.reloadButton.y,
        logicalWidth: scene.scale.width,
        logicalHeight: scene.scale.height,
      };
    });
    const canvas = await page.locator('canvas').boundingBox();
    if (!canvas) throw new Error('missing gameplay canvas');
    await page.touchscreen.tap(
      canvas.x + (center.x / center.logicalWidth) * canvas.width,
      canvas.y + (center.y / center.logicalHeight) * canvas.height,
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __battleInventoryInputs?: Array<{ reload: boolean }>;
              }
            ).__battleInventoryInputs?.filter(({ reload }) => reload).length ?? 0,
        ),
      )
      .toBe(1);
    const deliveredPointer = await page.evaluate(
      () =>
        (
          window as unknown as {
            __battleInventoryTouch?: { x: number; y: number };
          }
        ).__battleInventoryTouch,
    );
    expect(deliveredPointer).toBeDefined();
    expect(Math.abs(deliveredPointer!.x - center.x)).toBeLessThan(2);
    expect(Math.abs(deliveredPointer!.y - center.y)).toBeLessThan(2);
  } else if (gamepadProject) {
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __battleInventoryGamepad: {
            buttons: Array<{ pressed: boolean; value: number }>;
          };
        }
      ).__battleInventoryGamepad;
      state.buttons[2] = { pressed: true, value: 1 };
    });
  } else {
    const canvas = await page.locator('canvas').boundingBox();
    if (!canvas) throw new Error('missing gameplay canvas');
    await page.mouse.move(canvas.x + canvas.width * 0.75, canvas.y + canvas.height * 0.5);
    await page.mouse.down();
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __battleInventoryInputs?: Array<{ firePressed: boolean }>;
              }
            ).__battleInventoryInputs?.filter(({ firePressed }) => firePressed).length ?? 0,
        ),
      )
      .toBe(1);
    await page.keyboard.down('r');
    await page.waitForTimeout(80);
    await page.keyboard.up('r');
  }

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __battleInventoryInputs?: Array<{ reload: boolean }>;
            }
          ).__battleInventoryInputs?.filter(({ reload }) => reload).length ?? 0,
      ),
    )
    .toBe(1);
  await waitForRenderedFrames(page);
  if (liveChromium) {
    await page.screenshot({ path: testInfo.outputPath('battle-inventory-43.png') });
  }
});

test('Battle Royale projects the authoritative safe zone into world, minimap, and tactical map', async ({
  page,
}, testInfo) => {
  test.skip(
    !shellAdvertised || !battleRoyaleAdvertised,
    'Run with CAPABILITY_NEW_SHELL=true and CAPABILITY_BATTLE_ROYALE=true.',
  );
  test.setTimeout(60_000);
  const gamepadProject = testInfo.project.name === 'desktop-firefox';
  await page.addInitScript((mockGamepad) => {
    if (!mockGamepad) return;
    const state = {
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          id: 'Batch 46 Standard Gamepad',
          index: 0,
          connected: true,
          mapping: 'standard',
          axes: state.axes,
          buttons: state.buttons,
          timestamp: 0,
        },
      ],
    });
    (window as unknown as { __battleZoneGamepad?: typeof state }).__battleZoneGamepad = state;
  }, gamepadProject);
  await page.addInitScript(() => {
    localStorage.setItem('mmr_fighter_selection', 'rook');
    localStorage.setItem('mmr_nickname', 'Circle46');
  });
  await page.goto('/');
  if (testInfo.project.name !== 'desktop-chromium') {
    await stageNonChromiumShell(page, `battle-zone-${testInfo.project.name}`);
  }
  await waitForActiveScene(page, 'ReforgedShellScene');
  const localId = await page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      gameService: {
        getNetworkManager(): {
          getPlayerId(): string | null;
          handleMessage(message: unknown): void;
        };
      };
    };
    const manager = shell.gameService.getNetworkManager();
    const playerId = manager.getPlayerId();
    if (!playerId) throw new Error('missing local Battle Royale zone player');
    manager.handleMessage({
      type: 'server:matchFound',
      matchId: 'battle-zone-46',
      opponents: Array.from({ length: 7 }, (_, index) => ({
        id: index === 0 ? 'hidden-rival-46' : `hidden-rival-46-${index}`,
        nickname: index === 0 ? 'Hidden Rival' : `Hidden Rival ${index}`,
      })),
      mapName: 'Shatterlands',
      gameMode: 'deathmatch',
      matchKind: 'battle_royale',
      battleRoyale: { participantCount: 8, humanCount: 1, botCount: 7 },
    });
    return playerId;
  });
  await waitForActiveScene(page, 'GameScene');

  await page.evaluate((playerId) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      gameService: { getNetworkManager(): { handleMessage(message: unknown): void } };
      tacticalMapRenderer: {
        launcher: Phaser.GameObjects.Rectangle;
      };
    };
    const player = (id: string, x: number, y: number, nickname: string) => ({
      id,
      characterId: 'rook',
      position: { x, y },
      velocity: { x: 0, y: 0 },
      aimAngle: 0,
      health: 100,
      maxHealth: 100,
      armor: 0,
      ammo: 0,
      weaponId: 'punch',
      battleRoyaleInventory: { equipped: null, loadedAmmo: 0, reserveAmmo: 0 },
      specialAmmo: 0,
      specialReserve: 0,
      grenades: 3,
      isReloading: false,
      isSprinting: false,
      stamina: 3,
      isDead: false,
      respawnTimer: 0,
      invulnerableTimer: 0,
      lastProcessedInput: 0,
      score: 0,
      deaths: 0,
      nickname,
      abilityActiveSeconds: 0,
      abilityCooldownSeconds: 0,
      frozenTimer: 0,
      secondWindTimer: 0,
    });
    scene.gameService.getNetworkManager().handleMessage({
      type: 'server:gameState',
      tick: 46,
      phase: 'active',
      countdownTimer: 0,
      matchTimer: 88,
      players: [
        player(playerId, 320, 256, 'Circle46'),
        player('hidden-rival-46', 2200, 1200, 'Hidden Rival'),
      ],
      grenades: [],
      axes: [],
      bulletTrails: [],
      barrelExplosions: [],
      contract: {
        id: 'hot_shot',
        title: 'HOT SHOT',
        objective: 'LAND 8 ATTACKS',
        target: 8,
        players: [],
      },
      punches: [],
      pickups: [],
      activeMutators: [],
      isOvertime: false,
      battleRoyaleSafeZone: {
        phaseIndex: 3,
        phase: 'closing',
        center: { x: 1344, y: 816 },
        radius: 560,
        nextCenter: { x: 1180, y: 760 },
        nextRadius: 300,
        phaseSecondsRemaining: 8.4,
        damagePerPulse: 4,
      },
    });
  }, localId);

  if (gamepadProject) {
    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __battleZoneGamepad?: { buttons: Array<{ pressed: boolean; value: number }> };
        }
      ).__battleZoneGamepad;
      if (!state) throw new Error('missing Battle Royale zone gamepad');
      state.buttons[12] = { pressed: true, value: 1 };
    });
    await page.waitForTimeout(120);
    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __battleZoneGamepad?: { buttons: Array<{ pressed: boolean; value: number }> };
        }
      ).__battleZoneGamepad;
      if (state) state.buttons[12] = { pressed: false, value: 0 };
    });
  } else {
    await page.evaluate(() => {
      const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'GameScene',
      ) as unknown as { tacticalMapRenderer: { launcher: Phaser.GameObjects.Rectangle } };
      scene.tacticalMapRenderer.launcher.emit('pointerup');
    });
  }

  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
          'GameScene',
        ) as unknown as {
          getBattleRoyaleSafeZoneRenderState(): Record<string, unknown> | null;
          getTacticalMapRenderState(): Record<string, unknown> | null;
          getMinimapRenderState(): { safeZone: { phase: string } | null } | null;
        };
        return {
          world: scene.getBattleRoyaleSafeZoneRenderState(),
          tactical: scene.getTacticalMapRenderState(),
          minimapPhase: scene.getMinimapRenderState()?.safeZone?.phase,
        };
      }),
    )
    .toMatchObject({
      world: { visible: true, outside: true, status: 'OUTSIDE SAFE ZONE · 4 DAMAGE' },
      tactical: {
        open: true,
        regions: 4,
        containers: 16,
        safeZonePhase: 'closing',
        rivalMarkers: 0,
      },
      minimapPhase: 'closing',
    });

  await page.keyboard.press('m');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
          'GameScene',
        ) as unknown as { getTacticalMapRenderState(): { open: boolean } | null };
        return scene.getTacticalMapRenderState()?.open;
      }),
    )
    .toBe(false);
});

test('Battle Royale spectator cycles authoritative targets and keeps the tactical focus', async ({
  page,
}, testInfo) => {
  test.skip(
    !shellAdvertised || !battleRoyaleAdvertised,
    'Run with CAPABILITY_NEW_SHELL=true and CAPABILITY_BATTLE_ROYALE=true.',
  );
  test.setTimeout(60_000);
  const gamepad = testInfo.project.name === 'desktop-firefox';
  const touch = testInfo.project.name === 'mobile-landscape';
  await page.addInitScript((mockGamepad) => {
    if (!mockGamepad) return;
    const state = {
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          id: 'Batch 48 Standard Gamepad',
          index: 0,
          connected: true,
          mapping: 'standard',
          axes: state.axes,
          buttons: state.buttons,
          timestamp: 0,
        },
      ],
    });
    (window as unknown as { __battleSpectatorGamepad?: typeof state }).__battleSpectatorGamepad =
      state;
  }, gamepad);
  await page.addInitScript(() => {
    localStorage.setItem('mmr_fighter_selection', 'rook');
    localStorage.setItem('mmr_nickname', 'Watcher48');
  });
  await page.goto('/');
  if (testInfo.project.name !== 'desktop-chromium') {
    await stageNonChromiumShell(page, `battle-spectator-${testInfo.project.name}`);
  }
  await waitForActiveScene(page, 'ReforgedShellScene');
  const localId = await page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      gameService: {
        getNetworkManager(): {
          getPlayerId(): string | null;
          handleMessage(message: unknown): void;
        };
      };
    };
    const manager = shell.gameService.getNetworkManager();
    const playerId = manager.getPlayerId();
    if (!playerId) throw new Error('missing local Battle Royale spectator');
    manager.handleMessage({
      type: 'server:matchFound',
      matchId: 'battle-spectator-48',
      opponents: [
        { id: 'alpha-48', nickname: 'Alpha' },
        { id: 'bravo-48', nickname: 'Bravo' },
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `waiting-48-${index}`,
          nickname: `Waiting ${index}`,
        })),
      ],
      mapName: 'Shatterlands',
      gameMode: 'deathmatch',
      matchKind: 'battle_royale',
      battleRoyale: { participantCount: 8, humanCount: 1, botCount: 7 },
    });
    return playerId;
  });
  await waitForActiveScene(page, 'GameScene');

  await page.evaluate((playerId) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      gameService: {
        getNetworkManager(): { handleMessage(message: unknown): void };
        leaveBattleRoyaleSpectator(): void;
      };
    };
    const player = (id: string, x: number, y: number, nickname: string, isDead = false) => ({
      id,
      characterId: 'rook',
      position: { x, y },
      velocity: { x: 0, y: 0 },
      aimAngle: 0,
      health: isDead ? 0 : 100,
      maxHealth: 100,
      armor: 0,
      ammo: 0,
      weaponId: 'punch',
      battleRoyaleInventory: { equipped: null, loadedAmmo: 0, reserveAmmo: 0 },
      specialAmmo: 0,
      specialReserve: 0,
      grenades: 0,
      isReloading: false,
      isSprinting: false,
      stamina: 3,
      isDead,
      respawnTimer: 0,
      invulnerableTimer: 0,
      lastProcessedInput: 0,
      score: 0,
      deaths: isDead ? 1 : 0,
      nickname,
      abilityActiveSeconds: 0,
      abilityCooldownSeconds: 0,
      frozenTimer: 0,
      secondWindTimer: 0,
    });
    scene.gameService.getNetworkManager().handleMessage({
      type: 'server:gameState',
      tick: 48,
      phase: 'active',
      countdownTimer: 0,
      matchTimer: 70,
      players: [
        player(playerId, 320, 256, 'Watcher48', true),
        player('alpha-48', 900, 620, 'Alpha'),
        player('bravo-48', 1900, 1080, 'Bravo'),
      ],
      grenades: [],
      axes: [],
      bulletTrails: [],
      barrelExplosions: [],
      contract: {
        id: 'hot_shot',
        title: 'HOT SHOT',
        objective: 'LAND 8 ATTACKS',
        target: 8,
        players: [],
      },
      punches: [],
      pickups: [],
      activeMutators: [],
      isOvertime: false,
      battleRoyaleSpectator: {
        livingPlayerIds: ['alpha-48', 'bravo-48'],
        aliveCount: 2,
        standings: [
          {
            playerId: 'alpha-48',
            placement: 2,
            status: 'alive',
            eliminatedBy: null,
            eliminationCause: null,
          },
          {
            playerId: 'bravo-48',
            placement: 2,
            status: 'alive',
            eliminatedBy: null,
            eliminationCause: null,
          },
          {
            playerId,
            placement: 3,
            status: 'eliminated',
            eliminatedBy: 'bravo-48',
            eliminationCause: 'combat',
          },
        ],
      },
      battleRoyaleSafeZone: {
        phaseIndex: 2,
        phase: 'hold',
        center: { x: 1400, y: 820 },
        radius: 760,
        nextCenter: { x: 1600, y: 900 },
        nextRadius: 500,
        phaseSecondsRemaining: 10,
        damagePerPulse: 2,
      },
    });
    (window as unknown as { __spectatorResultsRequested?: boolean }).__spectatorResultsRequested =
      false;
    scene.gameService.leaveBattleRoyaleSpectator = () => {
      (window as unknown as { __spectatorResultsRequested?: boolean }).__spectatorResultsRequested =
        true;
    };
  }, localId);
  await waitForRenderedFrames(page);

  if (gamepad) {
    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __battleSpectatorGamepad?: { buttons: Array<{ pressed: boolean; value: number }> };
        }
      ).__battleSpectatorGamepad;
      if (!state) throw new Error('missing Batch 48 gamepad');
      state.buttons[15] = { pressed: true, value: 1 };
    });
    await page.waitForTimeout(120);
    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __battleSpectatorGamepad?: { buttons: Array<{ pressed: boolean; value: number }> };
        }
      ).__battleSpectatorGamepad;
      if (state) state.buttons[15] = { pressed: false, value: 0 };
    });
  } else if (touch) {
    await page.evaluate(() => {
      const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'GameScene',
      ) as unknown as {
        battleRoyaleSpectatorOverlay: { next: Phaser.GameObjects.Text };
      };
      scene.battleRoyaleSpectatorOverlay.next.emit('pointerup');
    });
  } else {
    await page.keyboard.press('E');
  }
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      tacticalMapRenderer: { launcher: Phaser.GameObjects.Rectangle };
    };
    scene.tacticalMapRenderer.launcher.emit('pointerup');
  });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
          'GameScene',
        ) as unknown as {
          getBattleRoyaleSpectatorRenderState(): {
            active: boolean;
            targetId: string | null;
          } | null;
          getTacticalMapRenderState(): {
            open: boolean;
            localPoint: unknown;
            rivalMarkers: number;
          } | null;
          getCameraController(): {
            getState(): { target: { kind: string; position: { x: number; y: number } } | null };
          } | null;
        };
        return {
          spectator: scene.getBattleRoyaleSpectatorRenderState(),
          tactical: scene.getTacticalMapRenderState(),
          camera: scene.getCameraController()?.getState().target,
        };
      }),
    )
    .toMatchObject({
      spectator: { active: true, targetId: 'bravo-48' },
      tactical: { open: true, localPoint: expect.any(Object), rivalMarkers: 0 },
      camera: { kind: 'spectator', position: { x: 1900, y: 1080 } },
    });
  await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      tacticalMapRenderer: { launcher: Phaser.GameObjects.Rectangle };
      battleRoyaleSpectatorOverlay: { results: Phaser.GameObjects.Text };
    };
    scene.tacticalMapRenderer.launcher.emit('pointerup');
    scene.battleRoyaleSpectatorOverlay.results.emit('pointerup');
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __spectatorResultsRequested?: boolean })
            .__spectatorResultsRequested ?? false,
      ),
    )
    .toBe(true);
  if (testInfo.project.name === 'desktop-chromium') {
    await page.screenshot({ path: testInfo.outputPath('battle-spectator-48.png') });
  }
});

test('Play submits one server-scheduled general intent and recovery clears queued entry', async ({
  page,
}, testInfo) => {
  test.skip(
    !shellAdvertised || !schedulesAdvertised,
    'Run with both Reforged shell and schedule capabilities for generalized entry.',
  );
  await page.addInitScript(() => {
    localStorage.setItem('mmr_nickname', 'Intent11');
    localStorage.setItem('mmr_fighter_selection', 'rook');
  });
  await page.goto('/');
  const touch = testInfo.project.name === 'mobile-landscape';
  const liveChromium = testInfo.project.name === 'desktop-chromium';
  if (!liveChromium) await stageNonChromiumShell(page);
  await waitForActiveScene(page, 'ReforgedShellScene');

  await page.evaluate((forwardToServer) => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      gameService: {
        getNetworkManager(): { connection: { send(message: unknown): void } };
      };
    };
    const connection = shell.gameService.getNetworkManager().connection;
    const send = connection.send.bind(connection);
    connection.send = (message: unknown): void => {
      (window as unknown as { batch11Intent?: unknown }).batch11Intent = message;
      if (forwardToServer) send(message);
    };
  }, liveChromium);

  await clickLogicalPlayOption(page, 0, touch);
  await clickLogicalPlayOption(page, 0, touch);
  await clickLogicalPlayOption(page, 1, touch);
  await clickLogicalPlayOption(page, 0, touch);
  await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('review');
  expect((await playRosterSnapshot(page)).optionLabels).toEqual([
    'ENTER MATCH',
    'CREATE PARTY',
    'JOIN PARTY',
  ]);
  await clickLogicalPlayOption(page, 0, touch);

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { batch11Intent?: { type?: string } }).batch11Intent?.type ?? null,
      ),
    )
    .toBe('client:submitMatchIntent');
  const submitted = await page.evaluate(
    () => (window as unknown as { batch11Intent?: Record<string, unknown> }).batch11Intent,
  );
  expect(submitted).toMatchObject({
    type: 'client:submitMatchIntent',
    nickname: 'Intent11',
    intent: {
      format: 'duel',
      composition: { humanCount: 1, botCount: 1 },
      mode: 'koth',
      fighterId: 'rook',
      scheduledArena: { mode: 'koth' },
    },
  });

  if (liveChromium) {
    await waitForActiveScene(page, 'GameScene');
    expect(
      await page.evaluate(() => {
        const game = (window as unknown as { game?: Phaser.Game }).game;
        return game?.scene.getScenes(true).map((scene) => scene.scene.key) ?? [];
      }),
    ).not.toContain('CharacterSelectScene');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const game = (window as unknown as { game?: Phaser.Game }).game;
          return [game?.scale.width, game?.scale.height];
        }),
      )
      .toEqual([largeWorldsAdvertised ? 1280 : 960, 720]);
    return;
  }

  await page.evaluate(() => {
    const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ReforgedShellScene',
    ) as unknown as {
      gameService: {
        getNetworkManager(): {
          connection: { setState(state: string): void };
          handleMessage(message: unknown): void;
        };
      };
    };
    const manager = shell.gameService.getNetworkManager();
    manager.handleMessage({
      type: 'server:matchmakingStatus',
      status: 'queued',
      matchKind: 'duel',
      groupSize: 1,
      maxGroupSize: 1,
      playersOnline: 1,
    });
  });
  await expect.poll(async () => (await playRosterSnapshot(page)).queued).toBe(true);
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

test('validated standard launch bypasses Draft and Character Select across pointer, keyboard, gamepad, and touch', async ({
  page,
}, testInfo) => {
  test.skip(
    !shellAdvertised || !schedulesAdvertised,
    'Run with both Reforged shell and schedule capabilities for direct launch.',
  );
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    localStorage.setItem('mmr_nickname', 'Direct16');
    localStorage.setItem('mmr_fighter_selection', 'rook');
  });
  await page.goto('/');
  const liveChromium = testInfo.project.name === 'desktop-chromium';
  const touch = testInfo.project.name === 'mobile-landscape';
  if (!liveChromium) await stageNonChromiumShell(page, 'direct-player-16');
  await waitForActiveScene(page, 'ReforgedShellScene');

  // Pointer/touch enters Play; an external keyboard chooses composition and
  // explicit mode; standard gamepad A confirms the server arena and launch.
  await clickLogicalPlayOption(page, 0, touch);
  await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('composition');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('mode');
  if (touch) {
    await clickLogicalPlayOption(page, 1, true);
  } else {
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
  }
  await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('arena');
  await queueMenuGamepadActions(page, [{ confirm: true }]);
  await expect.poll(async () => (await playRosterSnapshot(page)).step).toBe('review');
  const reviewed = await playRosterSnapshot(page);
  expect(reviewed.serialized).toMatchObject({
    format: 'duel',
    composition: { humanCount: 1, botCount: 1 },
    mode: 'koth',
    fighterId: 'rook',
  });
  await queueMenuGamepadActions(page, [{ confirm: true }]);

  if (!liveChromium) {
    await page.evaluate((serialized) => {
      if (!serialized) throw new Error('missing reviewed draft');
      const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'ReforgedShellScene',
      ) as unknown as {
        gameService: { getNetworkManager(): { handleMessage(message: unknown): void } };
      };
      const draft = serialized as {
        format: 'duel';
        composition: { humanCount: 1; botCount: 1 };
        mode: 'koth';
        arenaName: string;
        fighterId: 'rook';
      };
      shell.gameService.getNetworkManager().handleMessage({
        type: 'server:matchFound',
        matchId: 'direct-match-16',
        opponents: [{ id: 'direct-bot-16', nickname: 'Scrapper 1' }],
        mapName: draft.arenaName,
        gameMode: draft.mode,
        matchKind: 'duel',
        standardMatch: {
          format: draft.format,
          composition: draft.composition,
          scheduledArena: {
            mode: draft.mode,
            mapName: draft.arenaName,
            rotationEndsAt: 1_240_000,
          },
          participants: [
            {
              playerId: 'direct-player-16',
              nickname: 'Direct16',
              fighterId: draft.fighterId,
              source: 'human',
            },
            {
              playerId: 'direct-bot-16',
              nickname: 'Scrapper 1',
              fighterId: 'mighty_man',
              source: 'standard_bot',
            },
          ],
        },
      });
    }, reviewed.serialized);
  }

  await waitForActiveScene(page, 'GameScene');
  const route = await page.evaluate(() => {
    const game = (window as unknown as { game?: Phaser.Game }).game;
    const active = game?.scene.getScenes(true).map((scene) => scene.scene.key) ?? [];
    const scene = game?.scene.getScene('GameScene') as unknown as {
      matchData?: {
        mapName: string;
        gameMode: string;
        standardLaunchStatus: string;
        standardMatch?: {
          participants: Array<{ fighterId: string; source: string }>;
        };
      };
    };
    return { active, matchData: scene.matchData };
  });
  expect(route.active).not.toContain('DraftScene');
  expect(route.active).not.toContain('CharacterSelectScene');
  expect(route.matchData).toMatchObject({
    gameMode: 'koth',
    standardLaunchStatus: 'valid',
    standardMatch: {
      participants: expect.arrayContaining([
        expect.objectContaining({ fighterId: 'rook', source: 'human' }),
        expect.objectContaining({ source: 'standard_bot' }),
      ]),
    },
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (window as unknown as { game?: Phaser.Game }).game;
        return [game?.scale.width, game?.scale.height];
      }),
    )
    .toEqual([largeWorldsAdvertised ? 1280 : 960, 720]);

  if (liveChromium) {
    await waitForRenderedFrames(page);
    await page.screenshot({ path: testInfo.outputPath('direct-launch-desktop.png') });
    await page.evaluate(async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
    });
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await page.setViewportSize({ width: 844, height: 390 });
    await waitForRenderedFrames(page);
    await page.screenshot({ path: testInfo.outputPath('direct-launch-mobile-chromium.png') });
  }
});

test('Party readiness projects recovery, leadership, and server-owned slots across two clients', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  test.skip(
    !shellAdvertised || !schedulesAdvertised,
    'Run with both Reforged shell and schedule capabilities for party entry.',
  );
  const touch = testInfo.project.name === 'mobile-landscape';
  const liveChromium = testInfo.project.name === 'desktop-chromium';
  await page.addInitScript(() => {
    localStorage.setItem('mmr_nickname', 'Leader12');
    localStorage.setItem('mmr_fighter_selection', 'mighty_man');
  });
  let memberContext = await browser.newContext({
    viewport: touch ? { width: 844, height: 390 } : { width: 1280, height: 720 },
    hasTouch: touch,
  });
  let memberPage = await memberContext.newPage();
  await memberPage.addInitScript(() => {
    localStorage.setItem('mmr_nickname', 'Member12');
    localStorage.setItem('mmr_fighter_selection', 'bruce');
  });
  try {
    await Promise.all([page.goto('/'), memberPage.goto('/')]);
    if (!liveChromium) {
      await Promise.all([
        stageNonChromiumShell(page, 'staged-party-leader'),
        stageNonChromiumShell(memberPage, 'staged-party-member'),
      ]);
    }
    await Promise.all([
      waitForActiveScene(page, 'ReforgedShellScene'),
      waitForActiveScene(memberPage, 'ReforgedShellScene'),
    ]);
    await reachDuelPartyReview(page, touch);
    await reachDuelPartyReview(memberPage, touch);

    await clickLogicalPlayOption(page, 1, touch);
    let leaderState = (await playRosterSnapshot(page)).partyState;
    if (liveChromium) {
      await expect
        .poll(async () => (await playRosterSnapshot(page)).partyState?.code ?? null)
        .not.toBeNull();
      leaderState = (await playRosterSnapshot(page)).partyState;
      if (!leaderState) throw new Error('leader party missing');
      await memberPage.evaluate((code) => {
        window.prompt = () => code;
      }, leaderState.code);
      await clickLogicalPlayOption(memberPage, 2, touch);
      await expect
        .poll(async () => (await playRosterSnapshot(page)).partyState?.members.length ?? 0, {
          timeout: 20_000,
        })
        .toBe(2);
      await expect
        .poll(async () => (await playRosterSnapshot(memberPage)).partyState?.members.length ?? 0)
        .toBe(2);
    } else {
      await memberPage.evaluate(() => {
        window.prompt = () => 'ABCDE';
      });
      await clickLogicalPlayOption(memberPage, 2, touch);
      const reviewed = (await playRosterSnapshot(page)).serialized;
      if (!reviewed) throw new Error('missing reviewed roster');
      const state = {
        partyId: 'party_staged_12345678',
        code: 'ABCDE',
        joinPath: '/?party=ABCDE',
        format: 'duel',
        formatCapacity: 2,
        capacity: 2,
        leaderId: 'staged-party-leader',
        version: 2,
        lifecycle: 'assembling',
        members: [
          {
            playerId: 'staged-party-leader',
            nickname: 'Leader12',
            fighterId: 'mighty_man',
            joinedAt: 1,
            ready: false,
          },
          {
            playerId: 'staged-party-member',
            nickname: 'Member12',
            fighterId: 'bruce',
            joinedAt: 2,
            ready: false,
          },
        ],
        slots: [
          {
            index: 0,
            status: 'occupied',
            member: {
              playerId: 'staged-party-leader',
              nickname: 'Leader12',
              fighterId: 'mighty_man',
              joinedAt: 1,
              ready: false,
            },
          },
          {
            index: 1,
            status: 'occupied',
            member: {
              playerId: 'staged-party-member',
              nickname: 'Member12',
              fighterId: 'bruce',
              joinedAt: 2,
              ready: false,
            },
          },
        ],
        intent: {
          intentId: 'intent_staged_party_12',
          format: 'duel',
          composition: { humanCount: 2, botCount: 0 },
          mode: reviewed.mode,
          fighterId: 'mighty_man',
          scheduledArena: {
            mode: reviewed.mode,
            mapName: reviewed.arenaName,
            rotationEndsAt: 2_000_000,
          },
        },
      };
      await Promise.all(
        [page, memberPage].map((target) =>
          target.evaluate((partyState) => {
            const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
              'ReforgedShellScene',
            ) as unknown as {
              gameService: { getNetworkManager(): { handleMessage(message: unknown): void } };
            };
            shell.gameService
              .getNetworkManager()
              .handleMessage({ type: 'server:partyState', state: partyState });
          }, state),
        ),
      );
    }

    const leader = await playRosterSnapshot(page);
    const member = await playRosterSnapshot(memberPage);
    expect(leader.partyState?.members.map((entry) => [entry.nickname, entry.fighterId])).toEqual([
      ['Leader12', 'mighty_man'],
      ['Member12', 'bruce'],
    ]);
    expect(leader.optionLabels).toContain('KICK MEMBER12');
    expect(leader.optionLabels).toContain('READY UP');
    expect(member.optionLabels).toContain('READY UP');
    expect(member.optionLabels).not.toContain('KICK LEADER12');
    expect(leader.reviewBottom).not.toBeNull();
    expect(leader.optionsTop).toBeGreaterThan((leader.reviewBottom ?? 0) + 8);

    if (liveChromium) {
      const recoveryCode = leader.partyState?.code;
      if (!recoveryCode) throw new Error('missing recovery code');
      await memberPage.evaluate(() => {
        const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
          'ReforgedShellScene',
        ) as unknown as { gameService: { disconnect(): void } };
        shell.gameService.disconnect();
      });
      await expect
        .poll(async () => (await playRosterSnapshot(page)).partyState?.members.length ?? 0, {
          timeout: 10_000,
        })
        .toBe(1);
      await memberContext.close();
      expect((await playRosterSnapshot(page)).partyState?.slots.map((slot) => slot.status)).toEqual(
        ['occupied', 'open'],
      );
      memberContext = await browser.newContext({
        viewport: touch ? { width: 844, height: 390 } : { width: 1280, height: 720 },
        hasTouch: touch,
      });
      memberPage = await memberContext.newPage();
      await memberPage.addInitScript(() => {
        localStorage.setItem('mmr_nickname', 'Member12');
        localStorage.setItem('mmr_fighter_selection', 'bruce');
      });
      await memberPage.goto('/');
      await waitForActiveScene(memberPage, 'ReforgedShellScene');
      await reachDuelPartyReview(memberPage, touch);
      await memberPage.evaluate((code) => {
        window.prompt = () => code;
      }, recoveryCode);
      await clickLogicalPlayOption(memberPage, 2, touch);
      await expect
        .poll(async () => (await playRosterSnapshot(page)).partyState?.members.length ?? 0)
        .toBe(2);
      await waitForRenderedFrames(page);
      expect((await playRosterSnapshot(page)).optionLabels[1]).toBe('READY UP');
      await clickLogicalPlayOption(page, 1, false);
      await expect
        .poll(
          async () =>
            (await playRosterSnapshot(page)).partyState?.members.find(
              (entry) => entry.nickname === 'Leader12',
            )?.ready ?? false,
        )
        .toBe(true);
      await page.screenshot({ path: testInfo.outputPath('party-two-client-desktop.png') });
      await page.setViewportSize({ width: 844, height: 390 });
      await waitForRenderedFrames(page);
      await page.screenshot({ path: testInfo.outputPath('party-two-client-mobile-chromium.png') });
      await clickLogicalPlayOption(page, 4, false);
      await expect.poll(async () => (await playRosterSnapshot(memberPage)).partyState).toBeNull();
    } else {
      await clickLogicalPlayOption(page, 4, touch);
    }
  } finally {
    await memberContext.close();
  }
});

test('Party bot fill remains server-offered and requires explicit leader confirmation', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  test.skip(
    !shellAdvertised || !schedulesAdvertised,
    'Run with both Reforged shell and schedule capabilities for queue fallback.',
  );
  const touch = testInfo.project.name === 'mobile-landscape';
  const liveChromium = testInfo.project.name === 'desktop-chromium';
  await page.addInitScript(() => {
    localStorage.setItem('mmr_nickname', 'FillLead');
    localStorage.setItem('mmr_fighter_selection', 'mighty_man');
  });
  await page.goto('/');
  if (!liveChromium) await stageNonChromiumShell(page, 'staged-fill-leader');
  await waitForActiveScene(page, 'ReforgedShellScene');
  await reachDuelPartyReview(page, touch);
  await clickLogicalPlayOption(page, 1, touch);

  if (liveChromium) {
    await expect
      .poll(async () => (await playRosterSnapshot(page)).partyState?.code ?? null)
      .not.toBeNull();
    await clickLogicalPlayOption(page, 1, false);
    await expect
      .poll(async () => (await playRosterSnapshot(page)).partyState?.botFillOffer?.status ?? null)
      .toBe('waiting');
    await expect
      .poll(async () => (await playRosterSnapshot(page)).partyState?.botFillOffer?.status ?? null, {
        timeout: 20_000,
      })
      .toBe('available');
    const offered = await playRosterSnapshot(page);
    expect(offered.optionLabels).toContain('FILL WITH BOTS');
    expect(offered.partyState?.members).toHaveLength(1);
    expect(offered.partyState?.slots.map((slot) => slot.status)).toEqual(['occupied', 'open']);
    expect(offered.optionsTop).toBeGreaterThan((offered.reviewBottom ?? 0) + 8);
    await page.screenshot({ path: testInfo.outputPath('party-bot-fill-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await waitForRenderedFrames(page);
    await page.screenshot({ path: testInfo.outputPath('party-bot-fill-mobile-chromium.png') });
    await clickLogicalPlayOption(page, 0, false);
    await waitForActiveScene(page, 'GameScene');
    expect(
      await page.evaluate(() => {
        const game = (window as unknown as { game?: Phaser.Game }).game;
        return game?.scene.getScenes(true).map((scene) => scene.scene.key) ?? [];
      }),
    ).not.toContain('CharacterSelectScene');
  } else {
    const reviewed = (await playRosterSnapshot(page)).serialized;
    if (!reviewed) throw new Error('missing reviewed roster');
    await page.evaluate((draft) => {
      const shell = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'ReforgedShellScene',
      ) as unknown as {
        gameService: {
          confirmPartyBotFill(): void;
          getNetworkManager(): { handleMessage(message: unknown): void };
        };
      };
      const member = {
        playerId: 'staged-fill-leader',
        nickname: 'FillLead',
        fighterId: 'mighty_man',
        joinedAt: 1,
        ready: true,
      };
      shell.gameService.getNetworkManager().handleMessage({
        type: 'server:partyState',
        state: {
          partyId: 'party_fill_12345678',
          code: 'ABCDE',
          joinPath: '/?party=ABCDE',
          format: 'duel',
          formatCapacity: 2,
          capacity: 2,
          leaderId: 'staged-fill-leader',
          version: 3,
          lifecycle: 'queued',
          members: [member],
          slots: [
            { index: 0, status: 'occupied', member },
            { index: 1, status: 'open' },
          ],
          botFillOffer: {
            status: 'available',
            waitStartedAt: 1_000,
            eligibleAt: 16_000,
            serverTime: 16_000,
            openSlotCount: 1,
          },
          intent: {
            intentId: 'intent_staged_fill_1',
            format: 'duel',
            composition: { humanCount: 2, botCount: 0 },
            mode: draft.mode,
            fighterId: 'mighty_man',
            scheduledArena: {
              mode: draft.mode,
              mapName: draft.arenaName,
              rotationEndsAt: 2_000_000,
            },
          },
        },
      });
      shell.gameService.confirmPartyBotFill = () => {
        (window as unknown as { __botFillConfirmed?: boolean }).__botFillConfirmed = true;
      };
    }, reviewed);
    await waitForRenderedFrames(page);
    expect((await playRosterSnapshot(page)).optionLabels).toContain('FILL WITH BOTS');
    await clickLogicalPlayOption(page, 0, touch);
    expect(
      await page.evaluate(
        () => (window as unknown as { __botFillConfirmed?: boolean }).__botFillConfirmed,
      ),
    ).toBe(true);
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
