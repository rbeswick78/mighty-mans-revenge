import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DraftInputState {
  focusActive: boolean;
  focusedCard: string | null;
  enabledCards: string[];
  selections: Array<{ category: 'map' | 'mode'; value: string }>;
  footer: string | null;
  bounds: Record<string, Bounds>;
}

const MAP_OPTIONS = [
  'Wasteland Outpost',
  'Overgrown Suburb',
  'Scrapyard',
  'Collapsed Overpass',
  'Checkpoint Zero',
  'Rusted Refinery',
];

const MODE_OPTIONS = [
  'deathmatch',
  'koth',
  'gun_game',
  'last_stand',
  'kill_confirmed',
  'one_in_the_chamber',
  'core_run',
  'bounty_hunt',
];

function rallySnapshot(category: 'map' | 'mode'): object {
  return {
    type: 'server:draftState',
    matchId: 'draft-input-navigation',
    draftKind: 'rally',
    players: [
      { id: 'p1', nickname: 'Navigator' },
      { id: 'p2', nickname: 'Bravo' },
      { id: 'p3', nickname: 'Cora' },
    ],
    firstPickerId: 'p1',
    secondPickerId: 'p2',
    firstPickerReason: 'coin_toss',
    currentPickerId: null,
    rallyCategory: category,
    rallyVotes: [],
    mapPick: category === 'mode' ? 'Scrapyard' : null,
    modePick: null,
    mapOptions: MAP_OPTIONS,
    modeOptions: MODE_OPTIONS,
    pickDeadlineMs: 12000,
  };
}

function duelSnapshot(): object {
  return {
    ...rallySnapshot('map'),
    draftKind: 'duel',
    players: [
      { id: 'p1', nickname: 'Navigator' },
      { id: 'p2', nickname: 'Bravo' },
    ],
    currentPickerId: 'p1',
    rallyCategory: null,
  };
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

async function startRallyDraft(page: Page): Promise<void> {
  await waitForScene(page, 'LobbyScene');
  await page.evaluate((snapshot) => {
    const runtime = window as unknown as {
      game?: {
        scene: {
          scenes: Array<{
            scene: { start: (key: string, data?: unknown) => void };
            sys: { settings: { active: boolean } };
          }>;
          getScene: (key: string) => unknown;
        };
      };
      __draftSelections?: Array<{ category: 'map' | 'mode'; value: string }>;
    };
    const active = runtime.game?.scene.scenes.find((scene) => scene.sys.settings.active);
    const lobby = runtime.game?.scene.getScene('LobbyScene') as {
      gameService?: {
        getPlayerId: () => string | null;
        latestDraftState?: unknown;
      };
    };
    if (!active || !lobby.gameService) throw new Error('lobby is not ready');
    runtime.__draftSelections = [];
    lobby.gameService.getPlayerId = () => 'p1';
    lobby.gameService.latestDraftState = snapshot;
    active.scene.start('DraftScene', { nickname: 'Navigator' });
  }, rallySnapshot('map'));
  await waitForScene(page, 'DraftScene');
  // Let the scene's intentional 300ms fade complete before asserting or
  // capturing the rendered focus/touch treatment.
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const runtime = window as unknown as {
      game?: { scene: { getScene: (key: string) => unknown } };
      __draftSelections?: Array<{ category: 'map' | 'mode'; value: string }>;
    };
    const scene = runtime.game?.scene.getScene('DraftScene') as {
      gameService: {
        sendDraftPick: (category: 'map' | 'mode', value: string) => void;
      };
    };
    scene.gameService.sendDraftPick = (category, value) => {
      runtime.__draftSelections?.push({ category, value });
    };
  });
}

async function setRallyPhase(page: Page, category: 'map' | 'mode'): Promise<void> {
  await page.evaluate((snapshot) => {
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('DraftScene') as {
      acceptSnapshot: (value: unknown) => void;
      renderFromSnapshot: () => void;
    };
    scene.acceptSnapshot(snapshot);
    scene.renderFromSnapshot();
  }, rallySnapshot(category));
}

async function setDuelTurn(page: Page): Promise<void> {
  await page.evaluate((snapshot) => {
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('DraftScene') as {
      acceptSnapshot: (value: unknown) => void;
      renderFromSnapshot: () => void;
    };
    scene.acceptSnapshot(snapshot);
    scene.renderFromSnapshot();
  }, duelSnapshot());
}

