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
      activeKeys: scenes.filter((s) => s.sys.settings.active).map((s) => s.scene.key),
    };
  });
}

async function waitForActiveScene(page: Page, key: string, timeoutMs = 15000): Promise<void> {
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
        .poll(
          async () => {
            const active = (await getSceneInfo(page)).activeKeys;
            return active.includes('DraftScene') || active.includes('CharacterSelectScene');
          },
          { timeout: 15000, message: 'expected draft or character select' },
        )
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
        return a.includes('CharacterSelectScene') && b.includes('CharacterSelectScene');
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

test('solo practice launches against locked Rusty and reaches live play', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'One authoritative browser flow is sufficient; mobile rendering has separate coverage',
  );
  test.setTimeout(45000);

  if (process.env.VERIFY_GAMEPAD === '1') {
    await page.addInitScript(() => {
      const state = {
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 16 }, () => ({
          pressed: false,
          touched: false,
          value: 0,
        })),
        rumbleCount: 0,
      };
      const pad = {
        id: 'Playwright Standard Gamepad',
        index: 0,
        connected: true,
        mapping: 'standard',
        get axes() {
          return state.axes;
        },
        get buttons() {
          return state.buttons;
        },
        timestamp: 0,
        vibrationActuator: {
          playEffect: async () => {
            state.rumbleCount += 1;
            return 'complete';
          },
        },
      };
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => [pad],
      });
      (window as unknown as { __gamepadTest: typeof state }).__gamepadTest = state;
    });
  }

  await page.goto('/');
  await waitForLobby(page);
  const input = page.locator('input[type="text"]');
  await expect(input).toHaveCount(1);
  await input.fill('Solo');

  // Desktop canvas is 960x720 at this project viewport. Cycle the persisted
  // Rusty level once, optionally pin a Spar rival/mode, then launch an
  // ordinary spar, random Gauntlet, or shared Daily Run in canvas-local coordinates.
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await canvas.click({ position: { x: 410, y: 642 } });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('mmr_bot_difficulty')))
    .toBe('warlord');
  if (process.env.VERIFY_PRACTICE_MODE === '1') {
    // RANDOM -> DEATHMATCH -> KING OF THE HILL. Use two clicks so the
    // browser flow also proves the selector cycles through shared order.
    await canvas.click({ position: { x: 480, y: 666 } });
    await canvas.click({ position: { x: 480, y: 666 } });
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('mmr_practice_mode')))
      .toBe('koth');
  }
  if (process.env.VERIFY_PRACTICE_RIVAL === '1') {
    // RANDOM -> MIGHTY MAN -> BRUCE -> FROST WIZARD.
    for (let click = 0; click < 3; click++) {
      await canvas.click({ position: { x: 550, y: 642 } });
    }
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('mmr_practice_rival')))
      .toBe('frost_wizard');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as unknown as {
            game?: { scene: { getScene: (key: string) => unknown } };
          };
          type DisplayNode = {
            text?: string;
            width?: number;
            list?: DisplayNode[];
          };
          const scene = w.game?.scene.getScene('LobbyScene') as {
            children?: { list?: DisplayNode[] };
          } | null;
          const stack = [...(scene?.children?.list ?? [])];
          let label: DisplayNode | undefined;
          while (stack.length > 0 && !label) {
            const child = stack.pop();
            if (!child) continue;
            if (child.text?.startsWith('RIVAL:')) label = child;
            if (child.list) stack.push(...child.list);
          }
          return {
            text: label?.text ?? null,
            fitsButton: (label?.width ?? Number.POSITIVE_INFINITY) <= 117,
          };
        }),
      )
      .toEqual({ text: 'RIVAL: FROST WIZARD', fitsButton: true });
  }
  if (process.env.VERIFY_GAMEPAD === '1') {
    await page.evaluate(() => {
      const state = (window as unknown as { __gamepadTest: { axes: number[] } }).__gamepadTest;
      state.axes = [0, 1, 0, 0];
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as unknown as {
            game?: { scene: { getScene: (key: string) => unknown } };
          };
          const scene = w.game?.scene.getScene('LobbyScene') as {
            gamepadFocusIndex?: number;
          } | null;
          return scene?.gamepadFocusIndex ?? -1;
        }),
      )
      .toBe(1);
    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __gamepadTest: {
            axes: number[];
            buttons: Array<{ pressed: boolean; touched: boolean; value: number }>;
          };
        }
      ).__gamepadTest;
      state.axes = [0, 0, 0, 0];
      state.buttons[0] = { pressed: true, touched: true, value: 1 };
    });
  } else {
    await canvas.click({
      position: {
        x:
          process.env.VERIFY_DAILY_GAUNTLET === '1'
            ? 570
            : process.env.VERIFY_GAUNTLET === '1'
              ? 480
              : 390,
        y: 614,
      },
    });
  }
  await waitForActiveScene(page, 'CharacterSelectScene', 10000);
  if (process.env.VERIFY_GAMEPAD === '1') {
    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __gamepadTest: {
            buttons: Array<{ pressed: boolean; touched: boolean; value: number }>;
          };
        }
      ).__gamepadTest;
      state.buttons[0] = { pressed: false, touched: false, value: 0 };
    });
  }
  if (process.env.VERIFY_GAUNTLET === '1') {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as unknown as {
            game?: { scene: { getScene: (key: string) => unknown } };
          };
          const scene = w.game?.scene.getScene('CharacterSelectScene') as {
            matchData?: {
              gauntlet?: { stage: number; totalStages: number; difficulty: string };
            };
            children?: { list?: Array<{ text?: string }> };
          } | null;
          return {
            gauntlet: scene?.matchData?.gauntlet ?? null,
            briefing:
              scene?.children?.list?.some((child) =>
                child.text?.includes('GAUNTLET 1/3 - ROOKIE'),
              ) ?? false,
          };
        }),
      )
      .toEqual({
        gauntlet: { stage: 1, totalStages: 3, difficulty: 'rookie' },
        briefing: true,
      });
  }
  if (process.env.VERIFY_DAILY_GAUNTLET === '1') {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as unknown as {
            game?: { scene: { getScene: (key: string) => unknown } };
          };
          const scene = w.game?.scene.getScene('CharacterSelectScene') as {
            matchData?: {
              mapName?: string;
              gameMode?: string;
              gauntlet?: {
                stage: number;
                totalStages: number;
                difficulty: string;
                challengeKey?: string;
                opponentCharacterId?: string;
              };
            };
            latestSelections?: Array<{
              nickname: string;
              lockedCharacterId: string | null;
            }>;
            children?: { list?: Array<{ text?: string }> };
          } | null;
          const gauntlet = scene?.matchData?.gauntlet;
          const rusty = scene?.latestSelections?.find(
            (selection) => selection.nickname === 'RUSTY',
          );
          return {
            stage: gauntlet?.stage ?? null,
            totalStages: gauntlet?.totalStages ?? null,
            difficulty: gauntlet?.difficulty ?? null,
            challengeKey: gauntlet?.challengeKey ?? null,
            currentUtcKey: new Date().toISOString().slice(0, 10),
            destinationReady:
              typeof scene?.matchData?.mapName === 'string' &&
              typeof scene?.matchData?.gameMode === 'string',
            rustyMatchesDaily: rusty?.lockedCharacterId === gauntlet?.opponentCharacterId,
            briefing:
              scene?.children?.list?.some((child) => child.text?.includes('DAILY RUN 1/3')) ??
              false,
          };
        }),
      )
      .toEqual({
        stage: 1,
        totalStages: 3,
        difficulty: 'rookie',
        challengeKey: new Date().toISOString().slice(0, 10),
        currentUtcKey: new Date().toISOString().slice(0, 10),
        destinationReady: true,
        rustyMatchesDaily: true,
        briefing: true,
      });
  }
  if (process.env.VERIFY_PRACTICE_MODE === '1') {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as unknown as {
            game?: { scene: { getScene: (key: string) => unknown } };
          };
          const scene = w.game?.scene.getScene('CharacterSelectScene') as {
            matchData?: { gameMode?: string };
            children?: { list?: Array<{ text?: string }> };
          } | null;
          return {
            gameMode: scene?.matchData?.gameMode ?? null,
            briefing:
              scene?.children?.list?.some((child) => child.text?.includes('KING OF THE HILL')) ??
              false,
          };
        }),
      )
      .toEqual({ gameMode: 'koth', briefing: true });
  }
  if (process.env.VERIFY_PRACTICE_RIVAL === '1') {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as unknown as {
            game?: { scene: { getScene: (key: string) => unknown } };
          };
          const scene = w.game?.scene.getScene('CharacterSelectScene') as {
            latestSelections?: Array<{
              nickname: string;
              lockedCharacterId: string | null;
            }>;
            children?: { list?: Array<{ text?: string }> };
          } | null;
          return {
            rustyCharacter:
              scene?.latestSelections?.find((selection) => selection.nickname === 'RUSTY')
                ?.lockedCharacterId ?? null,
            lockedLabel:
              scene?.children?.list?.some((child) =>
                child.text?.includes('LOCKED · FROST WIZARD'),
              ) ?? false,
          };
        }),
      )
      .toEqual({ rustyCharacter: 'frost_wizard', lockedLabel: true });
  }

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
              (selection) => selection.nickname === 'RUSTY' && selection.lockedCharacterId !== null,
            ) ?? false
          );
        }),
      { timeout: 10000, message: 'expected Rusty to arrive already locked' },
    )
    .toBe(true);

  if (process.env.VERIFY_GAMEPAD === '1') {
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __gamepadTest: {
            buttons: Array<{ pressed: boolean; touched: boolean; value: number }>;
          };
        }
      ).__gamepadTest;
      state.buttons[0] = { pressed: true, touched: true, value: 1 };
    });
  } else {
    await canvas.click({ position: { x: 480, y: 400 } });
    await page.keyboard.press('Enter');
  }
  await waitForActiveScene(page, 'GameScene', 10000);
  if (process.env.VERIFY_GAMEPAD === '1') {
    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __gamepadTest: {
            buttons: Array<{ pressed: boolean; touched: boolean; value: number }>;
          };
        }
      ).__gamepadTest;
      state.buttons[0] = { pressed: false, touched: false, value: 0 };
    });
  }

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
            gameService?: {
              getNetworkManager: () => {
                getPlayerId: () => string | null;
              };
            };
            playerManager?: {
              getRenderer: (playerId: string) =>
                | {
                    batSprite?: { texture?: { key?: string } };
                  }
                | undefined;
            };
          } | null;
          const networkManager = scene?.gameService?.getNetworkManager();
          const localPlayerId = networkManager?.getPlayerId();
          const localRenderer = localPlayerId
            ? scene?.playerManager?.getRenderer(localPlayerId)
            : undefined;
          return {
            textureLoaded: w.game?.textures.exists('deco_scavenger_cache') ?? false,
            cacheCount: scene?.mapRenderer?.cacheSpritesByCell?.size ?? 0,
            batTextureLoaded: w.game?.textures.exists('pickup_bat') ?? false,
            batIconLoaded: w.game?.textures.exists('bat_icon') ?? false,
            batSpriteReady: localRenderer?.batSprite?.texture?.key === 'pickup_bat',
            deathVariantsLoaded: [
              'mighty_man_death2_side_death',
              'mighty_man_death2_side-left_death',
              'mighty_man_death3_side_death',
              'mighty_man_death3_side-left_death',
              'bruce_death2_side_death',
              'bruce_death2_side-left_death',
              'bubba_death2_side_death',
              'bubba_death2_side-left_death',
              'jack-noaxe_death2_side_death',
              'jack-noaxe_death2_side-left_death',
            ].every((key) => w.game?.textures.exists(key) === true),
          };
        }),
      {
        timeout: 5000,
        message: 'expected Wasteland Outpost caches and bat presentation to render',
      },
    )
    .toEqual({
      textureLoaded: true,
      cacheCount: 2,
      batTextureLoaded: true,
      batIconLoaded: true,
      batSpriteReady: true,
      deathVariantsLoaded: true,
    });

  if (process.env.VERIFY_COVER_BARRICADES === '1') {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as unknown as {
            game?: {
              textures: { exists: (key: string) => boolean };
              scene: { getScene: (key: string) => unknown };
            };
          };
          type CellSprite = {
            angle?: number;
            displayWidth?: number;
            displayHeight?: number;
            texture?: { key?: string };
          };
          const scene = w.game?.scene.getScene('GameScene') as {
            mapRenderer?: { tileSprites?: Array<Array<CellSprite | null>> };
          } | null;
          const barricades = (scene?.mapRenderer?.tileSprites ?? [])
            .flat()
            .filter((sprite): sprite is CellSprite => sprite?.texture?.key === 'cover_reinforced');
          return {
            texturesLoaded:
              w.game?.textures.exists('cover_reinforced') === true &&
              w.game?.textures.exists('cover_wooden') === true,
            rendered: barricades.length > 0,
            angles: [...new Set(barricades.map((sprite) => sprite.angle ?? -1))].sort(
              (a, b) => a - b,
            ),
            aspectCorrect: barricades.every(
              (sprite) =>
                Math.abs((sprite.displayWidth ?? 0) - 48) < 0.01 &&
                Math.abs((sprite.displayHeight ?? 0) - 42) < 0.01,
            ),
          };
        }),
      )
      .toEqual({
        texturesLoaded: true,
        rendered: true,
        angles: [0, 90],
        aspectCorrect: true,
      });

    const destruction = await page.evaluate(() => {
      const w = window as unknown as {
        game?: { scene: { getScene: (key: string) => unknown } };
      };
      type CellSprite = { texture?: { key?: string } };
      const scene = w.game?.scene.getScene('GameScene') as {
        mapRenderer?: {
          tileSprites?: Array<Array<CellSprite | null>>;
          tileTypes?: number[][];
          destroyTileAt: (col: number, row: number) => void;
          getCollisionGrid: () => { solid: boolean[][] } | null;
        };
      } | null;
      const renderer = scene?.mapRenderer;
      const rows = renderer?.tileSprites ?? [];
      for (let row = 0; row < rows.length; row++) {
        const col = rows[row].findIndex((sprite) => sprite?.texture?.key === 'cover_reinforced');
        if (col < 0) continue;
        renderer?.destroyTileAt(col, row);
        return {
          spriteRemoved: renderer?.tileSprites?.[row]?.[col] === null,
          becameFloor: renderer?.tileTypes?.[row]?.[col] === 0,
          collisionOpened: renderer?.getCollisionGrid()?.solid[row]?.[col] === false,
        };
      }
      return { spriteRemoved: false, becameFloor: false, collisionOpened: false };
    });
    expect(destruction).toEqual({
      spriteRemoved: true,
      becameFloor: true,
      collisionOpened: true,
    });
  }

  if (process.env.VERIFY_DEATH_VARIANTS === '1') {
    const collapse = await page.evaluate(() => {
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
          getRenderer: (playerId: string) =>
            | {
                setAimAngle: (angle: number) => void;
                updateLifeState: (dead: boolean, deathCount: number) => void;
                sprite?: {
                  texture?: { key?: string };
                  anims?: { currentAnim?: { key?: string } };
                };
              }
            | undefined;
        };
      } | null;
      const network = scene?.gameService?.getNetworkManager();
      const playerId = network?.getPlayerId();
      const renderer = playerId ? scene?.playerManager?.getRenderer(playerId) : undefined;
      renderer?.setAimAngle(0);
      renderer?.updateLifeState(true, 2);
      const result = {
        characterId: network?.getLocalPlayerState()?.characterId ?? '',
        texture: renderer?.sprite?.texture?.key ?? '',
        animation: renderer?.sprite?.anims?.currentAnim?.key ?? '',
      };
      renderer?.updateLifeState(false, 2);
      return result;
    });
    const expectedSecondDeath: Record<string, string> = {
      mighty_man: 'mighty_man_death2_side_death',
      bruce: 'bruce_death2_side_death',
      frost_wizard: 'mighty_man_death2_side_death',
      bubba: 'bubba_death2_side_death',
      jack: 'jack_side_death',
      rook: 'mighty_man_side_death',
    };
    const expected = expectedSecondDeath[collapse.characterId];
    expect(expected).toBeTruthy();
    expect(collapse.texture).toBe(expected);
    expect(collapse.animation).toBe(expected);
  }

  if (process.env.VERIFY_GAMEPAD === '1') {
    const opening = await page.evaluate(() => {
      const w = window as unknown as {
        game?: { scene: { getScene: (key: string) => unknown } };
      };
      const scene = w.game?.scene.getScene('GameScene') as {
        gameService?: {
          getNetworkManager: () => {
            getLocalPlayerState: () => { position: { x: number }; ammo: number } | null;
          };
        };
      } | null;
      const player = scene?.gameService?.getNetworkManager().getLocalPlayerState();
      return { x: player?.position.x ?? 0, ammo: player?.ammo ?? 0 };
    });

    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __gamepadTest: {
            axes: number[];
            buttons: Array<{ pressed: boolean; touched: boolean; value: number }>;
          };
        }
      ).__gamepadTest;
      state.axes = [1, 0, 1, 0];
      state.buttons[7] = { pressed: true, touched: true, value: 1 };
    });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('GameScene') as {
              inputManager?: {
                getActiveMode: () => string;
                getLastRawInput: () => {
                  moveX: number;
                  aimAngle: number;
                  aimingGun: boolean;
                } | null;
              };
              hud?: { eventBannerText?: { text?: string } };
            } | null;
            const raw = scene?.inputManager?.getLastRawInput();
            return {
              mode: scene?.inputManager?.getActiveMode() ?? null,
              movingRight: (raw?.moveX ?? 0) > 0.9,
              aimingRight: raw?.aimingGun === true && Math.abs(raw.aimAngle) < 0.01,
              banner: scene?.hud?.eventBannerText?.text ?? '',
            };
          }),
        { timeout: 5000, message: 'expected synthetic twin-stick input to take control' },
      )
      .toEqual({
        mode: 'gamepad',
        movingRight: true,
        aimingRight: true,
        banner: 'TWIN-STICK ONLINE\nRT FIRE  •  LT GRENADE  •  RB POWER',
      });

    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __gamepadTest: {
            axes: number[];
            buttons: Array<{ pressed: boolean; touched: boolean; value: number }>;
          };
        }
      ).__gamepadTest;
      state.axes = [0, 0, 1, 0];
      state.buttons[7] = { pressed: false, touched: false, value: 0 };
    });
    await expect
      .poll(
        () =>
          page.evaluate((start) => {
            const w = window as unknown as {
              __gamepadTest: { rumbleCount: number };
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('GameScene') as {
              gameService?: {
                getNetworkManager: () => {
                  getLocalPlayerState: () => {
                    position: { x: number };
                    ammo: number;
                  } | null;
                };
              };
            } | null;
            const player = scene?.gameService?.getNetworkManager().getLocalPlayerState();
            return {
              moved: (player?.position.x ?? 0) > start.x + 4,
              fired: (player?.ammo ?? start.ammo) < start.ammo,
              rumbled: w.__gamepadTest.rumbleCount > 0,
            };
          }, opening),
        {
          timeout: 5000,
          message: 'expected controller movement, trigger-release fire, and rumble',
        },
      )
      .toEqual({ moved: true, fired: true, rumbled: true });
  }

  if (process.env.VERIFY_OVERCHARGE === '1') {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('GameScene') as {
              gameService?: {
                getNetworkManager: () => {
                  getPickups: () => Array<{ type: string; isActive: boolean }>;
                };
              };
              pickupRenderer?: {
                pickups?: Map<
                  string,
                  {
                    container?: { visible?: boolean };
                    auraLabel?: { text?: string };
                  }
                >;
              };
            } | null;
            const pickups = scene?.gameService?.getNetworkManager().getPickups() ?? [];
            const authoredCell = pickups.find((pickup) => pickup.type === 'overcharge');
            const renderedCell = [...(scene?.pickupRenderer?.pickups?.values() ?? [])].some(
              (pickup) => pickup.container?.visible === true && pickup.auraLabel?.text === 'CHARGE',
            );
            return {
              stateActive: authoredCell?.isActive === true,
              rendered: renderedCell,
            };
          }),
        {
          timeout: 5000,
          message: 'expected the authoritative Overcharge Cell and CHARGE halo to render',
        },
      )
      .toEqual({ stateActive: true, rendered: true });
  }

  if (process.env.FORCE_MIDMATCH_MUTATOR === 'radiation_storm') {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('GameScene') as {
              gameService?: {
                getNetworkManager: () => {
                  getRadiationStormState: () => unknown | null;
                };
              };
              radiationStormRenderer?: {
                boundary?: { commandBuffer?: unknown[] };
              };
            } | null;
            return {
              stateActive: scene?.gameService?.getNetworkManager().getRadiationStormState() != null,
              boundaryDrawn:
                (scene?.radiationStormRenderer?.boundary?.commandBuffer?.length ?? 0) > 0,
            };
          }),
        { timeout: 15000, message: 'expected authoritative Radiation Storm rendering' },
      )
      .toEqual({ stateActive: true, boundaryDrawn: true });
  }

  if (
    process.env.FORCE_MIDMATCH_MUTATOR === 'scrapstorm' ||
    process.env.FORCE_EVENT === 'scrapstorm'
  ) {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('GameScene') as {
              gameService?: {
                getNetworkManager: () => {
                  getScrapstormState: () => { targetPosition?: unknown } | null;
                  getActiveMutators: () => readonly string[];
                  getMatchTimer: () => number;
                };
              };
              matchPhase?: string;
              scrapstormRenderer?: {
                warning?: { commandBuffer?: unknown[] };
              };
            } | null;
            const networkManager = scene?.gameService?.getNetworkManager();
            const state = networkManager?.getScrapstormState();
            return JSON.stringify({
              warningActive: state?.targetPosition != null,
              warningDrawn: (scene?.scrapstormRenderer?.warning?.commandBuffer?.length ?? 0) > 0,
              statePresent: state != null,
              rendererPresent: scene?.scrapstormRenderer != null,
              activeMutators: networkManager?.getActiveMutators() ?? [],
              matchTimer: networkManager?.getMatchTimer() ?? -1,
              matchPhase: scene?.matchPhase ?? 'missing',
            });
          }),
        { timeout: 15000, message: 'expected authoritative Scrapstorm warning rendering' },
      )
      .toContain('"warningActive":true,"warningDrawn":true');
  }

  if (
    process.env.FORCE_MIDMATCH_MUTATOR === 'demolition_wave' ||
    process.env.FORCE_EVENT === 'demolition_wave'
  ) {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('GameScene') as {
              gameService?: {
                getNetworkManager: () => {
                  getActiveMutators: () => readonly string[];
                };
              };
              hud?: {
                activeEventLabel?: { text?: string; visible?: boolean };
                eventBannerText?: { text?: string };
              };
              mapRenderer?: { gateSpritesByCell?: Map<number, unknown> };
            } | null;
            const active =
              scene?.gameService
                ?.getNetworkManager()
                .getActiveMutators()
                .includes('demolition_wave') ?? false;
            return {
              active,
              label: scene?.hud?.activeEventLabel?.text ?? '',
              labelVisible: scene?.hud?.activeEventLabel?.visible ?? false,
              closedGates: scene?.mapRenderer?.gateSpritesByCell?.size ?? -1,
            };
          }),
        { timeout: 15000, message: 'expected synchronized Demolition Wave arena opening' },
      )
      .toEqual({
        active: true,
        label: 'DEMOLITION WAVE',
        labelVisible: true,
        closedGates: 0,
      });
  }

  if (
    process.env.FORCE_MIDMATCH_MUTATOR === 'blood_rush' ||
    process.env.FORCE_EVENT === 'blood_rush'
  ) {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as {
              game?: { scene: { getScene: (key: string) => unknown } };
            };
            const scene = w.game?.scene.getScene('GameScene') as {
              gameService?: {
                getNetworkManager: () => {
                  getActiveMutators: () => readonly string[];
                };
              };
              hud?: { activeEventLabel?: { text?: string; visible?: boolean } };
            } | null;
            const active =
              scene?.gameService?.getNetworkManager().getActiveMutators().includes('blood_rush') ??
              false;
            return {
              active,
              label: scene?.hud?.activeEventLabel?.text ?? '',
              labelVisible: scene?.hud?.activeEventLabel?.visible ?? false,
              banner: scene?.hud?.eventBannerText?.text ?? '',
            };
          }),
        { timeout: 15000, message: 'expected synchronized Blood Rush activation' },
      )
      .toEqual({
        active: true,
        label: 'BLOOD RUSH',
        labelVisible: true,
        banner: 'BLOOD RUSH!\nKILLS GRANT 4 SEC SPEED',
      });
  }
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
                getRenderer: (id: string) =>
                  | {
                      bountyMarkerText?: { visible?: boolean };
                    }
                  | undefined;
              } | null;
              hud?: { bountyHuntText?: { visible?: boolean } } | null;
              gameService?: {
                getNetworkManager: () => {
                  getBountyHuntState: () => { targetId: string | null } | null;
                };
              };
            } | null;
            const state = scene?.gameService?.getNetworkManager().getBountyHuntState();
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
              const state = scene?.gameService?.getNetworkManager().getWastelandWarpState();
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

    if (process.env.FORCE_EVENT === 'scavenger_rush') {
      await expect
        .poll(
          () =>
            pageA.evaluate(() => {
              const w = window as unknown as {
                game?: { scene: { getScene: (key: string) => unknown } };
              };
              const scene = w.game?.scene.getScene('GameScene') as {
                pickupRenderer?: {
                  pickups?: Map<
                    string,
                    {
                      container?: { visible?: boolean };
                      auraHalo?: { visible?: boolean } | null;
                      auraLabel?: { text?: string; visible?: boolean } | null;
                    }
                  >;
                } | null;
                gameService?: {
                  getNetworkManager: () => {
                    getPickups: () => Array<{
                      id: string;
                      isActive: boolean;
                      isScavengerRushDrop?: true;
                    }>;
                  };
                };
              } | null;
              const supply = scene?.gameService
                ?.getNetworkManager()
                .getPickups()
                .find((pickup) => pickup.isScavengerRushDrop);
              const rendered = supply ? scene?.pickupRenderer?.pickups?.get(supply.id) : undefined;
              return {
                stateActive: supply?.isActive ?? false,
                containerVisible: rendered?.container?.visible ?? false,
                haloVisible: rendered?.auraHalo?.visible ?? false,
                label: rendered?.auraLabel?.text ?? null,
                labelVisible: rendered?.auraLabel?.visible ?? false,
              };
            }),
          {
            timeout: 10000,
            message: 'expected a live authoritative Scavenger Rush supply',
          },
        )
        .toEqual({
          stateActive: true,
          containerVisible: true,
          haloVisible: true,
          label: 'SUPPLY',
          labelVisible: true,
        });
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
              playerId && scene?.playerManager ? scene.playerManager.getRenderer(playerId) : null;
            const hasOverlay = Boolean(
              (renderer as { bodyOverlaySprite?: unknown } | null)?.bodyOverlaySprite,
            );
            return {
              characterId: network?.getLocalPlayerState()?.characterId ?? null,
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
