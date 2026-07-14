import { test, expect } from '../fixtures';

test.describe('Scrap Pit solo Rumble', () => {
  test('exposes the solo route and opens three distinct locked Rusties', async (
    { gamePage },
    testInfo,
  ) => {
    test.setTimeout(45000);
    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const game = (
            window as unknown as {
              game?: {
                scene: {
                  scenes: Array<{
                    scene: { key: string };
                    sys: { settings: { active: boolean } };
                  }>;
                };
              };
            }
          ).game;
          return (
            game?.scene.scenes.some(
              (scene) => scene.scene.key === 'LobbyScene' && scene.sys.settings.active,
            ) ?? false
          );
        }),
      )
      .toBe(true);

    if (testInfo.project.name === 'mobile-landscape') {
      const mobileLobby = await gamePage.evaluate(() => {
        const w = window as unknown as {
          game?: { scene: { getScene: (key: string) => unknown } };
        };
        const scene = w.game?.scene.getScene('LobbyScene') as {
          practiceButton: { x: number; list: Array<{ text?: string }> };
          rustyRumbleButton: { x: number; list: Array<{ text?: string }> };
          gauntletButton: { x: number; list: Array<{ text?: string }> };
          dailyButton: { x: number; list: Array<{ text?: string }> };
        };
        const buttons = [
          scene.practiceButton,
          scene.rustyRumbleButton,
          scene.gauntletButton,
          scene.dailyButton,
        ];
        return {
          labels: buttons.map(
            (button) =>
              button.list.find((child) => typeof child.text === 'string')?.text ?? null,
          ),
          xs: buttons.map((button) => button.x),
        };
      });
      expect(mobileLobby.labels).toEqual(['RUSTY SPAR', 'SCRAP PIT', 'GAUNTLET', 'DAILY RUN']);
      expect(mobileLobby.xs).toEqual([...mobileLobby.xs].sort((a, b) => a - b));
      expect(new Set(mobileLobby.xs).size).toBe(4);
      return;
    }

    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('LobbyScene') as {
              connectionState?: string;
            };
            return scene?.connectionState ?? 'missing';
          }),
        { timeout: 20000, message: 'expected the local WebRTC game connection' },
      )
      .toBe('connected');

    const input = gamePage.locator('input[type="text"]').first();
    await input.fill('Solo');

    const lobby = await gamePage.evaluate(() => {
      const w = window as unknown as {
        game?: { scene: { getScene: (key: string) => unknown } };
      };
      const scene = w.game?.scene.getScene('LobbyScene') as {
        practiceButton: { x: number; list: Array<{ text?: string }> };
        rustyRumbleButton: {
          x: number;
          active: boolean;
          activate: () => boolean;
          list: Array<{ text?: string }>;
        };
        gauntletButton: { x: number; list: Array<{ text?: string }> };
        dailyButton: { x: number; list: Array<{ text?: string }> };
      };
      const label = (button: { list: Array<{ text?: string }> }) =>
        button.list.find((child) => typeof child.text === 'string')?.text ?? null;
      const snapshot = {
        labels: [
          label(scene.practiceButton),
          label(scene.rustyRumbleButton),
          label(scene.gauntletButton),
          label(scene.dailyButton),
        ],
        xs: [
          scene.practiceButton.x,
          scene.rustyRumbleButton.x,
          scene.gauntletButton.x,
          scene.dailyButton.x,
        ],
        activated: scene.rustyRumbleButton.activate(),
      };
      return snapshot;
    });

    expect(lobby.labels).toEqual(['RUSTY SPAR', 'SCRAP PIT', 'GAUNTLET', 'DAILY RUN']);
    expect(lobby.xs).toEqual([...lobby.xs].sort((a, b) => a - b));
    expect(new Set(lobby.xs).size).toBe(4);
    expect(lobby.activated).toBe(true);

    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('CharacterSelectScene') as {
              sys?: { settings: { active: boolean } };
              matchData?: { matchKind?: string; practiceKind?: string; opponents?: unknown[] };
              latestSelections?: Array<{
                nickname: string;
                lockedCharacterId: string | null;
              }>;
              children?: { list: Array<{ text?: string }> };
            };
            const selections = scene?.latestSelections ?? [];
            const bots = selections.filter((selection) => selection.nickname !== 'Solo');
            return {
              active: scene?.sys?.settings.active ?? false,
              matchKind: scene?.matchData?.matchKind ?? null,
              practiceKind: scene?.matchData?.practiceKind ?? null,
              opponentCount: scene?.matchData?.opponents?.length ?? 0,
              botNicknames: bots.map((bot) => bot.nickname),
              botLocks: bots.map((bot) => bot.lockedCharacterId),
              briefing:
                scene?.children?.list.some((child) => child.text?.startsWith('SCRAP PIT:')) ??
                false,
            };
          }),
        { timeout: 15000, message: 'expected the authoritative four-fighter Scrap Pit select' },
      )
      .toMatchObject({
        active: true,
        matchKind: 'rumble',
        practiceKind: 'rusty_rumble',
        opponentCount: 3,
        botNicknames: ['RUSTY', 'SCRAPJAW', 'CLANK'],
        briefing: true,
      });

    const locks = await gamePage.evaluate(() => {
      const w = window as unknown as {
        game?: { scene: { getScene: (key: string) => unknown } };
      };
      const scene = w.game?.scene.getScene('CharacterSelectScene') as {
        latestSelections?: Array<{ nickname: string; lockedCharacterId: string | null }>;
      };
      return (scene.latestSelections ?? [])
        .filter((selection) => selection.nickname !== 'Solo')
        .map((selection) => selection.lockedCharacterId);
    });
    expect(locks.every((lock) => lock !== null)).toBe(true);
    expect(new Set(locks).size).toBe(3);
  });
});