async function draftInputState(page: Page): Promise<DraftInputState> {
  return page.evaluate(() => {
    type RuntimeButton = {
      focused: boolean;
      isDisabled: () => boolean;
      getBounds: () => Bounds;
    };
    type RuntimeCard = {
      category: 'map' | 'mode';
      value: string;
      button: RuntimeButton;
    };
    const runtime = window as unknown as {
      game?: { scene: { getScene: (key: string) => unknown } };
      __draftSelections?: Array<{ category: 'map' | 'mode'; value: string }>;
    };
    const scene = runtime.game?.scene.getScene('DraftScene') as {
      children: { list: Array<{ text?: string }> };
      cards: RuntimeCard[];
      gamepadFocusActive: boolean;
      gamepadFocusedCard: RuntimeCard | null;
    };
    const enabled = scene.cards.filter((card) => !card.button.isDisabled());
    return {
      focusActive: scene.gamepadFocusActive,
      focusedCard: scene.gamepadFocusedCard?.value ?? null,
      enabledCards: enabled.map((card) => card.value),
      selections: runtime.__draftSelections ?? [],
      footer:
        scene.children.list.find(
          (child) =>
            child.text?.startsWith('TAB / ARROWS') || child.text?.startsWith('TAP ONE CARD'),
        )?.text ?? null,
      bounds: Object.fromEntries(
        scene.cards.map((card) => [`${card.category}:${card.value}`, card.button.getBounds()]),
      ),
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

test.describe('Draft input navigation', () => {
  test('keeps both voting phases reachable on keyboard, pointer, and touch', async ({
    gamePage,
  }, testInfo) => {
    await startRallyDraft(gamePage);
    const mobile = testInfo.project.name === 'mobile-landscape';
    const initial = await draftInputState(gamePage);
    expect(initial).toMatchObject({
      focusActive: false,
      focusedCard: null,
      enabledCards: MAP_OPTIONS,
      selections: [],
      footer: mobile
        ? 'TAP ONE CARD  •  EVERY FIGHTER VOTES  •  TIES BREAK RANDOMLY'
        : 'TAB / ARROWS + ENTER  •  ESC / B LOBBY',
    });

    if (mobile) {
      await pressCanvasButton(gamePage, initial.bounds['map:Scrapyard'], true);
      await expect
        .poll(() => draftInputState(gamePage))
        .toMatchObject({
          focusActive: false,
          focusedCard: null,
          selections: [{ category: 'map', value: 'Scrapyard' }],
        });
      await gamePage.screenshot({ path: testInfo.outputPath('draft-touch-vote.png') });
      return;
    }

    // Ordinary duel first-pick enables both columns. Prove the spatial path
    // crosses between them before committing a map choice.
    await setDuelTurn(gamePage);
    await gamePage.keyboard.press('Tab');
    expect(await draftInputState(gamePage)).toMatchObject({
      focusActive: true,
      focusedCard: 'Wasteland Outpost',
    });
    await gamePage.keyboard.press('ArrowRight');
    expect(await draftInputState(gamePage)).toMatchObject({ focusedCard: 'deathmatch' });
    await gamePage.keyboard.press('ArrowLeft');
    expect(await draftInputState(gamePage)).toMatchObject({ focusedCard: 'Wasteland Outpost' });
    await gamePage.keyboard.press('ArrowDown');
    expect(await draftInputState(gamePage)).toMatchObject({ focusedCard: 'Overgrown Suburb' });
    await gamePage.keyboard.press('Enter');
    await expect
      .poll(() => draftInputState(gamePage))
      .toMatchObject({
        selections: [{ category: 'map', value: 'Overgrown Suburb' }],
      });

    await setRallyPhase(gamePage, 'mode');
    expect(await draftInputState(gamePage)).toMatchObject({
      focusActive: true,
      focusedCard: 'deathmatch',
      enabledCards: MODE_OPTIONS,
    });
    await gamePage.keyboard.press('ArrowDown');
    expect(await draftInputState(gamePage)).toMatchObject({ focusedCard: 'koth' });
    await gamePage.screenshot({ path: testInfo.outputPath('draft-keyboard-focus.png') });
    await gamePage.keyboard.press('Enter');
    await expect
      .poll(() => draftInputState(gamePage))
      .toMatchObject({
        selections: [
          { category: 'map', value: 'Overgrown Suburb' },
          { category: 'mode', value: 'koth' },
        ],
      });

    const beforePointer = await draftInputState(gamePage);
    await pressCanvasButton(gamePage, beforePointer.bounds['mode:gun_game'], false);
    await expect
      .poll(() => draftInputState(gamePage))
      .toMatchObject({
        focusActive: false,
        focusedCard: 'koth',
        selections: [
          { category: 'map', value: 'Overgrown Suburb' },
          { category: 'mode', value: 'koth' },
          { category: 'mode', value: 'gun_game' },
        ],
      });
  });
});
