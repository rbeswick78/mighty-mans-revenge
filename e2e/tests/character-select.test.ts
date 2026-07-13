import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * Character-select E2E coverage. This test pairs two real browser contexts
 * via QUICK MATCH, walks the pre-match map/mode draft (Session 9 — every
 * un-pinned match drafts before character select), and verifies both
 * contexts land on CharacterSelectScene.
 *
 * Notes on brittleness:
 *  - The cards are Phaser-rendered (no DOM accessibility tree), so we can't
 *    use Playwright locators on them directly. We assert scene transitions
 *    via window.game.scene.getScenes(true).map(s => s.scene.key) instead.
 *  - We type the nickname into the transparent <input> overlay that
 *    LobbyScene mounts at runtime, then send Enter — LobbyScene treats
 *    Enter as QUICK MATCH (lobby-scene.ts:167-169), avoiding fragile
 *    canvas hit-zone clicks.
 *  - Draft picks are driven by evaluating into the live DraftScene
 *    instance (latestDraft snapshot + gameService.sendDraftPick) rather
 *    than clicking canvas card positions — the server ignores wrong-turn
 *    picks, so blindly attempting on both pages every poll is safe.
 */

async function waitForLobby(page: Page): Promise<void> {
  await page.waitForSelector('canvas', { timeout: 15000 });
  // BootScene loads assets, then transitions to LobbyScene. Poll the
  // active-scene list until LobbyScene is up — works around variable
  // asset-load timing on cold cache.
  await waitForActiveScene(page, 'LobbyScene', 30000);
  // The transparent <input> is mounted in LobbyScene.create(). Wait
  // until it's actually attached so we can type into it.
  await page.waitForFunction(() => !!document.querySelector('input[type="text"]'), null, {
    timeout: 10000,
  });
}

type SceneInfo = { keys: string[]; activeKeys: string[] };

async function getSceneInfo(page: Page): Promise<SceneInfo> {
  return page.evaluate<SceneInfo>(() => {
    const w = window as unknown as {
      game?: {
        scene: {
          scenes: Array<{
            scene: { key: string };
            sys: { settings: { active: boolean } };
          }>;
        };
      };
    };
    const scenes = w.game?.scene.scenes ?? [];
    return {
      keys: scenes.map((s) => s.scene.key),
      activeKeys: scenes
        .filter((s) => s.sys.settings.active)
        .map((s) => s.scene.key),
    };
  });
}

async function waitForActiveScene(
  page: Page,
  key: string,
  timeoutMs = 15000,
): Promise<void> {
  await expect
    .poll(async () => (await getSceneInfo(page)).activeKeys, {
      timeout: timeoutMs,
      message: `expected scene ${key} to become active`,
    })
    .toContain(key);
}

/**
 * If this page's player currently holds the draft pick, send one (map
 * first, then mode). No-op when the draft scene/snapshot isn't up yet or
 * it's the other player's turn. Returns whether a pick was attempted.
 */
async function draftPickIfMyTurn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const w = window as unknown as {
      game?: { scene: { getScene: (key: string) => unknown } };
    };
    const scene = w.game?.scene.getScene('DraftScene') as {
      latestDraft?: {
        currentPickerId: string | null;
        mapPick: string | null;
        modePick: string | null;
        mapOptions: string[];
        modeOptions: string[];
      } | null;
      gameService?: {
        sendDraftPick: (category: 'map' | 'mode', value: string) => void;
        getNetworkManager: () => { getPlayerId: () => string | null };
      };
    } | null;
    const draft = scene?.latestDraft;
    const service = scene?.gameService;
    if (!draft || !service) return false;
    const myId = service.getNetworkManager().getPlayerId();
    if (!myId || draft.currentPickerId !== myId) return false;
    if (draft.mapPick === null) {
      service.sendDraftPick('map', draft.mapOptions[0]);
      return true;
    }
    if (draft.modePick === null) {
      // Exercise the newest marked-target mode through the real draft and
      // live scene; fall back only for an older server during mixed-version
      // local development.
      service.sendDraftPick(
        'mode',
        draft.modeOptions.includes('bounty_hunt') ? 'bounty_hunt' : draft.modeOptions[0],
      );
      return true;
    }
    return false;
  });
}

/**
 * Drive both pages through the draft until CharacterSelectScene is active
 * on both. Tolerates the ~900ms locked-in beat and either pick order.
 */
