import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

async function waitForScene(page: Page, key: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((sceneKey) => {
          const game = (
            window as unknown as {
              game?: {
                scene: {
                  getScene: (key: string) => { sys?: { settings: { active: boolean } } };
                };
              };
            }
          ).game;
          return game?.scene.getScene(sceneKey)?.sys?.settings.active ?? false;
        }, key),
      { timeout: 10000 },
    )
    .toBe(true);
}

async function startDraft(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = (
      window as unknown as {
        game?: {
          scene: {
            getScene: (key: string) => unknown;
            scenes: Array<{
              scene: { start: (key: string, data?: unknown) => void };
              sys: { settings: { active: boolean } };
            }>;
          };
        };
      }
    ).game;
    const active = game?.scene.scenes.find((scene) => scene.sys.settings.active);
    const lobby = game?.scene.getScene('LobbyScene') as {
      gameService?: { getPlayerId: () => string | null; latestDraftState?: unknown };
    };
    if (!active || !lobby.gameService) throw new Error('lobby is not ready');
    lobby.gameService.getPlayerId = () => 'p1';
    lobby.gameService.latestDraftState = {
      type: 'server:draftState',
      matchId: 'pre-fight-exit-smoke',
      draftKind: 'duel',
      players: [
        { id: 'p1', nickname: 'Alpha' },
        { id: 'p2', nickname: 'Bravo' },
      ],
      firstPickerId: 'p2',
      secondPickerId: 'p1',
      firstPickerReason: 'coin_toss',
      currentPickerId: 'p1',
      rallyCategory: null,
      rallyVotes: [],
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
      pickDeadlineMs: 12000,
    };
    active.scene.start('DraftScene', { nickname: 'Alpha' });
  });
  await waitForScene(page, 'DraftScene');
}

async function startCharacterSelect(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = (
      window as unknown as {
        game?: {
          scene: {
            scenes: Array<{
              scene: { start: (key: string, data?: unknown) => void };
              sys: { settings: { active: boolean } };
            }>;
          };
        };
      }
    ).game;
    const active = game?.scene.scenes.find((scene) => scene.sys.settings.active);
    if (!active) throw new Error('active scene is not ready');
    active.scene.start('CharacterSelectScene', {
      nickname: 'Alpha',
      matchData: {
        matchId: 'pre-fight-exit-smoke',
        opponents: [{ id: 'p2', nickname: 'Bravo' }],
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
}

interface BackControlState {
  label: string | null;
  footerHasBack: boolean;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

async function backControlState(page: Page, sceneKey: string): Promise<BackControlState> {
  return page.evaluate((key) => {
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene(key) as {
      backButton?: {
        list?: Array<{ text?: string }>;
        getBounds: () => { x: number; y: number; width: number; height: number };
      };
      children?: { list: Array<{ text?: string; visible?: boolean }> };
    };
    const bounds = scene?.backButton?.getBounds();
    return {
      label: scene?.backButton?.list?.find((child) => child.text === 'BACK TO LOBBY')?.text ?? null,
      footerHasBack:
        scene?.children?.list.some(
          (child) =>
            child.visible &&
            (child.text?.includes('ESC / B BACK') || child.text?.includes('ESC / B LOBBY')),
        ) ?? false,
      bounds: bounds
        ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
        : null,
    };
  }, sceneKey);
}

async function activateCanvasControl(
  page: Page,
  bounds: NonNullable<BackControlState['bounds']>,
  useTouch: boolean,
): Promise<void> {
  const canvas = page.locator('canvas');
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('canvas is not laid out');
  const canvasSize = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  const x = canvasBox.x + ((bounds.x + bounds.width / 2) / canvasSize.width) * canvasBox.width;
  const y = canvasBox.y + ((bounds.y + bounds.height / 2) / canvasSize.height) * canvasBox.height;
  if (useTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test.describe('Pre-fight exit routes', () => {
  test('keeps Draft and Character Select escapable on every input surface', async ({
    gamePage,
  }, testInfo) => {
    test.skip(
      process.env.CAPABILITY_NEW_SHELL === 'true',
      'Standard Reforged Play bypasses these legacy pre-fight scenes; enabled challenge entry is covered by reforged-shell.test.ts.',
    );
    await waitForScene(gamePage, 'LobbyScene');
    await startDraft(gamePage);
    const draft = await backControlState(gamePage, 'DraftScene');
    expect(draft).toMatchObject({ label: 'BACK TO LOBBY' });
    // The visible 30px control intentionally owns a 50px touch target.
    expect(draft.bounds).toMatchObject({ x: 24, y: 14, width: 150, height: 50 });
    await gamePage.waitForTimeout(400);
    await gamePage.screenshot({ path: testInfo.outputPath('draft-back-control.png') });
    await activateCanvasControl(
      gamePage,
      draft.bounds!,
      testInfo.project.name === 'mobile-landscape',
    );
    await waitForScene(gamePage, 'LobbyScene');

    await startCharacterSelect(gamePage);
    const select = await backControlState(gamePage, 'CharacterSelectScene');
    expect(select).toMatchObject({
      label: 'BACK TO LOBBY',
      footerHasBack: testInfo.project.name !== 'mobile-landscape',
    });
    expect(select.bounds).toMatchObject({ x: 24, y: 14, width: 150, height: 50 });
    await gamePage.waitForTimeout(400);
    await gamePage.screenshot({ path: testInfo.outputPath('fighter-select-back-control.png') });
    if (testInfo.project.name === 'mobile-landscape') {
      await activateCanvasControl(gamePage, select.bounds!, true);
    } else {
      await gamePage.keyboard.press('Escape');
    }
    await waitForScene(gamePage, 'LobbyScene');

    // MenuGamepadInput already maps standard B to `back`; prove each scene
    // consumes that action even during the draft's non-pick presentation.
    await startDraft(gamePage);
    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('DraftScene') as {
        menuGamepad: { poll: () => unknown };
        update: () => void;
      };
      scene.menuGamepad = {
        poll: () => ({
          connected: true,
          left: false,
          right: false,
          up: false,
          down: false,
          confirm: false,
          back: true,
          alternate: false,
          hasAction: true,
        }),
      };
      scene.update();
    });
    await waitForScene(gamePage, 'LobbyScene');
  });
});
