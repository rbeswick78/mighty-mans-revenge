import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from '../fixtures';

const largeWorldsAdvertised = process.env.CAPABILITY_LARGE_WORLDS === 'true';
const modernArtAdvertised = process.env.CAPABILITY_MODERN_ART === 'true';

function batch24ArtifactPath(testInfo: TestInfo, name: string): string | null {
  const artifactDir = process.env.BATCH24_ARTIFACT_DIR;
  if (!artifactDir) return null;
  mkdirSync(artifactDir, { recursive: true });
  return path.join(artifactDir, `${testInfo.project.name}-${name}.png`);
}

async function waitForScene(page: Page, key: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((sceneKey) => {
          const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
            sceneKey,
          );
          return scene?.sys.settings.active ?? false;
        }, key),
      { timeout: 15_000 },
    )
    .toBe(true);
}

async function rendererSnapshot(page: Page): Promise<{
  dataUrl: string;
  sampledColors: number;
  nonBlackSamples: number;
}> {
  return page.evaluate(
    () =>
      new Promise<{
        dataUrl: string;
        sampledColors: number;
        nonBlackSamples: number;
      }>((resolve, reject) => {
        const game = (window as unknown as { game?: Phaser.Game }).game;
        if (!game) {
          reject(new Error('game is missing before renderer snapshot'));
          return;
        }
        game.renderer.snapshot((image) => {
          const sample = document.createElement('canvas');
          sample.width = 160;
          sample.height = 90;
          const context = sample.getContext('2d', { willReadFrequently: true });
          if (!context) {
            reject(new Error('renderer snapshot sample context is unavailable'));
            return;
          }
          context.drawImage(image, 0, 0, sample.width, sample.height);
          const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
          const colors = new Set<string>();
          let nonBlackSamples = 0;
          for (let index = 0; index < pixels.length; index += 16) {
            const red = pixels[index] ?? 0;
            const green = pixels[index + 1] ?? 0;
            const blue = pixels[index + 2] ?? 0;
            const alpha = pixels[index + 3] ?? 0;
            colors.add(`${red},${green},${blue},${alpha}`);
            if (alpha > 0 && red + green + blue > 12) nonBlackSamples += 1;
          }
          resolve({
            dataUrl: image.src,
            sampledColors: colors.size,
            nonBlackSamples,
          });
        });
      }),
  );
}

async function stageGameplay(page: Page, largeWorlds: boolean, modernArt = false): Promise<void> {
  await page.evaluate(
    ({ advertiseLargeWorlds, advertiseModernArt }) => {
      const game = (window as unknown as { game?: Phaser.Game }).game;
      const lobby = game?.scene.getScene('LobbyScene') as unknown as {
        gameService: {
          getNetworkManager(): {
            connection: {
              disconnect(): void;
              send(message: unknown): void;
              setState(state: string): void;
            };
            getPlayerId(): string;
            getLocalPlayerState(): unknown;
            handleMessage(message: unknown): void;
          };
        };
      };
      const active = game?.scene.getScenes(true)[0];
      if (!active || !lobby.gameService) throw new Error('active menu scene is not ready');

      const manager = lobby.gameService.getNetworkManager();
      manager.connection.disconnect();
      manager.connection.setState('connected');
      manager.connection.send = () => undefined;
      manager.handleMessage({
        type: 'server:welcome',
        playerId: 'viewport-local',
        capabilities: {
          newShell: false,
          schedules: false,
          largeWorlds: advertiseLargeWorlds,
          modernArt: advertiseModernArt,
          battleRoyale: false,
        },
      });
      manager.getPlayerId = () => 'viewport-local';
      manager.getLocalPlayerState = () => ({
        id: 'viewport-local',
        nickname: 'VIEWPORT',
        characterId: 'mighty_man',
        position: { x: 144, y: 144 },
        velocity: { x: 0, y: 0 },
        aimAngle: 0,
        health: 100,
        maxHealth: 100,
        armor: 0,
        ammo: 30,
        weaponId: 'rifle',
        specialAmmo: 0,
        specialReserve: 0,
        grenades: 2,
        isReloading: false,
        isSprinting: false,
        stamina: 100,
        isDead: false,
        respawnTimer: 0,
        invulnerableTimer: 0,
        lastProcessedInput: 0,
        score: 0,
        deaths: 0,
        abilityActiveSeconds: 0,
        abilityCooldownSeconds: 0,
        frozenTimer: 0,
        secondWindTimer: 0,
        spawnRushTimer: 0,
      });

      game.scene.getScenes(true)[0]?.scene.start('GameScene', {
        nickname: 'VIEWPORT',
        matchData: {
          matchId: 'batch-18-viewport',
          opponents: [{ id: 'viewport-rival', nickname: 'RIVAL' }],
          mapName: 'Scrapyard',
          gameMode: 'deathmatch',
          matchKind: 'practice',
        },
      });
    },
    { advertiseLargeWorlds: largeWorlds, advertiseModernArt: modernArt },
  );
  await waitForScene(page, 'GameScene');
}