async function completeDraft(pageA: Page, pageB: Page): Promise<void> {
  // A slow worker can let the server's draft deadlines auto-pick both
  // categories before this helper begins polling. CharacterSelectScene is
  // then the correct advanced state, so accept either the draft itself or
  // its successful destination instead of waiting for a scene that ended.
  await Promise.all(
    [pageA, pageB].map((page) =>
      expect
        .poll(async () => {
          const active = (await getSceneInfo(page)).activeKeys;
          return (
            active.includes('DraftScene') ||
            active.includes('CharacterSelectScene')
          );
        }, { timeout: 15000, message: 'expected draft or character select' })
        .toBe(true),
    ),
  );
  await expect
    .poll(
      async () => {
        await draftPickIfMyTurn(pageA);
        await draftPickIfMyTurn(pageB);
        const a = (await getSceneInfo(pageA)).activeKeys;
        const b = (await getSceneInfo(pageB)).activeKeys;
        return (
          a.includes('CharacterSelectScene') &&
          b.includes('CharacterSelectScene')
        );
      },
      {
        timeout: 20000,
        message: 'expected both players through the draft to character select',
      },
    )
    .toBe(true);
}

async function startQuickMatch(page: Page, nickname: string): Promise<void> {
  const input = page.locator('input[type="text"]').first();
  await input.click();
  // Clear and type a nickname.
  await input.fill('');
  await input.type(nickname);
  // Click outside the input first so Enter doesn't get swallowed by the
  // DOM input (Firefox/mobile in particular are stricter than Chromium
  // about delivering Enter to window listeners while an input has focus).
  // Click the canvas in a corner to defocus without triggering any UI.
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  // Phaser's keyboard plugin listens on window — pressing Enter now is
  // handled by LobbyScene's keydown-ENTER listener.
  await page.keyboard.press('Enter');
}

// ─────────────────────────────────────────────────────────────────────
// Desktop projects: full pair-up + lock-and-go.
// ─────────────────────────────────────────────────────────────────────

test('solo practice launches against locked Rusty and reaches live play', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'One authoritative browser flow is sufficient; mobile rendering has separate coverage',
  );
  test.setTimeout(30000);

  await page.goto('/');
  await waitForLobby(page);
  const input = page.locator('input[type="text"]');
  await expect(input).toHaveCount(1);
  await input.fill('Solo');

  // Desktop canvas is 960x720 at this project viewport. Cycle the persisted
  // Rusty level once, then click the practice CTA in canvas-local coordinates.
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await canvas.click({ position: { x: 480, y: 660 } });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('mmr_bot_difficulty')))
    .toBe('warlord');
  await canvas.click({ position: { x: 480, y: 614 } });
  await waitForActiveScene(page, 'CharacterSelectScene', 10000);

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window as unknown as {
            game?: { scene: { getScene: (key: string) => unknown } };
          };
          const scene = w.game?.scene.getScene('CharacterSelectScene') as {
            latestSelections?: Array<{
              nickname: string;
              lockedCharacterId: string | null;
            }>;
          } | null;
          return (
            scene?.latestSelections?.some(
              (selection) =>
                selection.nickname === 'RUSTY' &&
                selection.lockedCharacterId !== null,
            ) ?? false
          );
        }),
      { timeout: 10000, message: 'expected Rusty to arrive already locked' },
    )
    .toBe(true);

  await canvas.click({ position: { x: 480, y: 400 } });
  await page.keyboard.press('Enter');
  await waitForActiveScene(page, 'GameScene', 10000);

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window as unknown as {
            game?: {
              textures: { exists: (key: string) => boolean };
              scene: { getScene: (key: string) => unknown };
            };
          };
          const scene = w.game?.scene.getScene('GameScene') as {
            mapRenderer?: {
              cacheSpritesByCell?: { size: number };
            };
          } | null;
          return {
            textureLoaded:
              w.game?.textures.exists('deco_scavenger_cache') ?? false,
            cacheCount: scene?.mapRenderer?.cacheSpritesByCell?.size ?? 0,
          };
        }),
      {
        timeout: 5000,
        message: 'expected both Wasteland Outpost scavenger caches to render',
      },
    )
    .toEqual({ textureLoaded: true, cacheCount: 2 });
});

