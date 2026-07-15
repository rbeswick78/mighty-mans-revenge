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
    .poll(() =>
      page.evaluate((sceneKey) => {
        const game = (
          window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
        ).game;
        const scene = game?.scene.getScene(sceneKey) as {
          sys?: { settings: { active: boolean } };
        };
        return scene?.sys?.settings.active ?? false;
      }, key),
    )
    .toBe(true);
}

async function pressCanvasBounds(page: Page, bounds: Bounds, touch: boolean): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('game canvas is not laid out');
  const size = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  const x = box.x + ((bounds.x + bounds.width / 2) / size.width) * box.width;
  const y = box.y + ((bounds.y + bounds.height / 2) / size.height) * box.height;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test.describe('Selected fighter briefing', () => {
  test('turns the dense roster into one readable decision across devices', async ({
    gamePage,
  }, testInfo) => {
    await waitForScene(gamePage, 'LobbyScene');
    await gamePage.evaluate(() => {
      const game = (
        window as unknown as {
          game?: { scene: { getScene: (key: string) => unknown } };
        }
      ).game;
      const lobby = game?.scene.getScene('LobbyScene') as {
        scene?: { start: (key: string, data: unknown) => void };
        gameService?: {
          sendCharacterHover: (...args: unknown[]) => unknown;
          sendCharacterLock: (...args: unknown[]) => unknown;
        };
      };
      if (!lobby?.scene || !lobby.gameService) throw new Error('lobby scene is not ready');
      const service = lobby.gameService;
      service.sendCharacterHover = () => undefined;
      service.sendCharacterLock = () => undefined;
      const fighterSelect = game?.scene.getScene('CharacterSelectScene') as {
        wireGameServiceEvents?: () => void;
      };
      fighterSelect.wireGameServiceEvents = () => undefined;
      lobby.scene.start('CharacterSelectScene', {
        nickname: 'Reader',
        matchData: {
          matchId: 'fighter-briefing-smoke',
          opponents: [{ id: 'rusty-reader', nickname: 'Rusty' }],
          mapName: 'Overgrown Suburb',
          gameMode: 'deathmatch',
          matchKind: 'practice',
          practiceKind: 'sparring',
          characterWins: {},
        },
      });
    });
    await waitForScene(gamePage, 'CharacterSelectScene');
    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('CharacterSelectScene') as { cards?: Map<string, unknown> };
          return scene?.cards?.size ?? 0;
        }),
      )
      .toBe(6);

    const initial = await gamePage.evaluate(() => {
      type DisplayNode = { text?: string };
      type Card = {
        container: { list: DisplayNode[] };
        hitZone: { getBounds: () => Bounds };
      };
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('CharacterSelectScene') as {
        children: { list: Array<{ text?: string; getBounds?: () => Bounds }> };
        cards: Map<string, Card>;
        fighterDetailTitle: { text: string; style: { fontSize: string } };
        fighterDetailText: {
          text: string;
          width: number;
          style: { fontSize: string };
        };
        lockButton: { getBounds: () => Bounds };
      };
      const jack = scene.cards.get('jack');
      if (!jack) throw new Error('Jack card is missing');
      const footer = scene.children.list.find(
        (child) =>
          child.text?.startsWith('TAB / ARROWS') || child.text?.startsWith('TAP A FIGHTER'),
      );
      const staleAbilityCopy = [...scene.cards.values()].flatMap((card) =>
        card.container.list
          .map((child) => child.text)
          .filter((text): text is string => typeof text === 'string')
          .filter((text) => text.includes('(30s)') || text.includes('(45s)')),
      );
      return {
        title: scene.fighterDetailTitle.text,
        detail: scene.fighterDetailText.text,
        titleFont: Number.parseInt(scene.fighterDetailTitle.style.fontSize, 10),
        detailFont: Number.parseInt(scene.fighterDetailText.style.fontSize, 10),
        detailWidth: scene.fighterDetailText.width,
        jackBounds: jack.hitZone.getBounds(),
        lockBounds: scene.lockButton.getBounds(),
        footerBounds: footer?.getBounds?.() ?? null,
        staleAbilityCopy,
      };
    });

    expect(initial).toMatchObject({
      title: 'MIGHTY MAN  //  X-RAY VISION',
      detail: '100 HP  //  SPEED 1.00X  //  WALL SHOTS 7S // 30S COOLDOWN',
      titleFont: 11,
      detailFont: 13,
      staleAbilityCopy: [],
    });
    expect(initial.detailWidth).toBeLessThan(640);
    expect(initial.jackBounds.height).toBe(210);
    expect(initial.footerBounds).not.toBeNull();
    expect(initial.lockBounds.y + initial.lockBounds.height).toBeLessThan(
      initial.footerBounds?.y ?? 0,
    );

    await gamePage.screenshot({ path: testInfo.outputPath('fighter-briefing-mighty-man.png') });
    await pressCanvasBounds(
      gamePage,
      initial.jackBounds,
      testInfo.project.name === 'mobile-landscape',
    );
    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('CharacterSelectScene') as {
            fighterDetailTitle: { text: string };
            fighterDetailText: { text: string };
          };
          return {
            title: scene.fighterDetailTitle.text,
            detail: scene.fighterDetailText.text,
          };
        }),
      )
      .toEqual({
        title: 'JACK  //  AXE THROW',
        detail: '100 HP  //  SPEED 1.00X  //  60 DAMAGE AXE // 12S COOLDOWN',
      });

    await gamePage.keyboard.press('ArrowRight');
    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('CharacterSelectScene') as {
            fighterDetailTitle: { text: string };
          };
          return scene.fighterDetailTitle.text;
        }),
      )
      .toBe('ROOK  //  BREACH DASH');
    await gamePage.screenshot({ path: testInfo.outputPath('fighter-briefing-rook.png') });
  });
});
