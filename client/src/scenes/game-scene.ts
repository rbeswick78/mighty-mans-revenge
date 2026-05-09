import Phaser from 'phaser';

import type { MapData } from '@shared/types/map.js';
import type { PlayerId, Vec2 } from '@shared/types/common.js';
import type { MatchResult, KillFeedEntry } from '@shared/types/game.js';
import { MatchPhase } from '@shared/types/game.js';
import type { BulletTrail } from '@shared/types/projectile.js';
import { PLAYER, SERVER } from '@shared/config/game.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import {
  predictBulletRay,
  predictGrenadePath,
} from '@shared/utils/trajectory-prediction.js';
import type { PlayerState } from '@shared/types/player.js';
import { MapRenderer } from '../rendering/map-renderer.js';
import { ClientPlayerManager } from '../rendering/player-manager.js';
import { EffectsRenderer } from '../rendering/effects-renderer.js';
import { PickupRenderer } from '../rendering/pickup-renderer.js';
import { GrenadeRenderer } from '../rendering/grenade-renderer.js';
import { LightingRenderer } from '../rendering/lighting-renderer.js';
import { KillJuice } from '../rendering/kill-juice.js';
import { HealFlash } from '../rendering/heal-flash.js';
import { EventFlash } from '../rendering/event-flash.js';
import { eventDisplayName } from '@shared/utils/event-modifiers.js';
import type { FinalMinuteEvent, SerializedPlayerState } from '@shared/types/network.js';
import type { EventStartPayload, EventWarningPayload } from '../services/game-service.js';
import { ImpactFx } from '../rendering/impact-fx.js';
import { ExplosionFx } from '../rendering/explosion-fx.js';
import { SmokeFx } from '../rendering/smoke-fx.js';
import { FireBreathFx } from '../rendering/fire-breath-fx.js';
import { XrayFx } from '../rendering/xray-fx.js';
import { AbilityAura } from '../rendering/ability-aura.js';
import { DecalRenderer } from '../rendering/decal-renderer.js';
import { CameraKick } from '../rendering/camera-kick.js';
import { ZoomPulse } from '../rendering/zoom-pulse.js';
import { CameraRoll, ROLL_DAMAGE_THRESHOLD } from '../rendering/camera-roll.js';
import {
  CHROMATIC_DECAY_MS,
  CHROMATIC_INITIAL_PIXELS,
  CrtPipeline,
} from '../rendering/post-fx/crt-pipeline.js';
import { ShockwaveController } from '../rendering/post-fx/shockwave-controller.js';
import {
  BLOOM_BLUR_STRENGTH,
  BLOOM_COLOR,
  BLOOM_OFFSET_X,
  BLOOM_OFFSET_Y,
  BLOOM_STEPS,
  BLOOM_STRENGTH,
} from '../rendering/post-fx/bloom-config.js';
import { Crosshair } from '../rendering/crosshair.js';
import { HUD } from '../ui/hud.js';
import { InputManager } from '../input/input-manager.js';
import { isTouchDevice } from '../input/is-touch-device.js';
import { GameService, type MatchData } from '../services/game-service.js';
import { AudioManager } from '../audio/audio-manager.js';
import type { LocalCorrection, NetworkManager } from '../network/network-manager.js';
import { getMap, DEFAULT_MAP_NAME } from '@shared/maps/registry.js';

const LOCAL_CORRECTION_SMOOTH_MS = 120;
const LOCAL_CORRECTION_EPSILON = 0.01;

/**
 * Hard cap on how many catch-up ticks can run in a single Phaser frame.
 * If `delta` ever balloons (tab hidden, GC pause, RAF throttling, OS sleep),
 * we discard the surplus instead of replaying it. Replaying causes runaway
 * prediction (visible as the local player rocketing across the map) and
 * floods the server's input queue, where the per-tick drain limit then
 * stretches a multi-second backlog out — the client sees rubber-banding
 * for every gameState until the queue clears.
 */
const MAX_CATCHUP_TICKS = 3;

interface GameSceneData {
  nickname?: string;
  matchData?: MatchData;
}

export class GameScene extends Phaser.Scene {
  private mapRenderer: MapRenderer | null = null;
  private playerManager: ClientPlayerManager | null = null;
  private effectsRenderer: EffectsRenderer | null = null;
  private pickupRenderer: PickupRenderer | null = null;
  private grenadeRenderer: GrenadeRenderer | null = null;
  private lightingRenderer: LightingRenderer | null = null;
  private killJuice: KillJuice | null = null;
  private healFlash: HealFlash | null = null;
  private eventFlash: EventFlash | null = null;
  private impactFx: ImpactFx | null = null;
  private explosionFx: ExplosionFx | null = null;
  private smokeFx: SmokeFx | null = null;
  private fireBreathFx: FireBreathFx | null = null;
  private xrayFx: XrayFx | null = null;
  private abilityAura: AbilityAura | null = null;
  /**
   * Last-seen `abilityActiveSeconds > 0` for the local player. Used to
   * detect the false→true edge so the activation banner fires exactly
   * once per cast — not every frame the ability is active.
   */
  private prevAbilityActive = false;
  private decalRenderer: DecalRenderer | null = null;
  private cameraKick: CameraKick | null = null;
  private zoomPulse: ZoomPulse | null = null;
  private cameraRoll: CameraRoll | null = null;
  /** Tracks last-seen isDead per player so we can detect the false→true edge. */
  private prevDeadStates: Map<string, boolean> = new Map();
  /** Chromatic-aberration offset in pixels; decays toward 0, kicks back up on local damage. */
  private aberrationPixels = 0;
  private prevLocalHealth: number | null = null;
  private crtPipeline: CrtPipeline | null = null;
  private shockwaveController: ShockwaveController | null = null;
  private hud: HUD | null = null;
  private crosshair: Crosshair | null = null;
  private inputManager: InputManager | null = null;
  private gameService!: GameService;
  private nickname = '';
  private matchData: MatchData | null = null;
  private currentTick = 0;
  private inputAccumulatorMs = 0;
  private lastCountdownValue = -1;
  private matchPhase: MatchPhase = MatchPhase.WAITING;
  /**
   * The fade-out + scene transition is started by whichever of these fires first:
   * the local match clock reaching 0:00, or the server:matchEnd arriving (kill
   * target / disconnect / etc.). The other side fills in once it shows up. The
   * actual ResultsScene start is gated on having both the result and the fade
   * complete, so timer-driven match-ends don't sit on a frozen 0:00 waiting on
   * server round-trip + fade.
   */
  private endTransitionStarted = false;
  private fadeComplete = false;
  private pendingResult: MatchResult | null = null;