test.describe('Character select (desktop)', () => {
  let ctxA: BrowserContext;
  let ctxB: BrowserContext;
  let pageA: Page;
  let pageB: Page;

  test.beforeEach(async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile-landscape',
      'Mobile pair-up runs in its own describe block below',
    );
    ctxA = await browser.newContext();
    ctxB = await browser.newContext();
    pageA = await ctxA.newPage();
    pageB = await ctxB.newPage();
  });

  test.afterEach(async () => {
    await pageA?.close().catch(() => {});
    await pageB?.close().catch(() => {});
    await ctxA?.close().catch(() => {});
    await ctxB?.close().catch(() => {});
  });

  // Playwright insists the first test arg is an object-destructuring
  // pattern even when no fixtures are used, so `{}` is unavoidable here.
  // eslint-disable-next-line no-empty-pattern
  test('two players land on CharacterSelectScene after QUICK MATCH', async ({}, testInfo) => {
    // Two-context pair-up is reliable on Chromium but flaky on Firefox in
    // this environment — Firefox's second context sometimes fails to
    // complete the geckos.io WebRTC handshake before Page A's
    // matchmaking-search timeout fires. Pin to Chromium for now; the
    // server-side coverage in match.test.ts exercises the actual
    // CHARACTER_SELECT → COUNTDOWN logic.
    test.fixme(
      testInfo.project.name === 'desktop-firefox',
      'Two-context WebRTC pair-up is unreliable on Firefox locally',
    );

    await Promise.all([pageA.goto('/'), pageB.goto('/')]);
    await Promise.all([waitForLobby(pageA), waitForLobby(pageB)]);

    await startQuickMatch(pageA, 'Alpha');
    await startQuickMatch(pageB, 'Bravo');

    await completeDraft(pageA, pageB);
  });

  // eslint-disable-next-line no-empty-pattern
  test('lock-and-go: both players Enter and transition to GameScene', async ({}, testInfo) => {
    test.setTimeout(process.env.FORCE_EVENT === 'wasteland_warp' ? 75000 : 45000);
    test.fixme(
      testInfo.project.name === 'desktop-firefox',
      'Two-context WebRTC pair-up is unreliable on Firefox locally',
    );

    await Promise.all([pageA.goto('/'), pageB.goto('/')]);
    await Promise.all([waitForLobby(pageA), waitForLobby(pageB)]);

    await startQuickMatch(pageA, 'Alpha');
    await startQuickMatch(pageB, 'Bravo');

    await completeDraft(pageA, pageB);

    // Each scene's keyboard handler treats Enter as Lock In. The default
    // hovers (mighty_man for the first joiner, bruce for the second) are
    // distinct, so locking via Enter on both resolves immediately.
    // Click the canvas first to ensure Phaser's window-level keyboard
    // listener receives Enter (not the lobby's destroyed input).
    await pageA.locator('canvas').click({ position: { x: 10, y: 10 } });
    await pageB.locator('canvas').click({ position: { x: 10, y: 10 } });
    await pageA.keyboard.press('Enter');
    await pageB.keyboard.press('Enter');

    await Promise.all([
      waitForActiveScene(pageA, 'GameScene', 10000),
      waitForActiveScene(pageB, 'GameScene', 10000),
    ]);

    await expect
      .poll(
        () =>
          pageA.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('GameScene') as {
              matchData?: { gameMode?: string } | null;
              playerManager?: {
                getRenderer: (id: string) => {
                  bountyMarkerText?: { visible?: boolean };
                } | undefined;
              } | null;
              hud?: { bountyHuntText?: { visible?: boolean } } | null;
              gameService?: {
                getNetworkManager: () => {
                  getBountyHuntState: () => { targetId: string | null } | null;
                };
              };
            } | null;
            const state = scene?.gameService
              ?.getNetworkManager()
              .getBountyHuntState();
            const targetRenderer = state?.targetId
              ? scene?.playerManager?.getRenderer(state.targetId)
              : undefined;
            return {
              mode: scene?.matchData?.gameMode ?? null,
              hasTarget: state?.targetId !== null && state?.targetId !== undefined,
              markerVisible: targetRenderer?.bountyMarkerText?.visible ?? false,
              hudVisible: scene?.hud?.bountyHuntText?.visible ?? false,
            };
          }),
        {
          timeout: 10000,
          message: 'expected drafted Bounty Hunt state, world marker, and HUD',
        },
      )
      .toEqual({
        mode: 'bounty_hunt',
        hasTarget: true,
        markerVisible: true,
        hudVisible: true,
      });

    if (process.env.FORCE_EVENT === 'wasteland_warp') {
      await expect
        .poll(
          () =>
            pageA.evaluate(() => {
              const w = window as unknown as {
                game?: { scene: { getScene: (key: string) => unknown } };
              };
              const scene = w.game?.scene.getScene('GameScene') as {
                lastWastelandWarpSequence?: number;
                gameService?: {
                  getNetworkManager: () => {
                    getWastelandWarpState: () => {
                      secondsUntilSwap: number;
                      sequence: number;
                    } | null;
                  };
                };
              } | null;
              const state = scene?.gameService
                ?.getNetworkManager()
                .getWastelandWarpState();
              return {
                sequence: state?.sequence ?? -1,
                presentedSequence: scene?.lastWastelandWarpSequence ?? -1,
              };
            }),
          {
            timeout: 25000,
            message: 'expected a live authoritative Wasteland Warp rotation',
          },
        )
        .toEqual({ sequence: 1, presentedSequence: 1 });
    }
  });

  // eslint-disable-next-line no-empty-pattern
  test('Rook locks with a live helmet overlay and reaches play', async ({}, testInfo) => {
    test.setTimeout(45000);
    test.fixme(
      testInfo.project.name === 'desktop-firefox',
      'Two-context WebRTC pair-up is unreliable on Firefox locally',
    );

    await Promise.all([pageA.goto('/'), pageB.goto('/')]);
    await Promise.all([waitForLobby(pageA), waitForLobby(pageB)]);

    await startQuickMatch(pageA, 'RookAlpha');
    await startQuickMatch(pageB, 'Bravo');

    await completeDraft(pageA, pageB);

    await pageA.locator('canvas').click({ position: { x: 10, y: 10 } });
    await pageB.locator('canvas').click({ position: { x: 10, y: 10 } });

    // Page A starts on Mighty Man. Moving left wraps to the final roster
    // entry, proving Rook participates in the real keyboard selection path.
    await pageA.keyboard.press('ArrowLeft');
    await expect
      .poll(
        () =>
          pageA.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('CharacterSelectScene') as {
              localHoveredId?: string | null;
            } | null;
            return scene?.localHoveredId ?? null;
          }),
        { timeout: 5000, message: 'expected Page A to hover Rook' },
      )
      .toBe('rook');

    await pageA.keyboard.press('Enter');
    await pageB.keyboard.press('Enter');

    await Promise.all([
      waitForActiveScene(pageA, 'GameScene', 10000),
      waitForActiveScene(pageB, 'GameScene', 10000),
    ]);

    // Verify the authoritative selection and the actual renderer layer. This
    // catches missing helmet loads/animations that a scene-transition smoke
    // test cannot see.
    await expect
      .poll(
        () =>
          pageA.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('GameScene') as {
              gameService?: {
                getNetworkManager: () => {
                  getPlayerId: () => string | null;
                  getLocalPlayerState: () => { characterId?: string } | null;
                };
              };
              playerManager?: {
                getRenderer: (playerId: string) => unknown;
              };
            } | null;
            const network = scene?.gameService?.getNetworkManager();
            const playerId = network?.getPlayerId();
            const renderer =
              playerId && scene?.playerManager
                ? scene.playerManager.getRenderer(playerId)
                : null;
            const hasOverlay = Boolean(
              (renderer as { bodyOverlaySprite?: unknown } | null)
                ?.bodyOverlaySprite,
            );
            return {
              characterId:
                network?.getLocalPlayerState()?.characterId ?? null,
              hasOverlay,
            };
          }),
        { timeout: 10000, message: 'expected live Rook renderer and helmet' },
      )
      .toEqual({ characterId: 'rook', hasOverlay: true });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Mobile-landscape: scene-transition smoke only. Touch interactions to
