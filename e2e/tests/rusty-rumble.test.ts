import { test, expect } from '../fixtures';

test.describe('Scrap Pit solo Rumble', () => {
  test('opens three distinct rivals and makes the crew answer a challenge', async ({
    gamePage,
  }, testInfo) => {
    test.setTimeout(60000);
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
          practiceButton: { x: number; y: number; list: Array<{ text?: string }> };
          rustyRumbleButton: { x: number; y: number; list: Array<{ text?: string }> };
          crewBattleButton: { x: number; y: number; list: Array<{ text?: string }> };
          gauntletButton: { x: number; y: number; list: Array<{ text?: string }> };
          dailyButton: { x: number; y: number; list: Array<{ text?: string }> };
        };
        const buttons = [
          scene.practiceButton,
          scene.rustyRumbleButton,
          scene.crewBattleButton,
          scene.gauntletButton,
          scene.dailyButton,
        ];
        return {
          labels: buttons.map(
            (button) => button.list.find((child) => typeof child.text === 'string')?.text ?? null,
          ),
          xs: buttons.map((button) => button.x),
          ys: buttons.map((button) => button.y),
        };
      });
      expect(mobileLobby.labels).toEqual([
        'RUSTY SPAR',
        'SCRAP PIT\nNO WINS YET',
        'CREW 2V2\nTOUR 0/4',
        'GAUNTLET',
        'DAILY RUN',
      ]);
      expect(mobileLobby.xs.slice(0, 3)).toEqual(
        [...mobileLobby.xs.slice(0, 3)].sort((a, b) => a - b),
      );
      expect(mobileLobby.xs.slice(3)).toEqual([...mobileLobby.xs.slice(3)].sort((a, b) => a - b));
      expect(new Set(mobileLobby.ys.slice(0, 3)).size).toBe(1);
      expect(new Set(mobileLobby.ys.slice(3)).size).toBe(1);
      expect(mobileLobby.ys[3]).toBeGreaterThan(mobileLobby.ys[0]);
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
        practiceButton: { x: number; y: number; list: Array<{ text?: string }> };
        rustyRumbleButton: {
          x: number;
          y: number;
          active: boolean;
          activate: () => boolean;
          list: Array<{ text?: string }>;
        };
        crewBattleButton: { x: number; y: number; list: Array<{ text?: string }> };
        gauntletButton: { x: number; y: number; list: Array<{ text?: string }> };
        dailyButton: { x: number; y: number; list: Array<{ text?: string }> };
      };
      const label = (button: { list: Array<{ text?: string }> }) =>
        button.list.find((child) => typeof child.text === 'string')?.text ?? null;
      const snapshot = {
        labels: [
          label(scene.practiceButton),
          label(scene.rustyRumbleButton),
          label(scene.crewBattleButton),
          label(scene.gauntletButton),
          label(scene.dailyButton),
        ],
        xs: [
          scene.practiceButton.x,
          scene.rustyRumbleButton.x,
          scene.crewBattleButton.x,
          scene.gauntletButton.x,
          scene.dailyButton.x,
        ],
        ys: [
          scene.practiceButton.y,
          scene.rustyRumbleButton.y,
          scene.crewBattleButton.y,
          scene.gauntletButton.y,
          scene.dailyButton.y,
        ],
        activated: scene.rustyRumbleButton.activate(),
      };
      return snapshot;
    });

    expect(lobby.labels).toEqual([
      'RUSTY SPAR',
      'SCRAP PIT\nNO WINS YET',
      'CREW 2V2\nTOUR 0/4',
      'GAUNTLET',
      'DAILY RUN',
    ]);
    expect(lobby.xs.slice(0, 3)).toEqual([...lobby.xs.slice(0, 3)].sort((a, b) => a - b));
    expect(lobby.xs.slice(3)).toEqual([...lobby.xs.slice(3)].sort((a, b) => a - b));
    expect(new Set(lobby.ys.slice(0, 3)).size).toBe(1);
    expect(new Set(lobby.ys.slice(3)).size).toBe(1);
    expect(lobby.ys[3]).toBeGreaterThan(lobby.ys[0]);
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
              crewBriefing:
                scene?.children?.list.some(
                  (child) =>
                    child.text?.includes('PIT CREW:') &&
                    child.text.includes('LEADER HUNTER') &&
                    child.text.includes('SCAVENGER') &&
                    child.text.includes('PIT BANTER: TAUNT THE CREW'),
                ) ?? false,
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
        crewBriefing: true,
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

    await gamePage.keyboard.press('ArrowRight');
    await gamePage.keyboard.press('Enter');
    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('GameScene') as {
              sys?: { settings: { active: boolean } };
              matchPhase?: string;
            };
            return {
              active: scene?.sys?.settings.active ?? false,
              phase: scene?.matchPhase ?? null,
            };
          }),
        { timeout: 15000, message: 'expected the Scrap Pit to reach live play' },
      )
      .toEqual({ active: true, phase: 'active' });

    await gamePage.keyboard.press('t');
    await expect
      .poll(
        () =>
          gamePage.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('GameScene') as {
              gameService?: {
                getNetworkManager: () => { getPlayerId: () => string | null };
              };
              tauntRenderer?: {
                active?: Map<string, { container: { list: Array<{ text?: string }> } }>;
              };
            };
            const localPlayerId = scene?.gameService?.getNetworkManager().getPlayerId();
            const bubbles = [...(scene?.tauntRenderer?.active ?? new Map())].map(
              ([playerId, active]) => ({
                playerId,
                text:
                  active.container.list.find((child) => typeof child.text === 'string')?.text ??
                  null,
              }),
            );
            return {
              localText: bubbles.find((bubble) => bubble.playerId === localPlayerId)?.text ?? null,
              rivalTexts: bubbles
                .filter((bubble) => bubble.playerId !== localPlayerId)
                .map((bubble) => bubble.text),
            };
          }),
        { timeout: 5000, message: 'expected one Scrap Pit rival to answer the local taunt' },
      )
      .toMatchObject({
        localText: 'BRING IT!',
        rivalTexts: expect.arrayContaining([
          expect.stringMatching(/^(BRING IT!|IS THAT ALL\?|STILL STANDING!)$/),
        ]),
      });
  });
});
