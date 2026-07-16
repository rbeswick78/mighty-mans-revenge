import Phaser from 'phaser';

import type { MapData } from '@shared/types/map.js';
import type { PlayerId, Vec2 } from '@shared/types/common.js';
import type {
  MatchResult,
  KillFeedEntry,
  KillConfirmedCollection,
  RumbleLeadState,
} from '@shared/types/game.js';
import { GameModeType, MatchPhase } from '@shared/types/game.js';
import type { BulletTrail, PunchEvent } from '@shared/types/projectile.js';
import { PickupType } from '@shared/types/pickup.js';
import { PLAYER, SERVER, WEAPONS } from '@shared/config/game.js';
import { TAUNT, TAUNT_IDS, type TauntId } from '@shared/config/game.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { predictBulletRay, predictGrenadePath } from '@shared/utils/trajectory-prediction.js';
import { gunGameRungForScore } from '@shared/utils/gun-game.js';
import { practiceGauntletStylePointsForKill } from '@shared/utils/practice-gauntlet.js';
import type { PlayerState } from '@shared/types/player.js';
import { MapRenderer } from '../rendering/map-renderer.js';
import { ClientPlayerManager } from '../rendering/player-manager.js';
import { TauntRenderer } from '../rendering/taunt-renderer.js';
import { EffectsRenderer } from '../rendering/effects-renderer.js';
import { hasConfirmedPlayerHit, isSameShotgunBlast } from '../rendering/hit-feedback.js';
import { PickupRenderer } from '../rendering/pickup-renderer.js';
import { ConfirmedTagRenderer } from '../rendering/confirmed-tag-renderer.js';
import { CoreRunRenderer } from '../rendering/core-run-renderer.js';
import { GrenadeRenderer } from '../rendering/grenade-renderer.js';
import { AxeRenderer } from '../rendering/axe-renderer.js';
import { LightingRenderer } from '../rendering/lighting-renderer.js';
import { KillJuice } from '../rendering/kill-juice.js';
import { HealFlash } from '../rendering/heal-flash.js';
import { EventFlash } from '../rendering/event-flash.js';
import { eventDisplayName, eventStartDetail } from '@shared/utils/event-modifiers.js';
import type { SerializedPlayerState } from '@shared/types/network.js';
import { MUTATORS, type MutatorId, type WeaponId } from '@shared/config/game.js';
import { weaponRouletteCallout } from '../ui/weapon-roulette.js';
import { activeMutatorLabel, didWastelandWarp } from '../ui/wasteland-warp.js';
import type {
  EventStartPayload,
  EventWarningPayload,
  WeaponIncomingPayload,
} from '../services/game-service.js';
import { ImpactFx } from '../rendering/impact-fx.js';
import { ExplosionFx } from '../rendering/explosion-fx.js';
import { SmokeFx } from '../rendering/smoke-fx.js';
import { FireBreathFx } from '../rendering/fire-breath-fx.js';
import { XrayFx } from '../rendering/xray-fx.js';
import { AbilityAura } from '../rendering/ability-aura.js';
import { touchAbilityState } from '../input/touch-action-presentation.js';
import { DecalRenderer } from '../rendering/decal-renderer.js';
import { KothHillRenderer } from '../rendering/koth-hill-renderer.js';
import { RadiationStormRenderer } from '../rendering/radiation-storm-renderer.js';
import { ScrapstormRenderer } from '../rendering/scrapstorm-renderer.js';
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
import { combatCalloutFor, withGauntletStyle } from '../ui/combat-callout.js';
import { confirmedTagCallout } from '../ui/confirmed-tag.js';
import { killFeedPresentation } from '../ui/kill-feed-presentation.js';
import { rumbleLeadCallout } from '../ui/rumble-lead.js';
import { HUD } from '../ui/hud.js';
import { InputManager } from '../input/input-manager.js';
import { MenuGamepadInput } from '../input/menu-gamepad.js';
import { isTouchDevice } from '../input/is-touch-device.js';
import { GameService, type MatchData } from '../services/game-service.js';
import { AudioManager } from '../audio/audio-manager.js';
import type { LocalCorrection, NetworkManager } from '../network/network-manager.js';
import { getMap, DEFAULT_MAP_NAME } from '@shared/maps/registry.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';
import { MatchMenu } from '../ui/match-menu.js';
import {
  currentGameplayOverlaySafeArea,
  gameplayViewportForCapabilities,
  type GameplayOverlaySafeArea,
  type GameplayViewportContract,
  useGameplayLogicalSize,
} from '../ui/gameplay-viewport.js';
import { useLegacyLogicalSize } from '../ui/reforged/responsive-menu-layout.js';

const LOCAL_CORRECTION_SMOOTH_MS = 120;
const LOCAL_CORRECTION_EPSILON = 0.01;

/**
 * How long the displayed clock must sit at 0:00 before the LOCAL
 * end-of-match fade fires. Covers the overtime race: a tied match
 * re-anchors the clock to sudden death within ~1 tick + RTT of zero, and
 * server:matchEnd (the authoritative fade trigger) also lands well inside
 * this window when the match really ended.
 */
const END_FADE_GRACE_MS = 600;

/**
 * Gap between the overtime deep-horn sting and the gameplay track's finale
 * restarting underneath it — long enough for the sting to read over
 * silence, short enough that overtime doesn't feel score-less.
 */
