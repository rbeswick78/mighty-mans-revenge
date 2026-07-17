import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

async function waitForLobby(gamePage: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(
      () =>
        gamePage.evaluate(() => {
          const game = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game;
          const lobby = game?.scene.getScene('LobbyScene') as {
            sys?: { settings: { active: boolean } };
          };
          return lobby?.sys?.settings.active ?? false;
        }),
      { timeout: 15000 },
    )
    .toBe(true);
}

test.describe('Rumble Draft Rally', () => {
  test('shows live group ballots and the local locked vote', async ({ gamePage }, testInfo) => {
    await waitForLobby(gamePage);
    await gamePage.evaluate(() => {
      const w = window as unknown as {
        game?: {
          scene: {
            scenes: Array<{
              scene: { start: (key: string, data?: unknown) => void };
              sys: { settings: { active: boolean } };
            }>;
            getScene: (key: string) => unknown;
          };
        };
      };
      const active = w.game?.scene.scenes.find((scene) => scene.sys.settings.active);
      const lobby = w.game?.scene.getScene('LobbyScene') as {
        gameService?: {
          getPlayerId: () => string | null;
          latestDraftState?: unknown;
        };
      };
      if (!active || !lobby.gameService) throw new Error('lobby is not ready');
      lobby.gameService.getPlayerId = () => 'p1';
      lobby.gameService.latestDraftState = {
        type: 'server:draftState',
        matchId: 'rally-visual',
        draftKind: 'rally',
        players: [
          { id: 'p1', nickname: 'Alpha' },
          { id: 'p2', nickname: 'Bravo' },
          { id: 'p3', nickname: 'Cora' },
          { id: 'p4', nickname: 'Delta' },
        ],
        firstPickerId: 'p1',
        secondPickerId: 'p2',
        firstPickerReason: 'coin_toss',
        currentPickerId: null,
        rallyCategory: 'map',
        rallyVotes: [
          { playerId: 'p2', value: 'Scrapyard' },
          { playerId: 'p3', value: 'Scrapyard' },
        ],
        mapPick: null,
        modePick: null,
        mapOptions: [
          'Wasteland Outpost',
          'Overgrown Suburb',
          'Scrapyard',
          'Collapsed Overpass',
          'Checkpoint Zero',
          'Rusted Refinery',
        ],
        modeOptions: [
          'deathmatch',
          'koth',
          'gun_game',
          'last_stand',
          'kill_confirmed',
          'one_in_the_chamber',
          'core_run',
          'bounty_hunt',
        ],
        pickDeadlineMs: 12000,
      };
      active.scene.start('DraftScene', { nickname: 'Alpha' });
    });

    await expect
      .poll(() => collectRallyText(gamePage))
      .toMatchObject({
        active: true,
        title: 'RUMBLE DRAFT RALLY',
        status: 'YOUR VOTE - CHOOSE A MAP',
        countedCard: 'SCRAPYARD · 2',
        footer:
          testInfo.project.name === 'mobile-landscape'
            ? 'TAP ONE CARD  •  EVERY FIGHTER VOTES  •  TIES BREAK RANDOMLY'
            : 'TAB / ARROWS + ENTER  •  ESC / B LOBBY',
      });

    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('DraftScene') as {
        acceptSnapshot: (snapshot: unknown) => void;
        renderFromSnapshot: () => void;
      };
      scene.acceptSnapshot({
        type: 'server:draftState',
        matchId: 'rally-visual',
        draftKind: 'rally',
        players: [
          { id: 'p1', nickname: 'Alpha' },
          { id: 'p2', nickname: 'Bravo' },
          { id: 'p3', nickname: 'Cora' },
          { id: 'p4', nickname: 'Delta' },
        ],
        firstPickerId: 'p1',
        secondPickerId: 'p2',
        firstPickerReason: 'coin_toss',
        currentPickerId: null,
        rallyCategory: 'mode',
        rallyVotes: [
          { playerId: 'p1', value: 'koth' },
          { playerId: 'p2', value: 'koth' },
        ],
        mapPick: 'Scrapyard',
        modePick: null,
        mapOptions: [
          'Wasteland Outpost',
          'Overgrown Suburb',
          'Scrapyard',
          'Collapsed Overpass',
          'Checkpoint Zero',
          'Rusted Refinery',
        ],
        modeOptions: [
          'deathmatch',
          'koth',
          'gun_game',
          'last_stand',
          'kill_confirmed',
          'one_in_the_chamber',
          'core_run',
          'bounty_hunt',
        ],
        pickDeadlineMs: 9000,
      });
      scene.renderFromSnapshot();
    });

    await expect
      .poll(() => collectRallyText(gamePage))
      .toMatchObject({
        status: 'VOTE CAST - WAITING FOR 2 FIGHTERS',
        countedCard: 'KING OF THE HILL · 2',
        groupPick: 'GROUP PICK',
      });
  });

  test('lets three real clients choose the authoritative map and mode', async ({
    gamePage,
    context,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop-chromium',
      'One authoritative three-client journey is sufficient; Firefox/mobile Rally UI is covered above.',
    );
    test.setTimeout(90000);
    const pageB = await context.newPage();
    const pageC = await context.newPage();
    await Promise.all([pageB.goto('/'), pageC.goto('/')]);
    await Promise.all([pageB.waitForSelector('canvas'), pageC.waitForSelector('canvas')]);
    const pages = [gamePage, pageB, pageC];

    try {
      await Promise.all(pages.map((page) => waitForLobby(page)));
      for (const [index, page] of pages.entries()) {
        await joinRumble(page, ['Alpha', 'Bravo', 'Cora'][index]);
      }
      await Promise.all(pages.map((page) => waitForRallyPhase(page, 'map')));

      for (const page of pages) await sendRallyVote(page, 'map', 'Scrapyard');
      await Promise.all(pages.map((page) => waitForRallyPhase(page, 'mode')));

      for (const page of pages) await sendRallyVote(page, 'mode', 'koth');
      await expect
        .poll(
          async () =>
            Promise.all(
              pages.map((page) =>
                page.evaluate(() => {
                  const scene = (
                    window as unknown as {
                      game?: { scene: { getScene: (key: string) => unknown } };
                    }
                  ).game?.scene.getScene('CharacterSelectScene') as {
                    sys?: { settings: { active: boolean } };
                    matchData?: { mapName: string; gameMode: string; matchKind: string };
                  };
                  return {
                    active: scene?.sys?.settings.active ?? false,
                    mapName: scene?.matchData?.mapName,
                    gameMode: scene?.matchData?.gameMode,
                    matchKind: scene?.matchData?.matchKind,
                  };
                }),
              ),
            ),
          { timeout: 10000 },
        )
        .toEqual(
          Array.from({ length: 3 }, () => ({
            active: true,
            mapName: 'Scrapyard',
            gameMode: 'koth',
            matchKind: 'rumble',
          })),
        );
    } finally {
      await Promise.all([pageB.close(), pageC.close()]);
    }
  });
});