async function viewportSnapshot(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const game = (window as unknown as { game?: Phaser.Game }).game;
    const scene = game?.scene.getScene('GameScene') as unknown as {
      cameras: {
        main: { scrollX: number; scrollY: number; zoom: number; worldView: Phaser.Geom.Rectangle };
      };
      getGameplayViewportContract(): {
        viewport: {
          mode: string;
          logicalWidth: number;
          logicalHeight: number;
          worldBounds: { left: number; top: number; width: number; height: number };
        };
        safeArea: { left: number; top: number; right: number; bottom: number } | null;
      };
      getGameplayCoordinateSpace(): {
        screenToWorld(point: { space: 'screen'; x: number; y: number }): {
          space: 'world';
          x: number;
          y: number;
        };
        worldToScreen(point: { space: 'world'; x: number; y: number }): {
          space: 'screen';
          x: number;
          y: number;
        };
      };
      getCameraController(): {
        getState(): unknown;
      } | null;
      getResponsiveHudLayout(): {
        mode: string;
        vitalsPanel: unknown;
        score: unknown;
        menu: { launcher: unknown };
        touchActions: unknown;
      } | null;
      getDynamicWorldRenderState(): {
        plan: {
          worldBounds: { left: number; top: number; width: number; height: number };
          chunks: unknown[];
          viewportResource: { width: number; height: number };
        } | null;
        quality: { tier: string };
        map: { chunkCount: number; visibleChunkIds: string[] } | null;
        decals: { resourceCount: number; resources: unknown[] } | null;
        lighting: { width: number; height: number; quality: string } | null;
      };
      getMinimapRenderState(): unknown;
      kothHillRenderer: { gfx: { scrollFactorX: number; scrollFactorY: number } };
      coreRunRenderer: { container: { scrollFactorX: number; scrollFactorY: number } };
      radiationStormRenderer: {
        boundary: { scrollFactorX: number; scrollFactorY: number };
        wash: { scrollFactorX: number; scrollFactorY: number };
      };
      scrapstormRenderer: {
        warning: { scrollFactorX: number; scrollFactorY: number };
        localWarning: { scrollFactorX: number; scrollFactorY: number };
      };
      xrayFx: { tintRect: { scrollFactorX: number; scrollFactorY: number } };
      impactFx: { sparkPool: Array<{ img: { scrollFactorX: number; scrollFactorY: number } }> };
      explosionFx: { pool: Array<{ img: { scrollFactorX: number; scrollFactorY: number } }> };
      playerManager: {
        getRenderer(playerId: string):
          | {
              getContainer(): { scrollFactorX: number; scrollFactorY: number };
            }
          | undefined;
      };
    };
    const contract = scene.getGameplayViewportContract();
    const coordinates = scene.getGameplayCoordinateSpace();
    const cameraController = scene.getCameraController();
    const hudLayout = scene.getResponsiveHudLayout();
    const dynamic = scene.getDynamicWorldRenderState();
    const minimap = scene.getMinimapRenderState();
    const playerMarkerOwner = scene.playerManager.getRenderer('viewport-local')?.getContainer();
    return {
      scale: [game?.scale.width, game?.scale.height],
      mode: contract.viewport.mode,
      worldBounds: contract.viewport.worldBounds,
      safeArea: contract.safeArea,
      camera: {
        scrollX: scene.cameras.main.scrollX,
        scrollY: scene.cameras.main.scrollY,
        zoom: scene.cameras.main.zoom,
        width: scene.cameras.main.worldView.width,
        height: scene.cameras.main.worldView.height,
      },
      cameraController: cameraController?.getState() ?? null,
      hudLayout: hudLayout
        ? {
            mode: hudLayout.mode,
            vitalsPanel: hudLayout.vitalsPanel,
            score: hudLayout.score,
            menuLauncher: hudLayout.menu.launcher,
            touchActions: hudLayout.touchActions,
          }
        : null,
      dynamic: {
        worldBounds: dynamic.plan?.worldBounds ?? null,
        viewportResource: dynamic.plan?.viewportResource ?? null,
        chunks: dynamic.plan?.chunks.length ?? 0,
        quality: dynamic.quality.tier,
        map: dynamic.map,
        decals: dynamic.decals,
        lighting: dynamic.lighting,
      },
      minimap,
      coordinates: {
        screenToWorld: coordinates.screenToWorld({ space: 'screen', x: 480, y: 288 }),
        worldToScreen: coordinates.worldToScreen({ space: 'world', x: 480, y: 288 }),
      },
      domains: {
        kothObjective: [
          scene.kothHillRenderer.gfx.scrollFactorX,
          scene.kothHillRenderer.gfx.scrollFactorY,
        ],
        coreMarker: [
          scene.coreRunRenderer.container.scrollFactorX,
          scene.coreRunRenderer.container.scrollFactorY,
        ],
        playerMarkers: playerMarkerOwner
          ? [playerMarkerOwner.scrollFactorX, playerMarkerOwner.scrollFactorY]
          : null,
        impactParticles: [
          scene.impactFx.sparkPool[0]?.img.scrollFactorX,
          scene.impactFx.sparkPool[0]?.img.scrollFactorY,
        ],
        explosionParticles: [
          scene.explosionFx.pool[0]?.img.scrollFactorX,
          scene.explosionFx.pool[0]?.img.scrollFactorY,
        ],
        radiationBoundary: [
          scene.radiationStormRenderer.boundary.scrollFactorX,
          scene.radiationStormRenderer.boundary.scrollFactorY,
        ],
        radiationOverlay: [
          scene.radiationStormRenderer.wash.scrollFactorX,
          scene.radiationStormRenderer.wash.scrollFactorY,
        ],
        scrapBoundary: [
          scene.scrapstormRenderer.warning.scrollFactorX,
          scene.scrapstormRenderer.warning.scrollFactorY,
        ],
        scrapOverlay: [
          scene.scrapstormRenderer.localWarning.scrollFactorX,
          scene.scrapstormRenderer.localWarning.scrollFactorY,
        ],
        xrayOverlay: [scene.xrayFx.tintRect.scrollFactorX, scene.xrayFx.tintRect.scrollFactorY],
      },
    };
  });
}

