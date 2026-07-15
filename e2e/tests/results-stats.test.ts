import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
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

test.describe('Readable duel results', () => {
  test('keeps large combat totals clear of every stat label across devices', async ({
    gamePage,
  }, testInfo) => {
    await waitForScene(gamePage, 'LobbyScene');
    await gamePage.evaluate(() => {
      const game = (
        window as unknown as {
          game?: {
            scene: {
              scenes: Array<{
                scene: { start: (key: string, data: unknown) => void };
                sys: { settings: { active: boolean } };
              }>;
              getScene: (key: string) => unknown;
            };
          };
        }
      ).game;
      const active = game?.scene.scenes.find((scene) => scene.sys.settings.active);
      const lobby = game?.scene.getScene('LobbyScene') as {
        gameService?: { getPlayerId: () => string | null };
      };
      if (!active || !lobby.gameService) throw new Error('lobby is not ready');
      lobby.gameService.getPlayerId = () => 'local';

      const stats = {
        kills: 18,
        assists: 0,
        deaths: 7,
        shotsFired: 120,
        shotsHit: 73,
        damageDealt: 12_345,
        damageTaken: 9_876,
        grenadesThrown: 42,
        killsByWeapon: {
          gun: 10,
          grenade: 8,
          fire: 0,
          shotgun: 0,
          axe: 0,
          pistol: 0,
          punch: 0,
          bat: 0,
          barrel: 0,
        },
        longestKillStreak: 11,
        distanceTraveled: 9_999,
        hillSeconds: 0,
      };

      active.scene.start('ResultsScene', {
        nickname: 'Longhaul',
        matchData: { opponents: [{ id: 'rival', nickname: 'Roadburner' }] },
        result: {
          matchId: 'wide-result-stats',
          winnerId: 'local',
          playerStats: new Map([
            ['local', stats],
            [
              'rival',
              {
                ...stats,
                kills: 7,
                deaths: 18,
                shotsHit: 41,
                damageDealt: 98_765,
                damageTaken: 54_321,
              },
            ],
          ]),
          duration: 180,
          gameMode: 'deathmatch',
          matchKind: 'duel',
          playerCharacters: { local: 'mighty_man', rival: 'bruce' },
          awards: [],
          rivalry: null,
          rivalrySet: null,
          isPractice: false,
          nextMapName: 'Scrapyard',
          nextGameMode: 'koth',
          wentToOvertime: false,
        },
      });
    });
    await waitForScene(gamePage, 'ResultsScene');

    const layout = await gamePage.evaluate(() => {
      interface ResultNode {
        name?: string;
        text?: string;
        x?: number;
        y?: number;
        contentWidth?: number;
        contentHeight?: number;
        list?: ResultNode[];
        getBounds?: () => Bounds;
      }
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('ResultsScene') as { children?: { list: ResultNode[] } };
      const nodes = (scene.children?.list ?? []).flatMap((child) => [
        child,
        ...(child.list ?? []),
      ]);
      const panel = nodes.find((node) => node.name === 'result-stats-panel');
      if (
        panel?.x === undefined ||
        panel.y === undefined ||
        panel.contentWidth === undefined ||
        panel.contentHeight === undefined
      ) {
        throw new Error('missing result stats panel geometry');
      }
      const rows = Array.from({ length: 9 }, (_, index) => {
        const item = (role: 'label' | 'left' | 'right') => {
          const node = nodes.find((candidate) => candidate.name === `result-stat-${role}-${index}`);
          if (!node?.getBounds) throw new Error(`missing ${role} stat node ${index}`);
          return { text: node.text ?? '', bounds: node.getBounds() };
        };
        return { label: item('label'), left: item('left'), right: item('right') };
      });
      return {
        panelBounds: {
          x: panel.x,
          y: panel.y,
          width: panel.contentWidth,
          height: panel.contentHeight,
        },
        rows,
      };
    });

    const { panelBounds, rows } = layout;
    expect(panelBounds.width).toBe(380);
    expect(panelBounds.height).toBe(330);
    expect(rows).toHaveLength(9);
    expect(rows[4]).toMatchObject({
      label: { text: 'DMG DEALT' },
      left: { text: '12345' },
      right: { text: '98765' },
    });
    expect(rows[5]).toMatchObject({
      label: { text: 'DMG TAKEN' },
      left: { text: '9876' },
      right: { text: '54321' },
    });

    for (const row of rows) {
      const leftEdge = row.left.bounds.x + row.left.bounds.width;
      const labelRight = row.label.bounds.x + row.label.bounds.width;
      expect(leftEdge).toBeLessThanOrEqual(row.label.bounds.x - 20);
      expect(labelRight).toBeLessThanOrEqual(row.right.bounds.x - 20);
      for (const item of [row.left, row.label, row.right]) {
        expect(item.bounds.x).toBeGreaterThanOrEqual(panelBounds.x);
        expect(item.bounds.x + item.bounds.width).toBeLessThanOrEqual(
          panelBounds.x + panelBounds.width,
        );
        expect(item.bounds.y).toBeGreaterThanOrEqual(panelBounds.y);
        expect(item.bounds.y + item.bounds.height).toBeLessThanOrEqual(
          panelBounds.y + panelBounds.height,
        );
      }
    }

    await gamePage.waitForTimeout(2100);
    await gamePage.screenshot({ path: testInfo.outputPath('large-stat-columns.png') });
  });
});
