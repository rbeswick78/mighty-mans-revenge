import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextSnapshot {
  text: string;
  color: string;
  font: number;
  visible: boolean;
  bounds: Bounds;
}

interface PanelSnapshot {
  background: { visible: boolean; bounds: Bounds };
  title: TextSnapshot;
  rows: TextSnapshot;
}

async function waitForLobby(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('LobbyScene') as {
            sys?: { settings?: { active?: boolean } };
          };
          return scene?.sys?.settings?.active ?? false;
        }),
      { timeout: 15000 },
    )
    .toBe(true);
}

async function leaderboardSnapshot(
  page: Page,
): Promise<{ career: PanelSnapshot; daily: PanelSnapshot }> {
  return page.evaluate(() => {
    type TextNode = {
      text: string;
      visible: boolean;
      style: { color: string; fontSize: string };
      getBounds: () => Bounds;
    };
    type RectangleNode = {
      visible: boolean;
      getBounds: () => Bounds;
    };
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('LobbyScene') as {
      leaderboardPanelBg: RectangleNode;
      leaderboardTitleText: TextNode;
      leaderboardRowsText: TextNode;
      dailyLeaderboardPanelBg: RectangleNode;
      dailyLeaderboardTitleText: TextNode;
      dailyLeaderboardRowsText: TextNode;
    };
    const readText = (node: TextNode): TextSnapshot => ({
      text: node.text,
      color: node.style.color,
      font: Number.parseInt(node.style.fontSize, 10),
      visible: node.visible,
      bounds: node.getBounds(),
    });
    const readPanel = (
      background: RectangleNode,
      title: TextNode,
      rows: TextNode,
    ): PanelSnapshot => ({
      background: { visible: background.visible, bounds: background.getBounds() },
      title: readText(title),
      rows: readText(rows),
    });

    return {
      career: readPanel(
        scene.leaderboardPanelBg,
        scene.leaderboardTitleText,
        scene.leaderboardRowsText,
      ),
      daily: readPanel(
        scene.dailyLeaderboardPanelBg,
        scene.dailyLeaderboardTitleText,
        scene.dailyLeaderboardRowsText,
      ),
    };
  });
}

function expectTextInsidePanel(text: TextSnapshot, panel: Bounds): void {
  expect(text.visible).toBe(true);
  expect(text.bounds.x).toBeGreaterThanOrEqual(panel.x + 10);
  expect(text.bounds.x + text.bounds.width).toBeLessThanOrEqual(panel.x + panel.width - 10);
  expect(text.bounds.y).toBeGreaterThanOrEqual(panel.y + 10);
  expect(text.bounds.y + text.bounds.height).toBeLessThanOrEqual(panel.y + panel.height - 10);
}

test.describe('Readable lobby leaderboards', () => {
  test('keeps career and daily score chases clear across devices', async ({
    gamePage,
  }, testInfo) => {
    await waitForLobby(gamePage);
    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('LobbyScene') as {
        updateLeaderboard: (entries: unknown[]) => void;
        updateDailyLeaderboard: (snapshot: unknown) => void;
      };
      scene.updateLeaderboard([
        {
          nickname: 'MightyMax',
          wins: 42,
          losses: 17,
          draws: 2,
          kills: 318,
          matches: 61,
          contractsCompleted: 28,
        },
        {
          nickname: 'ScrapKing',
          wins: 31,
          losses: 21,
          draws: 1,
          kills: 240,
          matches: 53,
          contractsCompleted: 19,
        },
        {
          nickname: 'DustRider',
          wins: 24,
          losses: 19,
          draws: 0,
          kills: 175,
          matches: 43,
          contractsCompleted: 13,
        },
        {
          nickname: 'RoadWar8',
          wins: 18,
          losses: 15,
          draws: 1,
          kills: 121,
          matches: 34,
          contractsCompleted: 8,
        },
        {
          nickname: 'NewBlood',
          wins: 9,
          losses: 7,
          draws: 0,
          kills: 60,
          matches: 16,
          contractsCompleted: 3,
        },
      ]);
      scene.updateDailyLeaderboard({
        challengeKey: '2026-07-15',
        entries: [
          { nickname: 'MightyMax', score: 12500 },
          { nickname: 'DustRider', score: 9875 },
          { nickname: 'RoadWar8', score: 8200 },
          { nickname: 'NewBlood', score: 7100 },
          { nickname: 'ScrapKing', score: 6250 },
        ],
      });
    });

    const boards = await leaderboardSnapshot(gamePage);
    expect(boards.career.background.visible).toBe(true);
    expect(boards.daily.background.visible).toBe(true);
    expect(boards.career.background.bounds).toMatchObject({
      x: 24,
      y: 488,
      width: 258,
      height: 192,
    });
    expect(boards.daily.background.bounds).toMatchObject({
      x: 678,
      y: 488,
      width: 258,
      height: 192,
    });

    expect(boards.career.title).toMatchObject({
      text: 'ALL-TIME TOP 5\nW · L · C CONTRACTS',
      color: '#ab947a',
      font: 11,
    });
    expect(boards.daily.title).toMatchObject({
      text: 'DAILY TOP 5\n2026-07-15 UTC',
      color: '#f57d4a',
      font: 11,
    });
    expect(boards.career.rows).toMatchObject({ color: '#c7dcd0', font: 14 });
    expect(boards.daily.rows).toMatchObject({ color: '#c7dcd0', font: 14 });
    expect(boards.career.rows.text.split('\n')).toHaveLength(5);
    expect(boards.daily.rows.text.split('\n')).toHaveLength(5);

    expectTextInsidePanel(boards.career.title, boards.career.background.bounds);
    expectTextInsidePanel(boards.career.rows, boards.career.background.bounds);
    expectTextInsidePanel(boards.daily.title, boards.daily.background.bounds);
    expectTextInsidePanel(boards.daily.rows, boards.daily.background.bounds);
    expect(boards.career.title.bounds.y + boards.career.title.bounds.height).toBeLessThan(
      boards.career.rows.bounds.y,
    );
    expect(boards.daily.title.bounds.y + boards.daily.title.bounds.height).toBeLessThan(
      boards.daily.rows.bounds.y,
    );
    expect(
      boards.career.background.bounds.x + boards.career.background.bounds.width,
    ).toBeLessThanOrEqual(282);
    expect(boards.daily.background.bounds.x).toBeGreaterThanOrEqual(678);

    await gamePage.screenshot({ path: testInfo.outputPath('lobby-leaderboards.png') });
  });
});