async function responsiveHudSnapshot(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    type TextNode = {
      text: string;
      visible: boolean;
      x: number;
      y: number;
      alpha: number;
      scrollFactorX: number;
      scrollFactorY: number;
      setAlpha(value: number): TextNode;
      setScale(value: number): TextNode;
    };
    type ButtonNode = {
      emit(event: string): void;
      getBounds(): { x: number; y: number; width: number; height: number };
      scrollFactorX: number;
      scrollFactorY: number;
    };
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      getResponsiveHudLayout(): Record<string, unknown> | null;
      gameService: {
        getNetworkManager(): {
          getLocalPlayerState(): Record<string, unknown> | null;
          getMatchTimer(): number;
          getContractState(): unknown;
          getActiveMutators(): string[];
        };
      };
      hud: {
        healthText: TextNode;
        staminaText: TextNode;
        ammoText: TextNode;
        grenadeText: TextNode;
        specialWeaponLabel: TextNode;
        abilityNameText: TextNode;
        abilityCountdownText: TextNode;
        scoreText: TextNode;
        timerText: TextNode;
        activeEventLabel: TextNode;
        gunGameLadderText: TextNode;
        lastStandText: TextNode;
        killConfirmedText: TextNode;
        oneInTheChamberText: TextNode;
        coreRunText: TextNode;
        bountyHuntText: TextNode;
        kothLabel: TextNode;
        contractTitleText: TextNode;
        contractProgressText: TextNode;
        countdownText: TextNode;
        modeBriefingTitle: TextNode;
        deathOverlay: TextNode;
        combatCalloutText: TextNode;
        contractCalloutText: TextNode;
        eventBannerText: TextNode;
        killFeedEntries: Array<{ text: TextNode }>;
        updateHealth(current: number, max: number, armor: number): void;
        updateStamina(current: number, max: number): void;
        updateAmmo(current: number, max: number, reloading: boolean): void;
        updateGrenadeStatus(live: boolean, count: number): void;
        updateSpecialWeapon(weaponId: string, mag: number, reserve: number): void;
        updateAbility(characterId: string, active: number, cooldown: number): void;
        updateScores(scores: ReadonlyArray<{ name: string; score: number }>): void;
        updateTimer(seconds: number): void;
        setActiveEventLabel(text: string): void;
        updateGunGame(rung: unknown): void;
        updateLastStand(active: boolean): void;
        updateKillConfirmed(active: boolean): void;
        updateOneInTheChamber(
          active: boolean,
          weaponId: string,
          rounds: number,
          dead: boolean,
          started: boolean,
        ): void;
        updateCoreRun(state: unknown, localId: string): void;
        updateBountyHunt(state: unknown, localId: string, nickname: string): void;
        updateKothState(state: unknown, localId: string): void;
        updateContract(state: unknown, localId: string): void;
        addKillFeedEntry(label: string, tone: string): void;
        showCountdown(value: number): void;
        showModeBriefing(mode: string, input: string, secondary: boolean): void;
        updateDeathState(dead: boolean, seconds: number, eliminated: boolean): void;
        showCombatCallout(headline: string, detail: string, tint: number): void;
        showEventBanner(headline: string, detail: string, tint: number): void;
      };
      tweens: { killTweensOf(target: unknown): void };
      update(time: number, delta: number): void;
      inputManager: {
        touchInput: {
          grenadeButton: ButtonNode;
          abilityButton: ButtonNode;
          tauntButton: ButtonNode;
          setGameplayEnabled(enabled: boolean): void;
          getInput(liveGrenade: boolean): {
            throwPressed: boolean;
            abilityPressed: boolean;
            tauntPressed: boolean;
          };
        };
      };
    };
    const hud = scene.hud;
    const manager = scene.gameService.getNetworkManager();
    const local = manager.getLocalPlayerState();
    if (!local) throw new Error('responsive HUD local snapshot is missing');
    manager.getLocalPlayerState = () => ({
      ...local,
      health: 41.1,
      maxHealth: 115,
      armor: 12.2,
      stamina: 0.6,
      ammo: 7,
      weaponId: 'shotgun',
      specialAmmo: 3,
      specialReserve: 8,
      grenades: 2,
      score: 12,
      abilityCooldownSeconds: 4.2,
    });
    manager.getMatchTimer = () => 29.1;
    manager.getContractState = () => ({
      id: 'batch22-contract',
      title: 'ROAD WARRIOR',
      objective: 'LAND HITS',
      target: 8,
      players: [{ playerId: 'viewport-local', progress: 8, completed: true }],
    });
    manager.getActiveMutators = () => ['scrapstorm'];
    hud.updateHealth(41.1, 115, 12.2);
    hud.updateStamina(0.6, 3);
    hud.updateAmmo(7, 30, false);
    hud.updateGrenadeStatus(false, 2);
    hud.updateSpecialWeapon('shotgun', 3, 8);
    hud.updateAbility('mighty_man', 0, 4.2);
    hud.updateScores([
      { name: 'YOU', score: 12 },
      { name: 'RIVAL', score: 9 },
    ]);
    hud.updateTimer(29.1);
    hud.setActiveEventLabel('SCRAPSTORM · MOVE');

    const modeStates: Record<string, string> = {};
    hud.updateGunGame({ rungIndex: 2, killsIntoRung: 1, killsForRung: 2, weapon: 'pistol' });
    modeStates.gunGame = hud.gunGameLadderText.text;
    hud.updateGunGame(null);
    hud.updateLastStand(true);
    modeStates.lastStand = hud.lastStandText.text;
    hud.updateLastStand(false);
    hud.updateKillConfirmed(true);
    modeStates.killConfirmed = hud.killConfirmedText.text;
    hud.updateKillConfirmed(false);
    hud.updateOneInTheChamber(true, 'pistol', 1, false, true);
    modeStates.oneInTheChamber = hud.oneInTheChamberText.text;
    hud.updateOneInTheChamber(false, 'rifle', 0, false, true);
    hud.updateCoreRun(
      {
        position: { x: 480, y: 288 },
        carrierId: 'viewport-local',
        returnInSeconds: null,
        carryFraction: 0.5,
      },
      'viewport-local',
    );
    modeStates.coreRun = hud.coreRunText.text;
    hud.updateCoreRun(null, 'viewport-local');
    hud.updateBountyHunt({ targetId: 'viewport-rival' }, 'viewport-local', 'RIVAL');
    modeStates.bountyHunt = hud.bountyHuntText.text;
    hud.updateBountyHunt(null, 'viewport-local', 'RIVAL');
    hud.updateKothState(
      {
        hill: { x: 4, y: 4 },
        nextHill: null,
        occupantId: 'viewport-local',
        contested: false,
        captureFraction: 0.5,
      },
      'viewport-local',
    );
    modeStates.koth = hud.kothLabel.text;

    hud.updateContract(
      {
        id: 'batch22-contract',
        title: 'ROAD WARRIOR',
        objective: 'LAND HITS',
        target: 8,
        players: [{ playerId: 'viewport-local', progress: 3, completed: false }],
      },
      'viewport-local',
    );
    hud.addKillFeedEntry('YOU [RIFLE] RIVAL', 'local-kill');
    hud.addKillFeedEntry('RIVAL [AXE] YOU', 'local-death');
    hud.showCountdown(2);
    hud.showModeBriefing('deathmatch', 'touch', true);
    hud.updateDeathState(true, 2.2, false);
    hud.showCombatCallout('DOUBLE KILL', 'KEEP PUSHING', 0xffd166);
    hud.updateContract(
      {
        id: 'batch22-contract',
        title: 'ROAD WARRIOR',
        objective: 'LAND HITS',
        target: 8,
        players: [{ playerId: 'viewport-local', progress: 8, completed: true }],
      },
      'viewport-local',
    );
    hud.showEventBanner('SCRAPSTORM', 'MOVE NOW', 0xffa34d);
    for (const text of [
      hud.countdownText,
      hud.combatCalloutText,
      hud.contractCalloutText,
      hud.eventBannerText,
    ]) {
      scene.tweens.killTweensOf(text);
      text.setAlpha(1).setScale(1);
    }

    const touch = scene.inputManager.touchInput;
    touch.setGameplayEnabled(true);
    touch.grenadeButton.emit('pointerdown');
    touch.grenadeButton.emit('pointerup');
    touch.abilityButton.emit('pointerdown');
    touch.tauntButton.emit('pointerdown');
    const touchInput = touch.getInput(false);

    const read = (text: TextNode) => ({
      text: text.text,
      visible: text.visible,
      x: text.x,
      y: text.y,
      alpha: text.alpha,
      scroll: [text.scrollFactorX, text.scrollFactorY],
    });
    scene.update = () => undefined;
    return {
      layout: scene.getResponsiveHudLayout(),
      resources: {
        health: read(hud.healthText),
        stamina: read(hud.staminaText),
        ammo: read(hud.ammoText),
        grenades: read(hud.grenadeText),
        special: read(hud.specialWeaponLabel),
        abilityName: read(hud.abilityNameText),
        abilityState: read(hud.abilityCountdownText),
      },
      status: {
        score: read(hud.scoreText),
        timer: read(hud.timerText),
        event: read(hud.activeEventLabel),
        modes: modeStates,
      },
      contract: [read(hud.contractTitleText), read(hud.contractProgressText)],
      killFeed: hud.killFeedEntries.map(({ text }) => read(text)),
      overlays: {
        countdown: read(hud.countdownText),
        briefing: read(hud.modeBriefingTitle),
        death: read(hud.deathOverlay),
        combat: read(hud.combatCalloutText),
        contract: read(hud.contractCalloutText),
        event: read(hud.eventBannerText),
      },
      touch: {
        input: touchInput,
        taunt: touch.tauntButton.getBounds(),
        grenade: touch.grenadeButton.getBounds(),
        ability: touch.abilityButton.getBounds(),
        domains: [
          touch.tauntButton.scrollFactorX,
          touch.tauntButton.scrollFactorY,
          touch.grenadeButton.scrollFactorX,
          touch.grenadeButton.scrollFactorY,
          touch.abilityButton.scrollFactorX,
          touch.abilityButton.scrollFactorY,
        ],
      },
    };
  });
}

async function transformedCameraSnapshot(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      cameras: {
        main: {
          scrollX: number;
          scrollY: number;
          zoom: number;
          rotation: number;
          preRender(): void;
        };
      };
      getGameplayViewportContract(): {
        viewport: { worldBounds: { left: number; top: number; width: number; height: number } };
      };
      getGameplayCoordinateSpace(): {
        screenToWorld(point: { space: 'screen'; x: number; y: number }): {
          space: 'world';
          x: number;
          y: number;
        };
        worldToScreen(point: { space: 'world'; x: number; y: number }): {
          space: 'screen';
          x: number;
          y: number;
        };
        aimAngle(
          player: { space: 'world'; x: number; y: number },
          target: { space: 'screen'; x: number; y: number },
        ): number;
      };
      getCameraController(): {
        setWorldBounds(bounds: { left: number; top: number; width: number; height: number }): void;
        setBaseZoom(zoom: number): void;
        setTarget(target: {
          kind: 'local-player' | 'respawn' | 'spectator';
          position: { space: 'world'; x: number; y: number };
        }): void;
        triggerKick(angle: number): void;
        triggerShake(durationMs: number, intensity: number): void;
        triggerZoomPulse(): void;
        triggerRoll(sign: -1 | 1): void;
        update(deltaMs: number): void;
        getState(): {
          base: { scrollX: number; scrollY: number; zoom: number };
          transient: {
            kickX: number;
            kickY: number;
            shakeX: number;
            shakeY: number;
            zoomMultiplier: number;
            roll: number;
          };
          composed: { scrollX: number; scrollY: number; zoom: number; rotation: number };
        };
        reset(): void;
      } | null;
    };
    const controller = scene.getCameraController();
    if (!controller) throw new Error('camera controller is not ready');
    const coordinates = scene.getGameplayCoordinateSpace();
    const originalBounds = scene.getGameplayViewportContract().viewport.worldBounds;
    const syntheticLargeBounds = { left: 0, top: 0, width: 2560, height: 1440 };

    controller.setWorldBounds(syntheticLargeBounds);
    controller.setBaseZoom(1.25);
    controller.setTarget({
      kind: 'local-player',
      position: { space: 'world', x: 1500, y: 900 },
    });
    controller.update(0);
    scene.cameras.main.preRender();

    const screen = { space: 'screen', x: 800, y: 300 } as const;
    const targetWorld = coordinates.screenToWorld(screen);
    const roundTrip = coordinates.worldToScreen(targetWorld);
    const aim = coordinates.aimAngle({ space: 'world', x: 1500, y: 900 }, screen);
    const expectedAim = Math.atan2(targetWorld.y - 900, targetWorld.x - 1500);
    const targetScreen = coordinates.worldToScreen({
      space: 'world',
      x: 1500,
      y: 900,
    });
    const base = controller.getState();

    controller.setTarget({
      kind: 'respawn',
      position: { space: 'world', x: 100, y: 80 },
    });
    controller.update(0);
    const respawn = controller.getState();
    controller.setTarget({
      kind: 'spectator',
      position: { space: 'world', x: 2400, y: 1300 },
    });
    controller.triggerKick(0);
    controller.triggerShake(200, 0.01);
    controller.triggerZoomPulse();
    controller.triggerRoll(1);
    controller.update(16);
    const composed = controller.getState();

    controller.reset();
    controller.setWorldBounds(originalBounds);
    controller.setTarget({
      kind: 'local-player',
      position: { space: 'world', x: 144, y: 144 },
    });
    controller.update(0);

    return {
      base,
      respawn,
      composed,
      transform: { targetWorld, targetScreen, roundTrip, aim, expectedAim },
      restoredCamera: {
        scrollX: scene.cameras.main.scrollX,
        scrollY: scene.cameras.main.scrollY,
        zoom: scene.cameras.main.zoom,
        rotation: scene.cameras.main.rotation,
      },
    };
  });
}

