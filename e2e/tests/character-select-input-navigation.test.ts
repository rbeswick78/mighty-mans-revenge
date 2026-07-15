import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CharacterSelectInputState {
  hovered: string | null;
  lockFocused: boolean;
  footer: string | null;
  detailTitle: string;
  hoverMessages: string[];
  lockMessages: string[];
  cardBounds: Record<string, Bounds>;
  lockBounds: Bounds;
}

const BASE_SELECTIONS = [
  {
    playerId: 'p1',
    nickname: 'Navigator',
    hoveredCharacterId: 'mighty_man',
    lockedCharacterId: null,
  },
  {
    playerId: 'p2',
    nickname: 'Rusty',
    hoveredCharacterId: 'bruce',
    lockedCharacterId: 'bruce',
  },
];

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

async function startCharacterSelect(page: Page): Promise<void> {
  await waitForScene(page, 'LobbyScene');
  await page.evaluate(() => {
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
      __characterHoverMessages?: string[];
      __characterLockMessages?: string[];
    };
    const active = runtime.game?.scene.scenes.find((scene) => scene.sys.settings.active);
    const lobby = runtime.game?.scene.getScene('LobbyScene') as {
      gameService?: {
        getPlayerId: () => string | null;
        sendCharacterHover: (id: string) => void;
        sendCharacterLock: (id: string) => void;
      };
    };
    if (!active || !lobby.gameService) throw new Error('lobby is not ready');
    runtime.__characterHoverMessages = [];
    runtime.__characterLockMessages = [];
    lobby.gameService.getPlayerId = () => 'p1';
    lobby.gameService.sendCharacterHover = (id) => runtime.__characterHoverMessages?.push(id);
    lobby.gameService.sendCharacterLock = (id) => runtime.__characterLockMessages?.push(id);
    active.scene.start('CharacterSelectScene', {
      nickname: 'Navigator',
      matchData: {
        matchId: 'character-select-input-navigation',
        opponents: [{ id: 'p2', nickname: 'Rusty' }],
        mapName: 'Scrapyard',
        gameMode: 'deathmatch',
        matchKind: 'duel',
        characterWins: {
          mighty_man: 0,
          bruce: 0,
          frost_wizard: 0,
          bubba: 0,
          jack: 0,
          rook: 0,
        },
      },
    });
  });
  await waitForScene(page, 'CharacterSelectScene');
  await page.waitForTimeout(400);
}

async function applySelection(page: Page, hoveredCharacterId: string): Promise<void> {
  await page.evaluate(
    ({ selections, hovered }) => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('CharacterSelectScene') as {
        latestSelections: unknown[];
        applyServerState: (snapshot: unknown) => void;
      };
      const snapshot = {
        type: 'server:characterSelectState',
        matchId: 'character-select-input-navigation',
        selections: selections.map((selection) =>
          selection.playerId === 'p1' ? { ...selection, hoveredCharacterId: hovered } : selection,
        ),
        timeRemainingMs: 30000,
      };
      // Mirror the scene's real characterSelectState event handler: it owns
      // both the stored authority used for filtering and the rendered state.
      scene.latestSelections = snapshot.selections;
      scene.applyServerState(snapshot);
    },
    { selections: BASE_SELECTIONS, hovered: hoveredCharacterId },
  );
}

async function resetMessages(page: Page): Promise<void> {
  await page.evaluate(() => {
    const runtime = window as unknown as {
      __characterHoverMessages?: string[];
      __characterLockMessages?: string[];
    };
    runtime.__characterHoverMessages = [];
    runtime.__characterLockMessages = [];
  });
}

