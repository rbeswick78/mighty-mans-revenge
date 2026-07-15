import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FeedRow {
  text: string;
  color: string;
  font: number;
  bounds: Bounds;
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

async function feedRows(page: Page): Promise<FeedRow[]> {
  return page.evaluate(() => {
    type TextNode = {
      text: string;
      style: { color: string; fontSize: string };
      getBounds: () => Bounds;
    };
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('GameScene') as {
      hud: { killFeedEntries: Array<{ text: TextNode }> };
    };
    return scene.hud.killFeedEntries.map(({ text }) => ({
      text: text.text,
      color: text.style.color,
      font: Number.parseInt(text.style.fontSize, 10),
      bounds: text.getBounds(),
    }));
  });
}

test.describe('Readable live kill feed', () => {
  test('keeps newest authoritative combat outcomes visible across devices', async ({
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
      lobby.gameService.getNetworkManager().getPlayerId = () => 'feed-local';
      lobby.scene.start('GameScene', {
        nickname: 'Feed Reader',
        matchData: {
          matchId: 'kill-feed-smoke',
          opponents: [
            { id: 'feed-rival', nickname: 'Rusty' },
            { id: 'feed-third', nickname: 'Scrapjaw' },
            { id: 'feed-fourth', nickname: 'Clank' },
          ],
          mapName: 'Scrapyard',
          gameMode: 'deathmatch',
          matchKind: 'practice',
        },
      });
    });
    await waitForScene(gamePage, 'GameScene');
    await gamePage.waitForTimeout(300);
    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        scene: { pause: () => void };
        onPlayerKilled: (entry: {
          killerId: string;
          victimId: string;
          weapon: string;
          timestamp: number;
        }) => void;
      };
      scene.scene.pause();
      scene.onPlayerKilled({
        killerId: 'feed-third',
        victimId: 'feed-fourth',
        weapon: 'axe',
        timestamp: 1,
      });
      scene.onPlayerKilled({
        killerId: 'feed-local',
        victimId: 'feed-rival',
        weapon: 'gun',
        timestamp: 2,
      });
      scene.onPlayerKilled({
        killerId: 'feed-rival',
        victimId: 'feed-local',
        weapon: 'shotgun',
        timestamp: 3,
      });
    });

    const rows = await feedRows(gamePage);
    expect(rows.map((row) => row.text)).toEqual([
      'RUSTY [SHOTGUN] YOU',
      'YOU [RIFLE] RUSTY',
      'SCRAPJAW [AXE] CLANK',
    ]);
    expect(rows.map((row) => row.color)).toEqual(['#ea4f36', '#91db69', '#c7dcd0']);
    for (const [index, row] of rows.entries()) {
      expect(row.font).toBe(16);
      expect(row.bounds.x).toBeGreaterThanOrEqual(640);
      expect(row.bounds.x + row.bounds.width).toBeLessThanOrEqual(960);
      expect(row.bounds.y).toBeGreaterThanOrEqual(576);
      expect(row.bounds.y + row.bounds.height).toBeLessThanOrEqual(720);
      if (index > 0) {
        expect(row.bounds.y).toBeGreaterThan(rows[index - 1].bounds.y);
      }
    }
    await gamePage.screenshot({ path: testInfo.outputPath('kill-feed.png') });
  });
});
