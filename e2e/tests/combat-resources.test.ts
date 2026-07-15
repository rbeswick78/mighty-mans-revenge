import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ResourceState {
  ammo: string;
  ammoColor: string;
  ammoFont: number;
  ammoBounds: Bounds;
  grenades: string;
  grenadeColor: string;
  grenadeFont: number;
  grenadeBounds: Bounds;
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

async function resourceState(page: Page): Promise<ResourceState> {
  return page.evaluate(() => {
    type TextNode = {
      text: string;
      style: { color: string; fontSize: string };
      getBounds: () => Bounds;
    };
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('GameScene') as {
      hud: { ammoText: TextNode; grenadeText: TextNode };
    };
    const ammoBounds = scene.hud.ammoText.getBounds();
    const grenadeBounds = scene.hud.grenadeText.getBounds();
    return {
      ammo: scene.hud.ammoText.text,
      ammoColor: scene.hud.ammoText.style.color,
      ammoFont: Number.parseInt(scene.hud.ammoText.style.fontSize, 10),
      ammoBounds,
      grenades: scene.hud.grenadeText.text,
      grenadeColor: scene.hud.grenadeText.style.color,
      grenadeFont: Number.parseInt(scene.hud.grenadeText.style.fontSize, 10),
      grenadeBounds,
    };
  });
}

test.describe('Combat resource HUD', () => {
  test('keeps ammo and grenades readable at a glance across devices', async ({
    gamePage,
  }, testInfo) => {
    await waitForScene(gamePage, 'LobbyScene');
    await gamePage.evaluate(() => {
      const lobby = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('LobbyScene') as {
        scene: { start: (key: string, data: unknown) => void };
        gameService: { getNetworkManager: () => { getPlayerId: () => string | null } };
      };
      lobby.gameService.getNetworkManager().getPlayerId = () => 'resource-local';
      lobby.scene.start('GameScene', {
        nickname: 'Resource Reader',
        matchData: {
          matchId: 'combat-resource-smoke',
          opponents: [{ id: 'resource-rival', nickname: 'Rusty' }],
          mapName: 'Scrapyard',
          gameMode: 'deathmatch',
          matchKind: 'practice',
        },
      });
    });
    await waitForScene(gamePage, 'GameScene');

    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        hud: {
          updateAmmo: (current: number, max: number, reloading: boolean) => void;
          updateGrenadeStatus: (active: boolean, count: number) => void;
        };
      };
      scene.hud.updateAmmo(30, 30, false);
      scene.hud.updateGrenadeStatus(false, 3);
    });

    const ready = await resourceState(gamePage);
    expect(ready).toMatchObject({
      ammo: 'RIFLE  30/30',
      ammoColor: '#c7dcd0',
      ammoFont: 18,
      grenades: 'GRENADES  3',
      grenadeColor: '#c7dcd0',
      grenadeFont: 18,
    });
    for (const bounds of [ready.ammoBounds, ready.grenadeBounds]) {
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThan(300);
      expect(bounds.y).toBeGreaterThanOrEqual(576);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
    }
    await gamePage.screenshot({ path: testInfo.outputPath('combat-resources-ready.png') });

    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        hud: {
          updateAmmo: (current: number, max: number, reloading: boolean) => void;
          updateGrenadeStatus: (active: boolean, count: number) => void;
        };
      };
      scene.hud.updateAmmo(7, 30, false);
      scene.hud.updateGrenadeStatus(false, 1);
    });
    expect(await resourceState(gamePage)).toMatchObject({
      ammo: 'RIFLE  7/30',
      ammoColor: '#f9c22b',
      grenades: 'GRENADES  1',
      grenadeColor: '#f9c22b',
    });

    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        hud: {
          updateAmmo: (current: number, max: number, reloading: boolean) => void;
          updateGrenadeStatus: (active: boolean, count: number) => void;
        };
      };
      scene.hud.updateAmmo(0, 30, false);
      scene.hud.updateGrenadeStatus(true, 2);
    });
    expect(await resourceState(gamePage)).toMatchObject({
      ammo: 'RIFLE  0/30',
      ammoColor: '#ea4f36',
      grenades: 'GRENADE  LIVE',
      grenadeColor: '#ea4f36',
    });

    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        hud: {
          updateAmmo: (current: number, max: number, reloading: boolean) => void;
          updateOneInTheChamber: (
            active: boolean,
            weaponId: 'pistol',
            rounds: number,
            dead: boolean,
            started: boolean,
          ) => void;
          updateGrenadeStatus: (active: boolean, count: number) => void;
        };
      };
      scene.hud.updateAmmo(0, 30, true);
      scene.hud.updateOneInTheChamber(true, 'pistol', 1, false, true);
      scene.hud.updateGrenadeStatus(true, 2);
    });
    expect(await resourceState(gamePage)).toMatchObject({
      ammo: 'RIFLE  RELOADING',
      ammoColor: '#f9c22b',
      grenades: 'GRENADES  OFF',
      grenadeColor: '#694f62',
    });
    await gamePage.screenshot({ path: testInfo.outputPath('combat-resources-alerts.png') });
  });
});