async function inputState(page: Page): Promise<CharacterSelectInputState> {
  return page.evaluate(() => {
    type RuntimeCard = {
      characterId: string;
      container: { getBounds: () => Bounds };
    };
    const runtime = window as unknown as {
      game?: { scene: { getScene: (key: string) => unknown } };
      __characterHoverMessages?: string[];
      __characterLockMessages?: string[];
    };
    const scene = runtime.game?.scene.getScene('CharacterSelectScene') as {
      cards: Map<string, RuntimeCard>;
      children: { list: Array<{ text?: string }> };
      localHoveredId: string | null;
      lockButton: { focused: boolean; getBounds: () => Bounds };
      fighterDetailTitle: { text: string };
    };
    const cards = [...scene.cards.values()];
    return {
      hovered: scene.localHoveredId,
      lockFocused: scene.lockButton.focused,
      footer:
        scene.children.list.find(
          (child) =>
            child.text?.startsWith('TAB / ARROWS') || child.text?.startsWith('TAP A FIGHTER'),
        )?.text ?? null,
      detailTitle: scene.fighterDetailTitle.text,
      hoverMessages: runtime.__characterHoverMessages ?? [],
      lockMessages: runtime.__characterLockMessages ?? [],
      cardBounds: Object.fromEntries(
        cards.map((card) => [card.characterId, card.container.getBounds()]),
      ),
      lockBounds: scene.lockButton.getBounds(),
    };
  });
}

async function pressCanvasControl(page: Page, bounds: Bounds, touch: boolean): Promise<void> {
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

test.describe('Character select input navigation', () => {
  test('keeps choosing and locking reachable on keyboard, pointer, and touch', async ({
    gamePage,
  }, testInfo) => {
    await startCharacterSelect(gamePage);
    const mobile = testInfo.project.name === 'mobile-landscape';

    if (!mobile) {
      // Enter must still lock the safe first fighter if it arrives before the
      // server's initial hover snapshot.
      await gamePage.keyboard.press('Enter');
      expect(await inputState(gamePage)).toMatchObject({
        hovered: 'mighty_man',
        lockFocused: true,
        lockMessages: ['mighty_man'],
      });
      await resetMessages(gamePage);
    }

    await applySelection(gamePage, 'mighty_man');
    const initial = await inputState(gamePage);
    expect(initial).toMatchObject({
      hovered: 'mighty_man',
      lockFocused: !mobile,
      footer: mobile
        ? 'TAP A FIGHTER + LOCK IN  •  DOUBLE-TAP TO LOCK'
        : 'TAB / ARROWS / D-PAD PICK  •  ENTER / A LOCK  •  ESC / B LOBBY',
      hoverMessages: [],
      lockMessages: [],
    });

    if (mobile) {
      await pressCanvasControl(gamePage, initial.cardBounds.jack, true);
      await expect
        .poll(() => inputState(gamePage))
        .toMatchObject({
          hovered: 'jack',
          lockFocused: false,
          hoverMessages: ['jack'],
          lockMessages: [],
        });
      await applySelection(gamePage, 'jack');
      const selected = await inputState(gamePage);
      expect(selected.detailTitle).toContain('JACK');
      await pressCanvasControl(gamePage, selected.lockBounds, true);
      await expect
        .poll(() => inputState(gamePage))
        .toMatchObject({ lockFocused: false, lockMessages: ['jack'] });
      await gamePage.screenshot({ path: testInfo.outputPath('character-select-touch.png') });
      return;
    }

    // Bruce is locked by the rival, so every navigation route must skip it.
    await gamePage.keyboard.press('Tab');
    expect(await inputState(gamePage)).toMatchObject({
      hovered: 'frost_wizard',
      lockFocused: true,
      hoverMessages: ['frost_wizard'],
    });
    await gamePage.keyboard.press('Shift+Tab');
    expect(await inputState(gamePage)).toMatchObject({ hovered: 'mighty_man' });
    await gamePage.keyboard.press('ArrowUp');
    expect(await inputState(gamePage)).toMatchObject({ hovered: 'rook' });
    await gamePage.keyboard.press('ArrowDown');
    expect(await inputState(gamePage)).toMatchObject({ hovered: 'mighty_man' });
    await gamePage.keyboard.press('ArrowRight');
    expect(await inputState(gamePage)).toMatchObject({ hovered: 'frost_wizard' });
    await gamePage.keyboard.press('Enter');
    expect(await inputState(gamePage)).toMatchObject({ lockMessages: ['frost_wizard'] });

    const beforePointer = await inputState(gamePage);
    await pressCanvasControl(gamePage, beforePointer.cardBounds.jack, false);
    await expect
      .poll(() => inputState(gamePage))
      .toMatchObject({
        hovered: 'jack',
        lockFocused: false,
        lockMessages: ['frost_wizard'],
      });
    await applySelection(gamePage, 'jack');
    await gamePage.screenshot({ path: testInfo.outputPath('character-select-keyboard.png') });
  });
});
