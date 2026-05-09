import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * Character-select E2E coverage. This test pairs two real browser contexts
 * via QUICK MATCH and verifies they both land on CharacterSelectScene.
 *
 * Notes on brittleness:
 *  - The cards are Phaser-rendered (no DOM accessibility tree), so we can't
 *    use Playwright locators on them directly. We assert scene transitions
 *    via window.game.scene.getScenes(true).map(s => s.scene.key) instead.
 *  - We type the nickname into the transparent <input> overlay that
 *    LobbyScene mounts at runtime, then send Enter — LobbyScene treats
 *    Enter as QUICK MATCH (lobby-scene.ts:167-169), avoiding fragile
 *    canvas hit-zone clicks.
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

  test('two players land on CharacterSelectScene after QUICK MATCH', async (_fixtures, testInfo) => {
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

    await Promise.all([
      waitForActiveScene(pageA, 'CharacterSelectScene'),
      waitForActiveScene(pageB, 'CharacterSelectScene'),
    ]);
  });

  test('lock-and-go: both players Enter and transition to GameScene', async (_fixtures, testInfo) => {
    test.fixme(
      testInfo.project.name === 'desktop-firefox',
      'Two-context WebRTC pair-up is unreliable on Firefox locally',
    );

    await Promise.all([pageA.goto('/'), pageB.goto('/')]);
    await Promise.all([waitForLobby(pageA), waitForLobby(pageB)]);

    await startQuickMatch(pageA, 'Alpha');
    await startQuickMatch(pageB, 'Bravo');

    await Promise.all([
      waitForActiveScene(pageA, 'CharacterSelectScene'),
      waitForActiveScene(pageB, 'CharacterSelectScene'),
    ]);

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

    await Promise.all([
      waitForActiveScene(pageA, 'CharacterSelectScene'),
      waitForActiveScene(pageB, 'CharacterSelectScene'),
    ]);
  });
});