async function coordinateInputSnapshot(
  page: Page,
  mobile: boolean,
): Promise<Record<string, unknown>> {
  return page.evaluate((useTouch) => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      input: { activePointer: { x: number; y: number } };
      getGameplayCoordinateSpace(): {
        aimAngle(
          player: { space: 'world'; x: number; y: number },
          target: { space: 'screen'; x: number; y: number },
        ): number;
        screenDirectionAngle(direction: { space: 'screen'; x: number; y: number }): number;
      };
      crosshair: {
        sprite: { x: number; y: number; scrollFactorX: number; scrollFactorY: number };
        update(enabled?: boolean): void;
      } | null;
      inputManager: {
        keyboardMouseInput: {
          getInput(position: { x: number; y: number }, hasGrenade: boolean): { aimAngle: number };
        };
        touchInput: {
          setGameplayEnabled(enabled: boolean): void;
          onPointerDown(pointer: Phaser.Input.Pointer): void;
          onPointerMove(pointer: Phaser.Input.Pointer): void;
          onPointerUp(pointer: Phaser.Input.Pointer): void;
          getInput(hasGrenade: boolean): { aimAngle: number };
          rightJoystick: { active: boolean };
        };
      };
    };
    const coordinates = scene.getGameplayCoordinateSpace();

    if (!useTouch) {
      const pointer = scene.input.activePointer;
      const raw = scene.inputManager.keyboardMouseInput.getInput({ x: 144, y: 144 }, false);
      scene.crosshair?.update(true);
      return {
        rawAim: raw.aimAngle,
        expectedAim: coordinates.aimAngle(
          { space: 'world', x: 144, y: 144 },
          { space: 'screen', x: pointer.x, y: pointer.y },
        ),
        crosshair: scene.crosshair
          ? [
              scene.crosshair.sprite.x,
              scene.crosshair.sprite.y,
              scene.crosshair.sprite.scrollFactorX,
              scene.crosshair.sprite.scrollFactorY,
            ]
          : null,
        pointer: [pointer.x, pointer.y],
      };
    }

    const touch = scene.inputManager.touchInput;
    touch.setGameplayEnabled(true);
    const down = { id: 41, x: 900, y: 300 } as Phaser.Input.Pointer;
    const moved = { id: 41, x: 950, y: 300 } as Phaser.Input.Pointer;
    touch.onPointerDown(down);
    touch.onPointerMove(moved);
    const raw = touch.getInput(false);
    touch.onPointerUp(moved);
    const blocked = { id: 42, x: 900, y: 600 } as Phaser.Input.Pointer;
    touch.onPointerDown(blocked);
    return {
      rawAim: raw.aimAngle,
      expectedAim: coordinates.screenDirectionAngle({ space: 'screen', x: 1, y: 0 }),
      fixedMapRejectsOutsideWorldY: !touch.rightJoystick.active,
    };
  }, mobile);
}

async function dynamicWorldMutationSnapshot(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      cameras: { main: { preRender(): void } };
      mapRenderer: {
        getCollisionGrid(): unknown;
        destroyTileAt(col: number, row: number): void;
        updateVisibleChunks(view: { x: number; y: number; width: number; height: number }): void;
      };
      decalRenderer: {
        addBulletHoleIfWall(x: number, y: number, angle: number, grid: unknown): void;
        updateDestroyedTiles(tiles: Array<{ col: number; row: number }>): void;
        updateVisibleChunks(view: { x: number; y: number; width: number; height: number }): void;
      };
      lightingRenderer: {
        addExplosionFlash(x: number, y: number): void;
        update(positions: unknown[], delta: number, local: null, blackout: boolean): void;
      };
      worldRenderQuality: { sampleFrame(delta: number): void; reset(): void };
      getDynamicWorldRenderState(): {
        quality: { tier: string };
        map: { visibleChunkIds: string[] };
        decals: {
          resources: Array<{
            id: string;
            stamps: number;
            revision: number;
            visible: boolean;
          }>;
        };
        lighting: {
          quality: string;
          lastProjectedLight: { x: number; y: number; radius: number } | null;
        };
      };
      getCameraController(): {
        setWorldBounds(bounds: { left: number; top: number; width: number; height: number }): void;
        setBaseZoom(zoom: number): void;
        setTarget(target: {
          kind: 'local-player';
          position: { space: 'world'; x: number; y: number };
        }): void;
        update(delta: number): void;
        reset(): void;
      };
    };
    const grid = scene.mapRenderer.getCollisionGrid();
    scene.decalRenderer.addBulletHoleIfWall(384, 72, 0, grid);
    const beforeDestruction = scene.getDynamicWorldRenderState().decals.resources;
    scene.mapRenderer.destroyTileAt(8, 1);
    scene.decalRenderer.updateDestroyedTiles([{ col: 8, row: 1 }]);
    const afterDestruction = scene.getDynamicWorldRenderState().decals.resources;

    const edgeView = { x: 0, y: 0, width: 336, height: 336 };
    scene.mapRenderer.updateVisibleChunks(edgeView);
    scene.decalRenderer.updateVisibleChunks(edgeView);
    const edgeCulling = scene.getDynamicWorldRenderState();

    for (let i = 0; i < 30; i++) scene.worldRenderQuality.sampleFrame(24);
    const controller = scene.getCameraController();
    controller.setWorldBounds({ left: 0, top: 0, width: 2560, height: 1440 });
    controller.setBaseZoom(1.25);
    controller.setTarget({
      kind: 'local-player',
      position: { space: 'world', x: 1500, y: 900 },
    });
    controller.update(0);
    scene.cameras.main.preRender();
    scene.lightingRenderer.addExplosionFlash(1500, 900);
    scene.lightingRenderer.update([], 16, null, false);
    const reduced = scene.getDynamicWorldRenderState();

    controller.reset();
    controller.setWorldBounds({ left: 0, top: 0, width: 960, height: 576 });
    scene.worldRenderQuality.reset();

    return {
      beforeDestruction,
      afterDestruction,
      edgeVisible: edgeCulling.map.visibleChunkIds,
      edgeDecals: edgeCulling.decals.resources
        .filter((resource) => resource.visible)
        .map((resource) => resource.id),
      reducedQuality: reduced.quality.tier,
      lightingQuality: reduced.lighting.quality,
      projectedLight: reduced.lighting.lastProjectedLight,
    };
  });
}