// drive the lock are harder to drive reliably across browsers, so we
// stop at "both reached select."
// ─────────────────────────────────────────────────────────────────────

test.describe('Character select (mobile-landscape)', () => {
  let ctxA: BrowserContext;
  let ctxB: BrowserContext;
  let pageA: Page;
  let pageB: Page;

  test.beforeEach(async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile-landscape',
      'Only runs on the mobile-landscape project',
    );
    ctxA = await browser.newContext();
    ctxB = await browser.newContext();
    pageA = await ctxA.newPage();
    pageB = await ctxB.newPage();
  });

  test.afterEach(async () => {
    await pageA?.close().catch(() => {});
    await pageB?.close().catch(() => {});
    await ctxA?.close().catch(() => {});
    await ctxB?.close().catch(() => {});
  });

  test('two players land on CharacterSelectScene', async () => {
    // Mobile-landscape touch driving plus two-context pair-up is too
    // brittle to drive reliably here — startQuickMatch uses keyboard
    // Enter, which doesn't match how a real mobile user interacts with
    // the lobby button. Fixme until we wire a touch-based quickmatch
    // helper. Server-side select logic is covered in match.test.ts.
    test.fixme(true, 'Mobile two-context pair-up requires touch driver work');

    await Promise.all([pageA.goto('/'), pageB.goto('/')]);
    await Promise.all([waitForLobby(pageA), waitForLobby(pageB)]);

    await startQuickMatch(pageA, 'Mob1');
    await startQuickMatch(pageB, 'Mob2');

    await completeDraft(pageA, pageB);
  });
});
