import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AbilityHudState {
  name: string;
  nameFont: number;
  nameBounds: Bounds;
  state: string;
  stateColor: string;
  stateFont: number;
  stateBounds: Bounds;
  visible: boolean;
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

async function abilityHudState(page: Page): Promise<AbilityHudState> {
  return page.evaluate(() => {
    type TextNode = {
      text: string;
      visible: boolean;
      style: { color: string; fontSize: string };
      getBounds: () => Bounds;
    };
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('GameScene') as {
      hud: {
        abilityNameText: TextNode;
        abilityCountdownText: TextNode;
      };
    };
    const name = scene.hud.abilityNameText;
    const state = scene.hud.abilityCountdownText;
    return {
      name: name.text,
      nameFont: Number.parseInt(name.style.fontSize, 10),
      nameBounds: name.getBounds(),
      state: state.text,
      stateColor: state.style.color,
      stateFont: Number.parseInt(state.style.fontSize, 10),
      stateBounds: state.getBounds(),
      visible: name.visible && state.visible,
    };
  });
}

async function setAbility(
  page: Page,
  characterId: 'mighty_man' | 'bruce' | 'rook',
  activeSeconds: number,
  cooldownSeconds: number,
): Promise<void> {
  await page.evaluate(
    ({ id, active, cooldown }) => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        hud: {
          updateAbility: (character: string, activeSeconds: number, cooldownSeconds: number) => void;
        };
      };
      scene.hud.updateAbility(id, active, cooldown);
    },
    { id: characterId, active: activeSeconds, cooldown: cooldownSeconds },
  );
}

test.describe('Named ability HUD', () => {
  test('keeps ability identity and readiness readable across devices', async ({ gamePage }, testInfo) => {
    await waitForScene(gamePage, 'LobbyScene');
    await gamePage.evaluate(() => {
      const lobby = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('LobbyScene') as {
        scene: { start: (key: string, data: unknown) => void };
        gameService: { getNetworkManager: () => { getPlayerId: () => string | null } };
      };
      lobby.gameService.getNetworkManager().getPlayerId = () => 'ability-local';
      lobby.scene.start('GameScene', {
        nickname: 'Ability Reader',
        matchData: {
          matchId: 'ability-hud-smoke',
          opponents: [{ id: 'ability-rival', nickname: 'Rusty' }],
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

    await setAbility(gamePage, 'mighty_man', 0, 0);
    const ready = await abilityHudState(gamePage);
    expect(ready).toMatchObject({
      name: 'X-RAY VISION',
      nameFont: 12,
      state: 'READY',
      stateColor: '#4ad8e8',
      stateFont: 12,
      visible: true,
    });
    for (const bounds of [ready.nameBounds, ready.stateBounds]) {
      expect(bounds.x).toBeGreaterThanOrEqual(190);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(315);
      expect(bounds.y).toBeGreaterThanOrEqual(576);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
    }
    await gamePage.waitForTimeout(50);
    await gamePage.screenshot({ path: testInfo.outputPath('ability-ready.png') });

    await setAbility(gamePage, 'bruce', 1.01, 44);
    expect(await abilityHudState(gamePage)).toMatchObject({
      name: 'FIRE BREATH',
      state: 'ACTIVE 2S',
      stateColor: '#c7dcd0',
    });

    await setAbility(gamePage, 'rook', 0, 6.01);
    const cooldown = await abilityHudState(gamePage);
    expect(cooldown).toMatchObject({
      name: 'BREACH DASH',
      state: 'READY IN 7S',
      stateColor: '#9aa3b0',
    });
    for (const bounds of [cooldown.nameBounds, cooldown.stateBounds]) {
      expect(bounds.x).toBeGreaterThanOrEqual(190);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(315);
      expect(bounds.y).toBeGreaterThanOrEqual(576);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
    }
    await gamePage.waitForTimeout(50);
    await gamePage.screenshot({ path: testInfo.outputPath('ability-cooldown.png') });
  });
});