async function minimapScenarioSnapshot(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    type RemoteState = {
      characterId: 'bruce';
      position: { x: number; y: number };
      velocity: { x: number; y: number };
      aimAngle: number;
      health: number;
      maxHealth: number;
      armor: number;
      ammo: number;
      weaponId: 'rifle';
      specialAmmo: number;
      specialReserve: number;
      grenades: number;
      isReloading: boolean;
      isSprinting: boolean;
      stamina: number;
      isDead: boolean;
      respawnTimer: number;
      invulnerableTimer: number;
      score: number;
      deaths: number;
      nickname: string;
      abilityActiveSeconds: number;
      abilityCooldownSeconds: number;
      frozenTimer: number;
      secondWindTimer: number;
    };
    const remote = (x: number, y: number, nickname: string, isDead = false): RemoteState => ({
      characterId: 'bruce',
      position: { x, y },
      velocity: { x: 0, y: 0 },
      aimAngle: 0,
      health: isDead ? 0 : 100,
      maxHealth: 100,
      armor: 0,
      ammo: 30,
      weaponId: 'rifle',
      specialAmmo: 0,
      specialReserve: 0,
      grenades: 2,
      isReloading: false,
      isSprinting: false,
      stamina: 100,
      isDead,
      respawnTimer: isDead ? 2 : 0,
      invulnerableTimer: 0,
      score: 0,
      deaths: isDead ? 1 : 0,
      nickname,
      abilityActiveSeconds: 0,
      abilityCooldownSeconds: 0,
      frozenTimer: 0,
      secondWindTimer: 0,
    });

    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      matchData: {
        gameMode: string;
        playerTeams?: Record<string, 'blue' | 'red'>;
      };
      gameService: {
        getNetworkManager(): {
          getInterpolatedPlayers(): Map<string, RemoteState>;
          getKothState(): unknown;
          getConfirmedTags(): unknown[];
          getCoreRunState(): unknown;
          getBountyHuntState(): unknown;
        };
      };
      onTilesDestroyed: ((tiles: Array<{ col: number; row: number }>) => void) | null;
      getMinimapRenderState(): Record<string, unknown> | null;
    };
    const manager = scene.gameService.getNetworkManager();
    manager.getInterpolatedPlayers = () =>
      new Map([
        ['ally-b', remote(240, 192, 'ALLY B', true)],
        ['rival', remote(720, 384, 'RIVAL')],
        ['ally-a', remote(336, 240, 'ALLY A')],
      ]);
    scene.matchData.playerTeams = {
      'viewport-local': 'blue',
      'ally-a': 'blue',
      'ally-b': 'blue',
      rival: 'red',
    };

    let koth: unknown = null;
    let tags: unknown[] = [];
    let core: unknown = null;
    let bounty: unknown = null;
    manager.getKothState = () => koth;
    manager.getConfirmedTags = () => tags;
    manager.getCoreRunState = () => core;
    manager.getBountyHuntState = () => bounty;
    const settle = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );

    scene.matchData.gameMode = 'koth';
    koth = {
      hill: { x: 9, y: 5 },
      nextHill: { x: 7, y: 2 },
      occupantId: 'viewport-local',
      contested: false,
      captureFraction: 0.5,
    };
    await settle();
    const kothState = scene.getMinimapRenderState();

    scene.matchData.gameMode = 'kill_confirmed';
    koth = null;
    tags = [
      { id: 'tag-a', ownerId: 'viewport-local', position: { x: 96, y: 96 }, expiresInSeconds: 10 },
      { id: 'tag-b', ownerId: 'rival', position: { x: 800, y: 480 }, expiresInSeconds: 8 },
    ];
    await settle();
    const tagState = scene.getMinimapRenderState();

    scene.matchData.gameMode = 'core_run';
    tags = [];
    core = {
      position: { x: 480, y: 288 },
      carrierId: 'ally-a',
      returnInSeconds: null,
      carryFraction: 0.2,
    };
    await settle();
    const coreState = scene.getMinimapRenderState();

    scene.matchData.gameMode = 'bounty_hunt';
    core = null;
    bounty = { targetId: 'rival' };
    await settle();
    const bountyState = scene.getMinimapRenderState();

    const beforeDestruction = scene.getMinimapRenderState();
    scene.onTilesDestroyed?.([{ col: 7, row: 5 }]);
    await settle();
    const afterDestruction = scene.getMinimapRenderState();

    scene.matchData.gameMode = 'koth';
    bounty = null;
    koth = {
      hill: { x: 9, y: 5 },
      nextHill: { x: 7, y: 2 },
      occupantId: 'ally-a',
      contested: false,
      captureFraction: 0.75,
    };
    await settle();
    const crewKoth = scene.getMinimapRenderState();

    return {
      koth: kothState,
      tags: tagState,
      core: coreState,
      bounty: bountyState,
      beforeDestruction,
      afterDestruction,
      crewKoth,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForScene(page, 'LobbyScene');
});

test('capability-off and old-server gameplay retain the exact legacy surface', async ({ page }) => {
  test.skip(largeWorldsAdvertised, 'This invocation explicitly advertises large-world gameplay.');
  await stageGameplay(page, false);

  expect(await viewportSnapshot(page)).toEqual({
    scale: [960, 720],
    mode: 'legacy',
    worldBounds: { left: 0, top: 0, width: 960, height: 576 },
    safeArea: null,
    camera: { scrollX: 0, scrollY: 0, zoom: 1, width: 960, height: 720 },
    cameraController: {
      target: {
        kind: 'local-player',
        position: { space: 'world', x: 144, y: 144 },
      },
      base: { scrollX: 0, scrollY: 0, zoom: 1 },
      transient: {
        kickX: 0,
        kickY: 0,
        shakeX: 0,
        shakeY: 0,
        zoomMultiplier: 1,
        roll: 0,
      },
      composed: { scrollX: 0, scrollY: 0, zoom: 1, rotation: 0 },
    },
    hudLayout: {
      mode: 'legacy',
      vitalsPanel: { x: 0, y: 576, width: 960, height: 144 },
      score: { x: 480, y: 590 },
      menuLauncher: { x: 816, y: 14, width: 128, height: 42 },
      touchActions: {
        taunt: { x: 808, y: 116 },
        grenade: { x: 904, y: 116 },
        ability: { x: 904, y: 208 },
      },
    },
    dynamic: {
      worldBounds: { left: 0, top: 0, width: 960, height: 576 },
      viewportResource: { width: 960, height: 576 },
      chunks: 6,
      quality: 'full',
      map: {
        worldBounds: { left: 0, top: 0, width: 960, height: 576 },
        chunkCount: 6,
        visibleChunkIds: ['0:0', '0:1', '1:0', '1:1', '2:0', '2:1'],
      },
      decals: {
        resourceCount: 6,
        resources: expect.any(Array),
      },
      lighting: {
        width: 960,
        height: 576,
        timedLights: 0,
        quality: 'full',
        lastProjectedLight: null,
      },
    },
    minimap: null,
    coordinates: {
      screenToWorld: { space: 'world', x: 480, y: 288 },
      worldToScreen: { space: 'screen', x: 480, y: 288 },
    },
    domains: {
      kothObjective: [1, 1],
      coreMarker: [1, 1],
      playerMarkers: [1, 1],
      impactParticles: [1, 1],
      explosionParticles: [1, 1],
      radiationBoundary: [1, 1],
      radiationOverlay: [0, 0],
      scrapBoundary: [1, 1],
      scrapOverlay: [0, 0],
      xrayOverlay: [0, 0],
    },
  });
});

