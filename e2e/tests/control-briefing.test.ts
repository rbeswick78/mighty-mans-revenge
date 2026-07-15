import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
              x: number;
              y: number;
              emit: (event: string) => void;
            };
            abilityButton?: { visible: boolean; radius: number; x: number; y: number };
            tauntButton?: { visible: boolean; radius: number; x: number; y: number };
            grenadeButtonText?: {
              text: string;
              visible: boolean;
              style: { fontSize: string };
              getBounds: () => Bounds;
            };
            abilityButtonText?: {
              text: string;
              visible: boolean;
              style: { fontSize: string };
              getBounds: () => Bounds;
            };
            tauntButtonText?: {
              text: string;
              visible: boolean;
              style: { fontSize: string };
              getBounds: () => Bounds;
            };
          };
        };
        matchMenu: { launcher: { getBounds: () => Bounds } };
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
                ? {
                    visible: touch.grenadeButton.visible,
                    radius: touch.grenadeButton.radius,
                    x: touch.grenadeButton.x,
                    y: touch.grenadeButton.y,
                  }
                : null,
              ability: touch.abilityButton
                ? {
                    visible: touch.abilityButton.visible,
                    radius: touch.abilityButton.radius,
                    x: touch.abilityButton.x,
                    y: touch.abilityButton.y,
                  }
                : null,
              taunt: touch.tauntButton
                ? {
                    visible: touch.tauntButton.visible,
                    radius: touch.tauntButton.radius,
                    x: touch.tauntButton.x,
                    y: touch.tauntButton.y,
                  }
                : null,
            }
          : null,
        menuLauncherBounds: scene.matchMenu.launcher.getBounds(),
        labels: touch
          ? {
              grenade: touch.grenadeButtonText
                ? {
                    text: touch.grenadeButtonText.text,
                    visible: touch.grenadeButtonText.visible,
                    font: Number.parseInt(touch.grenadeButtonText.style.fontSize, 10),
                    bounds: touch.grenadeButtonText.getBounds(),
                  }
                : null,
              ability: touch.abilityButtonText
                ? {
                    text: touch.abilityButtonText.text,
                    visible: touch.abilityButtonText.visible,
                    font: Number.parseInt(touch.abilityButtonText.style.fontSize, 10),
                    bounds: touch.abilityButtonText.getBounds(),
                  }
                : null,
              taunt: touch.tauntButtonText
                ? {
                    text: touch.tauntButtonText.text,
                    visible: touch.tauntButtonText.visible,
                    font: Number.parseInt(touch.tauntButtonText.style.fontSize, 10),
                    bounds: touch.tauntButtonText.getBounds(),
                  }
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
      expect(
        state.visibleText.some((text) => text.includes('GRENADE  •  ABILITY  •  TAUNT')),
      ).toBe(true);
      expect(state.actions).toEqual({
        gameplayEnabled: false,
        bufferedGrenade: false,
        grenade: { visible: true, radius: 40, x: 904, y: 116 },
        ability: { visible: true, radius: 40, x: 904, y: 208 },
        taunt: { visible: true, radius: 40, x: 808, y: 116 },
      });
      const menuBottom = state.menuLauncherBounds.y + state.menuLauncherBounds.height;
      for (const action of [state.actions.grenade, state.actions.taunt]) {
        expect(action).not.toBeNull();
        if (!action) continue;
        expect(action.y - action.radius).toBeGreaterThanOrEqual(menuBottom + 12);
      }
      expect(state.labels).toMatchObject({
        grenade: { text: 'GRENADE', visible: true, font: 11 },
        ability: { text: 'ABILITY\nREADY', visible: true, font: 11 },
        taunt: { text: 'TAUNT', visible: true, font: 11 },
      });
      for (const label of Object.values(state.labels ?? {})) {
        expect(label).not.toBeNull();
        if (!label) continue;
        expect(label.bounds.width).toBeLessThanOrEqual(76);
        expect(label.bounds.height).toBeLessThanOrEqual(60);
        expect(label.bounds.x).toBeGreaterThanOrEqual(0);
        expect(label.bounds.x + label.bounds.width).toBeLessThanOrEqual(960);
        expect(label.bounds.y).toBeGreaterThanOrEqual(0);
        expect(label.bounds.y + label.bounds.height).toBeLessThanOrEqual(576);
      }
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
            setAbilityButtonState: (state: 'ready' | 'active' | 'cooldown') => void;
            touchInput?: {
              gameplayEnabled?: boolean;
              grenadeButtonPressedFlag?: boolean;
              grenadeButton?: { emit: (event: string) => void };
              grenadeButtonText?: { text: string };
              abilityButtonText?: { text: string };
              tauntButtonText?: { text: string };
              getInput: (hasActiveGrenade: boolean) => unknown;
            };
          };
        };
        scene.gameService.emit('matchStart');
        scene.inputManager?.setAbilityButtonState('cooldown');
        const touch = scene.inputManager?.touchInput;
        touch?.getInput(true);
        touch?.grenadeButton?.emit('pointerdown');
        return {
          gameplayEnabled: touch?.gameplayEnabled ?? null,
          bufferedGrenade: touch?.grenadeButtonPressedFlag ?? null,
          labels: {
            grenade: touch?.grenadeButtonText?.text ?? null,
            ability: touch?.abilityButtonText?.text ?? null,
            taunt: touch?.tauntButtonText?.text ?? null,
          },
        };
      });
      expect(armed).toEqual({
        gameplayEnabled: true,
        bufferedGrenade: true,
        labels: {
          grenade: 'DETONATE',
          ability: 'ABILITY\nCOOLDOWN',
          taunt: 'TAUNT',
        },
      });
      await gamePage.waitForTimeout(50);
      await gamePage.screenshot({ path: testInfo.outputPath('touch-actions-live.png') });
    }
  });
});
