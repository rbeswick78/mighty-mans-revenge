import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VitalityState {
  health: string;
  healthColor: string;
  healthFont: number;
  healthBounds: Bounds;
  sprint: string;
  sprintColor: string;
  sprintFont: number;
  vitalsPanel: Bounds;
  sprintBounds: Bounds;
  sprintBarHeight: number;
}

async function waitForScene(page: Page, key: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((sceneKey) => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene(sceneKey) as { sys?: { settings?: { active?: boolean } } };
          return scene?.sys?.settings?.active ?? false;
        }, key),
      { timeout: 15000 },
    )
    .toBe(true);
}

async function vitalityState(page: Page): Promise<VitalityState> {
  return page.evaluate(() => {
    type TextNode = {
      text: string;
      style: { color: string; fontSize: string };
      getBounds: () => Bounds;
    };
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('GameScene') as {
      hud: {
        healthText: TextNode;
        staminaText: TextNode;
        staminaBarBg: { height: number };
      };
      getResponsiveHudLayout(): { vitalsPanel: Bounds } | null;
    };
    const healthBounds = scene.hud.healthText.getBounds();
    const sprintBounds = scene.hud.staminaText.getBounds();
    return {
      health: scene.hud.healthText.text,
      healthColor: scene.hud.healthText.style.color,
      healthFont: Number.parseInt(scene.hud.healthText.style.fontSize, 10),
      healthBounds,
      sprint: scene.hud.staminaText.text,
      sprintColor: scene.hud.staminaText.style.color,
      sprintFont: Number.parseInt(scene.hud.staminaText.style.fontSize, 10),
      sprintBounds,
      sprintBarHeight: scene.hud.staminaBarBg.height,
      vitalsPanel: scene.getResponsiveHudLayout()?.vitalsPanel ?? {
        x: 0,
        y: 576,
        width: 300,
        height: 144,
      },
    };
  });
}

test.describe('Vitality HUD', () => {
  test('names health and sprint state clearly across devices', async ({ gamePage }, testInfo) => {
    await waitForScene(gamePage, 'LobbyScene');
    await gamePage.evaluate(() => {
      const lobby = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('LobbyScene') as {
        scene: { start: (key: string, data: unknown) => void };
        gameService: { getNetworkManager: () => { getPlayerId: () => string | null } };
      };
      lobby.gameService.getNetworkManager().getPlayerId = () => 'vitality-local';
      lobby.scene.start('GameScene', {
        nickname: 'Vital Reader',
        matchData: {
          matchId: 'vitality-hud-smoke',
          opponents: [{ id: 'vitality-rival', nickname: 'Rusty' }],
          mapName: 'Scrapyard',
          gameMode: 'deathmatch',
          matchKind: 'practice',
        },
      });
    });
    await waitForScene(gamePage, 'GameScene');
    await gamePage.waitForTimeout(400);
    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as { scene: { pause: () => void } };
      scene.scene.pause();
    });

    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        hud: {
          updateHealth: (current: number, max: number, armor: number) => void;
          updateStamina: (current: number, max: number) => void;
        };
      };
      scene.hud.updateHealth(100, 100, 0);
      scene.hud.updateStamina(3, 3);
    });

    const ready = await vitalityState(gamePage);
    expect(ready).toMatchObject({
      health: 'HP  100/100',
      healthColor: '#c7dcd0',
      healthFont: 14,
      sprint: 'SPRINT  READY',
      sprintColor: '#c7dcd0',
      sprintFont: 13,
      sprintBarHeight: 16,
    });
    for (const bounds of [ready.healthBounds, ready.sprintBounds]) {
      expect(bounds.x).toBeGreaterThanOrEqual(ready.vitalsPanel.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(
        ready.vitalsPanel.x + ready.vitalsPanel.width,
      );
      expect(bounds.y).toBeGreaterThanOrEqual(ready.vitalsPanel.y);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        ready.vitalsPanel.y + ready.vitalsPanel.height,
      );
    }
    await gamePage.waitForTimeout(50);
    await gamePage.screenshot({ path: testInfo.outputPath('vitality-ready.png') });

    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        hud: {
          updateHealth: (current: number, max: number, armor: number) => void;
          updateStamina: (current: number, max: number) => void;
        };
      };
      scene.hud.updateHealth(41.1, 115, 12.2);
      scene.hud.updateStamina(0.6, 3);
    });
    expect(await vitalityState(gamePage)).toMatchObject({
      health: 'HP  42/115  ARM 13',
      sprint: 'SPRINT  20%',
      sprintColor: '#f9c22b',
    });

    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        hud: { updateStamina: (current: number, max: number) => void };
      };
      scene.hud.updateStamina(0, 3);
    });
    expect(await vitalityState(gamePage)).toMatchObject({
      sprint: 'SPRINT  EMPTY',
      sprintColor: '#ea4f36',
    });
    await gamePage.waitForTimeout(50);
    await gamePage.screenshot({ path: testInfo.outputPath('vitality-low.png') });
  });
});