test('gated gameplay keeps one 16:9 logical view across desktop and mobile', async ({
  page,
}, testInfo) => {
  test.skip(!largeWorldsAdvertised, 'Run with CAPABILITY_LARGE_WORLDS=true.');
  await stageGameplay(page, true);

  const initial = await viewportSnapshot(page);
  const modernFallback = await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      getModernUiRenderState(): {
        enabled: boolean;
        hudFrame: string | null;
        minimapFrame: string | null;
      };
    };
    return scene.getModernUiRenderState();
  });
  expect(modernFallback).toMatchObject({ enabled: false, hudFrame: null, minimapFrame: null });
  expect(initial).toMatchObject({
    scale: [1280, 720],
    mode: 'large-world',
    worldBounds: { left: 0, top: 0, width: 960, height: 576 },
    camera: { scrollX: 0, scrollY: 0, zoom: 1, width: 1280, height: 720 },
    cameraController: {
      target: { kind: 'local-player' },
      base: { scrollX: 0, scrollY: 0, zoom: 1 },
      composed: { scrollX: 0, scrollY: 0, zoom: 1, rotation: 0 },
    },
    hudLayout: {
      mode: 'large-world',
      vitalsPanel: { x: 32, y: 552, width: 308, height: 136 },
      menuLauncher: { x: 1120, y: 32, width: 128, height: 42 },
    },
    dynamic: {
      worldBounds: { left: 0, top: 0, width: 960, height: 576 },
      viewportResource: { width: 960, height: 576 },
      chunks: 6,
      quality: 'full',
      map: { chunkCount: 6 },
      decals: { resourceCount: 6 },
      lighting: { width: 960, height: 576, quality: 'full' },
    },
    minimap: {
      layout: {
        panel: { x: 1032, y: 232, width: 216, height: 154 },
        map: { x: 1040, y: 258, width: 200, height: 120 },
      },
      worldBounds: { left: 0, top: 0, width: 960, height: 576 },
      landmarkCount: 10,
      scrollFactors: [0, 0, 0, 0, 0, 0],
      interactive: false,
    },
  });
  expect(initial.safeArea).toMatchObject({ left: 32, top: 32, right: 1248, bottom: 688 });
  expect(initial.coordinates).toEqual({
    screenToWorld: { space: 'world', x: 480, y: 288 },
    worldToScreen: { space: 'screen', x: 480, y: 288 },
  });
  expect(initial.domains).toEqual({
    kothObjective: [1, 1],
    coreMarker: [1, 1],
    playerMarkers: [1, 1],
    impactParticles: [1, 1],
    explosionParticles: [1, 1],
    radiationBoundary: [1, 1],
    radiationOverlay: [0, 0],
    scrapBoundary: [1, 1],
    scrapOverlay: [0, 0],
    xrayOverlay: [0, 0],
  });

  const transformed = await transformedCameraSnapshot(page);
  expect(transformed).toMatchObject({
    base: {
      target: { kind: 'local-player' },
      base: { scrollX: 860, scrollY: 540, zoom: 1.25 },
    },
    respawn: {
      target: { kind: 'respawn' },
      base: { scrollX: -128, scrollY: -72, zoom: 1.25 },
    },
    composed: {
      target: { kind: 'spectator' },
      base: { scrollX: 1408, scrollY: 792, zoom: 1.25 },
    },
    restoredCamera: { scrollX: 0, scrollY: 0, zoom: 1, rotation: 0 },
  });
  const transformedDetail = transformed as {
    composed: {
      transient: {
        kickX: number;
        shakeX: number;
        shakeY: number;
        zoomMultiplier: number;
        roll: number;
      };
    };
    transform: {
      targetScreen: { x: number; y: number };
      roundTrip: { x: number; y: number };
      aim: number;
      expectedAim: number;
    };
  };
  expect(transformedDetail.composed.transient.kickX).toBeGreaterThan(0);
  expect(
    Math.abs(transformedDetail.composed.transient.shakeX) +
      Math.abs(transformedDetail.composed.transient.shakeY),
  ).toBeGreaterThan(0);
  expect(transformedDetail.composed.transient.zoomMultiplier).toBeGreaterThan(1);
  expect(transformedDetail.composed.transient.roll).toBeGreaterThan(0);
  expect(transformedDetail.transform.targetScreen.x).toBeCloseTo(640, 6);
  expect(transformedDetail.transform.targetScreen.y).toBeCloseTo(360, 6);
  expect(transformedDetail.transform.roundTrip.x).toBeCloseTo(800, 6);
  expect(transformedDetail.transform.roundTrip.y).toBeCloseTo(300, 6);
  expect(transformedDetail.transform.aim).toBeCloseTo(transformedDetail.transform.expectedAim, 6);
  expect((await viewportSnapshot(page)).minimap).toEqual(initial.minimap);

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  if (testInfo.project.name === 'mobile-landscape')
    await canvas.tap({ position: { x: 24, y: 24 } });
  else await canvas.click({ position: { x: 24, y: 24 } });
  await expect.poll(async () => (await viewportSnapshot(page)).mode).toBe('large-world');

  if (testInfo.project.name !== 'mobile-landscape') {
    const box = await canvas.boundingBox();
    if (!box) throw new Error('gameplay canvas is missing');
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.4);
  }
  const input = await coordinateInputSnapshot(page, testInfo.project.name === 'mobile-landscape');
  expect(input.rawAim).toBeCloseTo(input.expectedAim as number, 6);
  if (testInfo.project.name === 'mobile-landscape') {
    expect(input.fixedMapRejectsOutsideWorldY).toBe(true);
  } else {
    expect(input.crosshair).toEqual([...(input.pointer as number[]), 0, 0]);
  }

  await page.screenshot({ path: testInfo.outputPath('gameplay-viewport.png') });
  if (testInfo.project.name === 'desktop-chromium') {
    await page.setViewportSize({ width: 844, height: 390 });
    await expect
      .poll(async () => {
        const box = await canvas.boundingBox();
        return box ? box.width / box.height : 0;
      })
      .toBeCloseTo(16 / 9, 2);
    expect(await viewportSnapshot(page)).toMatchObject({
      scale: [1280, 720],
      mode: 'large-world',
      camera: { width: 1280, height: 720 },
    });
    await page.screenshot({ path: testInfo.outputPath('gameplay-viewport-mobile-chromium.png') });
  }
});

