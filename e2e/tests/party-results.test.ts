import { expect, test, type Page } from '@playwright/test';

const MATCH_ID = 'party-results-match-15';

function partyResultsState(requestedPlayerIds: readonly string[] = []): Record<string, unknown> {
  const members = [
    {
      playerId: 'results-leader',
      nickname: 'Lead15',
      fighterId: 'mighty_man',
      joinedAt: 1,
      ready: requestedPlayerIds.includes('results-leader'),
    },
    {
      playerId: 'results-member',
      nickname: 'Wing15',
      fighterId: 'bruce',
      joinedAt: 2,
      ready: requestedPlayerIds.includes('results-member'),
    },
  ];
  return {
    partyId: 'party_results_15',
    code: 'ABCDE',
    joinPath: '/?party=ABCDE',
    format: 'rumble',
    formatCapacity: 4,
    capacity: 2,
    leaderId: 'results-leader',
    version: 10 + requestedPlayerIds.length,
    lifecycle: 'results',
    matchId: MATCH_ID,
    members,
    slots: members.map((member, index) => ({ index, status: 'occupied', member })),
    participants: [
      { ...members[0], source: 'human' },
      { ...members[1], source: 'human' },
      {
        playerId: 'bot:results-1',
        nickname: 'Scrapper 1',
        fighterId: 'rook',
        source: 'standard_bot',
        ready: true,
      },
      {
        playerId: 'bot:results-2',
        nickname: 'Scrapper 2',
        fighterId: 'bubba',
        source: 'standard_bot',
        ready: true,
      },
    ],
    rematch: {
      status: requestedPlayerIds.length === 2 ? 'ready' : 'waiting',
      previousArena: {
        mode: 'deathmatch',
        mapName: 'Wasteland Outpost',
        rotationEndsAt: 1_000_000,
      },
      currentArena: {
        mode: 'deathmatch',
        mapName: 'Scrapyard',
        rotationEndsAt: 1_240_000,
      },
      arenaChanged: true,
      eligiblePlayerIds: ['results-leader', 'results-member'].filter(
        (playerId) => !requestedPlayerIds.includes(playerId),
      ),
      requestedPlayerIds,
      serverTime: 1_010_000,
      expiresAt: 1_070_000,
    },
    intent: {
      intentId: 'intent_party_results_15',
      format: 'rumble',
      composition: { humanCount: 2, botCount: 2 },
      mode: 'deathmatch',
      fighterId: 'mighty_man',
      scheduledArena: {
        mode: 'deathmatch',
        mapName: 'Wasteland Outpost',
        rotationEndsAt: 1_000_000,
      },
    },
  };
}

async function waitForLobby(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('canvas');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              (window as unknown as { game?: Phaser.Game }).game?.scene.getScene('LobbyScene') as
                | Phaser.Scene
                | undefined
            )?.sys.settings.active ?? false,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
}

async function stageResults(
  page: Page,
  playerId: 'results-leader' | 'results-member',
  state: Record<string, unknown>,
  capabilities = true,
): Promise<void> {
  await page.evaluate(
    ({ localPlayerId, partyState, advertiseCapabilities, matchId }) => {
      const game = (window as unknown as { game?: Phaser.Game }).game;
      const active = game?.scene.getScenes(true)[0];
      const lobby = game?.scene.getScene('LobbyScene') as unknown as {
        gameService: {
          getNetworkManager(): {
            connection: {
              disconnect(): void;
              send(message: unknown): void;
              setState(state: string): void;
            };
            handleMessage(message: unknown): void;
          };
        };
      };
      if (!active || !lobby.gameService) throw new Error('lobby is not ready');
      const manager = lobby.gameService.getNetworkManager();
      manager.connection.disconnect();
      manager.connection.setState('connected');
      manager.connection.send = (message) => {
        (window as unknown as { partyResultsMessages?: unknown[] }).partyResultsMessages ??= [];
        (window as unknown as { partyResultsMessages: unknown[] }).partyResultsMessages.push(
          message,
        );
      };
      manager.handleMessage({
        type: 'server:welcome',
        playerId: localPlayerId,
        capabilities: {
          newShell: advertiseCapabilities,
          schedules: advertiseCapabilities,
          largeWorlds: false,
          modernArt: false,
          battleRoyale: false,
        },
      });
      manager.handleMessage({ type: 'server:partyState', state: partyState });
      const stats = {
        kills: 6,
        assists: 2,
        deaths: 3,
        shotsFired: 20,
        shotsHit: 10,
        damageDealt: 500,
        damageTaken: 300,
        grenadesThrown: 1,
        killsByWeapon: {
          gun: 6,
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
        distanceTraveled: 800,
        hillSeconds: 0,
      };
      active.scene.start('ResultsScene', {
        nickname: localPlayerId === 'results-leader' ? 'Lead15' : 'Wing15',
        result: {
          matchId,
          winnerId: 'results-leader',
          playerStats: new Map([
            ['results-leader', stats],
            ['results-member', { ...stats, kills: 4 }],
            ['bot:results-1', { ...stats, kills: 3 }],
            ['bot:results-2', { ...stats, kills: 2 }],
          ]),
          duration: 120,
          gameMode: 'deathmatch',
          matchKind: 'rumble',
          scores: {
            'results-leader': 6,
            'results-member': 4,
            'bot:results-1': 3,
            'bot:results-2': 2,
          },
          playerNicknames: {
            'results-leader': 'Lead15',
            'results-member': 'Wing15',
            'bot:results-1': 'Scrapper 1',
            'bot:results-2': 'Scrapper 2',
          },
          playerCharacters: {
            'results-leader': 'mighty_man',
            'results-member': 'bruce',
            'bot:results-1': 'rook',
            'bot:results-2': 'bubba',
          },
          departedPlayerIds: [],
          awards: [],
          rivalry: null,
          rivalrySet: null,
          isPractice: false,
          nextMapName: 'Scrapyard',
          nextGameMode: 'deathmatch',
          wentToOvertime: false,
        },
      });
    },
    {
      localPlayerId: playerId,
      partyState: state,
      advertiseCapabilities: capabilities,
      matchId: MATCH_ID,
    },
  );
  await expect
    .poll(() => page.evaluate(() => document.querySelector('canvas') !== null))
    .toBe(true);
  await page.waitForTimeout(600);
}

async function resultsSnapshot(page: Page): Promise<{
  partyText: string | null;
  scheduleText: string | null;
  statusText: string;
  buttonLabel: string | null;
  buttonDisabled: boolean | null;
}> {
  return page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ResultsScene',
    ) as unknown as {
      partyProjectionText: Phaser.GameObjects.Text | null;
      partyScheduleText: Phaser.GameObjects.Text | null;
      rematchStatusText: Phaser.GameObjects.Text;
      rematchButton: Phaser.GameObjects.Container & { disabled?: boolean };
    };
    const buttonLabel = scene.rematchButton?.list.find(
      (child): child is Phaser.GameObjects.Text => child instanceof Phaser.GameObjects.Text,
    );
    return {
      partyText: scene.partyProjectionText?.text ?? null,
      scheduleText: scene.partyScheduleText?.text ?? null,
      statusText: scene.rematchStatusText?.text ?? '',
      buttonLabel: buttonLabel?.text ?? null,
      buttonDisabled: scene.rematchButton?.disabled ?? null,
    };
  });
}

