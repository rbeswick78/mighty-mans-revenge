import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StatusNode {
  text: string;
  color: string;
  font: number;
  bounds: Bounds;
}

interface StatusSnapshot {
  score: StatusNode;
  logicalWidth: number;
  logicalHeight: number;
  mode: StatusNode;
  timer: StatusNode;
  event: StatusNode;
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

async function statusSnapshot(page: Page): Promise<StatusSnapshot> {
  return page.evaluate(() => {
    type TextNode = {
      text: string;
      style: { color: string; fontSize: string };
      getBounds: () => Bounds;
    };
    const game = (
      window as unknown as {
        game?: { scale: { width: number }; scene: { getScene: (key: string) => unknown } };
      }
    ).game;
    const scene = game?.scene.getScene('GameScene') as {
      hud: {
        scoreText: TextNode;
        coreRunText: TextNode;
        timerText: TextNode;
        activeEventLabel: TextNode;
      };
    };
    const read = (node: TextNode): StatusNode => ({
      text: node.text,
      color: node.style.color,
      font: Number.parseInt(node.style.fontSize, 10),
      bounds: node.getBounds(),
    });

    return {
      logicalWidth: game?.scale.width ?? 960,
      logicalHeight: game?.scale.height ?? 720,
      score: read(scene.hud.scoreText),
      mode: read(scene.hud.coreRunText),
      timer: read(scene.hud.timerText),
      event: read(scene.hud.activeEventLabel),
    };
  });
}

test.describe('Readable match status', () => {
  test('keeps scores, objective, clock, and events legible across devices', async ({
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
      lobby.gameService.getNetworkManager().getPlayerId = () => 'status-local';
      lobby.scene.start('GameScene', {
        nickname: 'Status Reader',
        matchData: {
          matchId: 'match-status-smoke',
          opponents: [{ id: 'status-rival', nickname: 'Rusty' }],
          mapName: 'Scrapyard',
          gameMode: 'core-run',
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
        hud: {
          updateScores: (scores: Array<{ name: string; score: number }>) => void;
          updateCoreRun: (state: unknown, localPlayerId: string) => void;
          updateTimer: (seconds: number) => void;
          setOvertime: (active: boolean) => void;
          setActiveEventLabel: (label: string) => void;
        };
      };
      scene.scene.pause();
      scene.hud.updateScores([
        { name: 'YOU', score: 12 },
        { name: 'RUSTY', score: 9 },
      ]);
      scene.hud.updateCoreRun(
        {
          position: { x: 0, y: 0 },
          carrierId: 'status-rival',
          returnInSeconds: null,
          carryFraction: 0.5,
        },
        'status-local',
      );
      scene.hud.updateTimer(29.1);
      scene.hud.setOvertime(false);
      scene.hud.setActiveEventLabel('WASTELAND WARP · POSITIONS SWAP');
    });

    const status = await statusSnapshot(gamePage);
    expect(status.score).toMatchObject({
      text: 'YOU: 12  |  RUSTY: 9',
      font: 16,
    });
    expect(status.mode).toMatchObject({
      text: 'RIVAL HAS THE CORE · HUNT THEM',
      font: 13,
    });
    expect(status.timer).toMatchObject({ text: '0:30', color: '#f9c22b', font: 18 });
    expect(status.event).toMatchObject({
      text: 'WASTELAND WARP · POSITIONS SWAP',
      font: 12,
    });

    const ordered = [status.score, status.mode, status.timer, status.event];
    for (const [index, node] of ordered.entries()) {
      expect(node.bounds.x).toBeGreaterThanOrEqual(300);
      expect(node.bounds.x + node.bounds.width).toBeLessThanOrEqual(status.logicalWidth - 300);
      expect(node.bounds.y).toBeGreaterThanOrEqual(0);
      expect(node.bounds.y + node.bounds.height).toBeLessThanOrEqual(status.logicalHeight);
      if (index > 0) {
        const previous = ordered[index - 1];
        expect(node.bounds.y).toBeGreaterThanOrEqual(previous.bounds.y + previous.bounds.height);
      }
    }

    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        hud: {
          updateScores: (scores: Array<{ name: string; score: number }>) => void;
          updateTimer: (seconds: number) => void;
          setOvertime: (active: boolean) => void;
        };
      };
      scene.hud.updateScores([
        { name: 'Alpha Maximum', score: 20 },
        { name: 'Bravo Maximum', score: 18 },
        { name: 'Charlie Maximum', score: 15 },
        { name: 'Delta Maximum', score: 12 },
      ]);
      scene.hud.updateTimer(9.1);
    });
    const compact = await statusSnapshot(gamePage);
    expect(compact.score.font).toBe(11);
    expect(compact.score.bounds.x).toBeGreaterThanOrEqual(300);
    expect(compact.score.bounds.x + compact.score.bounds.width).toBeLessThanOrEqual(
      compact.logicalWidth - 300,
    );
    expect(compact.timer).toMatchObject({ text: '0:10', color: '#ea4f36' });

    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('GameScene') as {
        hud: { setOvertime: (active: boolean) => void };
      };
      scene.hud.setOvertime(true);
    });
    expect((await statusSnapshot(gamePage)).timer.color).toBe('#ea4f36');
    await gamePage.screenshot({ path: testInfo.outputPath('match-status.png') });
  });
});