test('responsive combat HUD prioritizes resources, statuses, callouts, touch, and menu', async ({
  page,
}, testInfo) => {
  test.skip(!largeWorldsAdvertised, 'Run with CAPABILITY_LARGE_WORLDS=true.');
  await stageGameplay(page, true);

  const snapshot = (await responsiveHudSnapshot(page)) as {
    layout: {
      logicalWidth: number;
      logicalHeight: number;
      safeArea: { left: number; top: number; right: number; bottom: number };
      vitalsPanel: { x: number; y: number; width: number; height: number };
      contract: { x: number; y: number; width: number; height: number };
      menu: { launcher: { x: number; y: number; width: number; height: number } };
      callouts: {
        combat: { y: number };
        contract: { y: number };
        event: { y: number };
      };
      countdown: { y: number };
    };
    resources: Record<string, { text: string; visible: boolean; scroll: number[] }>;
    status: {
      score: { text: string; visible: boolean; scroll: number[] };
      timer: { text: string; visible: boolean; scroll: number[] };
      event: { text: string; visible: boolean; scroll: number[] };
      modes: Record<string, string>;
    };
    contract: Array<{ text: string; visible: boolean; scroll: number[] }>;
    killFeed: Array<{ text: string; visible: boolean; scroll: number[] }>;
    overlays: Record<string, { text: string; visible: boolean; y: number; scroll: number[] }>;
    touch: {
      input: { throwPressed: boolean; abilityPressed: boolean; tauntPressed: boolean };
      taunt: { x: number; y: number; width: number; height: number };
      grenade: { x: number; y: number; width: number; height: number };
      ability: { x: number; y: number; width: number; height: number };
      domains: number[];
    };
  };

  expect(snapshot.layout).toMatchObject({
    logicalWidth: 1280,
    logicalHeight: 720,
    safeArea: { left: 32, top: 32, right: 1248, bottom: 688 },
    vitalsPanel: { x: 32, y: 552, width: 308, height: 136 },
    contract: { x: 32, y: 32 },
    menu: { launcher: { x: 1120, y: 32, width: 128, height: 42 } },
  });
  expect(snapshot.resources.health.text).toContain('42/115');
  expect(snapshot.resources.health.text).toContain('ARM 13');
  expect(snapshot.resources.stamina.text).toContain('SPRINT');
  expect(snapshot.resources.ammo.text).toContain('7/30');
  expect(snapshot.resources.grenades.text).toContain('2');
  expect(snapshot.resources.special.text).toBe('SHOTGUN');
  expect(snapshot.resources.abilityName.text).toContain('X-RAY');
  expect(snapshot.resources.abilityState.text).toContain('READY IN 5');
  for (const resource of Object.values(snapshot.resources)) {
    expect(resource.scroll).toEqual([0, 0]);
  }

  expect(snapshot.status.score.text).toContain('YOU: 12');
  expect(snapshot.status.timer.text).toBe('0:30');
  expect(snapshot.status.event.text).toContain('SCRAPSTORM');
  expect(snapshot.status.modes).toMatchObject({
    gunGame: 'PISTOL 1/2 - LVL 3/5',
    lastStand: 'LIVES REMAINING',
    killConfirmed: 'COLLECT ENEMY TAGS',
    oneInTheChamber: 'CHAMBER LOADED',
    coreRun: expect.stringContaining('YOU HAVE THE CORE'),
    bountyHunt: expect.stringContaining('HUNT RIVAL'),
    koth: 'HILL',
  });
  expect(snapshot.contract[0]?.text).toBe('CONTRACT COMPLETE');
  expect(snapshot.killFeed.map(({ text }) => text)).toEqual([
    'RIVAL [AXE] YOU',
    'YOU [RIFLE] RIVAL',
  ]);
  expect([
    snapshot.layout.callouts.combat.y,
    snapshot.layout.callouts.contract.y,
    snapshot.layout.callouts.event.y,
    snapshot.layout.countdown.y,
  ]).toEqual([170, 235, 300, 360]);
  expect(snapshot.overlays.combat.visible).toBe(true);
  expect(snapshot.overlays.contract.visible).toBe(true);
  expect(snapshot.overlays.event.visible).toBe(true);
  expect(snapshot.overlays.death.text).toContain('RESPAWN IN 3');
  expect(snapshot.overlays.briefing.text).toContain('DEATHMATCH');

  expect(snapshot.touch.input).toMatchObject({
    throwPressed: true,
    abilityPressed: true,
    tauntPressed: true,
  });
  expect(snapshot.touch.domains).toEqual([0, 0, 0, 0, 0, 0]);
  for (const action of [snapshot.touch.taunt, snapshot.touch.grenade, snapshot.touch.ability]) {
    expect(action.x).toBeGreaterThanOrEqual(snapshot.layout.safeArea.left);
    expect(action.y).toBeGreaterThanOrEqual(snapshot.layout.safeArea.top);
    expect(action.x + action.width).toBeLessThanOrEqual(snapshot.layout.safeArea.right);
    expect(action.y + action.height).toBeLessThanOrEqual(snapshot.layout.safeArea.bottom);
  }

  await page.screenshot({ path: testInfo.outputPath('responsive-combat-hud.png') });
  if (testInfo.project.name === 'desktop-chromium') {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({
      path: testInfo.outputPath('responsive-combat-hud-mobile-chromium.png'),
    });
  }

  const menu = await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      matchMenu: {
        setAvailable(available: boolean): void;
        show(): void;
        moveFocus(direction: -1 | 1): void;
        activateFocused(): void;
        getView(): string;
        getFocusedIndex(): number;
        isOpen(): boolean;
        getLayoutState(): { menu: { panel: unknown; launcher: unknown } } | null;
      };
    };
    scene.matchMenu.setAvailable(true);
    scene.matchMenu.show();
    scene.matchMenu.moveFocus(1);
    scene.matchMenu.activateFocused();
    return {
      open: scene.matchMenu.isOpen(),
      view: scene.matchMenu.getView(),
      focused: scene.matchMenu.getFocusedIndex(),
      layout: scene.matchMenu.getLayoutState()?.menu ?? null,
    };
  });
  expect(menu).toMatchObject({
    open: true,
    view: 'confirm',
    focused: 0,
    layout: {
      launcher: { x: 1120, y: 32 },
      panel: { x: 370, y: 145, width: 540, height: 430 },
    },
  });
  await page.screenshot({ path: testInfo.outputPath('responsive-match-menu.png') });
});

test('minimap projects map truth, objectives, local and Crew allies without camera authority', async ({
  page,
}, testInfo) => {
  test.skip(!largeWorldsAdvertised, 'Run with CAPABILITY_LARGE_WORLDS=true.');
  await stageGameplay(page, true);

  type MinimapState = {
    layout: {
      panel: { x: number; y: number; width: number; height: number };
      map: { x: number; y: number; width: number; height: number };
    };
    worldBounds: { left: number; top: number; width: number; height: number };
    solidCount: number;
    landmarkCount: number;
    objectives: Array<{ kind: string; playerId?: string }>;
    players: Array<{ kind: string; playerId: string; isDead: boolean }>;
    scrollFactors: number[];
    interactive: boolean;
  };
  const snapshot = (await minimapScenarioSnapshot(page)) as {
    koth: MinimapState;
    tags: MinimapState;
    core: MinimapState;
    bounty: MinimapState;
    beforeDestruction: MinimapState;
    afterDestruction: MinimapState;
    crewKoth: MinimapState;
  };

  expect(snapshot.koth.objectives.map(({ kind }) => kind)).toEqual(['koth', 'next-koth']);
  expect(snapshot.tags.objectives.map(({ kind }) => kind)).toEqual(['tag', 'tag']);
  expect(snapshot.core.objectives.map(({ kind }) => kind)).toEqual(['core']);
  expect(snapshot.bounty.objectives.map(({ kind, playerId }) => ({ kind, playerId }))).toEqual([
    { kind: 'bounty', playerId: 'rival' },
  ]);
  expect(snapshot.afterDestruction.solidCount).toBe(snapshot.beforeDestruction.solidCount - 1);
  expect(snapshot.afterDestruction.landmarkCount).toBe(
    snapshot.beforeDestruction.landmarkCount - 1,
  );
  expect(snapshot.crewKoth).toMatchObject({
    layout: {
      panel: { x: 1032, y: 232, width: 216, height: 154 },
      map: { x: 1040, y: 258, width: 200, height: 120 },
    },
    worldBounds: { left: 0, top: 0, width: 960, height: 576 },
    landmarkCount: 9,
    scrollFactors: [0, 0, 0, 0, 0, 0],
    interactive: false,
  });
  expect(
    snapshot.crewKoth.players.map(({ kind, playerId, isDead }) => ({
      kind,
      playerId,
      isDead,
    })),
  ).toEqual([
    { kind: 'local', playerId: 'viewport-local', isDead: false },
    { kind: 'ally', playerId: 'ally-a', isDead: false },
    { kind: 'ally', playerId: 'ally-b', isDead: true },
  ]);
  expect(snapshot.crewKoth.players.some(({ playerId }) => playerId === 'rival')).toBe(false);

  const desktopScreenshot = await page.screenshot();
  const desktopArtifact = batch24ArtifactPath(testInfo, 'camera-world-hud-minimap');
  if (desktopArtifact) writeFileSync(desktopArtifact, desktopScreenshot);
  await testInfo.attach('minimap-foundation', {
    body: desktopScreenshot,
    contentType: 'image/png',
  });
  if (testInfo.project.name === 'desktop-chromium') {
    await page.setViewportSize({ width: 844, height: 390 });
    await expect
      .poll(async () => {
        const state = (await viewportSnapshot(page)).minimap as MinimapState | null;
        return state?.layout.panel ?? null;
      })
      .toEqual(snapshot.crewKoth.layout.panel);
    const mobileScreenshot = await page.screenshot();
    const mobileArtifact = batch24ArtifactPath(testInfo, 'camera-world-hud-minimap-mobile-size');
    if (mobileArtifact) writeFileSync(mobileArtifact, mobileScreenshot);
    await testInfo.attach('minimap-foundation-mobile-chromium', {
      body: mobileScreenshot,
      contentType: 'image/png',
    });
  }
});