async function deliverPartyState(page: Page, state: Record<string, unknown>): Promise<void> {
  await page.evaluate((partyState) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ResultsScene',
    ) as unknown as {
      gameService: { getNetworkManager(): { handleMessage(message: unknown): void } };
    };
    scene.gameService
      .getNetworkManager()
      .handleMessage({ type: 'server:partyState', state: partyState });
  }, state);
}

test('renders server-owned party Results and recovers two-client rematch consensus', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  const memberContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const memberPage = await memberContext.newPage();
  try {
    await Promise.all([waitForLobby(page), waitForLobby(memberPage)]);
    const initial = partyResultsState();
    await Promise.all([
      stageResults(page, 'results-leader', initial),
      stageResults(memberPage, 'results-member', initial),
    ]);

    const leader = await resultsSnapshot(page);
    expect(leader).toMatchObject({
      statusText: '0 / 2 HUMANS READY',
      buttonLabel: 'READY FOR REMATCH',
      buttonDisabled: false,
    });
    expect(leader.partyText).toContain('LEAD15  /  HUMAN  /  MIGHTY MAN  /  WAITING');
    expect(leader.partyText).toContain('SCRAPPER 1  /  SCRAPPER BOT  /  ROOK  /  READY');
    expect(leader.scheduleText).toContain('MODE  /  DEATHMATCH');
    expect(leader.scheduleText).toContain('NEW ACTIVE ARENA  /  SCRAPYARD');

    await page.evaluate(() => {
      const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'ResultsScene',
      ) as unknown as { gameService: { requestPartyRematch(): void } };
      scene.gameService.requestPartyRematch();
    });
    expect(
      await page.evaluate(
        () => (window as unknown as { partyResultsMessages?: unknown[] }).partyResultsMessages,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'client:requestPartyRematch',
        partyId: 'party_results_15',
        expectedVersion: 10,
      }),
    ]);

    const leaderReady = partyResultsState(['results-leader']);
    await Promise.all([
      deliverPartyState(page, leaderReady),
      deliverPartyState(memberPage, leaderReady),
    ]);
    await expect
      .poll(async () => (await resultsSnapshot(page)).statusText)
      .toBe('1 / 2 HUMANS READY');
    expect((await resultsSnapshot(page)).buttonDisabled).toBe(true);
    expect((await resultsSnapshot(memberPage)).buttonDisabled).toBe(false);

    await page.evaluate(() => {
      const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'ResultsScene',
      ) as unknown as {
        onConnectionLost: (() => void) | null;
      };
      scene.onConnectionLost?.();
    });
    await expect
      .poll(async () => (await resultsSnapshot(page)).statusText)
      .toContain('Rematch unavailable');
    await page.evaluate((partyState) => {
      const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
        'ResultsScene',
      ) as unknown as { updatePartyResults(state: unknown): void };
      scene.updatePartyResults(partyState);
    }, leaderReady);
    await expect
      .poll(async () => (await resultsSnapshot(page)).statusText)
      .toBe('1 / 2 HUMANS READY');

    if (testInfo.project.name === 'desktop-chromium') {
      await page.screenshot({ path: testInfo.outputPath('party-results-desktop.png') });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: testInfo.outputPath('party-results-mobile-chromium.png') });
    }
  } finally {
    await memberContext.close();
  }
});

test('retains the legacy Results boundary when capabilities are off', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One capability-off fallback is enough.');
  await waitForLobby(page);
  await stageResults(page, 'results-leader', partyResultsState(), false);
  const snapshot = await resultsSnapshot(page);
  expect(snapshot.partyText).toBeNull();
  expect(snapshot.scheduleText).toBeNull();
  expect(snapshot.buttonLabel).not.toBe('READY FOR REMATCH');
});
