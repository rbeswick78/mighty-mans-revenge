import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

interface ButtonTextSnapshot {
  text: string;
  font: number;
  width: number;
}

interface ButtonSnapshot {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  targetHeight: number;
  label: ButtonTextSnapshot;
  subtitle: ButtonTextSnapshot | null;
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

async function playButtonSnapshot(page: Page): Promise<ButtonSnapshot[]> {
  return page.evaluate(() => {
    type TextNode = {
      type: string;
      text: string;
      displayWidth: number;
      style: { fontSize: string };
    };
    type ButtonNode = {
      x: number;
      y: number;
      btnWidth: number;
      btnHeight: number;
      zone: { height: number };
      list: Array<TextNode | { type: string }>;
    };
    const scene = (
      window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
    ).game?.scene.getScene('LobbyScene') as Record<string, ButtonNode>;
    const names = [
      'quickMatchButton',
      'rumbleButton',
      'practiceButton',
      'rustyRumbleButton',
      'crewBattleButton',
      'gauntletButton',
      'dailyButton',
      'practiceSetupButton',
      'buildCodexButton',
    ] as const;
    const readText = (node: TextNode): ButtonTextSnapshot => ({
      text: node.text,
      font: Number.parseInt(node.style.fontSize, 10),
      width: node.displayWidth,
    });

    return names.map((name) => {
      const button = scene[name];
      const textNodes = button.list.filter((child): child is TextNode => child.type === 'Text');
      const label = textNodes[0];
      if (!label) throw new Error(`${name} has no label`);
      return {
        name,
        x: button.x,
        y: button.y,
        width: button.btnWidth,
        height: button.btnHeight,
        targetHeight: button.zone.height,
        label: readText(label),
        subtitle: textNodes[1] ? readText(textNodes[1]) : null,
      };
    });
  });
}

test.describe('Readable lobby play controls', () => {
  test('keeps every play route legible and safely tappable across devices', async ({
    gamePage,
  }, testInfo) => {
    await waitForLobby(gamePage);
    const buttons = await playButtonSnapshot(gamePage);
    const byName = Object.fromEntries(buttons.map((button) => [button.name, button]));

    expect(buttons.map((button) => button.label.text)).toEqual([
      'QUICK MATCH',
      'RUMBLE 2-4',
      'SPAR',
      'SCRAP PIT',
      'CREW 2V2',
      'GAUNTLET',
      'DAILY RUN',
      'PRACTICE SETUP',
      expect.stringContaining('BUILD CODEX:'),
    ]);
    expect(buttons.map((button) => button.label.font)).toEqual([9, 9, 8, 8, 8, 8, 8, 9, 7]);
    expect(byName.rustyRumbleButton?.subtitle).toMatchObject({
      text: 'NO WINS YET',
      font: 6,
    });
    expect(byName.practiceButton?.subtitle).toMatchObject({
      text: 'VS RUSTY',
      font: 6,
    });
    expect(byName.crewBattleButton?.subtitle).toMatchObject({
      text: 'TOUR 0/4',
      font: 6,
    });
    expect(byName.practiceSetupButton?.subtitle).toMatchObject({
      text: 'LEVEL · RIVAL · MODE · CHAOS',
      font: 6,
    });

    for (const button of buttons) {
      expect(button.label.width).toBeLessThanOrEqual(button.width - 10);
      if (button.subtitle) {
        expect(button.subtitle.width).toBeLessThanOrEqual(button.width - 10);
      }
      expect(button.targetHeight).toBeGreaterThanOrEqual(button.height);
    }

    expect(byName.quickMatchButton).toMatchObject({ y: 94, height: 38, targetHeight: 42 });
    expect(byName.rumbleButton).toMatchObject({ y: 94, height: 38, targetHeight: 42 });
    for (const name of ['practiceButton', 'rustyRumbleButton', 'crewBattleButton']) {
      expect(byName[name]).toMatchObject({ y: 138, height: 34, targetHeight: 38 });
    }
    for (const name of ['gauntletButton', 'dailyButton']) {
      expect(byName[name]).toMatchObject({ y: 176, height: 34, targetHeight: 38 });
    }
    expect(byName.practiceSetupButton).toMatchObject({
      y: 216,
      height: 38,
      targetHeight: 44,
    });
    expect(byName.buildCodexButton).toMatchObject({
      y: 280,
      height: 18,
      targetHeight: 22,
    });

    const rowTargets = [
      byName.quickMatchButton,
      byName.practiceButton,
      byName.gauntletButton,
      byName.practiceSetupButton,
      byName.buildCodexButton,
    ].filter((button): button is ButtonSnapshot => button !== undefined);
    for (let index = 1; index < rowTargets.length; index += 1) {
      const previous = rowTargets[index - 1];
      const current = rowTargets[index];
      const previousBottom = previous.y + (previous.height + previous.targetHeight) / 2;
      const currentTop = current.y + (current.height - current.targetHeight) / 2;
      expect(currentTop).toBeGreaterThanOrEqual(previousBottom);
    }

    await gamePage.screenshot({ path: testInfo.outputPath('lobby-play-controls.png') });
  });
});
