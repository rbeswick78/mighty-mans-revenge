import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

async function waitForActiveScene(page: Page, key: string): Promise<void> {
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

test.describe('Pre-fight control briefing', () => {
  test('teaches the active input surface and reveals touch actions before play', async ({
    gamePage,
  }, testInfo) => {
    await waitForActiveScene(gamePage, 'LobbyScene');
    await gamePage.evaluate(() => {
      const game = (
        window as unknown as {
          game?: {
            scene: {
              scenes: Array<{
                scene: { start: (key: string, data: unknown) => void };
                sys: { settings: { active: boolean } };
              }>;
            };
          };
        }
      ).game;
      const active = game?.scene.scenes.find((scene) => scene.sys.settings.active);
      if (!active) throw new Error('active scene is not ready');
      active.scene.start('GameScene', {
        nickname: 'ControlTester',
        matchData: {
          matchId: 'control-briefing-smoke',
          opponents: [{ id: 'rival-a', nickname: 'Rusty' }],
          mapName: 'Scrapyard',
          gameMode: 'deathmatch',
          matchKind: 'duel',
        },
      });
    });
    await waitForActiveScene(gamePage, 'GameScene');

    const state = await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        gameService: { emit: (event: string, value: number) => void };
        children: {
          list: Array<{ text?: string; visible?: boolean }>;
        };
        inputManager?: {
          getActiveMode: () => string;
          touchInput?: {
            gameplayEnabled?: boolean;
            grenadeButtonPressedFlag?: boolean;
            grenadeButton?: {
              visible: boolean;
              radius: number;
              emit: (event: string) => void;
            };
            abilityButton?: { visible: boolean; radius: number };
            tauntButton?: { visible: boolean; radius: number };
          };
        };
      };
      scene.gameService.emit('matchCountdown', 3);
      const visibleText = scene.children.list
        .filter((child) => child.visible && typeof child.text === 'string')
        .map((child) => child.text as string);
      const touch = scene.inputManager?.touchInput;
      if (scene.inputManager?.getActiveMode() === 'touch') {
        touch?.grenadeButton?.emit('pointerdown');
      }
      return {
        inputMode: scene.inputManager?.getActiveMode() ?? null,
        visibleText,
        actions: touch
          ? {
              gameplayEnabled: touch.gameplayEnabled ?? null,
              bufferedGrenade: touch.grenadeButtonPressedFlag ?? null,
              grenade: touch.grenadeButton
                ? { visible: touch.grenadeButton.visible, radius: touch.grenadeButton.radius }
                : null,
              ability: touch.abilityButton
                ? { visible: touch.abilityButton.visible, radius: touch.abilityButton.radius }
                : null,
              taunt: touch.tauntButton
                ? { visible: touch.tauntButton.visible, radius: touch.tauntButton.radius }
                : null,
            }
          : null,
      };
    });

    expect(state.visibleText).toContain('DEATHMATCH');
    expect(state.visibleText).toContain('FIRST TO 10 KILLS');
    expect(state.visibleText.some((text) => text.includes('RELEASE TO FIRE'))).toBe(true);

    if (testInfo.project.name === 'mobile-landscape') {
      expect(state.inputMode).toBe('touch');
      expect(state.visibleText).toContain('HOW TO FIGHT // TOUCH');
      expect(state.visibleText.some((text) => text.includes('HOLD RIGHT SIDE TO AIM'))).toBe(
        true,
      );
      expect(state.actions).toEqual({
        gameplayEnabled: false,
        bufferedGrenade: false,
        grenade: { visible: true, radius: 40 },
        ability: { visible: true, radius: 40 },
        taunt: { visible: true, radius: 40 },
      });
    } else {
      expect(state.inputMode).toBe('keyboard');
      expect(state.visibleText).toContain('HOW TO FIGHT // KEYBOARD + MOUSE');
      expect(state.visibleText.some((text) => text.includes('HOLD LMB TO AIM'))).toBe(true);
    }

    // The GameScene deliberately fades in for 300ms. Capture after that beat
    // so the artifact verifies the rendered card rather than the transition.
    await gamePage.waitForTimeout(400);
    await gamePage.screenshot({ path: testInfo.outputPath('control-briefing.png') });

    if (testInfo.project.name === 'mobile-landscape') {
      const armed = await gamePage.evaluate(() => {
        const scene = (
          window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
        ).game?.scene.getScene('GameScene') as {
          gameService: { emit: (event: string) => void };
          inputManager?: {
            touchInput?: {
              gameplayEnabled?: boolean;
              grenadeButtonPressedFlag?: boolean;
              grenadeButton?: { emit: (event: string) => void };
            };
          };
        };
        scene.gameService.emit('matchStart');
        scene.inputManager?.touchInput?.grenadeButton?.emit('pointerdown');
        return {
          gameplayEnabled: scene.inputManager?.touchInput?.gameplayEnabled ?? null,
          bufferedGrenade:
            scene.inputManager?.touchInput?.grenadeButtonPressedFlag ?? null,
        };
      });
      expect(armed).toEqual({ gameplayEnabled: true, bufferedGrenade: true });
    }
  });
});