test('renderer snapshots provide trustworthy staged non-Chromium visual evidence', async ({
  page,
}, testInfo) => {
  test.skip(!largeWorldsAdvertised, 'Run with CAPABILITY_LARGE_WORLDS=true.');
  test.skip(
    testInfo.project.name === 'desktop-chromium',
    'Chromium already supplies live and mobile-sized compositor screenshots.',
  );
  await stageGameplay(page, true);
  await minimapScenarioSnapshot(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  const snapshot = await rendererSnapshot(page);
  expect(snapshot.sampledColors).toBeGreaterThan(8);
  expect(snapshot.nonBlackSamples).toBeGreaterThan(100);
  const image = Buffer.from(snapshot.dataUrl.split(',')[1] ?? '', 'base64');
  const artifact = batch24ArtifactPath(testInfo, 'renderer-visual');
  if (artifact) writeFileSync(artifact, image);
  await testInfo.attach('renderer-visual', {
    body: image,
    contentType: 'image/png',
  });
});

test('dynamic chunks, destruction resources, lighting, and quality stay aligned', async ({
  page,
}) => {
  test.skip(!largeWorldsAdvertised, 'Run with CAPABILITY_LARGE_WORLDS=true.');
  await stageGameplay(page, true);
  const state = (await dynamicWorldMutationSnapshot(page)) as {
    beforeDestruction: Array<{ id: string; stamps: number }>;
    afterDestruction: Array<{ id: string; stamps: number; revision: number }>;
    edgeVisible: string[];
    edgeDecals: string[];
    reducedQuality: string;
    lightingQuality: string;
    projectedLight: { x: number; y: number; radius: number };
  };
  expect(
    state.beforeDestruction
      .filter((resource) => resource.stamps > 0)
      .map((resource) => resource.id),
  ).toEqual(['0:0', '1:0']);
  expect(
    state.afterDestruction
      .filter((resource) => resource.revision > 0)
      .map(({ id, stamps, revision }) => ({ id, stamps, revision })),
  ).toEqual([
    { id: '0:0', stamps: 0, revision: 1 },
    { id: '1:0', stamps: 0, revision: 1 },
  ]);
  expect(state.edgeVisible).toEqual(['0:0']);
  expect(state.edgeDecals).toEqual(['0:0']);
  expect(state.reducedQuality).toBe('reduced');
  expect(state.lightingQuality).toBe('reduced');
  expect(state.projectedLight.x).toBeCloseTo(640, 4);
  expect(state.projectedLight.y).toBeCloseTo(360, 4);
  expect(state.projectedLight.radius).toBeCloseTo(187.5, 4);
});

test('modern UI frames preserve the current small world, HUD/minimap priorities, and Results focus', async ({
  page,
}, testInfo) => {
  test.skip(
    !largeWorldsAdvertised || !modernArtAdvertised,
    'Run with CAPABILITY_LARGE_WORLDS=true and CAPABILITY_MODERN_ART=true.',
  );
  await stageGameplay(page, true, true);
  const gameplay = await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      getModernUiRenderState(): {
        enabled: boolean;
        hudFrame: string | null;
        minimapFrame: string | null;
        worldBounds: { width: number; height: number } | null;
      };
      getResponsiveHudLayout(): { vitalsPanel: unknown; killFeed: unknown; menu: unknown };
      getMinimapRenderState(): { layout: unknown };
    };
    return {
      modern: scene.getModernUiRenderState(),
      hud: scene.getResponsiveHudLayout(),
      minimap: scene.getMinimapRenderState(),
    };
  });
  expect(gameplay.modern).toEqual({
    enabled: true,
    hudFrame: 'ui.chrome.states/001',
    minimapFrame: 'ui.chrome.states/003',
    worldBounds: { width: 960, height: 576 },
  });
  expect(gameplay.hud).not.toBeNull();
  expect(gameplay.minimap).not.toBeNull();
  await page.screenshot({ path: testInfo.outputPath('batch-27-modern-hud-minimap.png') });
  if (testInfo.project.name === 'desktop-chromium') {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: testInfo.outputPath('batch-27-modern-hud-minimap-mobile-size.png'),
    });
  }

  await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      shutdown(): void;
      scene: { start(key: string, data: unknown): void };
    };
    scene.shutdown();
    scene.scene.start('ResultsScene', { nickname: 'MODERN UI' });
  });
  await waitForScene(page, 'ResultsScene');
  await page.keyboard.press('ArrowRight');
  const results = await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'ResultsScene',
    ) as unknown as {
      getModernUiRenderState(): {
        enabled: boolean;
        panelFrame: string | null;
        actionFrames: (string | null)[];
      };
    };
    return scene.getModernUiRenderState();
  });
  expect(results).toEqual({
    enabled: true,
    panelFrame: 'ui.chrome.states/002',
    actionFrames: ['ui.chrome.states/019', null, 'ui.chrome.states/014'],
  });
  await page.screenshot({ path: testInfo.outputPath('batch-27-modern-results.png') });
});

test('Results and connection recovery restore legacy scene sizing', async ({ page }) => {
  test.skip(!largeWorldsAdvertised, 'Run with CAPABILITY_LARGE_WORLDS=true.');
  await stageGameplay(page, true);

  await page.evaluate(() => {
    const game = (window as unknown as { game?: Phaser.Game }).game;
    const scene = game?.scene.getScene('GameScene') as unknown as {
      shutdown(): void;
      scene: { start(key: string, data: unknown): void };
    };
    scene.shutdown();
    scene.scene.start('ResultsScene', { nickname: 'VIEWPORT' });
  });
  await waitForScene(page, 'ResultsScene');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (window as unknown as { game?: Phaser.Game }).game;
        return [game?.scale.width, game?.scale.height];
      }),
    )
    .toEqual([960, 720]);

  await page.evaluate(() => {
    const game = (window as unknown as { game?: Phaser.Game }).game;
    if (!game) throw new Error('game is missing before rematch restoration');
    game.scene.stop('ResultsScene');
    game.scene.start('GameScene', {
      nickname: 'VIEWPORT',
      matchData: {
        matchId: 'batch-22-rematch',
        opponents: [{ id: 'viewport-rival', nickname: 'RIVAL' }],
        mapName: 'Scrapyard',
        gameMode: 'deathmatch',
        matchKind: 'practice',
      },
    });
  });
  await waitForScene(page, 'GameScene');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (window as unknown as { game?: Phaser.Game }).game;
        const scene = game?.scene.getScene('GameScene') as unknown as {
          getResponsiveHudLayout(): { mode: string } | null;
          getMinimapRenderState(): unknown;
        };
        return {
          size: [game?.scale.width, game?.scale.height],
          hudMode: scene.getResponsiveHudLayout()?.mode ?? null,
          minimap: scene.getMinimapRenderState() !== null,
        };
      }),
    )
    .toEqual({ size: [1280, 720], hudMode: 'large-world', minimap: true });
  await page.evaluate(() => {
    const scene = (window as unknown as { game?: Phaser.Game }).game?.scene.getScene(
      'GameScene',
    ) as unknown as {
      gameService: { getNetworkManager(): { connection: { setState(state: string): void } } };
    };
    scene.gameService.getNetworkManager().connection.setState('reconnecting');
  });
  await waitForScene(page, 'LobbyScene');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (window as unknown as { game?: Phaser.Game }).game;
        return [game?.scale.width, game?.scale.height];
      }),
    )
    .toEqual([960, 720]);
});