const OVERTIME_MUSIC_DELAY_MS = 1000;

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
  private tauntRenderer: TauntRenderer | null = null;
  private effectsRenderer: EffectsRenderer | null = null;
  private pickupRenderer: PickupRenderer | null = null;
  private confirmedTagRenderer: ConfirmedTagRenderer | null = null;
  private coreRunRenderer: CoreRunRenderer | null = null;
  private radiationStormRenderer: RadiationStormRenderer | null = null;
  private scrapstormRenderer: ScrapstormRenderer | null = null;
  private grenadeRenderer: GrenadeRenderer | null = null;
  private axeRenderer: AxeRenderer | null = null;
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
  /**
   * Last-seen `abilityCooldownSeconds > 0` for the local player. Used by
   * instant-cast abilities (Frost Wizard's Frost Lock) that have no
   * active window — abilityActiveSeconds never goes above 0, so the
   * banner-trigger edge is the cooldown rising instead.
   */
  private prevAbilityCoolingDown = false;
  private decalRenderer: DecalRenderer | null = null;
  private kothHillRenderer: KothHillRenderer | null = null;
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
  private matchMenu: MatchMenu | null = null;
  private matchMenuGamepad: MenuGamepadInput | null = null;
  private onMatchMenuEscape: (() => void) | null = null;
  private leavingMatch = false;
  /** Announce the first meaningful controller input once per round. */
  private controllerAnnounced = false;
  private nextTauntIndex = 0;
  private localTauntCooldownUntil = 0;
  private gameService!: GameService;
  private gameplayViewport: GameplayViewportContract = gameplayViewportForCapabilities(undefined);
  private gameplaySafeArea: GameplayOverlaySafeArea | null = null;
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
  private connectionLostTransitionStarted = false;
  /**
   * Local-clock timestamp when the displayed match timer first read 0:00,
   * or null while it's above zero. The local end-of-match fade only fires
   * after the clock has sat at zero for a short grace window — a tied
   * match re-anchors the clock to overtime within ~1 tick + RTT, and
   * fading out over a match that's actually entering sudden death would
   * be wrong. Real ends aren't delayed in practice: server:matchEnd
   * arrives well inside the grace window and starts the fade itself.
   */
  private zeroClockSinceMs: number | null = null;

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
  private onConnectionLost: (() => void) | null = null;
  private onPlayerLeft: ((playerId: PlayerId, nickname: string) => void) | null = null;
  private onBulletTrail: ((trail: BulletTrail) => void) | null = null;
  private onPlayerKilled: ((entry: KillFeedEntry) => void) | null = null;
  private onPickupCollected: ((pickupId: string, playerId: PlayerId) => void) | null = null;
  private onConfirmedTagCollected: ((event: KillConfirmedCollection) => void) | null = null;
  private onRumbleLeadChanged:
    | ((state: RumbleLeadState, players: SerializedPlayerState[]) => void)
    | null = null;
  private onGrenadeThrown: ((pos: Vec2) => void) | null = null;
  private onGrenadeExploded: ((pos: Vec2) => void) | null = null;
  private onAxeThrown: ((pos: Vec2) => void) | null = null;
  private onAxeResolved: ((payload: { position: Vec2; angle: number }) => void) | null = null;
  private onPunchSwung: ((punch: PunchEvent) => void) | null = null;
  private onLocalCorrection: ((correction: LocalCorrection) => void) | null = null;
  private onEventWarning: ((payload: EventWarningPayload) => void) | null = null;
  private onEventStart: ((payload: EventStartPayload) => void) | null = null;
  private onWeaponIncoming: ((payload: WeaponIncomingPayload) => void) | null = null;
  private onTilesDestroyed: ((tiles: Array<{ col: number; row: number }>) => void) | null = null;
  private onOvertimeStart: (() => void) | null = null;
  private onTaunt: ((playerId: PlayerId, tauntId: TauntId) => void) | null = null;
  private modeBriefingShown = false;
  /**
   * Timestamp of the most recent shotgun blast per shooter. A blast
   * broadcasts one BulletTrail per pellet in the same tick; muzzle flash,
   * boom SFX, shoot anim, and camera kick should fire once per blast, not
   * once per pellet.
   */
  private lastShotgunBlastAt: Map<PlayerId, number> = new Map();
  /** First confirmed pellet owns the local hit tick for each shotgun blast. */
  private lastShotgunConfirmedHitAt: Map<PlayerId, number> = new Map();
  /** Cached so we can detect changes (incl. mid-match-join) and resync the label. */
  /** Joined display names of the synced active mutators, or null when none. */
  private lastSyncedMutatorLabel: string | null = null;
  /** Last authoritative local weapon seen while Weapon Roulette is active. */
  private lastRouletteWeapon: WeaponId | null = null;
  /** Ignore the pre-activation weapon if eventStart beats its first snapshot. */
  private awaitingRouletteOpeningWeapon = false;
  /** Undefined before the first Core Run snapshot; null means loose. */
  private lastCoreCarrierId: PlayerId | null | undefined = undefined;
  private lastBountyTargetId: PlayerId | null | undefined = undefined;
  /** Undefined before the first warp snapshot; later edges trigger feedback. */
  private lastWastelandWarpSequence: number | undefined = undefined;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameSceneData): void {
    this.nickname = data.nickname ?? 'Unknown';
    this.matchData = data.matchData ?? null;
    this.endTransitionStarted = false;
    this.fadeComplete = false;
    this.pendingResult = null;
    this.connectionLostTransitionStarted = false;
    this.leavingMatch = false;
    this.modeBriefingShown = false;
    this.prevAbilityActive = false;
    this.prevAbilityCoolingDown = false;
    this.lastCoreCarrierId = undefined;
    this.lastBountyTargetId = undefined;
    this.lastWastelandWarpSequence = undefined;
    this.controllerAnnounced = false;
    this.nextTauntIndex = 0;
    this.localTauntCooldownUntil = 0;
    this.gameplayViewport = gameplayViewportForCapabilities(undefined);
    this.gameplaySafeArea = null;
  }

  create(): void {
    this.gameService = GameService.getInstance();
    this.gameplayViewport = useGameplayLogicalSize(
      this.scale,
      this.gameService.getServerCapabilities(),
    );
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutGameplayViewport, this);
    this.layoutGameplayViewport();
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.installCrtPipeline();
    this.installBloomFX();

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
    this.gameService
      .getNetworkManager()
      .setAbilitiesEnabled(this.matchData?.gameMode !== GameModeType.ONE_IN_THE_CHAMBER);
    if (grid) {
      this.gameService.getNetworkManager().setCollisionGrid(grid);
    }

    // Decal RT must be created right after the map and before any player
    // containers — display-list insertion order is what stacks decals
    // above tiles and below players. See `DecalRenderer` class doc. The
    // grid is also used to bake a wall mask so decals are clipped to
    // wall pixels (no spillage onto floor at tile edges).
    this.decalRenderer = new DecalRenderer(this, grid);
    // KOTH hill zone overlay: same insertion-order contract — above tiles
    // and decals, below the player containers created later. Draws
    // nothing until snapshots carry hill state (i.e. in DM matches it
    // stays empty for free).
    this.kothHillRenderer = new KothHillRenderer(this);
    // Scorch is now a hard tile-frame swap on the map sprites themselves
    // (see MapRenderer.scorchArea), so no separate RT renderer here. The
    // ScorchRenderer module file is still in the repo for easy revert if
    // the hard-swap look turns out wrong.

    // Create subsystems
    this.playerManager = new ClientPlayerManager(this);
    this.tauntRenderer = new TauntRenderer(this);
    this.effectsRenderer = new EffectsRenderer(this);
    this.pickupRenderer = new PickupRenderer(this);
    this.confirmedTagRenderer = new ConfirmedTagRenderer(this);
    this.coreRunRenderer = new CoreRunRenderer(this);
    this.radiationStormRenderer = new RadiationStormRenderer(this);
    this.scrapstormRenderer = new ScrapstormRenderer(this);
    this.grenadeRenderer = new GrenadeRenderer(this);
    this.axeRenderer = new AxeRenderer(this);
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
    this.inputManager = new InputManager(
      this,
      this.matchData?.gameMode === GameModeType.ONE_IN_THE_CHAMBER,
    );
    this.matchMenuGamepad = new MenuGamepadInput();
    this.matchMenu = new MatchMenu(
      this,
      {
        matchKind: this.matchData?.matchKind,
        practiceKind: this.matchData?.practiceKind,
      },
      () => this.leaveCurrentMatch(),
      (open) => {
        this.inputManager?.setGameplayEnabled(!open && this.matchPhase === MatchPhase.ACTIVE);
      },
    );
    this.matchMenu.setAvailable(false);
    this.onMatchMenuEscape = () => {
      if (this.leavingMatch || this.endTransitionStarted) return;
      if (this.matchMenu?.isOpen()) this.matchMenu.back();
      else this.matchMenu?.show();
    };
    this.input.keyboard?.on('keydown-ESC', this.onMatchMenuEscape);

    // Wire up network events
    this.wireGameServiceEvents();
  }

  update(_time: number, delta: number): void {
    if (!this.inputManager || !this.hud) return;
    this.updateMatchMenuInput();

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
      this.prevLocalPos = this.currLocalPos ?? {
        x: localState.position.x,
        y: localState.position.y,
      };

      const playerId = networkManager.getPlayerId();
      const hasActiveGrenade = playerId ? networkManager.hasActiveGrenadeFor(playerId) : false;
      const input = this.inputManager.update(
        localState.position,
        this.currentTick,
        hasActiveGrenade,
        localState.frozenTimer > 0 || !!this.matchMenu?.isOpen(),
        this.matchData?.gameMode === GameModeType.ONE_IN_THE_CHAMBER,
      );
      this.gameService.sendInput(input);

      // Taunts ride a separate reliable message so they never pollute
      // movement prediction or authoritative combat inputs.
      if (
        this.inputManager.consumeTauntPressed() &&
        !localState.isDead &&
        this.time.now >= this.localTauntCooldownUntil
      ) {
        const tauntId = TAUNT_IDS[this.nextTauntIndex % TAUNT_IDS.length];
        this.nextTauntIndex++;
        this.localTauntCooldownUntil = this.time.now + TAUNT.COOLDOWN_SECONDS * 1000;
        this.gameService.sendTaunt(tauntId);
      }

      // Dry-fire feedback: a small camera shake + click when the player
      // releases the fire/throw button while their corresponding ammo pool
      // is empty. throwPressed is already gated to the throw-aim phase (not
      // detonate), so this only fires when the player intended to throw.
      // Fists are exempt — a punch has no ammo pool, so no mag count may
      // produce a false out-of-ammo click. The beep tracks the HELD
      // weapon's pool (same rule as the aim-line empty-mag tint):
      // shotgun/pistol/bat fire from specialAmmo, not the rifle magazine.
      const heldMagEmpty =
        localState.weaponId === 'punch'
          ? false
          : localState.weaponId === 'shotgun' ||
              localState.weaponId === 'pistol' ||
              localState.weaponId === 'bat'
            ? localState.specialAmmo === 0
            : localState.ammo === 0;
      if (input.firePressed && !heldMagEmpty) {
        this.inputManager.rumble(0.14, 45);
      }
      if (input.detonatePressed || (input.throwPressed && localState.grenades > 0)) {
        this.inputManager.rumble(0.28, 80);
      }
      if (
        input.abilityPressed &&
        localState.abilityActiveSeconds <= 0 &&
        localState.abilityCooldownSeconds <= 0
      ) {
        this.inputManager.rumble(0.2, 65);
      }
      if (
        (input.firePressed && heldMagEmpty) ||
        (input.throwPressed && localState.grenades === 0)
      ) {
        this.cameras.main.shake(120, 0.004);
        AudioManager.getInstance()?.play('outOfAmmo');
      }

      const updatedState = networkManager.getLocalPlayerState();
      if (updatedState) {
        if (
          input.abilityPressed &&
          localState.characterId === 'rook' &&
          localState.abilityCooldownSeconds <= 0 &&
          updatedState.abilityCooldownSeconds > 0
        ) {
          this.effectsRenderer?.showDash(localState.position, updatedState.position);
        }
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
        // characterId (server selects/auto-locks before COUNTDOWN, and
        // NetworkManager resets localPlayerState on every matchFound so
        // it is re-seeded from the new match's first snapshot), but
        // PlayerState models it as nullable. The 'mighty_man' fallback
        // only satisfies the type system: if it ever rendered, the
        // ClientPlayerManager rebuilds the renderer the moment the real
        // characterId disagrees, so a placeholder can't stick.
        const localCharacterId = currentLocalState.characterId ?? 'mighty_man';
        const allPlayers: SerializedPlayerState[] = [
          {
            id: currentLocalState.id,
            characterId: localCharacterId,
            position: renderPos,
            velocity: currentLocalState.velocity,
            aimAngle: currentLocalState.aimAngle,
            health: currentLocalState.health,
            maxHealth: currentLocalState.maxHealth,
            armor: currentLocalState.armor,
            ammo: currentLocalState.ammo,
            weaponId: currentLocalState.weaponId,
            specialAmmo: currentLocalState.specialAmmo,
            specialReserve: currentLocalState.specialReserve,
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
            frozenTimer: currentLocalState.frozenTimer,
            secondWindTimer: currentLocalState.secondWindTimer,
          },
        ];

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
            armor: interpState.armor,
            ammo: interpState.ammo,
            weaponId: interpState.weaponId,
            specialAmmo: interpState.specialAmmo,
            specialReserve: interpState.specialReserve,
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
            frozenTimer: interpState.frozenTimer,
            secondWindTimer: interpState.secondWindTimer,
          });
        }

        // Detect local-player damage (health decreased since last frame)
        // and kick chromatic aberration to peak. Respawns (0 → MAX) are
        // increases so they don't trigger here. Heavy hits also roll the
        // camera; chip damage skips the roll and gets only the aberration.
        if (this.prevLocalHealth !== null && currentLocalState.health < this.prevLocalHealth) {
          this.aberrationPixels = CHROMATIC_INITIAL_PIXELS;
          const damage = this.prevLocalHealth - currentLocalState.health;
          this.inputManager?.rumble(
            Math.min(1, 0.25 + damage / currentLocalState.maxHealth),
            damage >= ROLL_DAMAGE_THRESHOLD ? 130 : 75,
          );
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

        // big_heads: scale every player sprite up while active (visual
        // only — the matching hitbox scale lives in server validation and
        // the aim-line preview).
        this.playerManager.setBigHeads(networkManager.getActiveMutators().includes('big_heads'));
        const bountyHuntState = networkManager.getBountyHuntState();
        const localTeam = this.matchData?.playerTeams?.[playerId];
        const teammateIds = new Set(
          Object.entries(this.matchData?.playerTeams ?? {})
            .filter(([candidateId, teamId]) => candidateId !== playerId && teamId === localTeam)
            .map(([candidateId]) => candidateId),
        );
        this.playerManager.updatePlayers(
          allPlayers,
          playerId,
          bountyHuntState?.targetId ?? null,
          this.matchData?.rumbleCrown
            ? {
                id: this.matchData.rumbleCrown.holderId,
                wins: this.matchData.rumbleCrown.wins,
              }
            : null,
          teammateIds,
        );
        this.tauntRenderer?.update(this.playerManager, delta);

        // Ability VFX. Fire cone for any active Bruce; screen-edge border +
        // tint for the local player while their ability is active; x-ray
        // silhouettes only for the local Mighty Man; floor aura for any
        // active player so opponents also visibly telegraph their cast.
        const localSerialized = allPlayers.find((p) => p.id === playerId) ?? null;
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
          } else if (currentLocalState.characterId === 'bubba') {
            this.hud.showAbilityActivation('IRON HIDE!', 0xb8c4d0);
          }
          this.zoomPulse?.trigger();
        }
        this.prevAbilityActive = localAbilityActive;

        // Frost Lock and Axe Throw have no active window, so the
        // active-edge above never fires for them. Detect the cooldown's
        // leading edge instead — the server only flips cooldownSeconds
        // from 0 upward on a successful cast, so this is a clean
        // activation signal.
        const localCoolingDown = currentLocalState.abilityCooldownSeconds > 0;
        if (localCoolingDown && !this.prevAbilityCoolingDown) {
          if (currentLocalState.characterId === 'frost_wizard') {
            this.hud.showAbilityActivation('FROST LOCK!', 0xaaddff);
            this.zoomPulse?.trigger();
          } else if (currentLocalState.characterId === 'jack') {
            this.hud.showAbilityActivation('AXE THROW!', 0xffb347);
            this.zoomPulse?.trigger();
          } else if (currentLocalState.characterId === 'rook') {
            this.hud.showAbilityActivation('BREACH DASH!', 0x70e6ff);
            this.zoomPulse?.trigger();
          }
        }
        this.prevAbilityCoolingDown = localCoolingDown;

        // Update HUD — per-character HP pool, not the baseline constant.
        this.hud.updateHealth(
          currentLocalState.health,
          currentLocalState.maxHealth,
          currentLocalState.armor,
        );
        // Gun Game ladder line: derived purely from the local score via the
        // shared rung helper (no extra wire state). Null outside Gun Game
        // hides the line and lifts the grenade-rung ammo suppression. Runs
        // before the ammo rows so visibility rules sync within the frame.
        this.hud.updateGunGame(
          this.matchData?.gameMode === GameModeType.GUN_GAME
            ? gunGameRungForScore(currentLocalState.score)
            : null,
        );
        const isLastStand = this.matchData?.gameMode === GameModeType.LAST_STAND;
        this.hud.updateLastStand(isLastStand);
        this.hud.updateKillConfirmed(this.matchData?.gameMode === GameModeType.KILL_CONFIRMED);
        this.hud.updateOneInTheChamber(
          this.matchData?.gameMode === GameModeType.ONE_IN_THE_CHAMBER,
          currentLocalState.weaponId,
          currentLocalState.specialAmmo,
          currentLocalState.isDead,
          this.matchPhase === MatchPhase.ACTIVE,
        );
        this.hud.updateCoreRun(networkManager.getCoreRunState(), playerId);
        const bountyTarget = bountyHuntState?.targetId
          ? allPlayers.find((player) => player.id === bountyHuntState.targetId)
          : null;
        this.hud.updateBountyHunt(bountyHuntState, playerId, bountyTarget?.nickname ?? null);
        if (
          bountyHuntState &&
          bountyHuntState.targetId !== null &&
          bountyHuntState.targetId !== this.lastBountyTargetId
        ) {
          if (bountyHuntState.targetId === playerId) {
            this.hud.showCombatCallout('YOU ARE THE BOUNTY', 'FIGHT BACK · KILLS ×2', 0xffd166);
            AudioManager.getInstance()?.play('menuSelect', { rate: 0.68 });
          } else {
            this.hud.showCombatCallout(
              'NEW BOUNTY',
              `HUNT ${(bountyTarget?.nickname ?? 'THE MARK').toUpperCase()} · WORTH 3`,
              0xffd166,
            );
            AudioManager.getInstance()?.play('menuSelect', { rate: 1.12 });
          }
          this.zoomPulse?.trigger();
        }
        this.lastBountyTargetId = bountyHuntState?.targetId;
        this.hud.updateAmmo(
          currentLocalState.ammo,
          WEAPONS.rifle.magazineSize,
          currentLocalState.isReloading,
        );
        this.hud.updateSpecialWeapon(
          currentLocalState.weaponId,
          currentLocalState.specialAmmo,
          currentLocalState.specialReserve,
        );
        this.hud.updateGrenadeStatus(
          networkManager.hasActiveGrenadeFor(playerId),
          currentLocalState.grenades,
        );
        this.hud.updateStamina(currentLocalState.stamina, PLAYER.SPRINT_DURATION);
        this.hud.updateDeathState(
          currentLocalState.isDead,
          currentLocalState.respawnTimer,
          isLastStand && currentLocalState.score <= 0,
        );
        this.hud.updateAbility(
          currentLocalState.characterId,
          currentLocalState.abilityActiveSeconds,
          currentLocalState.abilityCooldownSeconds,
        );
        this.inputManager?.setAbilityButtonState(
          touchAbilityState(
            currentLocalState.abilityActiveSeconds,
            currentLocalState.abilityCooldownSeconds,
          ),
        );

        if (localTeam && this.matchData?.playerTeams) {
          const teamScores = new Map<string, number>();
          for (const fighter of allPlayers) {
            const teamId = this.matchData.playerTeams[fighter.id];
            if (teamId) teamScores.set(teamId, (teamScores.get(teamId) ?? 0) + fighter.score);
          }
          const rivalTeam = Object.values(this.matchData.playerTeams).find(
            (teamId) => teamId !== localTeam,
          );
          this.hud.updateScores([
            { name: 'YOUR CREW', score: teamScores.get(localTeam) ?? 0 },
            { name: 'RIVALS', score: rivalTeam ? (teamScores.get(rivalTeam) ?? 0) : 0 },
          ]);
        } else {
          // Local fighter first, then every live rival. HUD compacts at 3+
          // entrants so a four-player Rumble remains readable.
          this.hud.updateScores([
            {
              name: 'YOU',
              score: currentLocalState.score,
            },
            ...[...interpolatedPlayers.values()].map((state) => ({
              name: state.nickname || 'OPPONENT',
              score: state.score,
            })),
          ]);
        }
        this.hud.updateContract(networkManager.getContractState(), playerId);

        const remainingSeconds = networkManager.getMatchTimer();
        this.hud.updateTimer(remainingSeconds);

        // KOTH capture bar + sudden-death clock styling, both driven from
        // the latest snapshot (null hill state hides the bar — DM matches
        // and overtime).
        this.hud.updateKothState(networkManager.getKothState(), playerId);
        this.hud.setOvertime(networkManager.isOvertime());

        // Start the end-of-match fade from the local clock reaching 0:00 —
        // but only after it has SAT at zero for a grace window. A tied
        // match doesn't end at 0:00: the server re-anchors the clock to
        // sudden-death overtime within ~1 tick + RTT, which cancels this
        // trigger. Real ends fade via server:matchEnd (arrives well inside
        // the window), so the grace costs nothing when a winner exists.
        if (
          this.matchPhase === MatchPhase.ACTIVE &&
          !this.endTransitionStarted &&
          remainingSeconds <= 0
        ) {
          const now = this.time.now;
          if (this.zeroClockSinceMs === null) {
            this.zeroClockSinceMs = now;
          } else if (now - this.zeroClockSinceMs >= END_FADE_GRACE_MS) {
            this.beginEndTransition();
          }
        } else {
          this.zeroClockSinceMs = null;
        }

        // Sync the persistent active-mutator label. The eventStart handler
        // also sets this, but mid-match joiners only learn active mutators
        // through snapshots, so polling here covers that case too. With
        // two mutators stacked (mid-match + final-minute) the label joins
        // both names.
        const activeMutators = networkManager.getActiveMutators();
        const warpState = networkManager.getWastelandWarpState();
        const mutatorLabel = activeMutatorLabel(
          activeMutators,
          warpState,
          networkManager.getRadiationStormState(),
          networkManager.getScrapstormState(),
        );
        if (mutatorLabel !== this.lastSyncedMutatorLabel) {
          this.lastSyncedMutatorLabel = mutatorLabel;
          this.hud.setActiveEventLabel(mutatorLabel);
        }

        if (warpState) {
          if (didWastelandWarp(this.lastWastelandWarpSequence, warpState)) {
            this.hud.showEventBanner('POSITIONS WARPED!', 'REASSESS THE FIGHT', 0xb56cff);
            this.eventFlash?.trigger('wasteland_warp');
            this.zoomPulse?.trigger();
            AudioManager.getInstance()?.play('menuSelect', { rate: 0.55 });
          }
          this.lastWastelandWarpSequence = warpState.sequence;
        } else {
          this.lastWastelandWarpSequence = undefined;
        }

        const rouletteActive = activeMutators.includes('weapon_roulette');
        if (rouletteActive && this.awaitingRouletteOpeningWeapon) {
          if (currentLocalState.weaponId === MUTATORS.WEAPON_ROULETTE_ORDER[0]) {
            this.lastRouletteWeapon = currentLocalState.weaponId;
            this.awaitingRouletteOpeningWeapon = false;
          }
        } else {
          const rouletteCallout = weaponRouletteCallout(
            this.lastRouletteWeapon,
            currentLocalState.weaponId,
            rouletteActive,
          );
          if (rouletteCallout) {
            this.hud.showEventBanner(rouletteCallout, 'WEAPON ROULETTE', 0x5ce1e6);
            AudioManager.getInstance()?.play('pickupCollect', { rate: 1.25 });
            this.zoomPulse?.trigger();
          }
          this.lastRouletteWeapon = rouletteActive ? currentLocalState.weaponId : null;
        }
        if (!rouletteActive) {
          this.lastRouletteWeapon = null;
          this.awaitingRouletteOpeningWeapon = false;
        }
      }
    }

    // Render in-flight grenades from the server's authoritative list.
    if (this.grenadeRenderer) {
      this.grenadeRenderer.updateGrenades(networkManager.getActiveGrenades());
    }

    // Render Jack's thrown axes — same authoritative-list mirror.
    if (this.axeRenderer) {
      this.axeRenderer.updateAxes(networkManager.getActiveAxes());
    }

    // KOTH hill zone overlay (draws nothing when the snapshot carries no
    // hill state). Runs outside the local-player block so the hill stays
    // visible while dead/respawning.
    this.kothHillRenderer?.update(
      networkManager.getKothState(),
      networkManager.getPlayerId(),
      this.time.now,
    );

    // Render pickups (active ones visible, collected ones hidden).
    const pickups = networkManager.getPickups();
    if (this.pickupRenderer) {
      this.pickupRenderer.updatePickups(pickups);
    }
    this.confirmedTagRenderer?.update(
      networkManager.getConfirmedTags(),
      networkManager.getPlayerId(),
    );
    this.radiationStormRenderer?.update(
      networkManager.getRadiationStormState(),
      networkManager.getLocalPlayerState()?.position ?? null,
      this.time.now,
    );
    this.scrapstormRenderer?.update(
      networkManager.getScrapstormState(),
      networkManager.getPlayerId(),
      this.time.now,
    );
    const coreRunState = networkManager.getCoreRunState();
    this.coreRunRenderer?.update(coreRunState, networkManager.getPlayerId());
    if (coreRunState) {
      const carrierId = coreRunState.carrierId;
      if (this.lastCoreCarrierId !== undefined && carrierId !== this.lastCoreCarrierId) {
        if (carrierId === networkManager.getPlayerId()) {
          this.hud?.showCombatCallout('CORE SECURED', 'KEEP MOVING', 0x7dffb2);
          AudioManager.getInstance()?.play('pickupCollect', { rate: 1.2 });
        } else if (carrierId !== null) {
          this.hud?.showCombatCallout('CORE STOLEN', 'HUNT THE CARRIER', 0xff6b5c);
          AudioManager.getInstance()?.play('menuSelect', { rate: 0.75 });
        } else if (this.lastCoreCarrierId !== null) {
          this.hud?.showCombatCallout('CORE DROPPED', 'CLAIM IT', 0xffc857);
        }
      }
      this.lastCoreCarrierId = carrierId;
    } else {
      this.lastCoreCarrierId = undefined;
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
      if (coreRunState) {
        activePickupPositions.push({ ...coreRunState.position });
      }
      const bountyTargetId = networkManager.getBountyHuntState()?.targetId ?? null;
      if (bountyTargetId !== null) {
        const bountyPosition =
          bountyTargetId === networkManager.getPlayerId()
            ? currentLocalState?.position
            : networkManager.getInterpolatedPlayers().get(bountyTargetId)?.position;
        if (bountyPosition) activePickupPositions.push({ ...bountyPosition });
      }
      for (const grenade of networkManager.getActiveGrenades()) {
        if (grenade.isDeathBomb) activePickupPositions.push({ ...grenade.position });
      }
      const blackoutActive = networkManager.getActiveMutators().includes('blackout');
      const localLightPosition =
        !currentLocalState || currentLocalState.isDead
          ? null
          : (this.lastRenderedLocalPos ?? currentLocalState.position);
      this.lightingRenderer.update(
        activePickupPositions,
        delta,
        localLightPosition,
        blackoutActive,
      );
    }

    this.impactFx?.update(delta);
    this.explosionFx?.update(delta);
    this.smokeFx?.update(delta);

    this.crtPipeline?.setChromaticPixels(this.aberrationPixels);
    this.shockwaveController?.update(delta, this.crtPipeline);
    this.cameraKick?.update(delta, this.cameras.main);
    this.zoomPulse?.update(delta, this.cameras.main);
    this.cameraRoll?.update(delta, this.cameras.main);
    const controllerActive = this.inputManager.getActiveMode() === 'gamepad';
    if (controllerActive && !this.controllerAnnounced) {
      this.controllerAnnounced = true;
      this.hud.showEventBanner(
        'TWIN-STICK ONLINE',
        'HOLD RT TO AIM  •  RELEASE TO FIRE  •  LT GRENADE  •  RB POWER',
        0x5ce1e6,
      );
    }
    this.crosshair?.update(!controllerActive);
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
    const piercing = localState.characterId === 'mighty_man' && localState.abilityActiveSeconds > 0;

    // Melee draws no aim line — a short "ray" would read as a broken gun
    // preview, and the arc is validated server-side anyway. The
    // pistol falls through to the normal ray (predictBulletRay reads
    // WEAPONS[weaponId] for its range).
    if (raw.aimingGun && 'maxRange' in WEAPONS[localState.weaponId]) {
      this.effectsRenderer.clearAim();
      return;
    }

    if (raw.aimingGun) {
      // Build the players map (local + remotes) for ray hit-testing. Use
      // current/interpolated positions so the preview matches what the
      // server will see at firing time.
      const players = this.collectPlayersForAim(localState, networkManager);
      // Mirror the server's big_heads hit-validation scale so the preview
      // marks hits the server will actually count.
      const hitboxScale = networkManager.getActiveMutators().includes('big_heads')
        ? MUTATORS.BIG_HEADS_HITBOX_SCALE
        : 1;
      const aim = predictBulletRay(
        localState.id,
        localState.position,
        raw.aimAngle,
        players,
        grid,
        piercing,
        WEAPONS[localState.weaponId],
        hitboxScale,
      );
      // The empty-mag tint tracks the HELD weapon's pool: shotgun/pistol
      // fire from specialAmmo, not the rifle magazine.
      const magEmpty =
        localState.weaponId === 'shotgun' || localState.weaponId === 'pistol'
          ? localState.specialAmmo === 0
          : localState.ammo === 0;
      this.effectsRenderer.showBulletAim(
        localState.position.x,
        localState.position.y,
        aim.endPos.x,
        aim.endPos.y,
        magEmpty,
      );
    } else if (raw.aimingGrenade) {
      // turbo_grenades: preview at the boosted throw speed so the arc
      // matches the server's actual flight.
      const grenadeSpeedMultiplier = networkManager.getActiveMutators().includes('turbo_grenades')
        ? MUTATORS.TURBO_GRENADES_SPEED_MULTIPLIER
        : 1;
      const path = predictGrenadePath(
        localState.position,
        raw.aimAngle,
        grid,
        undefined,
        undefined,
        piercing,
        grenadeSpeedMultiplier,
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
        armor: interp.armor,
        ammo: interp.ammo,
        isReloading: interp.isReloading,
        reloadTimer: 0,
        weaponId: interp.weaponId,
        specialAmmo: interp.specialAmmo,
        specialReserve: interp.specialReserve,
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
        frozenTimer: interp.frozenTimer,
        secondWindTimer: interp.secondWindTimer,
      });
    }
    return players;
  }

  shutdown(): void {
    this.cleanup();
    useLegacyLogicalSize(this.scale);
  }

  getGameplayViewportContract(): Readonly<{
    viewport: GameplayViewportContract;
    safeArea: GameplayOverlaySafeArea | null;
  }> {
    return Object.freeze({ viewport: this.gameplayViewport, safeArea: this.gameplaySafeArea });
  }

  private layoutGameplayViewport(): void {
    this.gameplaySafeArea =
      this.gameplayViewport.mode === 'large-world'
        ? currentGameplayOverlaySafeArea(this.game.canvas)
        : null;
  }

  private updateMatchMenuInput(): void {
    const actions = this.matchMenuGamepad?.poll();
    if (!actions?.hasAction || !this.matchMenu || this.leavingMatch) return;

    if (actions.menu) {
      if (this.matchMenu.isOpen()) this.matchMenu.hide();
      else if (!this.endTransitionStarted) this.matchMenu.show();
      return;
    }
    if (!this.matchMenu.isOpen()) return;
    if (actions.back) {
      this.matchMenu.back();
      return;
    }
    if (actions.up || actions.left) this.matchMenu.moveFocus(-1);
    else if (actions.down || actions.right) this.matchMenu.moveFocus(1);
    else if (actions.confirm) this.matchMenu.activateFocused();
  }

  private leaveCurrentMatch(): void {
    if (this.leavingMatch) return;
    this.leavingMatch = true;
    this.endTransitionStarted = true;
    this.pendingResult = null;
    this.matchMenu?.setAvailable(false);
    this.inputManager?.setGameplayEnabled(false);
    this.gameService.returnToLobby();
    AudioManager.getInstance()?.stopMusic(200);
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.cleanup();
      this.scene.start('LobbyScene');
    });
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
        if (!this.modeBriefingShown && this.matchData?.gameMode) {
          this.modeBriefingShown = true;
          this.hud.showModeBriefing(
            this.matchData.gameMode,
            this.inputManager?.getActiveMode() ?? (isTouchDevice() ? 'touch' : 'keyboard'),
            this.matchData.gameMode !== GameModeType.ONE_IN_THE_CHAMBER,
          );
        }
      }
      this.matchPhase = MatchPhase.COUNTDOWN;
    };

    this.onMatchStart = () => {
      this.matchPhase = MatchPhase.ACTIVE;
      this.matchMenu?.setAvailable(true);
      this.inputManager?.setGameplayEnabled(!this.matchMenu?.isOpen());
      if (this.hud) {
        this.hud.showCountdown(0); // Shows "FIGHT!"
        this.hud.hideModeBriefing();
      }
      // Match length is tuned to this track (MATCH.TIME_LIMIT === 173s).
      // loop=false because the track ends exactly when the match ends —
      // looping would replay the intro for whatever fraction of a tick
      // the audio engine takes to honor stopMusic.
      AudioManager.getInstance()?.playMusic('music-gameplay', 0, false);
    };

    this.onMatchEnd = (result: MatchResult) => {
      if (this.leavingMatch) return;
      this.matchMenu?.setAvailable(false);
      this.pendingResult = result;
      this.beginEndTransition();
      this.tryStartResultsScene();
    };

    this.onOpponentDisconnected = (_playerId: PlayerId) => {
      if (this.leavingMatch) return;
      this.matchMenu?.setAvailable(false);
      // Show disconnect message
      const msg = this.add
        .text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'OPPONENT DISCONNECTED', {
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '24px',
          color: cssHex(Wasteland.TEXT_DISCONNECT),
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2000);

      this.time.delayedCall(3000, () => {
        msg.destroy();
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.cleanup();
          this.scene.start('LobbyScene');
        });
      });
    };

    this.onPlayerLeft = (_playerId: PlayerId, nickname: string) => {
      this.hud?.showEventBanner(
        'FIGHTER LEFT',
        `${nickname.toUpperCase()} IS OUT - RUMBLE CONTINUES`,
        Wasteland.TEXT_DISCONNECT,
      );
    };

    this.onBulletTrail = (trail: BulletTrail) => {
      const bulletAngle = Math.atan2(
        trail.endPos.y - trail.startPos.y,
        trail.endPos.x - trail.startPos.x,
      );

      // A shotgun blast arrives as one trail per pellet (same tick, same
      // shooter). Render every pellet's trail/impact, but fire the
      // one-per-blast effects (muzzle flash, boom SFX, shoot anim, camera
      // kick) only for the first pellet of the blast.
      const isShotgun = trail.weaponId === 'shotgun';
      const localPlayerId = this.gameService.getNetworkManager().getPlayerId();
      let primaryOfBlast = true;
      if (isShotgun) {
        const last = this.lastShotgunBlastAt.get(trail.shooterId);
        if (isSameShotgunBlast(last, trail.timestamp)) {
          primaryOfBlast = false;
        } else {
          this.lastShotgunBlastAt.set(trail.shooterId, trail.timestamp);
        }
      }

      // Muzzle flash + lighting flash are gun-specific visuals. Skip for
      // characters that don't render a held gun (e.g. Bruce) — fire
      // emerging from a fist would read as a bug. The bullet trail itself
      // still plays so the shot is legible.
      const shooter = this.playerManager?.getRenderer(trail.shooterId);
      if (primaryOfBlast && (shooter?.rendersGun() ?? true)) {
        this.effectsRenderer?.showMuzzleFlash(trail.startPos.x, trail.startPos.y, bulletAngle);
        this.lightingRenderer?.addMuzzleFlash(trail.startPos.x, trail.startPos.y);
      }

      // Rifle: three trails per burst (server-authoritative, burstInterval
      // apart), so per-trail playback naturally produces three shots.
      // Shotgun: one deeper boom per blast; pistol: a lighter, snappier
      // crack — both rate/detune variants of the same source WAV per the
      // roadmap (no new audio files).
      const audio = AudioManager.getInstance();
      if (audio && primaryOfBlast) {
        const sfxOptions = isShotgun
          ? { rate: 0.55, detune: -250 }
          : trail.weaponId === 'pistol'
            ? { rate: 1.4, detune: 200 }
            : undefined;
        const localState = this.gameService.getNetworkManager().getLocalPlayerState();
        if (localState) {
          audio.playAtPosition(
            'gunshot',
            trail.startPos.x,
            trail.startPos.y,
            localState.position.x,
            localState.position.y,
            sfxOptions,
          );
        } else {
          audio.play('gunshot', sfxOptions);
        }
      }

      // Trigger the shooter's weapon shoot animation (the shotgun chains
      // its pump-racking anim). Characters without a rendered gun
      // (CharacterDef.hasGun=false) silently no-op inside playShootAnimation.
      if (primaryOfBlast) {
        shooter?.playShootAnimation();
      }

      const grid = this.mapRenderer?.getCollisionGrid() ?? null;
      const confirmedPlayerHit = hasConfirmedPlayerHit(trail);
      this.effectsRenderer?.showBulletTrail(
        trail.startPos.x,
        trail.startPos.y,
        trail.endPos.x,
        trail.endPos.y,
        () => {
          if (confirmedPlayerHit) {
            this.effectsRenderer?.showPlayerHit(
              trail.endPos.x,
              trail.endPos.y,
              bulletAngle,
              trail.timestamp,
            );

            // This dry UI tick is private shooter feedback. Shotgun pellets
            // share one blast, so only its first confirmed pellet owns it.
            if (audio && trail.shooterId === localPlayerId) {
              let playHitConfirm = true;
              if (isShotgun) {
                const last = this.lastShotgunConfirmedHitAt.get(trail.shooterId);
                if (isSameShotgunBlast(last, trail.timestamp)) {
                  playHitConfirm = false;
                } else {
                  this.lastShotgunConfirmedHitAt.set(trail.shooterId, trail.timestamp);
                }
              }
              if (playHitConfirm) audio.play('hitConfirm');
            }
          } else {
            this.impactFx?.spawnBulletImpact(trail.endPos.x, trail.endPos.y, bulletAngle, grid);
            this.decalRenderer?.addBulletHoleIfWall(
              trail.endPos.x,
              trail.endPos.y,
              bulletAngle,
              grid,
            );
          }
        },
      );

      // Recoil kick — only the local player's shot moves the local camera.
      // Watching a remote player fire must not jitter your view.
      if (primaryOfBlast && trail.shooterId === localPlayerId) {
        this.cameraKick?.trigger(bulletAngle + Math.PI);
      }
    };

    this.onPlayerKilled = (entry: KillFeedEntry) => {
      // Killer hears the kill sound; victim hears the death sound. Suicide
      // (killer === victim, e.g. own grenade) plays only the death sound.
      const networkManager = this.gameService.getNetworkManager();
      const localId = networkManager.getPlayerId();
      if (!localId) return;

      // The reliable event owns attribution. Resolve presentation names from
      // the match roster first so a death still reads after interpolation has
      // already pruned a departed fighter; live snapshots may refine them.
      const playerNames = new Map<PlayerId, string>();
      for (const opponent of this.matchData?.opponents ?? []) {
        playerNames.set(opponent.id, opponent.nickname);
      }
      playerNames.set(localId, networkManager.getLocalPlayerState()?.nickname || this.nickname);
      for (const [playerId, state] of networkManager.getInterpolatedPlayers()) {
        playerNames.set(playerId, state.nickname);
      }
      const feed = killFeedPresentation(entry, playerNames, localId);
      this.hud?.addKillFeedEntry(feed.label, feed.tone);

      const baseCallout = combatCalloutFor(entry, localId);
      // The reliable kill event is authoritative, but the displayed points are
      // still provisional until the server confirms a stage win. Avoid a
      // client-side running total because reconnects do not replay old kills.
      const stylePoints = this.matchData?.gauntlet
        ? practiceGauntletStylePointsForKill(entry, localId)
        : 0;
      const callout = withGauntletStyle(baseCallout, stylePoints);
      if (callout) {
        this.hud?.showCombatCallout(callout.headline, callout.detail, callout.tint);
        if (callout.pulse) this.zoomPulse?.trigger();
      }
      const audio = AudioManager.getInstance();
      if (!audio) return;
      if (entry.killerId === localId && entry.killerId !== entry.victimId) {
        audio.play('kill', callout?.killSfx);
        this.healFlash?.trigger();
      }
      if (entry.assistId === localId && entry.killerId !== localId && entry.victimId !== localId) {
        audio.play('menuSelect', { rate: 1.2, detune: 200 });
      }
      if (entry.victimId === localId) {
        audio.play('death');
      }
    };

    this.onPickupCollected = (pickupId: string, collectorId: PlayerId) => {
      const audio = AudioManager.getInstance();
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

      // Rate variants distinguish pickups without new audio files: the
      // shotgun lands as a heavier clunk, the pistol as a lighter clack,
      // the bandage as a lighter snip.
      const pickupType = networkManager.getPickups().find((p) => p.id === pickupId)?.type;
      let sfxOptions: { rate: number } | undefined;
      if (pickupType === PickupType.WEAPON_SHOTGUN) {
        sfxOptions = { rate: 0.6 };
      } else if (pickupType === PickupType.WEAPON_PISTOL) {
        sfxOptions = { rate: 0.85 };
      } else if (pickupType === PickupType.WEAPON_BAT) {
        sfxOptions = { rate: 0.7 };
      } else if (pickupType === PickupType.BANDAGE) {
        sfxOptions = { rate: 1.35 };
      } else if (pickupType === PickupType.ARMOR) {
        sfxOptions = { rate: 0.72 };
      } else if (pickupType === PickupType.OVERCHARGE) {
        sfxOptions = { rate: 1.65 };
        if (collectorId === localId) {
          this.hud?.showEventBanner('OVERCHARGED', 'ABILITY READY', 0xc77dff);
          this.zoomPulse?.trigger();
        }
      }

      if (!audio) return;

      if (collectorPos && localState) {
        audio.playAtPosition(
          'pickupCollect',
          collectorPos.x,
          collectorPos.y,
          localState.position.x,
          localState.position.y,
          sfxOptions,
        );
      } else {
        audio.play('pickupCollect', sfxOptions);
      }
    };

    this.onConfirmedTagCollected = (event: KillConfirmedCollection) => {
      const localId = this.gameService.getNetworkManager().getPlayerId();
      if (!localId) return;
      const callout = confirmedTagCallout(event, localId);
      this.hud?.showCombatCallout(callout.headline, callout.detail, callout.color);
      AudioManager.getInstance()?.play('pickupCollect', {
        rate: event.confirmed ? 1.15 : 0.8,
      });
    };

    this.onRumbleLeadChanged = (state: RumbleLeadState, players: SerializedPlayerState[]) => {
      const localId = this.gameService.getNetworkManager().getPlayerId();
      if (!localId) return;
      const callout = rumbleLeadCallout(state, players, localId);
      if (!callout) return;
      this.hud?.showCombatCallout(callout.headline, callout.detail, callout.tint);
      if (callout.pulse) this.zoomPulse?.trigger();
      AudioManager.getInstance()?.play('menuSelect', {
        rate: state.leaderIds.includes(localId) ? 1.2 : 0.82,
      });
    };

    this.onGrenadeThrown = (pos: Vec2) => {
      const audio = AudioManager.getInstance();
      if (!audio) return;
      const localState = this.gameService.getNetworkManager().getLocalPlayerState();
      if (localState) {
        audio.playAtPosition(
          'grenadeThrow',
          pos.x,
          pos.y,
          localState.position.x,
          localState.position.y,
        );
      } else {
        audio.play('grenadeThrow');
      }
    };

    // Axe events are message-granularity (see NetworkManager) so even a
    // one-snapshot flight — thrown point-blank into a wall — still plays
    // its throw sound and landing animation.
    this.onAxeThrown = (pos: Vec2) => {
      const audio = AudioManager.getInstance();
      if (!audio) return;
      const localState = this.gameService.getNetworkManager().getLocalPlayerState();
      // Rotation-modulated whoosh — reads as a spinning blade (generated
      // WAV, replaces the Session 7 pitched grenade-throw stand-in).
      if (localState) {
        audio.playAtPosition(
          'axeWhoosh',
          pos.x,
          pos.y,
          localState.position.x,
          localState.position.y,
        );
      } else {
        audio.play('axeWhoosh');
      }
    };

    this.onAxeResolved = (payload: { position: Vec2; angle: number }) => {
      this.axeRenderer?.playLandingAt(payload.position.x, payload.position.y, payload.angle);

      // Landing thunk (new in Session 8 — the landing previously played
      // no sound at all).
      const audio = AudioManager.getInstance();
      if (!audio) return;
      const localState = this.gameService.getNetworkManager().getLocalPlayerState();
      if (localState) {
        audio.playAtPosition(
          'axeChop',
          payload.position.x,
          payload.position.y,
          localState.position.x,
          localState.position.y,
        );
      } else {
        audio.play('axeChop');
      }
    };

    // Punch swings ride the gameState message (message-granularity, like
    // the axe events) — one per swing, local and remote punchers alike.
    // The swing drives the puncher's body-level attack anim; melee has no
    // bullet trail, so no muzzle flash and no tracer.
    this.onPunchSwung = (punch: PunchEvent) => {
      const weaponId = punch.weaponId ?? 'punch';
      const renderer = this.playerManager?.getRenderer(punch.playerId);
      renderer?.playAttackAnimation();
      renderer?.playMeleeSwing(weaponId, punch.aimAngle);

      const audio = AudioManager.getInstance();
      if (!audio) return;
      const localState = this.gameService.getNetworkManager().getLocalPlayerState();
      const whooshOptions = weaponId === 'bat' ? { rate: 0.72 } : undefined;
      // Band-passed noise-sweep whoosh (generated WAV, replaces the
      // Session 7 pitched grenade-throw stand-in).
      if (localState) {
        audio.playAtPosition(
          'punchWhoosh',
          punch.position.x,
          punch.position.y,
          localState.position.x,
          localState.position.y,
          whooshOptions,
        );
      } else {
        audio.play('punchWhoosh', whooshOptions);
      }

      if (punch.hit) {
        // Body-blow thump + click (generated WAV, replaces the slowed
        // gun-shot stand-in).
        if (localState) {
          audio.playAtPosition(
            'punchImpact',
            punch.position.x,
            punch.position.y,
            localState.position.x,
            localState.position.y,
            weaponId === 'bat' ? { rate: 0.68 } : undefined,
          );
        } else {
          audio.play('punchImpact', weaponId === 'bat' ? { rate: 0.68 } : undefined);
        }
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
          audio.playAtPosition(
            'explosion',
            pos.x,
            pos.y,
            localState.position.x,
            localState.position.y,
          );
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
    const EVENT_BANNER_COLORS: Record<MutatorId, number> = {
      super_speed: 0xfff200,
      grenades_only: 0xff8a00,
      infinite_ammo: 0x39c5ff,
      low_health: 0xff2e3a,
      big_heads: 0xff7ae0,
      vampire: 0x9b30d9,
      turbo_grenades: 0x7cff4f,
      second_wind: 0x4fe3c1,
      blood_rush: 0xff4055,
      ability_overdrive: 0xc77dff,
      blackout: 0x4b527e,
      fists_only: 0xffb347,
      weapon_roulette: 0x5ce1e6,
      wasteland_warp: 0xb56cff,
      demolition_wave: 0xffb000,
      last_laugh: 0xff3b30,
      scavenger_rush: 0x5ce1e6,
      radiation_storm: 0x8cff2f,
      scrapstorm: 0xff6b35,
    };

    this.onEventWarning = (payload: EventWarningPayload) => {
      const name = eventDisplayName(payload.event);
      const headline = payload.isFinalMinute ? 'FINAL MINUTE INCOMING' : 'MUTATOR INCOMING';
      this.hud?.showEventBanner(headline, name, EVENT_BANNER_COLORS[payload.event]);
      AudioManager.getInstance()?.play('matchStartHorn');
    };

    this.onEventStart = (payload: EventStartPayload) => {
      const name = eventDisplayName(payload.event);
      if (payload.event === 'weapon_roulette') {
        this.lastRouletteWeapon = null;
        this.awaitingRouletteOpeningWeapon = true;
      }
      if (payload.event === 'demolition_wave') {
        this.cameras.main.shake(450, 0.012);
        this.zoomPulse?.trigger();
      }
      this.hud?.showEventBanner(
        `${name}!`,
        eventStartDetail(payload.event),
        EVENT_BANNER_COLORS[payload.event],
      );
      this.hud?.setActiveEventLabel(name);
      this.eventFlash?.trigger(payload.event);
      AudioManager.getInstance()?.play('matchStartHorn');
    };

    // Weapon pickup pre-announcement — "SHOTGUN INCOMING" ~5s before the
    // pickup lands at map center. Reuses the event banner (gold tint, to
    // match the shell indicators) with a down-pitched horn so it doesn't
    // read as a final-minute event.
    this.onWeaponIncoming = (payload: WeaponIncomingPayload) => {
      const name = payload.weaponId === 'shotgun' ? 'SHOTGUN' : payload.weaponId.toUpperCase();
      this.hud?.showEventBanner(`${name} INCOMING`, undefined, 0xf9c22b);
      AudioManager.getInstance()?.play('matchStartHorn', { detune: -400 });
    };

    this.onTilesDestroyed = (tiles) => {
      if (!this.mapRenderer) return;
      for (const { col, row } of tiles) {
        this.mapRenderer.destroyTileAt(col, row);
      }
    };

    // Sudden-death overtime: the tie banner beat. The clock re-anchor is
    // handled inside NetworkManager; a deep slow horn distinguishes it
    // from mutator/weapon announcements.
    this.onOvertimeStart = () => {
      this.hud?.showEventBanner('OVERTIME!', 'SUDDEN DEATH - FIRST KILL WINS', 0xb33831);
      AudioManager.getInstance()?.play('matchStartHorn', { detune: -800, rate: 0.7 });
      this.zoomPulse?.trigger();
      // After the sting reads, restart the gameplay track at its final
      // stretch so the already-tuned finale lands at 0:00 again. Seeking
      // by the clock's REMAINING seconds (re-anchored to overtime by
      // NetworkManager before this handler runs) rather than a fixed
      // OVERTIME.DURATION keeps the finale aligned despite the sting
      // delay and message latency. A kill just stops it early via the
      // normal match-end stopMusic path.
      this.time.delayedCall(OVERTIME_MUSIC_DELAY_MS, () => {
        if (this.endTransitionStarted) return;
        const remaining = this.gameService.getNetworkManager().getMatchTimer();
        if (remaining <= 0) return;
        AudioManager.getInstance()?.playMusicFromEnd('music-gameplay', remaining);
      });
    };

    this.onTaunt = (playerId: PlayerId, tauntId: TauntId) => {
      this.tauntRenderer?.show(playerId, tauntId);
    };

    this.onConnectionLost = () => {
      this.matchMenu?.setAvailable(false);
      this.returnToLobbyAfterConnectionLoss();
    };

    this.gameService.on('matchCountdown', this.onMatchCountdown);
    this.gameService.on('matchStart', this.onMatchStart);
    this.gameService.on('matchEnd', this.onMatchEnd);
    this.gameService.on('reconnecting', this.onConnectionLost);
    this.gameService.on('disconnected', this.onConnectionLost);
    this.gameService.on('opponentDisconnected', this.onOpponentDisconnected);
    this.gameService.on('playerLeft', this.onPlayerLeft);
    this.gameService.on('bulletTrail', this.onBulletTrail);
    this.gameService.on('playerKilled', this.onPlayerKilled);
    this.gameService.on('pickupCollected', this.onPickupCollected);
    this.gameService.on('confirmedTagCollected', this.onConfirmedTagCollected);
    this.gameService.on('rumbleLeadChanged', this.onRumbleLeadChanged);
    this.gameService.on('grenadeThrown', this.onGrenadeThrown);
    this.gameService.on('grenadeExploded', this.onGrenadeExploded);
    this.gameService.on('axeThrown', this.onAxeThrown);
    this.gameService.on('axeResolved', this.onAxeResolved);
    this.gameService.on('punchSwung', this.onPunchSwung);
    this.gameService.on('localCorrection', this.onLocalCorrection);
    this.gameService.on('eventWarning', this.onEventWarning);
    this.gameService.on('eventStart', this.onEventStart);
    this.gameService.on('weaponIncoming', this.onWeaponIncoming);
    this.gameService.on('tilesDestroyed', this.onTilesDestroyed);
    this.gameService.on('overtimeStart', this.onOvertimeStart);
    this.gameService.on('taunt', this.onTaunt);
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
    this.matchMenu?.setAvailable(false);
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

  private returnToLobbyAfterConnectionLoss(): void {
    if (this.connectionLostTransitionStarted) return;
    this.connectionLostTransitionStarted = true;
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    this.add
      .rectangle(centerX, centerY, this.scale.width, this.scale.height, Wasteland.CANVAS_BG, 0.82)
      .setDepth(20_000);
    this.add
      .text(centerX, centerY - 20, 'SIGNAL LOST', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '24px',
        color: cssHex(Wasteland.HIT_FLASH),
      })
      .setOrigin(0.5)
      .setDepth(20_001);
    this.add
      .text(centerX, centerY + 22, 'RETURNING TO THE OUTPOST...', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '18px',
        color: cssHex(Wasteland.COVER_FILL),
      })
      .setOrigin(0.5)
      .setDepth(20_001);
    AudioManager.getInstance()?.stopMusic();
    this.time.delayedCall(900, () => {
      this.cleanup();
      this.scene.start('LobbyScene');
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
    if (this.onConnectionLost) {
      this.gameService.off('reconnecting', this.onConnectionLost);
      this.gameService.off('disconnected', this.onConnectionLost);
      this.onConnectionLost = null;
    }
    if (this.onOpponentDisconnected) {
      this.gameService.off('opponentDisconnected', this.onOpponentDisconnected);
      this.onOpponentDisconnected = null;
    }
    if (this.onPlayerLeft) {
      this.gameService.off('playerLeft', this.onPlayerLeft);
      this.onPlayerLeft = null;
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
    if (this.onConfirmedTagCollected) {
      this.gameService.off('confirmedTagCollected', this.onConfirmedTagCollected);
      this.onConfirmedTagCollected = null;
    }
    if (this.onRumbleLeadChanged) {
      this.gameService.off('rumbleLeadChanged', this.onRumbleLeadChanged);
      this.onRumbleLeadChanged = null;
    }
    if (this.onGrenadeThrown) {
      this.gameService.off('grenadeThrown', this.onGrenadeThrown);
      this.onGrenadeThrown = null;
    }
    if (this.onAxeThrown) {
      this.gameService.off('axeThrown', this.onAxeThrown);
      this.onAxeThrown = null;
    }
    if (this.onAxeResolved) {
      this.gameService.off('axeResolved', this.onAxeResolved);
      this.onAxeResolved = null;
    }
    if (this.onPunchSwung) {
      this.gameService.off('punchSwung', this.onPunchSwung);
      this.onPunchSwung = null;
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
    if (this.onTilesDestroyed) {
      this.gameService.off('tilesDestroyed', this.onTilesDestroyed);
      this.onTilesDestroyed = null;
    }
    if (this.onEventStart) {
      this.gameService.off('eventStart', this.onEventStart);
      this.onEventStart = null;
    }
    if (this.onWeaponIncoming) {
      this.gameService.off('weaponIncoming', this.onWeaponIncoming);
      this.onWeaponIncoming = null;
    }
    if (this.onOvertimeStart) {
      this.gameService.off('overtimeStart', this.onOvertimeStart);
      this.onOvertimeStart = null;
    }
    if (this.onTaunt) {
      this.gameService.off('taunt', this.onTaunt);
      this.onTaunt = null;
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
    this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutGameplayViewport, this);
    this.cleanupEvents();
    if (this.onMatchMenuEscape) {
      this.input.keyboard?.off('keydown-ESC', this.onMatchMenuEscape);
      this.onMatchMenuEscape = null;
    }
    if (this.matchMenu) {
      this.matchMenu.destroy();
      this.matchMenu = null;
    }
    this.matchMenuGamepad = null;

    this.cameras.main.resetPostPipeline();
    this.cameras.main.postFX.clear();
    this.crtPipeline = null;
    this.aberrationPixels = 0;
    this.prevLocalHealth = null;

    if (this.mapRenderer) {
      this.mapRenderer.destroy();
      this.mapRenderer = null;
    }
    if (this.kothHillRenderer) {
      this.kothHillRenderer.destroy();
      this.kothHillRenderer = null;
    }
    if (this.tauntRenderer) {
      this.tauntRenderer.destroy();
      this.tauntRenderer = null;
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
    if (this.onConfirmedTagCollected) {
      this.gameService.off('confirmedTagCollected', this.onConfirmedTagCollected);
      this.onConfirmedTagCollected = null;
    }
    if (this.confirmedTagRenderer) {
      this.confirmedTagRenderer.destroy();
      this.confirmedTagRenderer = null;
    }
    if (this.coreRunRenderer) {
      this.coreRunRenderer.destroy();
      this.coreRunRenderer = null;
    }
    if (this.radiationStormRenderer) {
      this.radiationStormRenderer.destroy();
      this.radiationStormRenderer = null;
    }
    if (this.scrapstormRenderer) {
      this.scrapstormRenderer.destroy();
      this.scrapstormRenderer = null;
    }
    if (this.axeRenderer) {
      this.axeRenderer.destroy();
      this.axeRenderer = null;
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
    this.lastSyncedMutatorLabel = null;
    this.lastRouletteWeapon = null;
    this.awaitingRouletteOpeningWeapon = false;
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
    this.prevAbilityCoolingDown = false;
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
