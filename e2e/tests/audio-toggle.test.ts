import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

const shellAdvertised = process.env.CAPABILITY_NEW_SHELL === 'true';

async function waitForLobby(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const game = (
            window as unknown as {
              game?: {
                scene: {
                  getScene: (key: string) => { sys?: { settings: { active: boolean } } };
                };
              };
            }
          ).game;
          return game?.scene.getScene('LobbyScene')?.sys?.settings.active ?? false;
        }),
      { timeout: 10000 },
    )
    .toBe(true);
}

interface AudioLobbyState {
  label: string | null;
  muted: boolean | null;
  stored: string | null;
  gamepadReachable: boolean;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

async function audioLobbyState(page: Page): Promise<AudioLobbyState> {
  return page.evaluate(() => {
    const game = (
      window as unknown as {
        game?: { sound: { mute: boolean }; scene: { getScene: (key: string) => unknown } };
      }
    ).game;
    const scene = game?.scene.getScene('LobbyScene') as {
      audioButton?: {
        list?: Array<{ text?: string }>;
        getBounds: () => { x: number; y: number; width: number; height: number };
      };
      gamepadButtons?: () => unknown[];
    };
    const bounds = scene?.audioButton?.getBounds();
    return {
      label:
        scene?.audioButton?.list?.find((child) => child.text?.startsWith('AUDIO '))?.text ?? null,
      muted: game?.sound.mute ?? null,
      stored: localStorage.getItem('mmr_audio_muted'),
      gamepadReachable:
        scene?.gamepadButtons?.().some((button) => button === scene.audioButton) ?? false,
      bounds: bounds
        ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
        : null,
    };
  });
}

test.describe('Lobby audio control', () => {
  test('supports pointer/touch, persists mute, and restores through F2', async ({
    lobbyPage,
  }, testInfo) => {
    test.skip(
      shellAdvertised,
      'The advertised shell owns audio through Settings; reforged-shell.test.ts covers that owner.',
    );
    await waitForLobby(lobbyPage);
    const initial = await audioLobbyState(lobbyPage);
    expect(initial).toMatchObject({
      label: 'AUDIO ON  ·  F2',
      muted: false,
      stored: null,
      gamepadReachable: true,
    });
    expect(initial.bounds).not.toBeNull();

    await lobbyPage.screenshot({ path: testInfo.outputPath('audio-toggle-lobby.png') });

    const canvas = lobbyPage.locator('canvas');
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox || !initial.bounds) throw new Error('audio toggle is not laid out');
    const canvasWidth = await canvas.evaluate((element) => (element as HTMLCanvasElement).width);
    const canvasHeight = await canvas.evaluate((element) => (element as HTMLCanvasElement).height);
    const clickX =
      canvasBox.x + ((initial.bounds.x + initial.bounds.width / 2) / canvasWidth) * canvasBox.width;
    const clickY =
      canvasBox.y +
      ((initial.bounds.y + initial.bounds.height / 2) / canvasHeight) * canvasBox.height;
    if (testInfo.project.name === 'mobile-landscape') {
      await lobbyPage.touchscreen.tap(clickX, clickY);
    } else {
      await lobbyPage.mouse.click(clickX, clickY);
    }

    await expect
      .poll(() => audioLobbyState(lobbyPage))
      .toMatchObject({
        label: 'AUDIO OFF  ·  F2',
        muted: true,
        stored: 'true',
      });

    await lobbyPage.reload();
    await waitForLobby(lobbyPage);
    await expect
      .poll(() => audioLobbyState(lobbyPage))
      .toMatchObject({
        label: 'AUDIO OFF  ·  F2',
        muted: true,
        stored: 'true',
        gamepadReachable: true,
      });

    await lobbyPage.keyboard.press('F2');
    await expect
      .poll(() => audioLobbyState(lobbyPage))
      .toMatchObject({
        label: 'AUDIO ON  ·  F2',
        muted: false,
        stored: 'false',
      });
  });
});