  /** Previous and current predicted positions for render-rate interpolation. */
  private prevLocalPos: Vec2 | null = null;
  private currLocalPos: Vec2 | null = null;
  private localCorrectionOffset: Vec2 = { x: 0, y: 0 };
  private localCorrectionOffsetStart: Vec2 = { x: 0, y: 0 };
  private localCorrectionElapsedMs = 0;
  private lastRenderedLocalPos: Vec2 | null = null;

  // Event handler references for cleanup
  private onMatchCountdown: ((countdown: number) => void) | null = null;
  private onMatchStart: (() => void) | null = null;
  private onMatchEnd: ((result: MatchResult) => void) | null = null;
  private onOpponentDisconnected: ((playerId: PlayerId) => void) | null = null;
  private onBulletTrail: ((trail: BulletTrail) => void) | null = null;
  private onPlayerKilled: ((entry: KillFeedEntry) => void) | null = null;
  private onPickupCollected: ((pickupId: string, playerId: PlayerId) => void) | null = null;
  private onGrenadeThrown: ((pos: Vec2) => void) | null = null;
  private onGrenadeExploded: ((pos: Vec2) => void) | null = null;
  private onLocalCorrection: ((correction: LocalCorrection) => void) | null = null;
  private onEventWarning: ((payload: EventWarningPayload) => void) | null = null;
  private onEventStart: ((payload: EventStartPayload) => void) | null = null;
  /** Cached so we can detect changes (incl. mid-match-join) and resync the label. */
  private lastSyncedActiveEvent: FinalMinuteEvent | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameSceneData): void {
    this.nickname = data.nickname ?? 'Unknown';
    this.matchData = data.matchData ?? null;
    this.endTransitionStarted = false;
    this.fadeComplete = false;
    this.pendingResult = null;
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.installCrtPipeline();
    this.installBloomFX();
    this.gameService = GameService.getInstance();

    // Lobby music plays into the lobby; the countdown phase is silent and
    // the gameplay track starts on match start (see onMatchStart below).
    AudioManager.getInstance()?.stopMusic();

    // Render the map. Server picks the map at match-creation and tells the
    // client via matchFound.mapName; we look it up in the shared registry.
    // Falls back to the default map if matchData is missing (e.g., reloaded
    // mid-match before the matchFound event re-fires).
    this.mapRenderer = new MapRenderer(this);
    const mapData: MapData = getMap(this.matchData?.mapName ?? DEFAULT_MAP_NAME);
    this.mapRenderer.renderMap(mapData);

    // Wire the collision grid into the network manager so client-side
    // prediction and reconciliation use the same physics as the server.
    const grid = this.mapRenderer.getCollisionGrid();
    if (grid) {
      this.gameService.getNetworkManager().setCollisionGrid(grid);
    }

    // Decal RT must be created right after the map and before any player
    // containers — display-list insertion order is what stacks decals
    // above tiles and below players. See `DecalRenderer` class doc. The
    // grid is also used to bake a wall mask so decals are clipped to
    // wall pixels (no spillage onto floor at tile edges).
    this.decalRenderer = new DecalRenderer(this, grid);
    // Scorch is now a hard tile-frame swap on the map sprites themselves
    // (see MapRenderer.scorchArea), so no separate RT renderer here. The
    // ScorchRenderer module file is still in the repo for easy revert if
    // the hard-swap look turns out wrong.

    // Create subsystems
    this.playerManager = new ClientPlayerManager(this);
    this.effectsRenderer = new EffectsRenderer(this);
    this.pickupRenderer = new PickupRenderer(this);
    this.grenadeRenderer = new GrenadeRenderer(this);
    this.lightingRenderer = new LightingRenderer(this);
    this.killJuice = new KillJuice(this);
    this.healFlash = new HealFlash(this);
    this.eventFlash = new EventFlash(this);
    this.impactFx = new ImpactFx(this);
    this.explosionFx = new ExplosionFx(this);
    this.smokeFx = new SmokeFx(this);
    this.fireBreathFx = new FireBreathFx(this);
    this.xrayFx = new XrayFx(this);
    this.abilityAura = new AbilityAura(this);
    this.shockwaveController = new ShockwaveController();
    this.cameraKick = new CameraKick();
    this.zoomPulse = new ZoomPulse();
    this.cameraRoll = new CameraRoll();
    this.hud = new HUD(this);
    // Bullseye replaces the OS cursor on desktop only — touch input
    // doesn't have a hover position to track.
    if (!isTouchDevice()) {
      this.crosshair = new Crosshair(this);
    }
    this.inputManager = new InputManager(this);

    // Wire up network events
    this.wireGameServiceEvents();
  }

  update(_time: number, delta: number): void {
    if (!this.inputManager || !this.hud) return;

    // Decay chromatic aberration toward 0 every frame; it's pushed to the
    // pipeline at the end of update() so a same-frame hit registers
    // immediately.
    if (this.aberrationPixels > 0) {
      const decayPerMs = CHROMATIC_INITIAL_PIXELS / CHROMATIC_DECAY_MS;
      this.aberrationPixels = Math.max(0, this.aberrationPixels - delta * decayPerMs);
    }

    const networkManager = this.gameService.getNetworkManager();
    let localState = networkManager.getLocalPlayerState();

    // Rate-limit input to the server tick rate. Client prediction uses
    // dt = 1/TICK_RATE, so inputs must be emitted at exactly that cadence
    // or the client will over-predict.
    if (this.matchPhase === MatchPhase.ACTIVE) {
      this.inputAccumulatorMs += delta;
      // Cap the accumulator before draining. After a tab-hide / freeze the
      // first frame's delta can be seconds long; without a cap we'd run
      // dozens of ticks synchronously, fast-forwarding prediction and
      // spamming the server with stale inputs.
      const maxAccumulator = SERVER.TICK_INTERVAL * MAX_CATCHUP_TICKS;
      if (this.inputAccumulatorMs > maxAccumulator) {
        this.inputAccumulatorMs = maxAccumulator;
      }
    } else {
      this.inputAccumulatorMs = 0;
    }
    while (
      this.inputAccumulatorMs >= SERVER.TICK_INTERVAL &&
      localState &&
      this.matchPhase === MatchPhase.ACTIVE
    ) {
      this.inputAccumulatorMs -= SERVER.TICK_INTERVAL;
      this.currentTick++;

      localState = networkManager.getLocalPlayerState();
      if (!localState) break;

      // Capture the position as it was going into this tick for render
      // interpolation. The most recent predicted position after sendInput
      // becomes the new "current" target.
      this.prevLocalPos = this.currLocalPos ?? { x: localState.position.x, y: localState.position.y };

      const playerId = networkManager.getPlayerId();
      const hasActiveGrenade = playerId
        ? networkManager.hasActiveGrenadeFor(playerId)
        : false;
      const input = this.inputManager.update(
        localState.position,
        this.currentTick,
        hasActiveGrenade,
      );
      this.gameService.sendInput(input);

      // Dry-fire feedback: a small camera shake + click when the player
      // releases the fire/throw button while their corresponding ammo pool
      // is empty. throwPressed is already gated to the throw-aim phase (not
      // detonate), so this only fires when the player intended to throw.
      if (
        (input.firePressed && localState.ammo === 0) ||
        (input.throwPressed && localState.grenades === 0)
      ) {
        this.cameras.main.shake(120, 0.004);
        AudioManager.getInstance()?.play('outOfAmmo');
      }

      const updatedState = networkManager.getLocalPlayerState();
      if (updatedState) {
        this.currLocalPos = { x: updatedState.position.x, y: updatedState.position.y };
      }
    }

    // Re-read latest local state after any input ticks that ran this frame.
    const currentLocalState = networkManager.getLocalPlayerState();
    this.decayLocalCorrectionOffset(delta);

    // Update local player rendering
    if (currentLocalState && this.playerManager) {
      const playerId = networkManager.getPlayerId();
      if (playerId) {
        // Interpolate local player position between the previous and
        // current predicted positions. Alpha = fraction of the way through
        // the current tick window, so rendering runs at 60fps even though
        // prediction ticks at 20Hz.
        let renderPos = currentLocalState.position;
        if (this.prevLocalPos && this.currLocalPos) {
          const alpha = Math.min(1, this.inputAccumulatorMs / SERVER.TICK_INTERVAL);
          renderPos = {
            x: this.prevLocalPos.x + (this.currLocalPos.x - this.prevLocalPos.x) * alpha,
            y: this.prevLocalPos.y + (this.currLocalPos.y - this.prevLocalPos.y) * alpha,
          };
        }
        renderPos = {
          x: renderPos.x + this.localCorrectionOffset.x,
          y: renderPos.y + this.localCorrectionOffset.y,
        };
        this.lastRenderedLocalPos = { x: renderPos.x, y: renderPos.y };

        // Build serialized state array for the player manager.
        // Inside an active match the local state always has a non-null
        // characterId (server selects/auto-locks before COUNTDOWN), but
        // PlayerState models it as nullable. Fall back to 'mighty_man'
        // for the rare frame the renderer might briefly construct on a
        // stale snapshot — this only matters for the very first render
        // before reconciliation, where the visible difference is one
        // tick of a placeholder sprite.
        const localCharacterId = currentLocalState.characterId ?? 'mighty_man';
        const allPlayers: SerializedPlayerState[] = [{
          id: currentLocalState.id,
          characterId: localCharacterId,
          position: renderPos,
          velocity: currentLocalState.velocity,
          aimAngle: currentLocalState.aimAngle,
          health: currentLocalState.health,
          maxHealth: currentLocalState.maxHealth,
          ammo: currentLocalState.ammo,
          grenades: currentLocalState.grenades,
          isReloading: currentLocalState.isReloading,
          isSprinting: currentLocalState.isSprinting,
          stamina: currentLocalState.stamina,
          isDead: currentLocalState.isDead,
          respawnTimer: currentLocalState.respawnTimer,
          invulnerableTimer: currentLocalState.invulnerableTimer,
          lastProcessedInput: currentLocalState.lastProcessedInput,
          score: currentLocalState.score,
          deaths: currentLocalState.deaths,
          nickname: currentLocalState.nickname,
          abilityActiveSeconds: currentLocalState.abilityActiveSeconds,
          abilityCooldownSeconds: currentLocalState.abilityCooldownSeconds,
        }];

        // Add interpolated remote players
        const interpolatedPlayers = networkManager.getInterpolatedPlayers();
        for (const [remoteId, interpState] of interpolatedPlayers) {
          allPlayers.push({
            id: remoteId,
            characterId: interpState.characterId,
            position: interpState.position,
            velocity: interpState.velocity,
            aimAngle: interpState.aimAngle,
            health: interpState.health,
            maxHealth: interpState.maxHealth,
            ammo: interpState.ammo,
            grenades: interpState.grenades,
            isReloading: interpState.isReloading,
            isSprinting: interpState.isSprinting,
            stamina: interpState.stamina,
            isDead: interpState.isDead,
            respawnTimer: interpState.respawnTimer,
            invulnerableTimer: interpState.invulnerableTimer,
            lastProcessedInput: 0,
            score: interpState.score,
            deaths: interpState.deaths,
            nickname: interpState.nickname,
            abilityActiveSeconds: interpState.abilityActiveSeconds,
            abilityCooldownSeconds: interpState.abilityCooldownSeconds,
          });
        }

        // Detect local-player damage (health decreased since last frame)
        // and kick chromatic aberration to peak. Respawns (0 → MAX) are
        // increases so they don't trigger here. Heavy hits also roll the
        // camera; chip damage skips the roll and gets only the aberration.
        if (
          this.prevLocalHealth !== null &&
          currentLocalState.health < this.prevLocalHealth
        ) {
          this.aberrationPixels = CHROMATIC_INITIAL_PIXELS;
          const damage = this.prevLocalHealth - currentLocalState.health;
          if (damage >= ROLL_DAMAGE_THRESHOLD) {
            this.cameraRoll?.trigger();
          }
        }
        this.prevLocalHealth = currentLocalState.health;

        // Detect any player flipping false→true on isDead and fire kill
        // juice. Update tracker and prune disconnected players.
        const seenIds = new Set<string>();
        for (const p of allPlayers) {
          seenIds.add(p.id);
          const prev = this.prevDeadStates.get(p.id);
          if (prev === false && p.isDead) {
            this.killJuice?.trigger();
          }
          this.prevDeadStates.set(p.id, p.isDead);
        }
        for (const id of this.prevDeadStates.keys()) {
          if (!seenIds.has(id)) this.prevDeadStates.delete(id);
        }

        this.playerManager.updatePlayers(allPlayers, playerId);

        // Ability VFX. Fire cone for any active Bruce; screen-edge border +
        // tint for the local player while their ability is active; x-ray
        // silhouettes only for the local Mighty Man; floor aura for any
        // active player so opponents also visibly telegraph their cast.
        const localSerialized =
          allPlayers.find((p) => p.id === playerId) ?? null;
        const collisionGrid = this.mapRenderer?.getCollisionGrid() ?? null;
        this.abilityAura?.update(allPlayers, delta);
        this.fireBreathFx?.update(allPlayers, delta);
        this.xrayFx?.update(localSerialized, allPlayers, collisionGrid, delta);

        // Detect the local-player ability activation edge (false→true) and
        // flash a centered banner. Single-shot per cast — only fires the
        // first frame abilityActiveSeconds crosses 0.
        const localAbilityActive = currentLocalState.abilityActiveSeconds > 0;
        if (localAbilityActive && !this.prevAbilityActive) {
          if (currentLocalState.characterId === 'bruce') {
            this.hud.showAbilityActivation('FIRE BREATH!', 0xff7b2a);
          } else if (currentLocalState.characterId === 'mighty_man') {
            this.hud.showAbilityActivation('X-RAY VISION!', 0x4ad8e8);
          }
          this.zoomPulse?.trigger();
        }
        this.prevAbilityActive = localAbilityActive;

        // Update HUD
        this.hud.updateHealth(currentLocalState.health, PLAYER.MAX_HEALTH);
        this.hud.updateAmmo(currentLocalState.ammo, 30, currentLocalState.isReloading);
        this.hud.updateGrenadeStatus(
          networkManager.hasActiveGrenadeFor(playerId),
          currentLocalState.grenades,
        );
        this.hud.updateStamina(currentLocalState.stamina, PLAYER.SPRINT_DURATION);
        this.hud.updateDeathState(currentLocalState.isDead, currentLocalState.respawnTimer);
        this.hud.updateAbility(
          currentLocalState.characterId,
          currentLocalState.abilityActiveSeconds,
          currentLocalState.abilityCooldownSeconds,
        );

        // Update scores — use actual opponent nickname from the most
        // recent interpolated state; fall back to matchData for the
        // frame between match start and the first gameState.
        let opponentScore = 0;
        let opponentName = this.matchData?.opponents[0]?.nickname ?? 'OPPONENT';
        for (const [, interpState] of interpolatedPlayers) {
          if (interpState.score > opponentScore) opponentScore = interpState.score;
          if (interpState.nickname) opponentName = interpState.nickname;
        }
        this.hud.updateScores(
          currentLocalState.nickname || this.nickname,
          currentLocalState.score,
          opponentName,
          opponentScore,
        );

        const remainingSeconds = networkManager.getMatchTimer();
        this.hud.updateTimer(remainingSeconds);

        // Start the end-of-match fade the moment the local clock hits 0,
        // rather than waiting for server:matchEnd to round-trip back. Saves
        // ~50–150ms of "stuck on 0:00" before the screen reacts.
        if (
          this.matchPhase === MatchPhase.ACTIVE &&
          !this.endTransitionStarted &&
          remainingSeconds <= 0
        ) {
          this.beginEndTransition();
        }

        // Sync the persistent active-event label. The eventStart handler
        // also sets this, but mid-match joiners only learn the active event
        // through snapshots, so polling here covers that case too.
        const activeEvent = networkManager.getActiveEvent();
        if (activeEvent !== this.lastSyncedActiveEvent) {
          this.lastSyncedActiveEvent = activeEvent;
          this.hud.setActiveEventLabel(activeEvent ? eventDisplayName(activeEvent) : null);
        }
      }
    }

    // Render in-flight grenades from the server's authoritative list.
    if (this.grenadeRenderer) {
      this.grenadeRenderer.updateGrenades(networkManager.getActiveGrenades());
    }

    // Render pickups (active ones visible, collected ones hidden).
    const pickups = networkManager.getPickups();
    if (this.pickupRenderer) {
      this.pickupRenderer.updatePickups(pickups);
    }

    // Aim line preview (white) — re-drawn each render frame so it tracks the
    // mouse smoothly, not just on server-tick boundaries.
    this.updateAimLine(currentLocalState);

    if (this.lightingRenderer) {
      const activePickupPositions: Vec2[] = [];
      for (const p of pickups) {
        if (p.isActive) {
          activePickupPositions.push({ x: p.position.x, y: p.position.y });
        }
      }
      this.lightingRenderer.update(activePickupPositions, delta);
    }

    this.impactFx?.update(delta);
    this.explosionFx?.update(delta);
    this.smokeFx?.update(delta);

    this.crtPipeline?.setChromaticPixels(this.aberrationPixels);
    this.shockwaveController?.update(delta, this.crtPipeline);
    this.cameraKick?.update(delta, this.cameras.main);
    this.zoomPulse?.update(delta, this.cameras.main);
    this.cameraRoll?.update(delta, this.cameras.main);
    this.crosshair?.update();
  }

  private updateAimLine(localState: ReturnType<NetworkManager['getLocalPlayerState']>): void {
    if (!this.effectsRenderer || !this.inputManager || !localState || localState.isDead) {
      this.effectsRenderer?.clearAim();
      return;
    }

    const raw = this.inputManager.getLastRawInput();
    if (!raw) {
      this.effectsRenderer.clearAim();
      return;
    }

    const grid = this.mapRenderer?.getCollisionGrid();
    if (!grid) {
      this.effectsRenderer.clearAim();
      return;
    }

    const networkManager = this.gameService.getNetworkManager();

    // X-ray vision pierces walls for shots and grenades thrown right now.
    // Stickiness for already-fired projectiles is server-authoritative; we
    // only use this for live aim-line/aim-arc previews.
    const piercing =
      localState.characterId === 'mighty_man' && localState.abilityActiveSeconds > 0;

    if (raw.aimingGun) {
      // Build the players map (local + remotes) for ray hit-testing. Use
      // current/interpolated positions so the preview matches what the
      // server will see at firing time.
      const players = this.collectPlayersForAim(localState, networkManager);
      const aim = predictBulletRay(
        localState.id,
        localState.position,
        raw.aimAngle,
        players,
        grid,
        piercing,
      );
      this.effectsRenderer.showBulletAim(
        localState.position.x,
        localState.position.y,
        aim.endPos.x,
        aim.endPos.y,
        localState.ammo === 0,
      );
    } else if (raw.aimingGrenade) {
      const path = predictGrenadePath(
        localState.position,
        raw.aimAngle,
        grid,
        undefined,
        undefined,
        piercing,
      );
      this.effectsRenderer.showGrenadeAim(path, localState.grenades === 0);
    } else {
      this.effectsRenderer.clearAim();
    }
  }

  private collectPlayersForAim(
    localState: PlayerState,
    networkManager: NetworkManager,
  ): Map<string, PlayerState> {
    const players = new Map<string, PlayerState>();
    players.set(localState.id, localState);
    for (const [remoteId, interp] of networkManager.getInterpolatedPlayers()) {
      // Build a minimal PlayerState from the interpolated snapshot.
      players.set(remoteId, {
        id: remoteId,
        // characterId is unused by aim ray-casting (it only consults
        // position/hitbox), but PlayerState requires the field. The
        // interpolation buffer doesn't carry characterId — and doesn't
        // need to, since the renderer holds onto it from construction
        // time. Pass null so the type lines up; this map is consumed
        // only by predictBulletRay and never sent to a renderer.
        characterId: null,
        position: interp.position,
        velocity: interp.velocity,
        aimAngle: interp.aimAngle,
        health: interp.health,
        maxHealth: interp.maxHealth,
        ammo: interp.ammo,
        isReloading: interp.isReloading,
        reloadTimer: 0,
        grenades: interp.grenades,
        grenadeRegenSeconds: 0,
        isSprinting: interp.isSprinting,
        stamina: interp.stamina,
        isDead: interp.isDead,
        respawnTimer: interp.respawnTimer,
        invulnerableTimer: interp.invulnerableTimer,
        lastProcessedInput: 0,
        score: interp.score,
        deaths: interp.deaths,
        nickname: interp.nickname,
        abilityActiveSeconds: 0,
        abilityCooldownSeconds: 0,
        abilityLockedAim: 0,
      });
    }
    return players;
  }

  shutdown(): void {
    this.cleanup();
  }

  private installCrtPipeline(): void {
    // Phaser's PostFXPipeline subclasses can't be registered via the GameConfig
    // 'pipeline' field — its typing expects ordinary pipelines. Register here
    // (idempotent — Phaser overwrites by name) before attaching it to the
    // main camera.
    const renderer = this.game.renderer;
    if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
    renderer.pipelines.addPostPipeline('CrtPipeline', CrtPipeline);
    this.cameras.main.setPostPipeline(CrtPipeline);
    // Cache the live instance so we can push chromatic-aberration strength
    // each frame without re-resolving by class.
    const pipeline = this.cameras.main.getPostPipeline(CrtPipeline);
    this.crtPipeline = pipeline instanceof CrtPipeline ? pipeline : null;
  }

  private installBloomFX(): void {
    // Camera postFX runs before postPipeline, so bloom feeds into the CRT
    // shader: bright pixels glow first, then vignette+scanlines compose on
    // top.
    this.cameras.main.postFX.addBloom(
      BLOOM_COLOR,
      BLOOM_OFFSET_X,
      BLOOM_OFFSET_Y,
      BLOOM_BLUR_STRENGTH,
      BLOOM_STRENGTH,
      BLOOM_STEPS,
    );
  }

  private wireGameServiceEvents(): void {
    this.onMatchCountdown = (countdown: number) => {
      const value = Math.ceil(countdown);
      if (value !== this.lastCountdownValue && this.hud) {
        this.lastCountdownValue = value;
        this.hud.showCountdown(value);
      }
      this.matchPhase = MatchPhase.COUNTDOWN;
    };

    this.onMatchStart = () => {
      this.matchPhase = MatchPhase.ACTIVE;
      if (this.hud) {
        this.hud.showCountdown(0); // Shows "FIGHT!"
      }
      // Match length is tuned to this track (MATCH.TIME_LIMIT === 173s).
      // loop=false because the track ends exactly when the match ends —
      // looping would replay the intro for whatever fraction of a tick
      // the audio engine takes to honor stopMusic.
      AudioManager.getInstance()?.playMusic('music-gameplay', 0, false);
    };

    this.onMatchEnd = (result: MatchResult) => {
      this.pendingResult = result;
      this.beginEndTransition();
      this.tryStartResultsScene();
    };

    this.onOpponentDisconnected = (_playerId: PlayerId) => {
      // Show disconnect message
      const msg = this.add.text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2,
        'OPPONENT DISCONNECTED',
        {
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '24px',
          color: cssHex(Wasteland.TEXT_DISCONNECT),
          stroke: '#000000',
          strokeThickness: 4,
        },
      ).setOrigin(0.5).setScrollFactor(0).setDepth(2000);

      this.time.delayedCall(3000, () => {
        msg.destroy();
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.cleanup();
          this.scene.start('LobbyScene');
        });
      });
    };

    this.onBulletTrail = (trail: BulletTrail) => {
      this.effectsRenderer?.showBulletTrail(
        trail.startPos.x,
        trail.startPos.y,
        trail.endPos.x,
        trail.endPos.y,
      );

      const bulletAngle = Math.atan2(
        trail.endPos.y - trail.startPos.y,
        trail.endPos.x - trail.startPos.x,
      );

      // Muzzle flash + lighting flash are gun-specific visuals. Skip for
      // characters that don't render a held gun (e.g. Bruce) — fire
      // emerging from a fist would read as a bug. The bullet trail itself
      // still plays so the shot is legible.
      const shooter = this.playerManager?.getRenderer(trail.shooterId);
      if (shooter?.rendersGun() ?? true) {
        this.effectsRenderer?.showMuzzleFlash(trail.startPos.x, trail.startPos.y, bulletAngle);
        this.lightingRenderer?.addMuzzleFlash(trail.startPos.x, trail.startPos.y);
      }

      // Three trails per burst (server-authoritative, GUN.BURST_INTERVAL apart),
      // so this naturally produces three shots spaced to match the bullets.
      const audio = AudioManager.getInstance();
      if (audio) {
        const localState = this.gameService.getNetworkManager().getLocalPlayerState();
        if (localState) {
          audio.playAtPosition(
            'gunshot',
            trail.startPos.x,
            trail.startPos.y,
            localState.position.x,
            localState.position.y,
          );
        } else {
          audio.play('gunshot');
        }
      }

      // Trigger the shooter's gun shoot animation. Characters without a
      // rendered gun (CharacterDef.hasGun=false) silently no-op inside
      // playShootAnimation.
      shooter?.playShootAnimation();

      const grid = this.mapRenderer?.getCollisionGrid() ?? null;
      this.impactFx?.spawnBulletImpact(
        trail.endPos.x,
        trail.endPos.y,
        bulletAngle,
        grid,
      );
      this.decalRenderer?.addBulletHoleIfWall(
        trail.endPos.x,
        trail.endPos.y,
        bulletAngle,
        grid,
      );

      // Recoil kick — only the local player's shot moves the local camera.
      // Watching a remote player fire must not jitter your view.
      if (trail.shooterId === this.gameService.getNetworkManager().getPlayerId()) {
        this.cameraKick?.trigger(bulletAngle + Math.PI);
      }
    };

    this.onPlayerKilled = (entry: KillFeedEntry) => {
      // Killer hears the kill sound; victim hears the death sound. Suicide
      // (killer === victim, e.g. own grenade) plays only the death sound.
      const localId = this.gameService.getNetworkManager().getPlayerId();
      if (!localId) return;
      const audio = AudioManager.getInstance();
      if (!audio) return;
      if (entry.killerId === localId && entry.killerId !== entry.victimId) {
        audio.play('kill');
        this.healFlash?.trigger();
      }
      if (entry.victimId === localId) {
        audio.play('death');
      }
    };

    this.onPickupCollected = (_pickupId: string, collectorId: PlayerId) => {
      const audio = AudioManager.getInstance();
      if (!audio) return;
      const networkManager = this.gameService.getNetworkManager();
      const localId = networkManager.getPlayerId();
      const localState = networkManager.getLocalPlayerState();

      // Position the sound at the collecting player. For the local player
      // that's our predicted state; for a remote it's their interpolated
      // position. Fall back to a non-positional play if we can't resolve.
      let collectorPos: Vec2 | null = null;
      if (collectorId === localId) {
        collectorPos = localState ? localState.position : null;
      } else {
        const remote = networkManager.getInterpolatedPlayers().get(collectorId);
        collectorPos = remote ? remote.position : null;
      }

      if (collectorPos && localState) {
        audio.playAtPosition(
          'pickupCollect',
          collectorPos.x,
          collectorPos.y,
          localState.position.x,
          localState.position.y,
        );
      } else {
        audio.play('pickupCollect');
      }
    };

    this.onGrenadeThrown = (pos: Vec2) => {
      const audio = AudioManager.getInstance();
      if (!audio) return;
      const localState = this.gameService.getNetworkManager().getLocalPlayerState();
      if (localState) {
        audio.playAtPosition('grenadeThrow', pos.x, pos.y, localState.position.x, localState.position.y);
      } else {
        audio.play('grenadeThrow');
      }
    };

    this.onGrenadeExploded = (pos: Vec2) => {
      this.effectsRenderer?.showExplosion(pos.x, pos.y);
      this.lightingRenderer?.addExplosionFlash(pos.x, pos.y);
      this.explosionFx?.spawnExplosion(pos.x, pos.y);
      this.smokeFx?.spawnExplosionSmoke(pos.x, pos.y);

      const audio = AudioManager.getInstance();
      if (audio) {
        const localState = this.gameService.getNetworkManager().getLocalPlayerState();
        if (localState) {
          audio.playAtPosition('explosion', pos.x, pos.y, localState.position.x, localState.position.y);
        } else {
          audio.play('explosion');
        }
      }
      // Scorch: swap the single floor tile containing the explosion
      // midpoint to the lighter-spot frame. Pixel-art coherent, snaps
      // to the grid.
      this.mapRenderer?.scorchTileAt(pos.x, pos.y);
      this.shockwaveController?.trigger(pos.x, pos.y);
      this.zoomPulse?.trigger();
    };

    this.onLocalCorrection = (correction: LocalCorrection) => {
      this.prevLocalPos = {
        x: correction.correctedPosition.x,
        y: correction.correctedPosition.y,
      };
      this.currLocalPos = {
        x: correction.correctedPosition.x,
        y: correction.correctedPosition.y,
      };

      if (correction.shouldSnap) {
        this.localCorrectionOffset = { x: 0, y: 0 };
        this.localCorrectionOffsetStart = { x: 0, y: 0 };
        this.localCorrectionElapsedMs = 0;
        this.lastRenderedLocalPos = {
          x: correction.correctedPosition.x,
          y: correction.correctedPosition.y,
        };
        return;
      }

      const visualStart = this.lastRenderedLocalPos ?? correction.previousPosition;
      this.localCorrectionOffset = {
        x: visualStart.x - correction.correctedPosition.x,
        y: visualStart.y - correction.correctedPosition.y,
      };
      this.localCorrectionOffsetStart = { ...this.localCorrectionOffset };
      this.localCorrectionElapsedMs = 0;
    };

    // Per-event tint, kept in lock-step with EventFlash so the banner color
    // matches the screen flash. Picked for high contrast against the
    // wasteland palette.
    const EVENT_BANNER_COLORS: Record<FinalMinuteEvent, number> = {
      super_speed: 0xfff200,
      grenades_only: 0xff8a00,
      infinite_ammo: 0x39c5ff,
      low_health: 0xff2e3a,
    };

    this.onEventWarning = (payload: EventWarningPayload) => {
      const name = eventDisplayName(payload.event);
      this.hud?.showEventBanner('FINAL MINUTE INCOMING', name, EVENT_BANNER_COLORS[payload.event]);
      AudioManager.getInstance()?.play('matchStartHorn');
    };

    this.onEventStart = (payload: EventStartPayload) => {
      const name = eventDisplayName(payload.event);
      this.hud?.showEventBanner(`${name}!`, undefined, EVENT_BANNER_COLORS[payload.event]);
      this.hud?.setActiveEventLabel(name);
      this.eventFlash?.trigger(payload.event);
      AudioManager.getInstance()?.play('matchStartHorn');
    };

    this.gameService.on('matchCountdown', this.onMatchCountdown);
    this.gameService.on('matchStart', this.onMatchStart);
    this.gameService.on('matchEnd', this.onMatchEnd);
    this.gameService.on('opponentDisconnected', this.onOpponentDisconnected);
    this.gameService.on('bulletTrail', this.onBulletTrail);
    this.gameService.on('playerKilled', this.onPlayerKilled);
    this.gameService.on('pickupCollected', this.onPickupCollected);
    this.gameService.on('grenadeThrown', this.onGrenadeThrown);
    this.gameService.on('grenadeExploded', this.onGrenadeExploded);
    this.gameService.on('localCorrection', this.onLocalCorrection);
    this.gameService.on('eventWarning', this.onEventWarning);
    this.gameService.on('eventStart', this.onEventStart);
  }

  /**
   * Kick off the end-of-match fade-out (camera + music) exactly once. Called
   * by the local 0:00 detector OR by the server:matchEnd handler — whichever
   * fires first. The actual ResultsScene transition is deferred to
   * tryStartResultsScene so we don't start it before we have the result.
   */
  private beginEndTransition(): void {
    if (this.endTransitionStarted) return;
    this.endTransitionStarted = true;
    this.matchPhase = MatchPhase.ENDED;
    this.hud?.setActiveEventLabel(null);
    AudioManager.getInstance()?.stopMusic(300);
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.fadeComplete = true;
      this.tryStartResultsScene();
    });
  }

  /** Start ResultsScene once both the fade has finished and the result has arrived. */
  private tryStartResultsScene(): void {
    if (!this.fadeComplete || !this.pendingResult) return;
    const result = this.pendingResult;
    this.pendingResult = null;
    this.cleanup();
    this.scene.start('ResultsScene', {
      result,
      nickname: this.nickname,
      matchData: this.matchData,
    });
  }

  private cleanupEvents(): void {
    if (this.onMatchCountdown) {
      this.gameService.off('matchCountdown', this.onMatchCountdown);
      this.onMatchCountdown = null;
    }
    if (this.onMatchStart) {
      this.gameService.off('matchStart', this.onMatchStart);
      this.onMatchStart = null;
    }
    if (this.onMatchEnd) {
      this.gameService.off('matchEnd', this.onMatchEnd);
      this.onMatchEnd = null;
    }
    if (this.onOpponentDisconnected) {
      this.gameService.off('opponentDisconnected', this.onOpponentDisconnected);
      this.onOpponentDisconnected = null;
    }
    if (this.onBulletTrail) {
      this.gameService.off('bulletTrail', this.onBulletTrail);
      this.onBulletTrail = null;
    }
    if (this.onPlayerKilled) {
      this.gameService.off('playerKilled', this.onPlayerKilled);
      this.onPlayerKilled = null;
    }
    if (this.onPickupCollected) {
      this.gameService.off('pickupCollected', this.onPickupCollected);
      this.onPickupCollected = null;
    }
    if (this.onGrenadeThrown) {
      this.gameService.off('grenadeThrown', this.onGrenadeThrown);
      this.onGrenadeThrown = null;
    }
    if (this.onGrenadeExploded) {
      this.gameService.off('grenadeExploded', this.onGrenadeExploded);
      this.onGrenadeExploded = null;
    }
    if (this.onLocalCorrection) {
      this.gameService.off('localCorrection', this.onLocalCorrection);
      this.onLocalCorrection = null;
    }
    if (this.onEventWarning) {
      this.gameService.off('eventWarning', this.onEventWarning);
      this.onEventWarning = null;
    }
    if (this.onEventStart) {
      this.gameService.off('eventStart', this.onEventStart);
      this.onEventStart = null;
    }
  }

  private decayLocalCorrectionOffset(deltaMs: number): void {
    const distanceSq =
      this.localCorrectionOffset.x * this.localCorrectionOffset.x +
      this.localCorrectionOffset.y * this.localCorrectionOffset.y;

    if (distanceSq < LOCAL_CORRECTION_EPSILON * LOCAL_CORRECTION_EPSILON) {
      this.localCorrectionOffset = { x: 0, y: 0 };
      this.localCorrectionOffsetStart = { x: 0, y: 0 };
      this.localCorrectionElapsedMs = 0;
      return;
    }

    this.localCorrectionElapsedMs = Math.min(
      LOCAL_CORRECTION_SMOOTH_MS,
      this.localCorrectionElapsedMs + deltaMs,
    );
    const t = this.localCorrectionElapsedMs / LOCAL_CORRECTION_SMOOTH_MS;
    const keep = (1 - t) * (1 - t);
    this.localCorrectionOffset = {
      x: this.localCorrectionOffsetStart.x * keep,
      y: this.localCorrectionOffsetStart.y * keep,
    };
  }

  private cleanup(): void {
    this.cleanupEvents();

    this.cameras.main.resetPostPipeline();
    this.cameras.main.postFX.clear();
    this.crtPipeline = null;
    this.aberrationPixels = 0;
    this.prevLocalHealth = null;

    if (this.mapRenderer) {
      this.mapRenderer.destroy();
      this.mapRenderer = null;
    }
    if (this.playerManager) {
      this.playerManager.destroy();
      this.playerManager = null;
    }
    if (this.effectsRenderer) {
      this.effectsRenderer.destroy();
      this.effectsRenderer = null;
    }
    if (this.pickupRenderer) {
      this.pickupRenderer.destroy();
      this.pickupRenderer = null;
    }
    if (this.grenadeRenderer) {
      this.grenadeRenderer.destroy();
      this.grenadeRenderer = null;
    }
    if (this.lightingRenderer) {
      this.lightingRenderer.destroy();
      this.lightingRenderer = null;
    }
    if (this.killJuice) {
      this.killJuice.destroy();
      this.killJuice = null;
    }
    this.healFlash = null;
    this.eventFlash = null;
    this.lastSyncedActiveEvent = null;
    if (this.impactFx) {
      this.impactFx.destroy();
      this.impactFx = null;
    }
    if (this.explosionFx) {
      this.explosionFx.destroy();
      this.explosionFx = null;
    }
    if (this.smokeFx) {
      this.smokeFx.destroy();
      this.smokeFx = null;
    }
    if (this.fireBreathFx) {
      this.fireBreathFx.destroy();
      this.fireBreathFx = null;
    }
    if (this.xrayFx) {
      this.xrayFx.destroy();
      this.xrayFx = null;
    }
    if (this.abilityAura) {
      this.abilityAura.destroy();
      this.abilityAura = null;
    }
    this.prevAbilityActive = false;
    this.shockwaveController = null;
    if (this.cameraKick) {
      this.cameraKick.reset(this.cameras.main);
      this.cameraKick = null;
    }
    if (this.zoomPulse) {
      this.zoomPulse.reset(this.cameras.main);
      this.zoomPulse = null;
    }
    if (this.cameraRoll) {
      this.cameraRoll.reset(this.cameras.main);
      this.cameraRoll = null;
    }
    if (this.decalRenderer) {
      this.decalRenderer.destroy();
      this.decalRenderer = null;
    }
    this.prevDeadStates.clear();
    if (this.hud) {
      this.hud.destroy();
      this.hud = null;
    }
    if (this.crosshair) {
      this.crosshair.destroy();
      this.crosshair = null;
    }
    if (this.inputManager) {
      this.inputManager.destroy();
      this.inputManager = null;
    }
  }
}