async function joinRumble(page: Page, nickname: string): Promise<void> {
  await page.bringToFront();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const lobby = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('LobbyScene') as {
            gameService?: { getPlayerId: () => string | null };
          };
          return lobby?.gameService?.getPlayerId() ?? null;
        }),
      { timeout: 15000 },
    )
    .not.toBeNull();
  await page.evaluate((name) => {
    const lobby = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('LobbyScene') as {
      gameService: { joinRumble: (nickname: string) => void };
    };
    lobby.gameService.joinRumble(name);
  }, nickname);
}

async function waitForRallyPhase(page: Page, category: 'map' | 'mode'): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('DraftScene') as {
            sys?: { settings: { active: boolean } };
            latestDraft?: { draftKind?: string; rallyCategory?: string | null };
          };
          return {
            active: scene?.sys?.settings.active ?? false,
            kind: scene?.latestDraft?.draftKind,
            category: scene?.latestDraft?.rallyCategory,
          };
        }),
      { timeout: 20000 },
    )
    .toEqual({ active: true, kind: 'rally', category });
}

async function sendRallyVote(page: Page, category: 'map' | 'mode', value: string): Promise<void> {
  await page.bringToFront();
  await page.evaluate(
    ({ category: voteCategory, value: voteValue }) => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('DraftScene') as {
        gameService: { sendDraftPick: (category: 'map' | 'mode', value: string) => void };
      };
      scene.gameService.sendDraftPick(voteCategory, voteValue);
    },
    { category, value },
  );
}

async function collectRallyText(gamePage: import('@playwright/test').Page) {
  return gamePage.evaluate(() => {
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('DraftScene') as {
      sys?: { settings: { active: boolean } };
      children?: { list: unknown[] };
    };
    const texts: string[] = [];
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      const node = value as { text?: unknown; list?: unknown[] };
      if (typeof node.text === 'string') texts.push(node.text);
      for (const child of node.list ?? []) visit(child);
    };
    for (const child of scene?.children?.list ?? []) visit(child);
    return {
      active: scene?.sys?.settings.active ?? false,
      title: texts.find((text) => text === 'RUMBLE DRAFT RALLY'),
      status: texts.find((text) => text.startsWith('YOUR VOTE') || text.startsWith('VOTE CAST')),
      countedCard: texts.find((text) => text.endsWith('· 2')),
      footer: texts.find(
        (text) => text.startsWith('TAP ONE CARD') || text.startsWith('TAB / ARROWS + ENTER'),
      ),
      groupPick: texts.find((text) => text === 'GROUP PICK'),
    };
  });
}
