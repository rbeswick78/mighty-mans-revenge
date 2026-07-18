import {
  MatchPhase,
  GameModeType,
  MATCH,
  CREW_BATTLE,
  OVERTIME,
  RESPAWN,
  PLAYER,
  WEAPONS,
  GRENADE,
  GAUNTLET_BOON_IDS,
  PRACTICE_GAUNTLET,
  SERVER,
  MUTATORS,
  COMBAT_MEDALS,
  TAUNT,
  KOTH,
  ABILITY,
  CHARACTER_IDS,
  MAP,
  calculateDashEndpoint,
  calculateMovement,
  characterHitbox,
  characterMaxHealth,
  computePelletAngles,
  evenFanAngles,
  playerMovementModifiers,
  mutatorsConflict,
  rayIntersectsAABB,
  TileType,
  PickupType,
  PICKUP,
  selectMatchContract,
  selectScavengerCacheReward,
  radiationStormCenter,
  radiationStormInitialRadius,
  radiationStormRadius,
  isOutsideRadiationStorm,
  isTauntId,
  applyWeaponRarityDamage,
} from '@shared/game';
import type {
  PlayerId,
  PlayerState,
  PlayerInput,
  MapData,
  MatchResult,
  KillFeedEntry,
  KillWeapon,
  BulletTrail,
  PunchEvent,
  AxeState,
  GrenadeState,
  RocketState,
  GauntletBoonId,
  MutatorId,
  CharacterId,
  WeaponId,
  KothHudState,
  KillConfirmedTagState,
  KillConfirmedCollection,
  CoreRunState,
  BountyHuntState,
  RumbleLeadState,
  WastelandWarpState,
  RadiationStormState,
  ScrapstormState,
  ServerCharacterSelectStateMessage,
  MatchContractDefinition,
  MatchContractHudState,
  MatchContractId,
  TauntId,
  TeamId,
  BattleRoyaleMatchFormat,
} from '@shared/game';
import { logger } from '../utils/logger.js';
import { PickupManager } from './pickup-manager.js';
import { StatsTracker } from './stats-tracker.js';
import { MapManager } from './map-manager.js';
import { CombatManager, type ExplosionResult } from './combat-manager.js';
import { findBlastableCoverTiles, findDemolitionWaveTiles } from './destructible-cover.js';
import { LagCompensator } from './lag-compensator.js';
import { getGameMode } from './modes/index.js';
import type { GameMode, MatchContext } from './modes/game-mode.js';
import { InputQueue } from './input-queue.js';
import { RumbleAssistTracker } from './rumble-assist-tracker.js';
import { BattleRoyaleLifecycle } from './battle-royale-lifecycle.js';

interface PendingBurst {
  weaponId: 'rifle' | 'smg';
  shotsRemaining: number;
  /** Seconds until the next shot in the burst fires. */
  nextShotIn: number;
  /** Aim angle locked when the player released LMB. */
  lockedAngle: number;
}

export interface AutonomousTauntEvent {
  playerId: PlayerId;
  tauntId: TauntId;
}

export interface MatchLifecycleOptions {
  readonly format: BattleRoyaleMatchFormat;
}

export class Match implements MatchContext {
  readonly matchId: string;
  phase: MatchPhase = MatchPhase.CHARACTER_SELECT;
  countdownTimer = 0;
  matchTimer = 0;
  players: Map<PlayerId, PlayerState> = new Map();
  /**
   * Per-player character-select state. Populated for every player in the
   * constructor; mutated by setHover / setLock and consumed by
   * updateCharacterSelect when select completes.
   */
  selectionState: Map<PlayerId, { hovered: CharacterId | null; locked: CharacterId | null }> =
    new Map();
  /** Seconds remaining on the character-select auto-lock timer. */
  private selectTimer: number = MATCH.CHARACTER_SELECT_TIMEOUT_SEC;
  readonly stats: StatsTracker;
  readonly pickupManager: PickupManager;
  readonly mapManager: MapManager;
  /** Mode this match runs — the matchmaking manager reads it for rotation. */
  readonly gameModeType: GameModeType;
  private readonly gameMode: GameMode;
  private readonly killFeed: KillFeedEntry[] = [];
  /** Most recent opponent to kill each player, for authoritative payback. */
  private readonly lastKillerByVictim: Map<PlayerId, PlayerId> = new Map();
  /** First non-suicide kill is a once-per-match medal. */
  private firstBloodClaimed = false;
  /** Rolling rapid-kill chain state; uses simulated match time, not wall time. */
  private readonly rapidKillsByPlayer = new Map<
    PlayerId,
    { lastKillAtSeconds: number; count: number }
  >();
  readonly combatManager: CombatManager = new CombatManager();
  /**
   * Server-side rewind path for "favor the shooter" hit detection. Owns a
   * RewindBuffer of recent player states and routes processShot through it
   * using the shooter's measured RTT. Wraps combatManager — see
   * lag-compensator.ts.
   */
  private readonly lagCompensator: LagCompensator = new LagCompensator(this.combatManager);
  /**
   * Monotonic counter passed to the rewind buffer as its tick key. Distinct
   * from server tick — internal so tests don't need to thread an external
   * counter.
   */
  private rewindTickCounter = 0;
  /**
   * Resolver for the shooter's most recent measured RTT (ms). Installed by
   * MatchmakingManager from GameManager's per-player ping cache. Defaults
   * to 0 so unit tests get pass-through behavior identical to the
   * pre-lag-comp path.
   */
  private rttForShooter: (playerId: PlayerId) => number = () => 0;
  /** Recent bullet trails from this tick, cleared after broadcast. */
  private tickBulletTrails: BulletTrail[] = [];
  /** Punch swings resolved this tick, cleared after broadcast (like trails). */
  private tickPunchEvents: PunchEvent[] = [];
  /** Kills recorded this tick, cleared after broadcast. */
  private tickKillFeedEntries: KillFeedEntry[] = [];
  /** Pickups collected this tick, cleared after broadcast. */
  private tickPickupCollections: Array<{
    pickupId: string;
    playerId: PlayerId;
  }> = [];
  /** Solid tiles destroyed this tick by fire breath or grenade blasts. */
  private tickDestroyedTiles: Array<{ col: number; row: number }> = [];
  /** Environmental blasts resolved this tick, for client explosion VFX. */
  private tickBarrelExplosions: Array<{ x: number; y: number }> = [];
  /** Unspent explosive barrels in this round, keyed as `col,row`. */
  private readonly activeBarrels = new Set<string>();
  /** Closed shootable gates in this round, keyed as `col,row`. */
  private readonly activeGates = new Set<string>();
  /** Unopened one-shot loot crates in this round, keyed as `col,row`. */
  private readonly activeScavengerCaches = new Set<string>();
  /** Shared deterministic base reward used by every cache in this match. */
  private readonly scavengerCacheReward: PickupType;
  /** Barrel detonations credited to each player for the Powder Keg contract. */
  private readonly barrelDetonationsByPlayer = new Map<PlayerId, number>();
  /** Ability cells claimed by each player for the Power Trip contract. */
  private readonly overchargesByPlayer = new Map<PlayerId, number>();
  /** Shared side objective selected once for this match. */
  private readonly contractDefinition: MatchContractDefinition;
  /** Ordered input queue per player. Inputs are acked only after consumption. */
  private inputQueues: Map<PlayerId, InputQueue> = new Map();
  /** Active 3-shot bursts in flight, keyed by player. */
  private pendingBursts: Map<PlayerId, PendingBurst> = new Map();
  /** Simulation-time rate limit for presentation-only battle cries. */
  private readonly tauntCooldowns = new Map<PlayerId, number>();
  /** Server-authored signature cries registered only for personality bots. */
  private readonly autonomousTaunts = new Map<PlayerId, TauntId>();
  /** Autonomous cries earned this tick by a bot knockout. */
  private tickAutonomousTaunts: AutonomousTauntEvent[] = [];
  /**
   * Seconds until each player can pull the trigger again — the shotgun's
   * pump-racking, the pistol's semi-auto pacing, and the punch's swing
   * recovery all ride this one map. Only present (and > 0) between
   * shots; server-internal, like pendingBursts.
   */
  private fireCooldownTimers: Map<PlayerId, number> = new Map();
  /** Weapon-incoming warnings generated this tick, cleared after broadcast. */
  private tickWeaponIncoming: Array<{ weaponId: WeaponId; landsInMs: number }> = [];
  /**
   * Per-cast count of fire-breath damage ticks that have already fired
   * for each Bruce. The cast schedules DAMAGE_TICK_COUNT evenly-spaced
   * ticks across the active window; victims currently inside the cone on
   * each tick take a flat DAMAGE_PER_TICK. Cleared when the active window
   * ends (natural expiry, death, or new cast).
   */
  private fireBreathTicksByPlayer: Map<PlayerId, number> = new Map();
  /** Timestamp when the match became ACTIVE, for duration tracking. */
  get matchStartTime(): number {
    return this._matchStartTimeMs;
  }
  private _matchStartTimeMs = 0;
  private connectedPlayers: Set<PlayerId> = new Set();
  /** Only matches that began with a group field author live lead changes. */
  private readonly tracksRumbleLead: boolean;
  /** Only matches that began with a group field author assist credit. */
  private readonly tracksRumbleAssists: boolean;
  /** Immutable server-authored sides; empty for every non-team match. */
  private readonly playerTeams: ReadonlyMap<PlayerId, TeamId>;
  private readonly canDamagePlayer = (attackerId: PlayerId, victimId: PlayerId): boolean =>
    attackerId === victimId || !this.areTeammates(attackerId, victimId);
  private readonly rumbleAssistTracker = new RumbleAssistTracker();
  /** Persistent snapshot edge; sequence 0 is the silent opening baseline. */
  private rumbleLeadState: RumbleLeadState | null = null;
  /** Active-Rumble leavers stay in results but are removed from competition. */
  private readonly departedPlayerIds: Set<PlayerId> = new Set();
  /** Present only for the dormant Battle Royale format; standard matches keep the old path. */
  private readonly battleRoyaleLifecycle: BattleRoyaleLifecycle | null;
  /** Monotonic simulation cohort used to recognize same-tick final combat trades. */
  private battleRoyaleSimulationStep = 0;
  /**
   * Set when the match ended because everyone else disconnected/forfeited.
   * Overrides the game mode's scoreboard winner in getResult().
   */
  private forfeitWinnerId: PlayerId | null = null;
  /**
   * True from the moment a would-be tie sends the match into sudden-death
   * overtime. Part of MatchContext — modes stop accruing score during it.
   */
  isOvertime = false;
  /**
   * The player whose kill decided overtime. Set by onKill during overtime;
   * checkMatchEnd ends the match the same tick. Overrides the mode's
   * scoreboard winner in getResult() (forfeit still outranks it).
   */
  private overtimeWinnerId: PlayerId | null = null;
  /** Side whose knockout decided a Crew Battle overtime. */
  private overtimeWinnerTeamId: TeamId | null = null;
  /** One-shot overtime announcement to broadcast this tick. */
  private _tickOvertimeStart: { overtimeEndsInMs: number } | null = null;
  /**
   * Regulation seconds played when overtime began. Usually TIME_LIMIT
   * (time-out ties), but a simultaneous-kill tie at the score target can
   * start overtime mid-clock.
   */
  private regulationElapsedAtOvertime = 0;

  /**
   * Mutator scheduling state — two slots per match, each with the same
   * warn-then-start lifecycle. Slots choose their mutator at warning time,
   * excluding whatever the other slot already picked (no repeats within a
   * match). Both mutators run to match end, so they can stack: the
   * mid-match window's upper edge (70% elapsed) lies inside the final
   * minute.
   */
  private readonly midMatchSlot = {
    /**
     * Seconds of match ELAPSED at which the mutator activates. Rolled from
     * the injectable rng when the match transitions to ACTIVE, uniform in
     * the MIDMATCH_*_ELAPSED_FRACTION window.
     */
    activateAtElapsed: Number.POSITIVE_INFINITY,
    mutator: null as MutatorId | null,
    warningSent: false,
    started: false,
  };
  /** Final-minute slot — fixed thresholds in seconds REMAINING. */
  private readonly finalMinuteSlot = {
    mutator: null as MutatorId | null,
    warningSent: false,
    started: false,
  };
  /** Mutators that have activated, in activation order. */
  private readonly _activeMutators: MutatorId[] = [];
  /** One-shot warnings to broadcast this tick (consumed by matchmaking-manager). */
  private _tickMutatorWarnings: Array<{
    event: MutatorId;
    activatesInMs: number;
    isFinalMinute: boolean;
  }> = [];
  /** One-shot starts to broadcast this tick (consumed by matchmaking-manager). */
  private _tickMutatorStarts: Array<{
    event: MutatorId;
    isFinalMinute: boolean;
  }> = [];
  /** Injected RNG for mutator timing/selection — defaults to Math.random, override in tests. */
  private readonly rng: () => number;
  /** Mutators from the immediately previous round, excluded from random rolls. */
  private readonly rematchMutatorExclusions: ReadonlySet<MutatorId>;
  /** Optional server-authored Gauntlet promise for the mid-match slot. */
  private readonly plannedMidMatchMutator: MutatorId | undefined;
  /** Current shared step and countdown for the Weapon Roulette mutator. */
  private weaponRouletteIndex = 0;
  private weaponRouletteTimer = 0;
  /** Persistent countdown/edge for deterministic living-player warps. */
  private wastelandWarpTimer = 0;
  private wastelandWarpSequence = 0;
  /** Rotating one-shot supply cadence for the Scavenger Rush mutator. */
  private scavengerRushTimer = 0;
  private scavengerRushSequence = 0;
  /** Snapshot-driven nonlethal closing zone for Radiation Storm. */
  private radiationStormCenter = { x: 0, y: 0 };
  private radiationStormInitialRadius = 0;
  private radiationStormElapsed = 0;
  private radiationStormPulseTimer = 0;
  /** Alternating quiet/warning countdown for localized falling debris. */
  private scrapstormTimer = 0;
  private scrapstormTargetPosition: { x: number; y: number } | null = null;
  private scrapstormTargetPlayerId: PlayerId | null = null;
  private scrapstormTargetSequence = 0;
  /**
   * Regulation length in seconds — MATCH.TIME_LIMIT unless the
   * FORCE_MATCH_SECONDS env smoke pin overrides it (same family as
   * FORCE_MODE / FORCE_MAP / FORCE_EVENT: manual-smoke tooling for
   * reaching long-tail states — late Gun Game rungs, timeouts, overtime —
   * without playing full-length matches). The client needs no matching
   * override: its clock re-anchors from server snapshots every tick.
   * Music/timer sync is knowingly off while pinned.
   */
  private readonly timeLimitSeconds: number;
  /** Stable hash namespace for Daily Run contracts, hazards, and strikes. */
  private readonly stableSeed: string;
  /** Daily Run targets use semantic player-entry order instead of random UUID order. */
  private readonly usesChallengeSeed: boolean;
  /** Run-long, per-player Gauntlet benefits. Bots are deliberately absent. */
  private readonly gauntletBoonsByPlayer = new Map<PlayerId, ReadonlySet<GauntletBoonId>>();

  constructor(
    matchId: string,
    mapData: MapData,
    playerEntries: Array<{ id: PlayerId; nickname: string }>,
    gameModeType: GameModeType = GameModeType.DEATHMATCH,
    rng: () => number = Math.random,
    rematchMutatorExclusions: readonly MutatorId[] = [],
    contractOverride?: MatchContractId,
    previousContractId?: MatchContractId,
    plannedMidMatchMutator?: MutatorId,
    stableSeed?: string,
    gauntletBoonAssignments: ReadonlyMap<PlayerId, readonly GauntletBoonId[]> = new Map(),
    playerTeams: ReadonlyMap<PlayerId, TeamId> = new Map(),
    lifecycleOptions?: MatchLifecycleOptions,
  ) {
    this.matchId = matchId;
    this.playerTeams = new Map(playerTeams);
    this.battleRoyaleLifecycle =
      lifecycleOptions?.format === 'battle_royale'
        ? new BattleRoyaleLifecycle(playerEntries.map((entry) => entry.id))
        : null;
    this.tracksRumbleLead =
      this.battleRoyaleLifecycle === null &&
      playerEntries.length >= 3 &&
      this.playerTeams.size === 0;
    this.tracksRumbleAssists = this.battleRoyaleLifecycle === null && playerEntries.length >= 3;
    this.rng = rng;
    this.rematchMutatorExclusions = new Set(rematchMutatorExclusions);
    this.plannedMidMatchMutator = plannedMidMatchMutator;
    this.timeLimitSeconds = resolveTimeLimitSeconds();
    this.stableSeed = stableSeed ?? matchId;
    this.usesChallengeSeed = stableSeed !== undefined;
    for (const [playerId, boonIds] of gauntletBoonAssignments) {
      const valid = new Set(
        boonIds.filter((boonId) => (GAUNTLET_BOON_IDS as readonly string[]).includes(boonId)),
      );
      if (valid.size > 0) {
        this.gauntletBoonsByPlayer.set(
          playerId,
          new Set([...valid].slice(0, PRACTICE_GAUNTLET.TOTAL_STAGES - 1)),
        );
      }
    }
    this.stats = new StatsTracker();
    this.pickupManager = new PickupManager();
    this.mapManager = new MapManager();
    this.gameModeType = gameModeType;
    this.gameMode = getGameMode(gameModeType);
    this.scavengerCacheReward = selectScavengerCacheReward(
      this.stableSeed,
      (type) => this.gameMode.isPickupTypeEnabled?.(type) ?? true,
    );
    this.contractDefinition = selectMatchContract(
      this.stableSeed,
      gameModeType,
      contractOverride ?? process.env.FORCE_CONTRACT,
      previousContractId,
    );

    this.mapManager.loadMap(mapData);
    for (const decoration of mapData.decorations ?? []) {
      if (decoration.hazard === 'explosive_barrel') {
        this.activeBarrels.add(this.tileKey(decoration.x, decoration.y));
      }
      if (decoration.interaction === 'shootable_gate') {
        this.activeGates.add(this.tileKey(decoration.x, decoration.y));
      }
      if (decoration.interaction === 'scavenger_cache') {
        this.activeScavengerCaches.add(this.tileKey(decoration.x, decoration.y));
      }
    }
    // Modes can veto whole pickup categories (Gun Game: everything but
    // bandages) — filtered spawns never exist, so they never announce.
    this.pickupManager.initFromMap(
      mapData,
      (type) => this.gameMode.isPickupTypeEnabled?.(type) ?? true,
    );

    const spawns = this.mapManager.pickInitialSpawns(playerEntries.length, this.rng);
    // Default-hover assignment: as we iterate over players in insertion order,
    // give each player the first CHARACTER_ID not already taken as a default
    // hover. With only 2 characters and 2 players today this means P1 gets
    // CHARACTER_IDS[0] and P2 gets CHARACTER_IDS[1] — but it generalizes
    // cleanly to any roster size.
    const takenDefaults = new Set<CharacterId>();
    playerEntries.forEach((entry, i) => {
      const player = this.createPlayerState(entry.id, entry.nickname, spawns[i]);
      this.players.set(entry.id, player);
      this.inputQueues.set(entry.id, new InputQueue());
      this.stats.initPlayer(entry.id);
      this.connectedPlayers.add(entry.id);

      const defaultHover = CHARACTER_IDS.find((c) => !takenDefaults.has(c)) ?? CHARACTER_IDS[0];
      takenDefaults.add(defaultHover);
      this.selectionState.set(entry.id, {
        hovered: defaultHover,
        locked: null,
      });
    });
  }

  /**
   * Install the resolver used to fetch each shooter's RTT (ms) for the
   * lag-compensation rewind. Called once by MatchmakingManager when the
   * match is created.
   */
  setRttResolver(fn: (playerId: PlayerId) => number): void {
    this.rttForShooter = fn;
  }

  /** Queue a player input to be processed on the next tick. */
  queueInput(playerId: PlayerId, input: PlayerInput): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (input.sequenceNumber <= player.lastProcessedInput) return;

    if (this.phase !== MatchPhase.ACTIVE) {
      player.lastProcessedInput = input.sequenceNumber;
      player.aimAngle = input.aimAngle;
      return;
    }

    // Sequence validation lives in the queue; acks advance only during update.
    const queue = this.inputQueues.get(playerId);
    if (!queue) return;

    queue.push(input);
  }

  /**
   * Validate a requested battle cry against authoritative match state.
   * Returns the narrowed shared id only when the caller may broadcast it.
   */
  tryTaunt(playerId: PlayerId, value: unknown): TauntId | null {
    if (this.phase !== MatchPhase.ACTIVE || !isTauntId(value)) return null;
    const player = this.players.get(playerId);
    if (!player || player.isDead || (this.tauntCooldowns.get(playerId) ?? 0) > 0) {
      return null;
    }
    this.tauntCooldowns.set(playerId, TAUNT.COOLDOWN_SECONDS);
    return value;
  }

  /** Install one approved signature cry for a server-controlled personality. */
  registerAutonomousTaunt(playerId: PlayerId, tauntId: TauntId): void {
    if (!this.players.has(playerId)) return;
    this.autonomousTaunts.set(playerId, tauntId);
  }

  /**
   * Let the nearest available personality answer a living human challenge.
   * Distance and player id provide deterministic selection; a responder on
   * cooldown yields to the next candidate instead of silencing the crew.
   */
  tryAutonomousTauntResponse(challengerId: PlayerId): AutonomousTauntEvent | null {
    const challenger = this.players.get(challengerId);
    if (!challenger || challenger.isDead || this.autonomousTaunts.has(challengerId)) return null;

    const candidates = [...this.autonomousTaunts.entries()].sort(([leftId], [rightId]) => {
      const left = this.players.get(leftId);
      const right = this.players.get(rightId);
      const leftDistance = left
        ? Math.hypot(
            left.position.x - challenger.position.x,
            left.position.y - challenger.position.y,
          )
        : Number.POSITIVE_INFINITY;
      const rightDistance = right
        ? Math.hypot(
            right.position.x - challenger.position.x,
            right.position.y - challenger.position.y,
          )
        : Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance || leftId.localeCompare(rightId);
    });

    for (const [playerId, tauntId] of candidates) {
      const accepted = this.tryTaunt(playerId, tauntId);
      if (accepted) return { playerId, tauntId: accepted };
    }
    return null;
  }

  /**
   * Start the countdown phase. Called by updateCharacterSelect once both
   * players have locked (or the select timer has expired and any
   * unlocked players have been auto-locked). Every player must have a
   * non-null `characterId` by the time we get here — assert it loudly so
   * a logic bug in select-completion doesn't silently produce a match
   * with unset characters.
   */
  startCountdown(): void {
    if (this.phase !== MatchPhase.CHARACTER_SELECT && this.phase !== MatchPhase.WAITING) return;
    for (const [id, player] of this.players) {
      if (player.characterId === null) {
        logger.error(
          { matchId: this.matchId, playerId: id },
          'startCountdown called with player.characterId still null',
        );
      }
    }
    this.phase = MatchPhase.COUNTDOWN;
    this.countdownTimer = MATCH.COUNTDOWN_DURATION;
  }

  /** Main per-tick update. dt is in seconds. */
  update(dt: number): void {
    switch (this.phase) {
      case MatchPhase.CHARACTER_SELECT:
        this.updateCharacterSelect(dt);
        break;
      case MatchPhase.COUNTDOWN:
        this.updateCountdown(dt);
        break;
      case MatchPhase.ACTIVE:
        this.updateTauntCooldowns(dt);
        this.updateActive(dt);
        break;
      default:
        break;
    }
  }

  private updateTauntCooldowns(dt: number): void {
    for (const [playerId, remaining] of this.tauntCooldowns) {
      const next = remaining - dt;
      if (next <= 0) this.tauntCooldowns.delete(playerId);
      else this.tauntCooldowns.set(playerId, next);
    }
  }

  /**
   * Tick the character-select phase. Transitions to COUNTDOWN once every
   * player has locked, OR once the select timer hits zero (unlocked
   * players are auto-locked onto their current hover, falling back to
   * CHARACTER_IDS[0] if somehow nothing is hovered). On transition,
   * commits the locked character onto each player's persistent
   * playerState.characterId.
   */
  updateCharacterSelect(dt: number): void {
    this.selectTimer -= dt;

    let allLocked = true;
    for (const sel of this.selectionState.values()) {
      if (sel.locked === null) {
        allLocked = false;
        break;
      }
    }

    const timedOut = this.selectTimer <= 0;
    if (!allLocked && !timedOut) return;

    if (timedOut) {
      this.selectTimer = 0;
      for (const sel of this.selectionState.values()) {
        if (sel.locked === null) {
          sel.locked = sel.hovered ?? CHARACTER_IDS[0];
        }
      }
    }

    // Commit locks onto persistent player state.
    for (const [playerId, sel] of this.selectionState) {
      const player = this.players.get(playerId);
      if (!player) continue;
      // sel.locked is non-null here: either the all-locked branch made it so,
      // or the timeout branch just auto-locked any stragglers.
      player.characterId = sel.locked;
      // Stat identity: the character's HP pool replaces the pre-select
      // baseline. This runs before ACTIVE, so no mutator (low_health)
      // can have touched maxHealth yet.
      player.maxHealth = characterMaxHealth(player.characterId);
      player.health = player.maxHealth;
      this.applyGauntletSpawnBoons(player);
    }

    this.startCountdown();
  }

  /**
   * Update a player's hovered character during CHARACTER_SELECT. Silently
   * ignored if the match isn't in select, the player isn't in this match,
   * or the requested character is already locked by someone else (the
   * server's broadcast will reflect the actual state).
   */
  setHover(playerId: PlayerId, characterId: CharacterId): void {
    if (this.phase !== MatchPhase.CHARACTER_SELECT) return;
    const sel = this.selectionState.get(playerId);
    if (!sel) return;
    // Reject hovers onto a character another player has already locked.
    for (const [otherId, otherSel] of this.selectionState) {
      if (otherId === playerId) continue;
      if (otherSel.locked === characterId) return;
    }
    sel.hovered = characterId;
  }

  /**
   * Lock a player onto a character during CHARACTER_SELECT. Silently
   * ignored if the match isn't in select, the player isn't in this match,
   * the player has already locked, or the character is already locked by
   * another player. Auto-snaps any other player whose hover matches the
   * just-locked character to a different available character so the UI
   * never shows two players hovering the same locked option.
   */
  setLock(playerId: PlayerId, characterId: CharacterId): void {
    if (this.phase !== MatchPhase.CHARACTER_SELECT) return;
    const sel = this.selectionState.get(playerId);
    if (!sel) return;
    if (sel.locked !== null) return;
    if (this.battleRoyaleLifecycle === null) {
      for (const [otherId, otherSel] of this.selectionState) {
        if (otherId === playerId) continue;
        if (otherSel.locked === characterId) return;
      }
    }

    sel.locked = characterId;
    sel.hovered = characterId;

    // Eight solo slots can exceed the fighter roster. Battle Royale retains
    // the persisted fighter identity without importing standard draft locks.
    if (this.battleRoyaleLifecycle !== null) return;

    // Auto-snap any other player whose hover collides with the new lock.
    for (const [otherId, otherSel] of this.selectionState) {
      if (otherId === playerId) continue;
      if (otherSel.locked !== null) continue;
      if (otherSel.hovered !== characterId) continue;
      // Find the first character not currently locked by anyone.
      const taken = new Set<CharacterId>();
      for (const s of this.selectionState.values()) {
        if (s.locked !== null) taken.add(s.locked);
      }
      const fallback = CHARACTER_IDS.find((c) => !taken.has(c)) ?? CHARACTER_IDS[0];
      otherSel.hovered = fallback;
    }
  }

  /**
   * Build the per-tick character-select state message from the selection
   * map. The matchmaking manager broadcasts this in place of gameState
   * while the match is in CHARACTER_SELECT.
   */
  getSelectStateMessage(): ServerCharacterSelectStateMessage {
    const selections: ServerCharacterSelectStateMessage['selections'] = [];
    for (const [playerId, sel] of this.selectionState) {
      const player = this.players.get(playerId);
      selections.push({
        playerId,
        nickname: player?.nickname ?? '',
        hoveredCharacterId: sel.hovered,
        lockedCharacterId: sel.locked,
      });
    }
    return {
      type: 'server:characterSelectState',
      selections,
      timeRemainingMs: Math.max(0, this.selectTimer * 1000),
    };
  }

  /** Record a kill event. */
  onKill(killerId: PlayerId, victimId: PlayerId, weapon: KillWeapon): void {
    const victimWasEliminated = this.players.get(victimId)?.isDead ?? true;
    const isOpponentKill = killerId !== victimId;
    const assist =
      isOpponentKill && this.tracksRumbleAssists
        ? this.rumbleAssistTracker.resolveAssist(
            killerId,
            victimId,
            this.connectedPlayers,
            this.getElapsedSeconds(),
          )
        : null;
    if (!isOpponentKill && this.tracksRumbleAssists) {
      this.rumbleAssistTracker.clearVictim(victimId);
    }
    const victimStreakEnded = this.stats.getCurrentStreak(victimId);
    const isRevenge = isOpponentKill && this.lastKillerByVictim.get(killerId) === victimId;
    const killerAtKill = this.players.get(killerId);
    const isPosthumous = isOpponentKill && (killerAtKill?.isDead ?? false);
    const clutchHealth =
      isOpponentKill &&
      !isPosthumous &&
      killerAtKill &&
      killerAtKill.health > 0 &&
      killerAtKill.armor <= 0 &&
      killerAtKill.health <= killerAtKill.maxHealth * COMBAT_MEDALS.CLUTCH_HEALTH_FRACTION
        ? killerAtKill.health
        : undefined;
    const isFirstBlood = isOpponentKill && !this.firstBloodClaimed;
    let rapidKillCount = 0;
    if (isOpponentKill) {
      this.firstBloodClaimed = true;
      const now = this.getElapsedSeconds();
      const previous = this.rapidKillsByPlayer.get(killerId);
      rapidKillCount =
        previous && now - previous.lastKillAtSeconds <= COMBAT_MEDALS.RAPID_KILL_WINDOW_SECONDS
          ? previous.count + 1
          : 1;
      this.rapidKillsByPlayer.set(killerId, {
        lastKillAtSeconds: now,
        count: rapidKillCount,
      });
    }
    this.stats.recordKill(killerId, victimId, weapon);
    if (assist) this.stats.recordAssist(assist.playerId);
    const killerStreak = isOpponentKill ? this.stats.getCurrentStreak(killerId) : 0;
    this.stats.recordDeath(victimId);
    if (isOpponentKill) this.lastKillerByVictim.set(victimId, killerId);

    this.gameMode.onKill(this, killerId, victimId, weapon);

    // Blood Rush rewards living aggression, not suicides or delayed
    // posthumous explosives. Refreshing instead of stacking the duration
    // keeps rapid chains readable and prevents an unbounded speed bank.
    if (isOpponentKill && !isPosthumous && this.mutatorActive('blood_rush') && killerAtKill) {
      killerAtKill.secondWindTimer = MUTATORS.BLOOD_RUSH_DURATION_SECONDS;
    }

    // Kill Salvage rewards a living, direct follow-through. Posthumous
    // explosives cannot refill a corpse, and mode-owned grenade bans stay
    // authoritative even when the run build includes the boon.
    if (
      isOpponentKill &&
      !isPosthumous &&
      killerAtKill &&
      this.hasGauntletBoon(killerId, 'kill_salvage')
    ) {
      killerAtKill.health = Math.min(
        killerAtKill.maxHealth,
        killerAtKill.health + PRACTICE_GAUNTLET.BOON_KILL_SALVAGE_HEALTH,
      );
      if (!(this.gameMode.areGrenadesDisabled?.(this, killerAtKill) ?? false)) {
        killerAtKill.grenades = Math.min(
          GRENADE.MAX_COUNT,
          killerAtKill.grenades + PRACTICE_GAUNTLET.BOON_KILL_SALVAGE_GRENADES,
        );
      }
    }

    // Sudden death: the first kill decides the match. checkMatchEnd ends
    // it later this same tick, so the victim never sits dead-unrespawnable
    // for more than one tick.
    if (this.isOvertime && this.overtimeWinnerId === null && killerId !== victimId) {
      this.overtimeWinnerId = killerId;
      this.overtimeWinnerTeamId = this.getTeamId(killerId);
    }

    const victim = this.players.get(victimId);
    if (victim) {
      victim.isDead = true;
      victim.respawnTimer = RESPAWN.DELAY;
      victim.deaths++;
      this.cancelActiveAbility(victim);
      this.spawnLastLaughBomb(victim);
      this.dropPowerWeapon(victim);
      if (!victimWasEliminated) {
        this.battleRoyaleLifecycle?.recordElimination(
          victimId,
          'combat',
          this.battleRoyaleSimulationStep,
        );
      }
    }

    // Reward the killer with 50% of their max health (no overheal). Skip
    // suicide — getting credit for your own death shouldn't refill you.
    if (killerId !== victimId) {
      const killer = this.players.get(killerId);
      if (killer && !killer.isDead) {
        killer.health = Math.min(killer.maxHealth, killer.health + killer.maxHealth * 0.5);
      }
    }

    // Cancel any in-flight burst / fire-cooldown for the killed player and
    // restore the rifle slot after the carried special weapon has spilled.
    this.pendingBursts.delete(victimId);
    this.fireCooldownTimers.delete(victimId);
    if (victim && victim.weaponId !== 'rifle') {
      victim.weaponId = 'rifle';
      victim.weaponInstance = undefined;
      victim.specialAmmo = 0;
      victim.specialReserve = 0;
    }

    const entry: KillFeedEntry = {
      killerId,
      victimId,
      weapon,
      timestamp: Date.now(),
      killerStreak,
      victimStreakEnded,
      isRevenge,
      isFirstBlood,
      rapidKillCount,
      isPosthumous,
      clutchHealth,
      ...(assist ? { assistId: assist.playerId, assistDamage: assist.damage } : {}),
    };
    this.killFeed.push(entry);
    this.tickKillFeedEntries.push(entry);

    const autonomousTaunt = this.autonomousTaunts.get(killerId);
    if (autonomousTaunt && !this.autonomousTaunts.has(victimId)) {
      const accepted = this.tryTaunt(killerId, autonomousTaunt);
      if (accepted) this.tickAutonomousTaunts.push({ playerId: killerId, tauntId: accepted });
    }
  }

  /** Record that a player has disconnected. */
  onPlayerDisconnect(playerId: PlayerId, eliminate = false): void {
    this.connectedPlayers.delete(playerId);
    if (this.tracksRumbleAssists) this.rumbleAssistTracker.removePlayer(playerId);
    if ((!eliminate && this.battleRoyaleLifecycle === null) || this.phase !== MatchPhase.ACTIVE)
      return;
    const player = this.players.get(playerId);
    if (!player) return;
    const wasEliminated = player.isDead || this.battleRoyaleLifecycle?.isEliminated(playerId);
    this.departedPlayerIds.add(playerId);
    player.isDead = true;
    player.health = 0;
    player.respawnTimer = 0;
    // Every mode score starts at zero or above. A leaver can no longer win
    // a timed Rumble even if they departed while leading.
    if (this.battleRoyaleLifecycle === null) player.score = -1;
    if (!wasEliminated) {
      this.battleRoyaleLifecycle?.recordElimination(
        playerId,
        'departure',
        this.battleRoyaleSimulationStep,
      );
    }
    this.inputQueues.get(playerId)?.drain();
  }

  getConnectedPlayerIds(): PlayerId[] {
    return [...this.connectedPlayers];
  }

  getDepartedPlayerIds(): PlayerId[] {
    return [...this.departedPlayerIds];
  }

  /** Check if the match should end, and if so, transition to ENDED. */
  checkMatchEnd(): boolean {
    if (this.phase !== MatchPhase.ACTIVE) return false;

    if (this.battleRoyaleLifecycle !== null) {
      if (this.battleRoyaleLifecycle.resolve(this.players) === null) return false;
      this.phase = MatchPhase.ENDED;
      return true;
    }

    let shouldEnd = false;

    if (this.isOvertime && this.overtimeWinnerId !== null) {
      // Sudden death resolved — first kill wins, immediately.
      shouldEnd = true;
    } else if (this.gameMode.isMatchOver(this)) {
      // Game mode says it's over (score target reached or time out). A
      // genuine tie gets ONE shot at sudden-death overtime instead of
      // ending; a tie that survives overtime ends as a true draw.
      if (
        !this.isOvertime &&
        this.players.size > 1 &&
        this.gameMode.determineWinner(this) === null &&
        [...this.players.values()].filter((player) => this.canPlayerRespawn(player)).length > 1
      ) {
        this.enterOvertime();
      } else {
        shouldEnd = true;
      }
    } else if (this.connectedPlayers.size <= 1 && this.players.size > 1) {
      // Only one player still connected: the match ends as a forfeit and
      // the win goes to whoever stayed, regardless of the scoreboard —
      // otherwise a leaver who was ahead would bank a (now persistent)
      // win, and the player who stuck around would eat a loss.
      shouldEnd = true;
      const remaining = [...this.connectedPlayers];
      this.forfeitWinnerId = remaining.length === 1 ? remaining[0] : null;
    }

    if (shouldEnd) {
      this.phase = MatchPhase.ENDED;
      return true;
    }
    return false;
  }

  /**
   * Enter sudden-death overtime: reset the clock to OVERTIME.DURATION and
   * give everyone a fresh single life — full health, rifle, fresh spawn.
   * Respawning everyone (dead players included) keeps sudden death fair:
   * a player who happened to be mid-respawn at the tie moment would
   * otherwise start overtime with no life to play.
   */
  private enterOvertime(): void {
    this.isOvertime = true;
    this.regulationElapsedAtOvertime = this.timeLimitSeconds - this.matchTimer;
    this.matchTimer = OVERTIME.DURATION;
    for (const [playerId, player] of this.players) {
      if (!this.connectedPlayers.has(playerId)) {
        player.isDead = true;
        player.respawnTimer = 0;
        continue;
      }
      if (this.canPlayerRespawn(player)) {
        this.respawnPlayer(player);
      } else {
        player.isDead = true;
        player.respawnTimer = 0;
      }
    }
    // Nothing from regulation may decide the duel: no in-flight bursts,
    // fire cooldowns, live grenades, or thrown axes carry over.
    this.pendingBursts.clear();
    this.fireCooldownTimers.clear();
    this.combatManager.clearGrenades();
    this.combatManager.clearAxes();
    this.combatManager.clearRockets();
    this.pickupManager.removeScavengerRushDrops();
    this._tickOvertimeStart = { overtimeEndsInMs: OVERTIME.DURATION * 1000 };
    logger.info({ matchId: this.matchId }, 'Match tied — entering sudden-death overtime');
  }

  /** Build the match result. */
  getResult(): MatchResult {
    const result = this.gameMode.getResults(this);
    const battleRoyale = this.battleRoyaleLifecycle?.resolve(this.players) ?? null;
    if (battleRoyale) {
      result.winnerId = battleRoyale.winnerId;
      result.matchKind = 'battle_royale';
      result.battleRoyale = {
        placements: battleRoyale.placements,
        terminalReason: battleRoyale.terminalReason,
        actions: battleRoyale.actions,
      };
      result.rivalry = null;
      result.rivalrySet = null;
      result.nextMapName = null;
      result.nextGameMode = null;
      result.wentToOvertime = false;
      return result;
    }
    if (this.overtimeWinnerId !== null) {
      result.winnerId = this.overtimeWinnerId;
    }
    if (this.forfeitWinnerId !== null) {
      result.winnerId = this.forfeitWinnerId;
    }
    if (this.playerTeams.size > 0) {
      result.winnerId = null;
      result.winnerTeamId =
        this.overtimeWinnerTeamId ??
        (this.forfeitWinnerId ? this.getTeamId(this.forfeitWinnerId) : this.determineWinningTeam());
      result.playerTeams = Object.fromEntries(this.playerTeams) as Record<PlayerId, TeamId>;
      result.teamScores = Object.fromEntries(
        this.getTeamIds().map((teamId) => [teamId, this.getTeamScore(teamId)]),
      ) as Record<TeamId, number>;
    }
    result.contract = {
      ...this.getContractHudState(),
      careerCompletions: {},
    };
    return result;
  }

  /** Current authoritative progress for the round's shared side objective. */
  getContractHudState(): MatchContractHudState {
    const players = [...this.players.keys()].map((playerId) => {
      const progress = Math.min(this.contractDefinition.target, this.contractProgressFor(playerId));
      return {
        playerId,
        progress,
        completed: progress >= this.contractDefinition.target,
      };
    });
    return {
      id: this.contractDefinition.id,
      title: this.contractDefinition.title,
      objective: this.contractDefinition.objective,
      target: this.contractDefinition.target,
      players,
    };
  }

  private contractProgressFor(playerId: PlayerId): number {
    const stats = this.stats.getStats(playerId);
    switch (this.contractDefinition.metric) {
      case 'hits':
        return stats.shotsHit;
      case 'damage':
        return Math.floor(stats.damageDealt);
      case 'streak':
        return stats.longestKillStreak;
      case 'distance_tiles':
        return Math.floor(stats.distanceTraveled / this.mapManager.getMapData().tileSize);
      case 'barrels':
        return this.barrelDetonationsByPlayer.get(playerId) ?? 0;
      case 'overcharges':
        return this.overchargesByPlayer.get(playerId) ?? 0;
      case 'hill_seconds':
        return Math.floor(stats.hillSeconds);
      case 'confirmed_tags':
        return this.gameModeType === GameModeType.KILL_CONFIRMED
          ? (this.players.get(playerId)?.score ?? 0)
          : 0;
      case 'core_seconds':
        return this.gameModeType === GameModeType.CORE_RUN
          ? (this.players.get(playerId)?.score ?? 0)
          : 0;
    }
  }

  getKillFeed(): KillFeedEntry[] {
    return [...this.killFeed];
  }

  getKillTarget(): number {
    return this.playerTeams.size > 0 ? CREW_BATTLE.KILL_TARGET : MATCH.KILL_TARGET;
  }

  getTeamId(playerId: PlayerId): TeamId | null {
    return this.playerTeams.get(playerId) ?? null;
  }

  getTeamIds(): TeamId[] {
    return [...new Set(this.playerTeams.values())];
  }

  getTeamAssignments(): ReadonlyMap<PlayerId, TeamId> {
    return new Map(this.playerTeams);
  }

  getTeamScore(teamId: TeamId): number {
    let score = 0;
    for (const [playerId, player] of this.players) {
      if (this.playerTeams.get(playerId) === teamId) score += player.score;
    }
    return score;
  }

  areTeammates(leftId: PlayerId, rightId: PlayerId): boolean {
    if (leftId === rightId) return false;
    const leftTeam = this.playerTeams.get(leftId);
    return leftTeam !== undefined && leftTeam === this.playerTeams.get(rightId);
  }

  private determineWinningTeam(): TeamId | null {
    const ranked = this.getTeamIds()
      .map((teamId) => ({ teamId, score: this.getTeamScore(teamId) }))
      .sort((left, right) => right.score - left.score);
    if (ranked.length === 0) return null;
    return ranked.length > 1 && ranked[0].score === ranked[1].score ? null : ranked[0].teamId;
  }

  getTimeLimit(): number {
    return this.timeLimitSeconds;
  }

  getMapData(): MapData {
    return this.mapManager.getMapData();
  }

  /**
   * Clear a player's pending burst and fire-cooldown timer. Part of
   * MatchContext: modes call it when they swap a player's weapon out from
   * under them (Gun Game rung changes) so stale fire state can't leak
   * onto the new weapon.
   */
  clearWeaponTransients(playerId: PlayerId): void {
    this.pendingBursts.delete(playerId);
    this.fireCooldownTimers.delete(playerId);
  }

  /**
   * Seconds of play so far, overtime included. matchTimer alone can't
   * express this — entering overtime resets it to OVERTIME.DURATION.
   */
  getElapsedSeconds(): number {
    return this.isOvertime
      ? this.regulationElapsedAtOvertime + (OVERTIME.DURATION - this.matchTimer)
      : this.timeLimitSeconds - this.matchTimer;
  }

  /**
   * King of the Hill HUD state for gameState broadcasts. Null for modes
   * without a hill, during overtime (the hill is retired for sudden
   * death), and outside ACTIVE — gameState also broadcasts during
   * COUNTDOWN, before the mode's onStart has initialized its hills.
   */
  getKothHudState(): KothHudState | null {
    if (this.isOvertime || this.phase !== MatchPhase.ACTIVE) return null;
    return this.gameMode.getKothState?.(this) ?? null;
  }

  /** Active Kill Confirmed tags for snapshots and bot objective routing. */
  getKillConfirmedTags(): readonly KillConfirmedTagState[] {
    if (this.isOvertime || this.phase !== MatchPhase.ACTIVE) return [];
    return this.gameMode.getKillConfirmedTags?.(this) ?? [];
  }

  getKillConfirmedCollections(): readonly KillConfirmedCollection[] {
    return this.gameMode.getKillConfirmedCollections?.(this) ?? [];
  }

  /** Active Core Run objective for snapshots and Practice bot routing. */
  getCoreRunState(): CoreRunState | null {
    if (this.isOvertime || this.phase !== MatchPhase.ACTIVE) return null;
    return this.gameMode.getCoreRunState?.(this) ?? null;
  }

  /** Active Bounty Hunt target for snapshots and Practice bot routing. */
  getBountyHuntState(): BountyHuntState | null {
    if (this.isOvertime || this.phase !== MatchPhase.ACTIVE) return null;
    return this.gameMode.getBountyHuntState?.(this) ?? null;
  }

  /** Current group-match leaders; omitted for duels and outside live play. */
  getRumbleLeadState(): RumbleLeadState | null {
    if (!this.tracksRumbleLead || this.phase !== MatchPhase.ACTIVE || !this.rumbleLeadState) {
      return null;
    }
    return {
      leaderIds: [...this.rumbleLeadState.leaderIds],
      sequence: this.rumbleLeadState.sequence,
    };
  }

  private updateRumbleLeadState(): void {
    if (!this.tracksRumbleLead) return;

    const contenders = [...this.connectedPlayers]
      .map((playerId) => this.players.get(playerId))
      .filter((player): player is PlayerState => player !== undefined);
    if (contenders.length < 2) return;

    const highScore = Math.max(...contenders.map((player) => player.score));
    const leaderIds = contenders
      .filter((player) => player.score === highScore)
      .map((player) => player.id)
      .sort();
    const previous = this.rumbleLeadState;
    if (!previous) {
      this.rumbleLeadState = { leaderIds, sequence: 0 };
      return;
    }
    if (
      previous.leaderIds.length === leaderIds.length &&
      previous.leaderIds.every((playerId, index) => playerId === leaderIds[index])
    ) {
      return;
    }
    this.rumbleLeadState = {
      leaderIds,
      sequence: previous.sequence + 1,
    };
  }

  getWastelandWarpState(): WastelandWarpState | null {
    if (
      !this.mutatorActive('wasteland_warp') ||
      this.isOvertime ||
      this.phase !== MatchPhase.ACTIVE
    )
      return null;
    return {
      secondsUntilSwap: Math.max(0, this.wastelandWarpTimer),
      sequence: this.wastelandWarpSequence,
    };
  }

  getRadiationStormState(): RadiationStormState | null {
    if (
      !this.mutatorActive('radiation_storm') ||
      this.isOvertime ||
      this.phase !== MatchPhase.ACTIVE
    )
      return null;
    return {
      center: { ...this.radiationStormCenter },
      radius: radiationStormRadius(this.radiationStormInitialRadius, this.radiationStormElapsed),
      shrinkSecondsRemaining: Math.max(
        0,
        MUTATORS.RADIATION_STORM_SHRINK_SECONDS - this.radiationStormElapsed,
      ),
    };
  }

  getScrapstormState(): ScrapstormState | null {
    if (!this.mutatorActive('scrapstorm') || this.isOvertime || this.phase !== MatchPhase.ACTIVE)
      return null;
    return {
      targetPosition: this.scrapstormTargetPosition ? { ...this.scrapstormTargetPosition } : null,
      targetPlayerId: this.scrapstormTargetPlayerId,
      secondsUntilImpact: this.scrapstormTargetPosition ? Math.max(0, this.scrapstormTimer) : null,
      radius: MUTATORS.SCRAPSTORM_RADIUS_PX,
    };
  }

  /**
   * Consume the one-shot overtime announcement generated this tick (if
   * any) for broadcasting. Returns null on subsequent calls.
   */
  consumeTickOvertimeStart(): { overtimeEndsInMs: number } | null {
    const o = this._tickOvertimeStart;
    this._tickOvertimeStart = null;
    return o;
  }

  /** Bullet trails created in the most recent tick, for broadcasting. */
  getTickBulletTrails(): BulletTrail[] {
    return this.tickBulletTrails;
  }

  /** Punch swings resolved in the most recent tick, for broadcasting. */
  getTickPunchEvents(): PunchEvent[] {
    return this.tickPunchEvents;
  }

  /** Kill-feed entries recorded during the most recent tick, for broadcasting. */
  getTickKillFeedEntries(): KillFeedEntry[] {
    return this.tickKillFeedEntries;
  }

  /** Personality-bot cries earned during the most recent simulation tick. */
  getTickAutonomousTaunts(): AutonomousTauntEvent[] {
    return this.tickAutonomousTaunts;
  }

  /** Pickup collections recorded during the most recent tick, for broadcasting. */
  getTickPickupCollections(): Array<{ pickupId: string; playerId: PlayerId }> {
    return this.tickPickupCollections;
  }

  /** Wall tiles destroyed during the most recent tick, for broadcasting. */
  getTickDestroyedTiles(): Array<{ col: number; row: number }> {
    return this.tickDestroyedTiles;
  }

  /** Environmental blasts created in the most recent tick, for transient VFX. */
  getTickBarrelExplosions(): Array<{ x: number; y: number }> {
    return this.tickBarrelExplosions;
  }

  /** Active grenades in flight, for broadcasting. */
  getActiveGrenades(): GrenadeState[] {
    return this.combatManager.getGrenades();
  }

  /** Jack's thrown axes in flight, for broadcasting. */
  getActiveAxes(): AxeState[] {
    return this.combatManager.getAxes();
  }

  /** Battle Royale launcher rounds in flight; always empty in standard formats. */
  getActiveRockets(): RocketState[] {
    return this.combatManager.getRockets();
  }

  /** Mutators currently active, in activation order (empty before the first). */
  get activeMutators(): readonly MutatorId[] {
    return this._activeMutators;
  }

  /** Whether the given mutator has activated in this match. */
  private mutatorActive(mutator: MutatorId): boolean {
    return this._activeMutators.includes(mutator);
  }

  /**
   * Consume the mutator warnings generated this tick for broadcasting.
   * Returns [] on subsequent calls in the same tick. Usually 0 or 1
   * entries; both slots can warn in the same tick in degenerate timings.
   */
  consumeTickMutatorWarnings(): Array<{
    event: MutatorId;
    activatesInMs: number;
    isFinalMinute: boolean;
  }> {
    const w = this._tickMutatorWarnings;
    this._tickMutatorWarnings = [];
    return w;
  }

  /**
   * Consume the mutator starts generated this tick for broadcasting.
   * Returns [] on subsequent calls in the same tick.
   */
  consumeTickMutatorStarts(): Array<{
    event: MutatorId;
    isFinalMinute: boolean;
  }> {
    const s = this._tickMutatorStarts;
    this._tickMutatorStarts = [];
    return s;
  }

  /**
   * Consume the weapon-incoming warnings generated this tick (if any) for
   * broadcasting ("SHOTGUN INCOMING"). Returns [] on subsequent calls in
   * the same tick.
   */
  consumeTickWeaponIncoming(): Array<{
    weaponId: WeaponId;
    landsInMs: number;
  }> {
    const w = this.tickWeaponIncoming;
    this.tickWeaponIncoming = [];
    return w;
  }

  // ──────────────────────────── Private ────────────────────────────

  private updateCountdown(dt: number): void {
    this.countdownTimer -= dt;
    if (this.countdownTimer <= 0) {
      this.countdownTimer = 0;
      this.phase = MatchPhase.ACTIVE;
      this.matchTimer = this.timeLimitSeconds;
      this._matchStartTimeMs = Date.now();
      // Roll the mid-match mutator's activation time now, from the
      // injectable rng so tests can pin it: uniform inside the
      // 40%–70% elapsed window.
      if (this.battleRoyaleLifecycle === null) {
        const windowSpan =
          MUTATORS.MIDMATCH_MAX_ELAPSED_FRACTION - MUTATORS.MIDMATCH_MIN_ELAPSED_FRACTION;
        this.midMatchSlot.activateAtElapsed =
          this.timeLimitSeconds *
          (MUTATORS.MIDMATCH_MIN_ELAPSED_FRACTION + this.rng() * windowSpan);
      }
      this.gameMode.onStart(this);
      // Mode initialization owns opening scores (notably Last Stand lives),
      // so seed the silent baseline only after onStart has finished.
      this.updateRumbleLeadState();
    }
  }

  private updateActive(dt: number): void {
    this.battleRoyaleSimulationStep += 1;
    this.matchTimer -= dt;
    if (this.matchTimer < 0) {
      this.matchTimer = 0;
    }

    // Clear last tick's bullet trails — only trails from THIS tick are
    // broadcast in the next gameState message.
    this.tickBulletTrails = [];
    this.tickPunchEvents = [];
    this.tickKillFeedEntries = [];
    this.tickAutonomousTaunts = [];
    this.tickPickupCollections = [];
    this.tickDestroyedTiles = [];
    this.tickBarrelExplosions = [];

    // Snapshot positions BEFORE this tick's inputs move anyone. A shot
    // that arrives this tick will rewind opponents to the snapshot taken
    // at (now - rtt/2), which lines up with what the shooter saw on
    // their screen when they pulled the trigger. The buffer self-clamps
    // when empty (first tick of the match), so this is safe even before
    // any state is stored.
    this.rewindTickCounter += 1;
    this.lagCompensator.saveCurrentState(this.rewindTickCounter, Date.now(), this.players);

    // No NEW mutator activations during overtime — resetting matchTimer to
    // OVERTIME.DURATION would otherwise re-trip the final-minute
    // thresholds mid-sudden-death. Mutators already active keep running.
    if (!this.isOvertime && this.battleRoyaleLifecycle === null) {
      this.updateMutatorSchedule();
    }

    const grid = this.mapManager.getCollisionGrid();

    // Process movement and player-driven actions for each player.
    for (const [playerId, player] of this.players) {
      const queue = this.inputQueues.get(playerId);
      if (!queue) continue;

      if (player.isDead) {
        const ignoredInputs = queue.drain();
        const lastIgnored = ignoredInputs[ignoredInputs.length - 1];
        if (lastIgnored) {
          player.lastProcessedInput = lastIgnored.sequenceNumber;
          player.aimAngle = lastIgnored.aimAngle;
        }
        continue;
      }

      const inputs = queue.drain(SERVER.MAX_INPUTS_PER_PLAYER_PER_TICK);
      if (inputs.length === 0) continue;

      // Per-player because temporary mutator boosts ride on the player's own
      // countdown and the character speed multiplier is a per-player
      // stat identity. Constant across this tick's queued inputs — the
      // timer decrements later in the tick, matching the client, which
      // predicts each input with the timer value from the last snapshot.
      const movementModifiers = playerMovementModifiers(
        player.characterId,
        this._activeMutators,
        player.secondWindTimer,
        player.spawnRushTimer ?? 0,
      );
      const grenadesOnly = this.mutatorActive('grenades_only');
      const infiniteAmmo = this.mutatorActive('infinite_ammo');
      const fistsOnly = this.mutatorActive('fists_only');

      for (const input of inputs) {
        // Frost Wizard freeze: full action lockout while frozenTimer > 0.
        // Aim still updates so the cosmetic rotation tracks the cursor, but
        // ability activation, fire, throw, detonate, reload, and movement
        // are all suppressed. Sits above the Bruce-locked check so a Bruce
        // who gets frozen mid-breath also stops re-aiming his cone.
        if (player.frozenTimer > 0) {
          player.aimAngle = input.aimAngle;
          player.velocity = { x: 0, y: 0 };
          player.isSprinting = false;
          player.lastProcessedInput = input.sequenceNumber;
          continue;
        }

        // Spacebar / ability button: try to activate before everything else
        // so the Bruce-locked check below picks up the just-activated state.
        if (
          input.abilityPressed &&
          !(this.gameMode.areAbilitiesDisabled?.(this, player) ?? false)
        ) {
          this.tryActivateAbility(player, input.aimAngle);
        }

        // While Bruce is breathing fire his position and combat actions are
        // pinned, but he can still re-aim mid-cast so the cone sweeps with
        // the cursor. Update aim only and skip the rest of the input.
        const isBruceLocked = player.characterId === 'bruce' && player.abilityActiveSeconds > 0;
        if (isBruceLocked) {
          player.aimAngle = input.aimAngle;
          player.lastProcessedInput = input.sequenceNumber;
          continue;
        }

        // Movement. Each client input represents one fixed simulation tick,
        // so replay queued inputs one at a time with the server tick dt.
        const prevPos = player.position;
        const result = calculateMovement(
          input,
          player.position,
          player.stamina,
          dt,
          grid,
          movementModifiers,
        );
        // Distance stat for the Tourist award: one hypot per processed
        // input, accumulated server-side only (never predicted).
        this.stats.recordDistance(
          playerId,
          Math.hypot(result.newPos.x - prevPos.x, result.newPos.y - prevPos.y),
        );
        player.position = result.newPos;
        player.velocity = result.velocity;
        player.stamina = result.newStamina;
        player.isSprinting =
          input.sprint && (input.moveX !== 0 || input.moveY !== 0) && player.stamina > 0;
        player.aimAngle = input.aimAngle;

        // Reload — gated off during infinite_ammo (mag is always full).
        // Reloads apply to whichever weapon is in hand: special weapons
        // (shotgun/pistol) top their magazine up from reserve, the rifle
        // refills outright. Fists have nothing to reload.
        if (!infiniteAmmo && input.reload && !player.isReloading) {
          if (this.usesSpecialAmmo(player.weaponId)) {
            const held = WEAPONS[player.weaponId];
            if (player.specialAmmo < held.magazineSize && player.specialReserve > 0) {
              player.isReloading = true;
              player.reloadTimer = held.reloadTime;
            }
          } else if (player.weaponId === 'rifle' && player.ammo < WEAPONS.rifle.magazineSize) {
            player.isReloading = true;
            player.reloadTimer = WEAPONS.rifle.reloadTime;
          }
        }

        // Fire on the LMB-release edge, routed by the weapon in hand.
        // During grenades_only — or when the mode gates guns (Gun Game's
        // grenade rung) — all weapon fire is disabled entirely; grenade
        // throws stay live. Checked per input because a kill earlier in
        // this drain can advance the player onto a gated rung.
        const gunsDisabled =
          grenadesOnly || (this.gameMode.areGunsDisabled?.(this, player) ?? false);
        if (!gunsDisabled && input.firePressed) {
          if (player.weaponId === 'launcher') {
            this.tryFireLauncher(player, input, infiniteAmmo);
          } else if (player.weaponId === 'shotgun') {
            this.tryFireShotgun(player, input, grid, infiniteAmmo);
          } else if (player.weaponId === 'punch' || player.weaponId === 'bat') {
            this.tryMelee(player, input, grid, player.weaponId, infiniteAmmo);
          } else {
            this.tryFireHitscan(player, input, grid);
          }
        }

        // Throw grenade (release edge), only if no live grenade for this
        // player and they have at least one grenade in their pouch.
        if (
          !fistsOnly &&
          !(this.gameMode.areGrenadesDisabled?.(this, player) ?? false) &&
          input.throwPressed &&
          player.grenades > 0 &&
          !this.combatManager.getActiveGrenadeFor(playerId)
        ) {
          // Piercing stamps at throw-time and persists for the grenade's
          // lifetime — physics skip wall-bounce and the explosion damages
          // through walls.
          const grenadePiercing =
            player.characterId === 'mighty_man' && player.abilityActiveSeconds > 0;
          this.combatManager.spawnGrenade(
            playerId,
            player.position,
            input.aimAngle,
            grenadePiercing,
            this.mutatorActive('turbo_grenades') ? MUTATORS.TURBO_GRENADES_SPEED_MULTIPLIER : 1,
          );
          player.grenades -= 1;
          this.stats.recordGrenade(playerId);
        }

        // Manual detonation (press edge), only if a live grenade exists.
        if (
          input.detonatePressed &&
          !(this.gameMode.areGrenadesDisabled?.(this, player) ?? false)
        ) {
          const active = this.combatManager.getActiveGrenadeFor(playerId);
          if (active) {
            const explosion = this.combatManager.detonateGrenade(
              active.id,
              this.players,
              grid,
              this.canDamagePlayer,
            );
            if (explosion) {
              this.recordExplosion(explosion);
            }
          }
        }

        player.lastProcessedInput = input.sequenceNumber;
      }
    }

    // Advance any pending bursts.
    this.advanceBursts(dt, grid);

    // Tick down per-player fire-cooldown timers (shotgun pump-racking,
    // pistol semi-auto pacing, punch swing recovery).
    for (const [playerId, remaining] of this.fireCooldownTimers) {
      const next = remaining - dt;
      if (next <= 0) {
        this.fireCooldownTimers.delete(playerId);
      } else {
        this.fireCooldownTimers.set(playerId, next);
      }
    }

    // Bruce's fire-breath: per-tick segment hit check while abilityActiveSeconds
    // > 0. Runs BEFORE tickAbilities so the activation tick fires once before
    // the first decrement.
    this.tickFireBreath();

    // Decrement ability active/cooldown timers for all players.
    this.tickAbilities(dt);

    // Update grenades (movement + safety fuse + explosions)
    const { explosions } = this.combatManager.updateGrenades(
      dt,
      this.players,
      grid,
      this.canDamagePlayer,
    );
    for (const explosion of explosions) {
      this.recordExplosion(explosion);
    }

    // Advance Jack's thrown axes and book their hits. Damage was already
    // applied inside updateAxes (through applyDamage, so Iron Hide is
    // honored); here we own the kill/stat/vampire bookkeeping, mirroring
    // the explosion path. Axes never hit their thrower, so no suicide
    // handling is needed.
    const { hits: axeHits } = this.combatManager.updateAxes(
      dt,
      this.players,
      grid,
      this.hitValidationScale(),
      this.canDamagePlayer,
    );
    for (const hit of axeHits) {
      this.recordAttributedDamage(hit.throwerId, hit.victimId, hit.damage);
      this.applyVampireHeal(hit.throwerId, hit.victimId, hit.damage);
      if (hit.killed) {
        this.onKill(hit.throwerId, hit.victimId, 'axe');
      }
    }

    const { explosions: rocketExplosions } = this.combatManager.updateRockets(
      dt,
      this.players,
      grid,
      this.hitValidationScale(),
      this.canDamagePlayer,
    );
    for (const explosion of rocketExplosions) {
      this.tickBarrelExplosions.push({ ...explosion.position });
      this.recordExplosion(explosion, 'gun');
    }

    // Reload timers — short-circuited under infinite_ammo so the mag is
    // never empty and reloads can never start. Infinite ammo applies to
    // whichever weapon is in hand: any special-weapon holder keeps a
    // full mag (and therefore never auto-reverts) for the rest of the
    // match. The punch has no ammo, so nothing to top up.
    const infiniteAmmoActive = this.mutatorActive('infinite_ammo');
    for (const player of this.players.values()) {
      if (infiniteAmmoActive) {
        player.isReloading = false;
        player.reloadTimer = 0;
        player.ammo = WEAPONS.rifle.magazineSize;
        if (this.usesSpecialAmmo(player.weaponId)) {
          player.specialAmmo = WEAPONS[player.weaponId].magazineSize;
        }
        continue;
      }
      if (player.isReloading) {
        player.reloadTimer -= dt;
        if (player.reloadTimer <= 0) {
          player.isReloading = false;
          player.reloadTimer = 0;
          if (this.usesSpecialAmmo(player.weaponId)) {
            const take = Math.min(
              WEAPONS[player.weaponId].magazineSize - player.specialAmmo,
              player.specialReserve,
            );
            player.specialAmmo += take;
            player.specialReserve -= take;
          } else {
            player.ammo = WEAPONS.rifle.magazineSize;
          }
        }
      }
    }

    // Grenade auto-refill (single-slot regen timer). grenades_only and
    // turbo_grenades each grant regen on their own cadence; if both are
    // active the faster interval wins.
    const regenIntervals: number[] = [];
    if (this.mutatorActive('grenades_only')) {
      regenIntervals.push(MUTATORS.GRENADES_ONLY_REFILL_SECONDS);
    }
    if (this.mutatorActive('turbo_grenades')) {
      regenIntervals.push(MUTATORS.TURBO_GRENADES_REFILL_SECONDS);
    }
    if (regenIntervals.length > 0) {
      const regenInterval = Math.min(...regenIntervals);
      for (const player of this.players.values()) {
        if (player.isDead) continue;
        if (player.grenades >= GRENADE.MAX_COUNT) {
          player.grenadeRegenSeconds = 0;
          continue;
        }
        player.grenadeRegenSeconds += dt;
        if (player.grenadeRegenSeconds >= regenInterval) {
          player.grenades = Math.min(GRENADE.MAX_COUNT, player.grenades + 1);
          player.grenadeRegenSeconds = 0;
        }
      }
    }

    // Update respawn timers for dead players. Sudden-death overtime is
    // single-life: the timer freezes and nobody comes back (in practice
    // the first overtime death ends the match this same tick anyway).
    for (const [playerId, player] of this.players) {
      if (player.isDead && !this.isOvertime) {
        if (!this.connectedPlayers.has(playerId)) {
          player.respawnTimer = 0;
        } else if (!this.canPlayerRespawn(player)) {
          // Eliminated stock-lives players remain spectators. Zero the timer
          // so snapshots never imply that a respawn is still pending.
          player.respawnTimer = 0;
        } else if (player.respawnTimer > 0) {
          player.respawnTimer -= dt;
          if (player.respawnTimer <= 0) {
            this.respawnPlayer(player);
          }
        }
      }
      // Tick invulnerability timer
      if (player.invulnerableTimer > 0) {
        player.invulnerableTimer -= dt;
        if (player.invulnerableTimer < 0) {
          player.invulnerableTimer = 0;
        }
      }
      // Tick the Second Wind / Blood Rush speed boost. Runs AFTER this tick's
      // movement consumed the pre-decrement value — mirroring the client,
      // which predicts each input with the timer from the last snapshot.
      if (player.secondWindTimer > 0) {
        player.secondWindTimer = Math.max(0, player.secondWindTimer - dt);
      }
      if ((player.spawnRushTimer ?? 0) > 0) {
        player.spawnRushTimer = Math.max(0, (player.spawnRushTimer ?? 0) - dt);
      }
    }

    // Rotate living fighters before objective/pickup collection so every
    // downstream rule observes the new authoritative positions this tick.
    this.updateWastelandWarp(dt);
    this.updateRadiationStorm(dt);
    this.updateScrapstorm(dt);

    // Update pickups. Weapon pickups about to land generate one-shot
    // "INCOMING" warnings for the HUD banner.
    const weaponAnnouncements = this.pickupManager.update(dt);
    for (const announcement of weaponAnnouncements) {
      this.tickWeaponIncoming.push({
        weaponId: 'shotgun',
        landsInMs: announcement.landsInMs,
      });
    }
    // Spawn after ticking existing pickup lifetimes so a new supply keeps
    // its full authoritative window even if a test or stalled tick is large.
    this.updateScavengerRush(dt);

    // Pickup collection
    for (const player of this.players.values()) {
      if (player.isDead) continue;
      const pickup = this.pickupManager.checkCollection(player.position, {
        width: PLAYER.HITBOX_WIDTH,
        height: PLAYER.HITBOX_HEIGHT,
      });
      if (pickup) {
        const applied = this.pickupManager.applyPickup(pickup, player);
        if (applied) {
          this.pickupManager.collectPickup(pickup.id);
          this.tickPickupCollections.push({
            pickupId: pickup.id,
            playerId: player.id,
          });
          if (pickup.type === PickupType.OVERCHARGE) {
            this.overchargesByPlayer.set(
              player.id,
              (this.overchargesByPlayer.get(player.id) ?? 0) + 1,
            );
          }
          if (
            pickup.type === PickupType.WEAPON_SHOTGUN ||
            pickup.type === PickupType.WEAPON_PISTOL ||
            pickup.type === PickupType.WEAPON_BAT
          ) {
            // Auto-equip side effects that live on Match: stop any rifle
            // burst mid-flight and clear a stale weapon cooldown.
            this.pendingBursts.delete(player.id);
            this.fireCooldownTimers.delete(player.id);
          }
        }
      }
    }

    // Game mode tick
    this.gameMode.onTick(this, dt);

    // One mode-agnostic score read gives every 3+ player match the same live
    // takeover story without teaching the client any scoring rules.
    this.updateRumbleLeadState();

    // Weapon Roulette owns the shared weapon slot after respawns, pickups,
    // and compatible mode hooks. It rotates everyone on the same timer.
    if (this.mutatorActive('weapon_roulette')) {
      this.updateWeaponRoulette(dt);
    }

    // Fists Only is the final loadout authority for compatible modes.
    // Reapply after respawns, pickups, and mode hooks so no one can escape
    // the brawl between snapshots.
    if (this.mutatorActive('fists_only')) {
      this.enforceFistsOnlyLoadouts();
    }

    // Check win conditions
    this.checkMatchEnd();
  }

  /**
   * Advance burst timers and fire any rounds whose interval has elapsed.
   * Cancels a burst if the player runs out of ammo (and starts a reload) or
   * dies mid-burst.
   */
  private advanceBursts(dt: number, grid: ReturnType<MapManager['getCollisionGrid']>): void {
    for (const [playerId, burst] of this.pendingBursts) {
      const player = this.players.get(playerId);
      if (!player || player.isDead) {
        this.pendingBursts.delete(playerId);
        continue;
      }

      const infiniteAmmo = this.mutatorActive('infinite_ammo');
      burst.nextShotIn -= dt;
      // Fire all shots whose timer has elapsed (handles slow ticks gracefully).
      while (burst.nextShotIn <= 0 && burst.shotsRemaining > 0) {
        const availableAmmo = burst.weaponId === 'rifle' ? player.ammo : player.specialAmmo;
        if (!infiniteAmmo && availableAmmo <= 0) {
          // Out of ammo mid-burst: drop remaining shots and start a reload.
          if (!player.isReloading) {
            player.isReloading = true;
            player.reloadTimer = WEAPONS[burst.weaponId].reloadTime;
          }
          burst.shotsRemaining = 0;
          break;
        }

        this.fireOneShot(playerId, burst.lockedAngle, grid, burst.weaponId);
        burst.shotsRemaining -= 1;
        burst.nextShotIn += WEAPONS[burst.weaponId].burstInterval;
      }

      if (burst.shotsRemaining <= 0) {
        this.pendingBursts.delete(playerId);
        this.finishRangedTrigger(player, burst.weaponId);
      }
    }
  }

  /**
   * Whether a weapon rides the special-weapon ammo slot
   * (specialAmmo/specialReserve). The rifle has its own pool and the
   * punch has no ammo at all (magazineSize 0).
   */
  private usesSpecialAmmo(weaponId: WeaponId): boolean {
    return weaponId !== 'rifle' && WEAPONS[weaponId].magazineSize > 0;
  }

  private hasCoherentBattleRoyaleInstance(player: PlayerState, weaponId: WeaponId): boolean {
    return (
      this.battleRoyaleLifecycle !== null &&
      player.weaponId === weaponId &&
      player.weaponInstance?.weaponId === weaponId
    );
  }

  private damageForWeaponInstance(
    player: PlayerState,
    weaponId: WeaponId,
    ordinaryDamage: number,
  ): number {
    if (!this.hasCoherentBattleRoyaleInstance(player, weaponId)) return ordinaryDamage;
    return applyWeaponRarityDamage(ordinaryDamage, player.weaponInstance!.rarity);
  }

  /**
   * Fire the player's single-projectile hitscan weapon (rifle or pistol)
   * on a trigger pull. Refuses while mid-burst, cooling down between
   * semi-auto shots, reloading, or with an empty magazine. The rifle
   * starts its multi-round burst here; semi-auto weapons (burstSize 1)
   * get post-shot handling that mirrors the shotgun blast — pacing
   * cooldown, auto-reload on an empty mag, revert when completely dry.
   */
  private tryFireHitscan(
    player: PlayerState,
    input: PlayerInput,
    grid: ReturnType<MapManager['getCollisionGrid']>,
  ): void {
    const weaponId = player.weaponId;
    if (
      weaponId !== 'rifle' &&
      weaponId !== 'pistol' &&
      weaponId !== 'smg' &&
      weaponId !== 'sniper_rifle'
    )
      return;
    if (
      (weaponId === 'smg' || weaponId === 'sniper_rifle') &&
      !this.hasCoherentBattleRoyaleInstance(player, weaponId)
    )
      return;
    const weapon = WEAPONS[weaponId];

    const coolingDown = (this.fireCooldownTimers.get(player.id) ?? 0) > 0;
    const alreadyBursting = this.pendingBursts.has(player.id);
    const magazine = weaponId === 'rifle' ? player.ammo : player.specialAmmo;
    if (coolingDown || alreadyBursting || player.isReloading || magazine <= 0) return;

    this.fireOneShot(player.id, input.aimAngle, grid, weaponId);

    if (weapon.burstSize > 1) {
      // Queue the remaining shots of the burst (rifle).
      if (weaponId !== 'rifle' && weaponId !== 'smg') return;
      this.pendingBursts.set(player.id, {
        weaponId,
        shotsRemaining: weapon.burstSize - 1,
        nextShotIn: weapon.burstInterval,
        lockedAngle: input.aimAngle,
      });
      return;
    }

    this.finishRangedTrigger(player, weaponId);
  }

  private finishRangedTrigger(
    player: PlayerState,
    weaponId: 'rifle' | 'pistol' | 'smg' | 'sniper_rifle',
  ): void {
    if (weaponId === 'rifle') return;
    const weapon = WEAPONS[weaponId];
    if (player.specialAmmo > 0) {
      // Rounds left in the mag — pace the next trigger pull.
      this.fireCooldownTimers.set(player.id, weapon.fireCooldown);
    } else if (player.specialReserve > 0) {
      // Mag empty, reserve remains — auto-reload (no switch key exists,
      // so the player should never be stuck holding an unusable weapon).
      player.isReloading = true;
      player.reloadTimer = weapon.reloadTime;
    } else if (!this.mutatorActive('infinite_ammo') && !this.mutatorActive('weapon_roulette')) {
      // Completely dry: the special gun vanishes and the rifle comes back out.
      this.revertToRifle(player);
    }
  }

  private tryFireLauncher(player: PlayerState, input: PlayerInput, infiniteAmmo: boolean): void {
    if (!this.hasCoherentBattleRoyaleInstance(player, 'launcher')) return;
    const launcher = WEAPONS.launcher;
    const coolingDown = (this.fireCooldownTimers.get(player.id) ?? 0) > 0;
    if (coolingDown || player.isReloading || player.specialAmmo <= 0) return;

    this.combatManager.spawnRocket(
      player.id,
      player.position,
      input.aimAngle,
      player.weaponInstance!,
    );
    this.stats.recordShot(player.id);
    if (!infiniteAmmo) player.specialAmmo = Math.max(0, player.specialAmmo - 1);

    if (player.specialAmmo > 0) {
      this.fireCooldownTimers.set(player.id, launcher.fireCooldown);
    } else if (player.specialReserve > 0) {
      player.isReloading = true;
      player.reloadTimer = launcher.reloadTime;
    } else if (!this.mutatorActive('weapon_roulette')) {
      this.revertToRifle(player);
    }
  }

  /**
   * Fire one round at the given angle from the player's current position.
   * Records the shot, decrements the weapon's magazine, and applies
   * damage. Used by both hitscan weapons: the rifle (its own ammo pool,
   * also for subsequent burst rounds via advanceBursts) and the pistol
   * (the special-weapon slot).
   */
  private fireOneShot(
    playerId: PlayerId,
    aimAngle: number,
    grid: ReturnType<MapManager['getCollisionGrid']>,
    weaponId: 'rifle' | 'pistol' | 'smg' | 'sniper_rifle' = 'rifle',
  ): void {
    const player = this.players.get(playerId);
    if (!player) return;

    // Route every shot — including subsequent burst rounds — through lag
    // compensation. The shooter's position stays current (they see
    // themselves in real time); opponents get rewound to render time. RTT
    // of 0 collapses to a normal processShot, so unit tests with no RTT
    // resolver behave identically to the pre-lag-comp path.
    const rtt = this.rttForShooter(playerId);
    // Piercing is evaluated at fire-time per shot. Stickiness for in-flight
    // bullets is automatic — each shot's outcome is computed when fired.
    const piercing = player.characterId === 'mighty_man' && player.abilityActiveSeconds > 0;
    const shot = this.lagCompensator.processShootWithRewind(
      playerId,
      aimAngle,
      this.players,
      grid,
      rtt,
      piercing,
      weaponId,
      this.hitValidationScale(),
      this.canDamagePlayer,
    );
    this.tickBulletTrails.push(shot.trail);
    if (!this.mutatorActive('infinite_ammo')) {
      if (weaponId === 'rifle') {
        player.ammo = Math.max(0, player.ammo - 1);
      } else {
        player.specialAmmo = Math.max(0, player.specialAmmo - 1);
      }
    }
    this.stats.recordShot(playerId);

    if (shot.hit && shot.victimId && shot.damage !== undefined) {
      const victim = this.players.get(shot.victimId);
      if (victim) {
        const modeDamage =
          this.gameMode.damageForWeaponHit?.(this, player, victim, weaponId, shot.damage) ??
          shot.damage;
        const damage = this.damageForWeaponInstance(player, weaponId, modeDamage);
        const result = this.combatManager.applyDamage(
          victim,
          damage,
          playerId,
          this.canDamagePlayer,
        );
        shot.trail.hitPlayerId = shot.victimId;
        shot.trail.damageApplied = result.damageApplied;
        this.stats.recordHit(playerId);
        // damageApplied, not shot.damage — Iron Hide may have halved it.
        this.recordAttributedDamage(playerId, shot.victimId, result.damageApplied);
        this.applyVampireHeal(playerId, shot.victimId, result.damageApplied);
        if (result.killed && result.entry) {
          this.onKill(playerId, shot.victimId, weaponId === 'pistol' ? 'pistol' : 'gun');
        }
      }
    } else if (shot.hitTile) {
      this.resolveShotSceneryAt(shot.hitTile.col, shot.hitTile.row, playerId);
    }
  }

  /**
   * Swing a melee weapon: pelletCount deterministic even-fan rays across
   * its arc (no jitter — a jittered fan could gap past a hitbox at
   * melee range), each validated against a single lag-comp rewind
   * snapshot like a shotgun blast, with the weapon's maxRange capping
   * the reach. Every victim takes ONE flat damage application no matter
   * how many rays cross their box; a wide arc CAN strike several
   * distinct victims. Refuses while the swing cooldown runs or a rifle
   * burst is somehow still in flight. Melee never pierces walls — Mighty
   * Man's x-ray applies to bullets, not fists or bats.
   *
   * Accuracy bookkeeping mirrors the shotgun: one swing = one shot
   * fired, one hit if anyone was struck. No bullet trails — a one-shot
   * PunchEvent rides this tick's gameState instead, driving swing anims
   * and SFX on every client.
   */
  private tryMelee(
    player: PlayerState,
    input: PlayerInput,
    grid: ReturnType<MapManager['getCollisionGrid']>,
    weaponId: 'punch' | 'bat',
    infiniteAmmo: boolean,
  ): void {
    const weapon = WEAPONS[weaponId];
    const coolingDown = (this.fireCooldownTimers.get(player.id) ?? 0) > 0;
    if (
      coolingDown ||
      this.pendingBursts.has(player.id) ||
      (weaponId === 'bat' && player.specialAmmo <= 0)
    ) {
      return;
    }

    const angles = evenFanAngles(input.aimAngle, weapon.pelletCount, weapon.spreadAngle);
    const rtt = this.rttForShooter(player.id);
    const shots = this.lagCompensator.processMultiShotWithRewind(
      player.id,
      angles,
      this.players,
      grid,
      rtt,
      false, // walls always block melee
      weaponId,
      this.hitValidationScale(),
      this.canDamagePlayer,
    );

    this.stats.recordShot(player.id);
    const struckVictims = new Set<PlayerId>();

    for (const shot of shots) {
      if (!shot.hit || !shot.victimId || shot.damage === undefined) continue;
      // One damage application per victim per swing, however many rays
      // crossed their box.
      if (struckVictims.has(shot.victimId)) continue;
      const victim = this.players.get(shot.victimId);
      if (!victim || victim.isDead) continue;
      struckVictims.add(shot.victimId);
      const damage =
        this.gameMode.damageForWeaponHit?.(this, player, victim, weaponId, shot.damage) ??
        shot.damage;
      const result = this.combatManager.applyDamage(
        victim,
        damage,
        player.id,
        this.canDamagePlayer,
      );
      // damageApplied, not shot.damage — Iron Hide may have halved it.
      this.recordAttributedDamage(player.id, shot.victimId, result.damageApplied);
      this.applyVampireHeal(player.id, shot.victimId, result.damageApplied);
      if (result.killed) {
        this.onKill(player.id, shot.victimId, weaponId);
      }
    }

    if (struckVictims.size > 0) {
      this.stats.recordHit(player.id);
    }

    this.tickPunchEvents.push({
      playerId: player.id,
      weaponId,
      position: { x: player.position.x, y: player.position.y },
      aimAngle: input.aimAngle,
      hit: struckVictims.size > 0,
    });

    if (weaponId === 'bat' && !infiniteAmmo) {
      player.specialAmmo = Math.max(0, player.specialAmmo - 1);
      if (player.specialAmmo <= 0 && !this.mutatorActive('weapon_roulette')) {
        this.revertToRifle(player);
        return;
      }
    }
    this.fireCooldownTimers.set(player.id, weapon.fireCooldown);
  }

  /**
   * Fire one shotgun blast: pelletCount rays fanned deterministically
   * around the aim angle (seeded by the firing input's sequence number so
   * server validation and any client preview agree), each validated
   * against a single lag-comp rewind snapshot. Refuses while pump-racking,
   * reloading, or with an empty magazine.
   *
   * Accuracy bookkeeping counts the blast as ONE shot, and one hit if any
   * pellet connects — otherwise a shotgun would triple a player's
   * shots-fired column and wreck the accuracy stat.
   */
  private tryFireShotgun(
    player: PlayerState,
    input: PlayerInput,
    grid: ReturnType<MapManager['getCollisionGrid']>,
    infiniteAmmo: boolean,
  ): void {
    const shotgun = WEAPONS.shotgun;
    const racking = (this.fireCooldownTimers.get(player.id) ?? 0) > 0;
    if (racking || player.isReloading || player.specialAmmo <= 0) return;

    const angles = computePelletAngles(
      input.aimAngle,
      shotgun.pelletCount,
      shotgun.spreadAngle,
      input.sequenceNumber,
    );

    const rtt = this.rttForShooter(player.id);
    const piercing = player.characterId === 'mighty_man' && player.abilityActiveSeconds > 0;
    const shots = this.lagCompensator.processMultiShotWithRewind(
      player.id,
      angles,
      this.players,
      grid,
      rtt,
      piercing,
      'shotgun',
      this.hitValidationScale(),
      this.canDamagePlayer,
    );

    this.stats.recordShot(player.id);
    let anyPelletHit = false;
    const struckScenery = new Set<string>();

    for (const shot of shots) {
      this.tickBulletTrails.push(shot.trail);
      if (!shot.hit && shot.hitTile) {
        struckScenery.add(this.tileKey(shot.hitTile.col, shot.hitTile.row));
      }
      if (!shot.hit || !shot.victimId || shot.damage === undefined) continue;
      const victim = this.players.get(shot.victimId);
      // A victim killed by an earlier pellet of this same blast absorbs no
      // further pellets — without this guard each extra pellet would
      // re-trigger the death path and inflate the death counter.
      if (!victim || victim.isDead) continue;
      const result = this.combatManager.applyDamage(
        victim,
        this.damageForWeaponInstance(player, 'shotgun', shot.damage),
        player.id,
        this.canDamagePlayer,
      );
      shot.trail.hitPlayerId = shot.victimId;
      shot.trail.damageApplied = result.damageApplied;
      anyPelletHit = true;
      // damageApplied, not shot.damage — Iron Hide may have halved it.
      this.recordAttributedDamage(player.id, shot.victimId, result.damageApplied);
      this.applyVampireHeal(player.id, shot.victimId, result.damageApplied);
      if (result.killed) {
        this.onKill(player.id, shot.victimId, 'shotgun');
      }
    }

    if (anyPelletHit) {
      this.stats.recordHit(player.id);
    }

    // Resolve interactive scenery after every pellet's already-authoritative
    // player hit. Several pellets hitting one prop still consume it once.
    for (const key of struckScenery) {
      const [col, row] = key.split(',').map(Number);
      this.resolveShotSceneryAt(col, row, player.id);
    }

    if (!infiniteAmmo) {
      player.specialAmmo = Math.max(0, player.specialAmmo - 1);
    }

    if (player.specialAmmo > 0) {
      // Shells left in the mag — pump before the next shot.
      this.fireCooldownTimers.set(player.id, shotgun.fireCooldown);
    } else if (player.specialReserve > 0) {
      // Mag empty, reserve remains — auto-reload (no switch key exists,
      // so the player should never be stuck holding an unusable weapon).
      player.isReloading = true;
      player.reloadTimer = shotgun.reloadTime;
    } else if (!infiniteAmmo && !this.mutatorActive('weapon_roulette')) {
      // Completely dry: the shotgun vanishes and the rifle comes back out.
      this.revertToRifle(player);
    }
  }

  /**
   * Put the rifle back in the player's hands after their special weapon
   * runs dry (or on respawn). The rifle's magazine was untouched while
   * stowed; if it happens to be empty, start its reload immediately so
   * the player isn't left with a dead trigger.
   */
  private revertToRifle(player: PlayerState): void {
    player.weaponId = 'rifle';
    player.weaponInstance = undefined;
    player.specialAmmo = 0;
    player.specialReserve = 0;
    this.fireCooldownTimers.delete(player.id);
    player.isReloading = false;
    player.reloadTimer = 0;
    if (player.ammo <= 0) {
      player.isReloading = true;
      player.reloadTimer = WEAPONS.rifle.reloadTime;
    }
  }

  /** Apply world destruction, chain reactions, stats, and kill credit. */
  private recordExplosion(explosion: ExplosionResult, killWeapon: KillWeapon = 'grenade'): void {
    // Damage was already resolved by CombatManager against the untouched grid,
    // so cover protects players from the same blast that tears it down.
    const blastable = findBlastableCoverTiles(
      this.mapManager.getMapData(),
      this.mapManager.getCollisionGrid(),
      explosion.position,
    );
    const chainedBarrels: Array<{ col: number; row: number }> = [];
    for (const tile of blastable) {
      const key = this.tileKey(tile.col, tile.row);
      if (this.activeBarrels.delete(key)) chainedBarrels.push(tile);
      this.activeGates.delete(key);
    }
    for (const tile of blastable) {
      if (this.mapManager.destroyTile(tile.col, tile.row)) {
        this.tickDestroyedTiles.push(tile);
        if (this.activeScavengerCaches.delete(this.tileKey(tile.col, tile.row))) {
          this.spawnScavengerCacheReward(tile.col, tile.row);
        }
      }
    }

    for (const dmg of explosion.damages) {
      // Credit damage to the thrower. Self-damage from your own grenade
      // is real and intentional, but don't award yourself a kill.
      this.recordAttributedDamage(explosion.throwerId, dmg.playerId, dmg.damage);
      this.applyVampireHeal(explosion.throwerId, dmg.playerId, dmg.damage);
      if (dmg.killed && dmg.playerId !== explosion.throwerId) {
        this.onKill(explosion.throwerId, dmg.playerId, killWeapon);
      } else if (dmg.killed) {
        // Suicide via own grenade. In a duel, credit the kill to the only
        // other connected player so their score still ticks. In FFA with
        // multiple opponents we can't safely pick one, so the death just
        // costs the suicide victim and no kill is awarded.
        const opponents: PlayerId[] = [];
        for (const id of this.connectedPlayers) {
          if (id !== dmg.playerId) opponents.push(id);
        }
        if (opponents.length === 1) {
          this.onKill(opponents[0], dmg.playerId, killWeapon);
        } else {
          if (this.tracksRumbleAssists) {
            this.rumbleAssistTracker.clearVictim(dmg.playerId);
          }
          const victim = this.players.get(dmg.playerId);
          if (victim) {
            victim.isDead = true;
            victim.respawnTimer = RESPAWN.DELAY;
            victim.deaths++;
            this.pendingBursts.delete(dmg.playerId);
            this.cancelActiveAbility(victim);
            this.spawnLastLaughBomb(victim);
            this.dropPowerWeapon(victim);
            victim.weaponId = 'rifle';
            victim.weaponInstance = undefined;
            victim.specialAmmo = 0;
            victim.specialReserve = 0;
          }
        }
      }
    }

    for (const barrel of chainedBarrels) {
      this.resolveBarrelExplosion(barrel.col, barrel.row, explosion.throwerId);
    }
  }

  /** Every regulation death gets one victim-owned bomb, including FFA suicides. */
  private spawnLastLaughBomb(victim: PlayerState): void {
    if (!this.mutatorActive('last_laugh') || this.isOvertime) return;
    this.combatManager.spawnDeathBomb(victim.id, victim.position);
  }

  /** Spill the exact surviving special ammo as a short-lived contested pickup. */
  private dropPowerWeapon(victim: PlayerState): void {
    if (this.isOvertime) return;
    if (
      victim.weaponId !== 'shotgun' &&
      victim.weaponId !== 'pistol' &&
      victim.weaponId !== 'bat'
    ) {
      return;
    }
    if (
      this.mutatorActive('fists_only') ||
      this.mutatorActive('weapon_roulette') ||
      this.mutatorActive('grenades_only')
    ) {
      return;
    }
    const type =
      victim.weaponId === 'shotgun'
        ? PickupType.WEAPON_SHOTGUN
        : victim.weaponId === 'pistol'
          ? PickupType.WEAPON_PISTOL
          : PickupType.WEAPON_BAT;
    if (this.gameMode.isPickupTypeEnabled?.(type) === false) return;
    const remainingAmmo = victim.specialAmmo + victim.specialReserve;
    if (remainingAmmo <= 0) return;
    this.pickupManager.spawnOneShot(type, victim.position, {
      weaponAmmo: remainingAmmo,
      expiresInSeconds: PICKUP.DROPPED_WEAPON_LIFETIME_SECONDS,
      isDroppedWeapon: true,
    });
  }

  private tileKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  /** Resolve the first authored interaction carried by a bullet-struck tile. */
  private resolveShotSceneryAt(col: number, row: number, instigatorId: PlayerId): void {
    if (this.detonateBarrelAt(col, row, instigatorId)) return;
    if (this.openScavengerCacheAt(col, row)) return;
    this.openGateAt(col, row);
  }

  /** Consume a bullet-struck barrel and open its collision before it blasts. */
  private detonateBarrelAt(col: number, row: number, instigatorId: PlayerId): boolean {
    const key = this.tileKey(col, row);
    if (!this.activeBarrels.has(key)) return false;
    if (this.mapManager.destroyTile(col, row)) {
      this.activeBarrels.delete(key);
      this.tickDestroyedTiles.push({ col, row });
      this.resolveBarrelExplosion(col, row, instigatorId);
      return true;
    }
    return false;
  }

  /** Permanently open a closed gate and broadcast its cleared collision cell. */
  private openGateAt(col: number, row: number): boolean {
    const key = this.tileKey(col, row);
    if (!this.activeGates.has(key)) return false;
    if (!this.mapManager.destroyTile(col, row)) return false;
    this.activeGates.delete(key);
    this.tickDestroyedTiles.push({ col, row });
    return true;
  }

  /** Break one cache, clear its collision, and spill its one-shot reward. */
  private openScavengerCacheAt(col: number, row: number): boolean {
    const key = this.tileKey(col, row);
    if (!this.activeScavengerCaches.has(key)) return false;
    if (!this.mapManager.destroyTile(col, row)) return false;
    this.activeScavengerCaches.delete(key);
    this.tickDestroyedTiles.push({ col, row });
    this.spawnScavengerCacheReward(col, row);
    return true;
  }

  /**
   * Spawn at tile centre. Loadout-owning mutators turn stale weapon/ammo
   * rolls into sustain so a late-opened cache is always worth contesting.
   */
  private spawnScavengerCacheReward(col: number, row: number): void {
    const type = this.resolveDynamicPickupReward(this.scavengerCacheReward);
    const tileSize = this.mapManager.getMapData().tileSize;
    this.pickupManager.spawnOneShot(type, {
      x: col * tileSize + tileSize / 2,
      y: row * tileSize + tileSize / 2,
    });
  }

  /** Keep cache and Rush loot useful under live loadout and mode ownership. */
  private resolveDynamicPickupReward(rolled: PickupType): PickupType {
    let type = rolled;
    if (
      this.mutatorActive('fists_only') ||
      this.mutatorActive('weapon_roulette') ||
      this.mutatorActive('grenades_only')
    ) {
      type = PickupType.BANDAGE;
    } else if (this.mutatorActive('infinite_ammo') && type === PickupType.GUN_AMMO) {
      type = PickupType.GRENADE;
    } else if (this.mutatorActive('low_health') && type === PickupType.BANDAGE) {
      type = PickupType.GRENADE;
    }
    // Mutator substitutions still obey the mode's final economy contract.
    // Gun Game, for example, permits Low Health but owns its grenade rung.
    if (this.gameMode.isPickupTypeEnabled?.(type) === false) {
      const fallback = [PickupType.BANDAGE, PickupType.GRENADE, PickupType.GUN_AMMO].find(
        (candidate) => this.gameMode.isPickupTypeEnabled?.(candidate) ?? true,
      );
      type = fallback ?? PickupType.BANDAGE;
    }
    return type;
  }

  /** Resolve one already-consumed barrel, recursively triggering exposed props. */
  private resolveBarrelExplosion(col: number, row: number, instigatorId: PlayerId): void {
    const tileSize = this.mapManager.getMapData().tileSize;
    const position = {
      x: col * tileSize + tileSize / 2,
      y: row * tileSize + tileSize / 2,
    };
    this.barrelDetonationsByPlayer.set(
      instigatorId,
      (this.barrelDetonationsByPlayer.get(instigatorId) ?? 0) + 1,
    );
    this.tickBarrelExplosions.push(position);
    const explosion = this.combatManager.explodeAt(
      position,
      instigatorId,
      this.players,
      this.mapManager.getCollisionGrid(),
      this.canDamagePlayer,
    );
    this.recordExplosion(explosion, 'barrel');
  }

  private respawnPlayer(player: PlayerState): void {
    // Random spawn that isn't already occupied by another player. Reading
    // positions fresh each call means a co-respawning player processed earlier
    // in this same tick is already at their new spawn and will be avoided.
    const otherPositions: { x: number; y: number }[] = [];
    for (const other of this.players.values()) {
      if (other.id !== player.id) otherPositions.push(other.position);
    }
    const spawnPos = this.mapManager.pickRespawnPoint(otherPositions, this.rng);
    player.position = { ...spawnPos };
    player.velocity = { x: 0, y: 0 };
    // Honor any current cap (e.g. low_health drops maxHealth to 1) instead of
    // resetting to the default — otherwise the event would only bite on first
    // hit after respawn.
    player.health = player.maxHealth;
    player.armor = 0;
    player.isDead = false;
    player.respawnTimer = 0;
    player.invulnerableTimer = RESPAWN.INVULNERABILITY_DURATION;
    player.ammo = WEAPONS.rifle.magazineSize;
    player.isReloading = false;
    player.reloadTimer = 0;
    // Death drops the special weapon — you respawn on the rifle.
    player.weaponId = 'rifle';
    player.weaponInstance = undefined;
    player.specialAmmo = 0;
    player.specialReserve = 0;
    this.fireCooldownTimers.delete(player.id);
    player.stamina = PLAYER.SPRINT_DURATION;
    // During grenades_only, top up to MAX so respawning isn't a death sentence.
    player.grenades = this.mutatorActive('grenades_only')
      ? GRENADE.MAX_COUNT
      : GRENADE.STARTING_COUNT;
    player.grenadeRegenSeconds = 0;
    // Don't carry a freeze through death — respawning frozen would be
    // unrecoverable and is never the intent.
    player.frozenTimer = 0;
    // second_wind: respawning grants a short speed boost, applied through
    // the shared movement modifiers so prediction stays exact.
    player.secondWindTimer = this.mutatorActive('second_wind')
      ? MUTATORS.SECOND_WIND_DURATION_SECONDS
      : 0;
    player.spawnRushTimer = 0;
    this.applyGauntletSpawnBoons(player);
  }

  /** Format rules outrank mode defaults: Battle Royale never grants another life. */
  private canPlayerRespawn(player: PlayerState): boolean {
    if (this.battleRoyaleLifecycle !== null) return false;
    return this.gameMode.canRespawn?.(this, player) ?? true;
  }

  private hasGauntletBoon(playerId: PlayerId, boonId: GauntletBoonId): boolean {
    return this.gauntletBoonsByPlayer.get(playerId)?.has(boonId) ?? false;
  }

  /** Restore life-scoped boon benefits without weakening active mode/mutator rules. */
  private applyGauntletSpawnBoons(player: PlayerState): void {
    if (this.hasGauntletBoon(player.id, 'scrap_plating') && !this.mutatorActive('low_health')) {
      player.armor = Math.max(player.armor, PRACTICE_GAUNTLET.BOON_SCRAP_PLATING_ARMOR);
    }
    if (this.hasGauntletBoon(player.id, 'spawn_rush')) {
      player.spawnRushTimer = Math.max(
        player.spawnRushTimer ?? 0,
        PRACTICE_GAUNTLET.BOON_SPAWN_RUSH_SECONDS,
      );
    }
  }

  private createPlayerState(
    id: PlayerId,
    nickname: string,
    position: { x: number; y: number },
  ): PlayerState {
    return {
      id,
      nickname,
      // Set during the CHARACTER_SELECT → COUNTDOWN transition by
      // updateCharacterSelect, from each player's locked selection.
      characterId: null,
      position: { x: position.x, y: position.y },
      velocity: { x: 0, y: 0 },
      aimAngle: 0,
      health: PLAYER.MAX_HEALTH,
      maxHealth: PLAYER.MAX_HEALTH,
      armor: 0,
      ammo: WEAPONS.rifle.magazineSize,
      isReloading: false,
      reloadTimer: 0,
      weaponId: 'rifle',
      specialAmmo: 0,
      specialReserve: 0,
      grenades: GRENADE.STARTING_COUNT,
      grenadeRegenSeconds: 0,
      isSprinting: false,
      stamina: PLAYER.SPRINT_DURATION,
      isDead: false,
      respawnTimer: 0,
      invulnerableTimer: 0,
      lastProcessedInput: 0,
      score: 0,
      deaths: 0,
      abilityActiveSeconds: 0,
      abilityCooldownSeconds: 0,
      abilityLockedAim: 0,
      frozenTimer: 0,
      secondWindTimer: 0,
      spawnRushTimer: 0,
    };
  }

  /**
   * Advance both mutator slots: emit the one-shot warning when a slot's
   * warn threshold passes, then activate at its activation threshold. The
   * mid-match slot is keyed on seconds ELAPSED (rolled per match from the
   * injectable rng); the final-minute slot on seconds REMAINING (fixed
   * thresholds, unchanged from the pre-mutator system). If a slot's
   * warning and activation both land in one tick, the warning still goes
   * out first, paired with the same mutator.
   */
  private updateMutatorSchedule(): void {
    const elapsed = this.timeLimitSeconds - this.matchTimer;

    // Mid-match slot first — chronologically it usually warns first, and
    // warning order decides who picks from the pool first.
    const mid = this.midMatchSlot;
    if (
      !mid.warningSent &&
      this.matchTimer > 0 &&
      elapsed >= mid.activateAtElapsed - MUTATORS.WARNING_LEAD_SECONDS
    ) {
      mid.mutator = this.pickMutator(false);
      mid.warningSent = true;
      this._tickMutatorWarnings.push({
        event: mid.mutator,
        activatesInMs: Math.max(0, (mid.activateAtElapsed - elapsed) * 1000),
        isFinalMinute: false,
      });
    }
    if (!mid.started && mid.warningSent && elapsed >= mid.activateAtElapsed) {
      mid.started = true;
      this.startMutator(mid.mutator!, false);
    }

    const fin = this.finalMinuteSlot;
    if (
      !fin.warningSent &&
      this.matchTimer > 0 &&
      this.matchTimer <= MUTATORS.WARNING_AT_REMAINING
    ) {
      fin.mutator = this.pickMutator(true);
      fin.warningSent = true;
      this._tickMutatorWarnings.push({
        event: fin.mutator,
        activatesInMs: Math.max(0, (this.matchTimer - MUTATORS.ACTIVATION_AT_REMAINING) * 1000),
        isFinalMinute: true,
      });
    }
    if (!fin.started && fin.warningSent && this.matchTimer <= MUTATORS.ACTIVATION_AT_REMAINING) {
      fin.started = true;
      this.startMutator(fin.mutator!, true);
    }
  }

  /**
   * Pick a slot's mutator. Env overrides win first: FORCE_EVENT pins the
   * final-minute slot (its pre-mutator semantics), FORCE_MIDMATCH_MUTATOR
   * the mid-match slot — both test/e2e/smoke hooks, and both bypass the
   * mode's exclusion list by design. A compatible server-planned event
   * (Gauntlet forecast or Spar preference) owns the ordinary mid-match slot
   * next. Otherwise random picks draw uniformly
   * from POOL minus the mode's excluded mutators, recent rematch events, the
   * other slot's choice, and FORCE_EVENT's reserved value.
   */
  private pickMutator(isFinalMinute: boolean): MutatorId {
    const pool = MUTATORS.POOL as readonly string[];
    const forced = isFinalMinute ? process.env.FORCE_EVENT : process.env.FORCE_MIDMATCH_MUTATOR;
    if (forced && pool.includes(forced)) {
      return forced as MutatorId;
    }

    const excluded = new Set<MutatorId>();
    // Mode-level exclusions (Gun Game bans grenades_only/infinite_ammo).
    for (const modeExcluded of this.gameMode.excludedMutators ?? []) {
      excluded.add(modeExcluded);
    }
    const other = isFinalMinute ? this.midMatchSlot.mutator : this.finalMinuteSlot.mutator;
    if (other) {
      excluded.add(other);
      for (const candidate of MUTATORS.POOL) {
        if (mutatorsConflict(candidate, other)) excluded.add(candidate);
      }
    }
    if (!isFinalMinute) {
      const forcedFinal = process.env.FORCE_EVENT;
      if (forcedFinal && pool.includes(forcedFinal)) {
        const forcedFinalId = forcedFinal as MutatorId;
        excluded.add(forcedFinalId);
        for (const candidate of MUTATORS.POOL) {
          if (mutatorsConflict(candidate, forcedFinalId)) excluded.add(candidate);
        }
      }
    }

    if (
      !isFinalMinute &&
      this.plannedMidMatchMutator &&
      !excluded.has(this.plannedMidMatchMutator)
    ) {
      return this.plannedMidMatchMutator;
    }
    for (const recent of this.rematchMutatorExclusions) {
      excluded.add(recent);
    }
    const candidates = MUTATORS.POOL.filter((m) => !excluded.has(m));
    const idx = Math.floor(this.rng() * candidates.length);
    return candidates[Math.min(idx, candidates.length - 1)];
  }

  /** Activate a mutator: record it, queue the broadcast, apply one-shots. */
  private startMutator(mutator: MutatorId, isFinalMinute: boolean): void {
    this._activeMutators.push(mutator);
    this._tickMutatorStarts.push({ event: mutator, isFinalMinute });
    this.applyMutatorOnTrigger(mutator);
  }

  /** big_heads hit-validation AABB scale; 1 while inactive. */
  private hitValidationScale(): number {
    return this.mutatorActive('big_heads') ? MUTATORS.BIG_HEADS_HITBOX_SCALE : 1;
  }

  /** Single bookkeeping path for every authoritative attributed hit. */
  private recordAttributedDamage(attackerId: PlayerId, victimId: PlayerId, damage: number): void {
    this.stats.recordDamage(attackerId, damage);
    this.stats.recordDamageTaken(victimId, damage);
    if (this.tracksRumbleAssists) {
      this.rumbleAssistTracker.recordDamage(attackerId, victimId, damage, this.getElapsedSeconds());
    }
  }

  /**
   * vampire: return a fraction of damage dealt to the attacker as healing.
   * Self-damage never heals, dead attackers stay dead (a post-mortem
   * grenade can still explode), and the heal caps at maxHealth — which
   * low_health may have pinned to 1, making vampire moot but harmless.
   */
  private applyVampireHeal(attackerId: PlayerId, victimId: PlayerId, damage: number): void {
    if (!this.mutatorActive('vampire')) return;
    if (attackerId === victimId) return;
    const attacker = this.players.get(attackerId);
    if (!attacker || attacker.isDead) return;
    attacker.health = Math.min(
      attacker.maxHealth,
      attacker.health + damage * MUTATORS.VAMPIRE_HEAL_FRACTION,
    );
  }

  private applyMutatorOnTrigger(mutator: MutatorId): void {
    switch (mutator) {
      case 'super_speed':
      case 'big_heads':
      case 'vampire':
      case 'second_wind':
      case 'blood_rush':
      case 'ability_overdrive':
      case 'blackout':
      case 'last_laugh':
        // Per-tick behavior only; nothing to mutate at activation.
        return;
      case 'demolition_wave':
        this.triggerDemolitionWave();
        return;
      case 'scrapstorm':
        this.scrapstormTimer = MUTATORS.SCRAPSTORM_FIRST_WARNING_DELAY_SECONDS;
        this.scrapstormTargetPosition = null;
        this.scrapstormTargetPlayerId = null;
        this.scrapstormTargetSequence = 0;
        return;
      case 'radiation_storm': {
        const map = this.mapManager.getMapData();
        this.radiationStormCenter = radiationStormCenter(this.stableSeed, map);
        this.radiationStormInitialRadius = radiationStormInitialRadius(
          map,
          this.radiationStormCenter,
        );
        this.radiationStormElapsed = 0;
        this.radiationStormPulseTimer = MUTATORS.RADIATION_STORM_PULSE_SECONDS;
        return;
      }
      case 'scavenger_rush':
        this.scavengerRushTimer = 0;
        this.scavengerRushSequence = 0;
        return;
      case 'wasteland_warp':
        this.wastelandWarpTimer = MUTATORS.WASTELAND_WARP_FIRST_DELAY_SECONDS;
        this.wastelandWarpSequence = 0;
        return;
      case 'fists_only':
        this.combatManager.clearGrenades();
        this.pickupManager.removeTypes([
          PickupType.WEAPON_SHOTGUN,
          PickupType.WEAPON_PISTOL,
          PickupType.WEAPON_BAT,
        ]);
        this.enforceFistsOnlyLoadouts();
        return;
      case 'weapon_roulette':
        this.weaponRouletteIndex = 0;
        this.weaponRouletteTimer = MUTATORS.WEAPON_ROULETTE_INTERVAL_SECONDS;
        this.pickupManager.removeTypes([
          PickupType.GUN_AMMO,
          PickupType.WEAPON_SHOTGUN,
          PickupType.WEAPON_PISTOL,
          PickupType.WEAPON_BAT,
        ]);
        this.enforceWeaponRouletteLoadouts(
          MUTATORS.WEAPON_ROULETTE_ORDER[this.weaponRouletteIndex],
          true,
        );
        return;
      case 'turbo_grenades':
        // Restart the shared regen accumulator so the first turbo refill
        // lands a full interval after activation.
        for (const player of this.players.values()) {
          player.grenadeRegenSeconds = 0;
        }
        return;
      case 'grenades_only':
        this.pickupManager.removeTypes([
          PickupType.WEAPON_SHOTGUN,
          PickupType.WEAPON_PISTOL,
          PickupType.WEAPON_BAT,
        ]);
        for (const player of this.players.values()) {
          player.grenades = GRENADE.MAX_COUNT;
          player.grenadeRegenSeconds = 0;
        }
        // Cancel in-flight bursts and pump-racking; guns are gated off
        // from this tick on.
        this.pendingBursts.clear();
        this.fireCooldownTimers.clear();
        return;
      case 'infinite_ammo':
        for (const player of this.players.values()) {
          player.ammo = WEAPONS.rifle.magazineSize;
          if (this.usesSpecialAmmo(player.weaponId)) {
            player.specialAmmo = WEAPONS[player.weaponId].magazineSize;
          }
          player.isReloading = false;
          player.reloadTimer = 0;
        }
        return;
      case 'low_health':
        this.pickupManager.removeTypes([PickupType.ARMOR]);
        for (const player of this.players.values()) {
          player.armor = 0;
          player.maxHealth = MUTATORS.LOW_HEALTH_HP;
          if (!player.isDead) {
            player.health = Math.min(player.health, MUTATORS.LOW_HEALTH_HP);
          }
        }
        return;
    }
  }

  /** Permanently open ordinary low cover and live wire gates in one wave. */
  private triggerDemolitionWave(): void {
    const map = this.mapManager.getMapData();
    const grid = this.mapManager.getCollisionGrid();
    for (const tile of findDemolitionWaveTiles(map, grid)) {
      if (!this.mapManager.destroyTile(tile.col, tile.row)) continue;
      this.activeGates.delete(this.tileKey(tile.col, tile.row));
      this.tickDestroyedTiles.push(tile);
    }
  }

  /** Rotate sorted living fighters through already-valid player positions. */
  private updateWastelandWarp(dt: number): void {
    if (!this.mutatorActive('wasteland_warp') || this.isOvertime) return;
    this.wastelandWarpTimer -= dt;
    if (this.wastelandWarpTimer > 0) return;
    while (this.wastelandWarpTimer <= 0) {
      this.wastelandWarpTimer += MUTATORS.WASTELAND_WARP_INTERVAL_SECONDS;
    }

    const living = [...this.players.values()].filter((player) => !player.isDead);
    if (!this.usesChallengeSeed) living.sort((a, b) => a.id.localeCompare(b.id));
    if (living.length < 2) return;
    const positions = living.map((player) => ({ ...player.position }));
    for (let i = 0; i < living.length; i++) {
      living[i].position = { ...positions[(i + 1) % positions.length] };
      living[i].velocity = { x: 0, y: 0 };
    }
    this.wastelandWarpSequence += 1;
  }

  /** Close the safe zone and apply nonlethal, non-attributed outside pulses. */
  private updateRadiationStorm(dt: number): void {
    if (!this.mutatorActive('radiation_storm') || this.isOvertime) return;
    this.radiationStormElapsed = Math.min(
      MUTATORS.RADIATION_STORM_SHRINK_SECONDS,
      this.radiationStormElapsed + dt,
    );
    this.radiationStormPulseTimer -= dt;
    while (this.radiationStormPulseTimer <= 0) {
      this.radiationStormPulseTimer += MUTATORS.RADIATION_STORM_PULSE_SECONDS;
      const state = this.getRadiationStormState();
      if (!state) continue;
      for (const player of this.players.values()) {
        if (player.isDead || player.invulnerableTimer > 0) continue;
        if (!isOutsideRadiationStorm(player.position, state)) continue;
        player.health = Math.max(1, player.health - MUTATORS.RADIATION_STORM_DAMAGE_PER_PULSE);
      }
    }
  }

  /** Paint captured positions, then resolve fair nonlethal arena blasts. */
  private updateScrapstorm(dt: number): void {
    if (!this.mutatorActive('scrapstorm') || this.isOvertime) return;

    let remaining = dt;
    // Production advances at 20 Hz. The bounded loop also keeps direct
    // large-dt tests deterministic without risking a pathological stall.
    for (let transition = 0; transition < 32; transition++) {
      if (this.scrapstormTimer > remaining) {
        this.scrapstormTimer -= remaining;
        return;
      }
      remaining -= Math.max(0, this.scrapstormTimer);

      if (this.scrapstormTargetPosition) {
        this.resolveScrapstormImpact(this.scrapstormTargetPosition);
        this.scrapstormTargetPosition = null;
        this.scrapstormTargetPlayerId = null;
        this.scrapstormTimer = Math.max(
          0,
          MUTATORS.SCRAPSTORM_INTERVAL_SECONDS - MUTATORS.SCRAPSTORM_WARNING_SECONDS,
        );
      } else if (!this.beginScrapstormWarning()) {
        // No living fighter to target. Retry cheaply without manufacturing
        // a warning at a stale spawn or corpse position.
        this.scrapstormTimer = 1;
      }

      if (remaining <= 0) return;
    }
  }

  /** Capture one living fighter in stable round-robin order. */
  private beginScrapstormWarning(): boolean {
    const living = [...this.players.values()].filter((player) => !player.isDead);
    if (!this.usesChallengeSeed) living.sort((a, b) => a.id.localeCompare(b.id));
    if (living.length === 0) return false;

    const offset = this.stableIndex(`${this.stableSeed}:scrapstorm`, living.length);
    const target = living[(offset + this.scrapstormTargetSequence) % living.length];
    this.scrapstormTargetSequence += 1;
    this.scrapstormTargetPosition = { ...target.position };
    this.scrapstormTargetPlayerId = target.id;
    this.scrapstormTimer = MUTATORS.SCRAPSTORM_WARNING_SECONDS;
    return true;
  }

  private resolveScrapstormImpact(position: { x: number; y: number }): void {
    this.tickBarrelExplosions.push({ ...position });
    for (const player of this.players.values()) {
      if (
        Math.hypot(player.position.x - position.x, player.position.y - position.y) >
        MUTATORS.SCRAPSTORM_RADIUS_PX
      )
        continue;
      this.combatManager.applyNonlethalEnvironmentalDamage(player, MUTATORS.SCRAPSTORM_DAMAGE);
    }
  }

  /** Keep one short-lived supply moving through deterministic arena anchors. */
  private updateScavengerRush(dt: number): void {
    if (!this.mutatorActive('scavenger_rush') || this.isOvertime) return;
    this.scavengerRushTimer -= dt;
    if (this.scavengerRushTimer > 0) return;

    let dueCount = 0;
    while (this.scavengerRushTimer <= 0) {
      this.scavengerRushTimer += MUTATORS.SCAVENGER_RUSH_DROP_INTERVAL_SECONDS;
      dueCount++;
    }
    // Fixed 20 Hz play produces dueCount=1. Advancing skipped sequences on
    // an unusually large tick keeps the chosen anchor time-deterministic.
    this.scavengerRushSequence += dueCount - 1;
    this.spawnScavengerRushDrop();
  }

  private spawnScavengerRushDrop(): void {
    const map = this.mapManager.getMapData();
    let anchors: Array<{ x: number; y: number }>;
    if (map.kothHills?.length) {
      anchors = map.kothHills.map((hill) => ({
        x: (hill.x + KOTH.HILL_SIZE_TILES / 2) * map.tileSize,
        y: (hill.y + KOTH.HILL_SIZE_TILES / 2) * map.tileSize,
      }));
    } else if (map.pickupSpawns.length) {
      anchors = map.pickupSpawns.map((spawn) => ({
        x: (spawn.x + 0.5) * map.tileSize,
        y: (spawn.y + 0.5) * map.tileSize,
      }));
    } else {
      anchors = map.spawnPoints.map((spawn) => ({
        x: (spawn.x + 0.5) * map.tileSize,
        y: (spawn.y + 0.5) * map.tileSize,
      }));
    }
    if (anchors.length === 0) return;

    const sequence = this.scavengerRushSequence++;
    const offset = this.stableIndex(`${this.stableSeed}:scavenger-rush`, anchors.length);
    const position = anchors[(offset + sequence) % anchors.length];
    const rolled = selectScavengerCacheReward(
      `${this.stableSeed}:scavenger-rush:${sequence}`,
      (type) => this.gameMode.isPickupTypeEnabled?.(type) ?? true,
    );

    this.pickupManager.removeScavengerRushDrops();
    this.pickupManager.spawnOneShot(this.resolveDynamicPickupReward(rolled), position, {
      expiresInSeconds: MUTATORS.SCAVENGER_RUSH_DROP_LIFETIME_SECONDS,
      isScavengerRushDrop: true,
    });
  }

  /** Small stable FNV-1a index; consumes none of the match's gameplay RNG. */
  private stableIndex(key: string, length: number): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0) % length;
  }

  /** Equip fists, retire grenades, and cancel only stale prior-weapon state. */
  private enforceFistsOnlyLoadouts(): void {
    for (const player of this.players.values()) {
      const weaponChanged = player.weaponId !== 'punch';
      player.weaponId = 'punch';
      player.specialAmmo = 0;
      player.specialReserve = 0;
      player.grenades = 0;
      player.grenadeRegenSeconds = 0;
      player.isReloading = false;
      player.reloadTimer = 0;
      if (weaponChanged) this.clearWeaponTransients(player.id);
    }
  }

  /** Advance the fair shared weapon cycle and reassert its current loadout. */
  private updateWeaponRoulette(dt: number): void {
    this.weaponRouletteTimer -= dt;
    let advanced = false;
    while (this.weaponRouletteTimer <= 0) {
      this.weaponRouletteIndex =
        (this.weaponRouletteIndex + 1) % MUTATORS.WEAPON_ROULETTE_ORDER.length;
      this.weaponRouletteTimer += MUTATORS.WEAPON_ROULETTE_INTERVAL_SECONDS;
      advanced = true;
    }
    this.enforceWeaponRouletteLoadouts(
      MUTATORS.WEAPON_ROULETTE_ORDER[this.weaponRouletteIndex],
      advanced,
    );
  }

  /** Equip one synchronized roulette step without refilling it every tick. */
  private enforceWeaponRouletteLoadouts(weaponId: WeaponId, restock: boolean): void {
    for (const player of this.players.values()) {
      if (!restock && player.weaponId === weaponId) continue;

      player.weaponId = weaponId;
      player.isReloading = false;
      player.reloadTimer = 0;
      this.clearWeaponTransients(player.id);

      if (weaponId === 'rifle') {
        player.ammo = WEAPONS.rifle.magazineSize;
        player.specialAmmo = 0;
        player.specialReserve = 0;
      } else if (this.usesSpecialAmmo(weaponId)) {
        player.specialAmmo = WEAPONS[weaponId].magazineSize;
        player.specialReserve = WEAPONS[weaponId].magazineSize;
      } else {
        player.specialAmmo = 0;
        player.specialReserve = 0;
      }
    }
  }

  // ──────────────────────────── Abilities ────────────────────────────

  /**
   * Try to activate the player's character-specific ability. No-op if the
   * player is dead, has no character locked yet, is already mid-cast, or is
   * still cooling down. Both characters store the activation aim angle so
   * Bruce's locked breath direction is stable and Mighty Man's HUD has a
   * known reference for VFX placement.
   *
   * Cooldown anchors:
   *   Bruce — 45s cycle from activation. Set cooldown = COOLDOWN; both
   *     timers tick simultaneously, the 1.2s active overlaps the first
   *     1.2s of the cooldown.
   *   Mighty Man — 30s cooldown begins AFTER the 7s active window. Set
   *     cooldown = DURATION + COOLDOWN so it expires at the right moment.
   */
  private tryActivateAbility(player: PlayerState, aimAngle: number): void {
    if (player.isDead) return;
    if (!player.characterId) return;
    if (player.abilityActiveSeconds > 0) return;
    if (player.abilityCooldownSeconds > 0) return;

    player.abilityLockedAim = aimAngle;

    if (player.characterId === 'bruce') {
      player.abilityActiveSeconds = ABILITY.BRUCE_FIRE_BREATH.DURATION;
      player.abilityCooldownSeconds = ABILITY.BRUCE_FIRE_BREATH.COOLDOWN;
      // Pin aim so the breath cone fires along the activation direction.
      player.aimAngle = aimAngle;
      // Fresh per-cast damage-tick counter so a previous cast doesn't leak in.
      this.fireBreathTicksByPlayer.set(player.id, 0);
    } else if (player.characterId === 'mighty_man') {
      player.abilityActiveSeconds = ABILITY.MIGHTY_MAN_XRAY.DURATION;
      player.abilityCooldownSeconds =
        ABILITY.MIGHTY_MAN_XRAY.DURATION + ABILITY.MIGHTY_MAN_XRAY.COOLDOWN;
    } else if (player.characterId === 'frost_wizard') {
      // Auto-target nearest non-self, non-dead opponent by squared distance.
      // No range cap, no aim required. If no eligible target exists (e.g.
      // the only opponent is mid-respawn), abort without consuming the
      // cooldown — pressing into an empty room shouldn't burn 30s.
      let nearestId: string | null = null;
      let nearestDistSq = Infinity;
      for (const [otherId, other] of this.players) {
        if (otherId === player.id) continue;
        if (other.isDead) continue;
        const dx = other.position.x - player.position.x;
        const dy = other.position.y - player.position.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearestId = otherId;
        }
      }
      if (nearestId === null) return;
      const target = this.players.get(nearestId)!;
      target.frozenTimer = ABILITY.FROST_WIZARD_FREEZE.DURATION;
      player.abilityCooldownSeconds = ABILITY.FROST_WIZARD_FREEZE.COOLDOWN;
      // Frost Lock is instant — no active window. abilityActiveSeconds
      // stays 0 so the HUD only animates the cooldown arc.
    } else if (player.characterId === 'bubba') {
      // Iron Hide: the active window IS the effect — applyDamage halves
      // everything that lands while it runs. Bruce-style cooldown anchor
      // (starts at activation), so the total cycle is 30s.
      player.abilityActiveSeconds = ABILITY.BUBBA_IRON_HIDE.DURATION;
      player.abilityCooldownSeconds = ABILITY.BUBBA_IRON_HIDE.COOLDOWN;
    } else if (player.characterId === 'jack') {
      // Axe Throw: instant cast, like Frost Lock — the projectile does the
      // work. The axe is server-simulated by CombatManager; the kill/stat
      // bookkeeping happens where updateActive consumes updateAxes' hits.
      this.combatManager.spawnAxe(player.id, player.position, aimAngle);
      player.abilityCooldownSeconds = ABILITY.JACK_AXE_THROW.COOLDOWN;
    } else if (player.characterId === 'rook') {
      const before = player.position;
      const endpoint = calculateDashEndpoint(
        before,
        aimAngle,
        ABILITY.ROOK_BREACH_DASH.DISTANCE_TILES * MAP.TILE_SIZE,
        this.mapManager.getCollisionGrid(),
      );
      const distance = Math.hypot(endpoint.x - before.x, endpoint.y - before.y);
      // A point-blank wall does not eat the cooldown. Any legal partial dash
      // does: stopping early at cover is part of the ability's skill ceiling.
      if (distance < 1) return;
      player.position = endpoint;
      player.velocity = { x: 0, y: 0 };
      this.stats.recordDistance(player.id, distance);
      player.abilityCooldownSeconds = ABILITY.ROOK_BREACH_DASH.COOLDOWN;
    }
  }

  /**
   * Cancel an active ability — used on death. The active window ends
   * immediately. For Mighty Man, the 30s cooldown is reset to start from
   * "now" (death moment) per the design Q&A; for Bruce, the cooldown was
   * set at activation and is already running, so we leave it untouched
   * (continues through respawn).
   */
  private cancelActiveAbility(player: PlayerState): void {
    if (player.abilityActiveSeconds <= 0) return;
    player.abilityActiveSeconds = 0;
    if (player.characterId === 'mighty_man') {
      player.abilityCooldownSeconds = ABILITY.MIGHTY_MAN_XRAY.COOLDOWN;
    }
    this.fireBreathTicksByPlayer.delete(player.id);
  }

  /** Decrement active and cooldown timers for every player. */
  private tickAbilities(dt: number): void {
    const globalRechargeMultiplier = this.mutatorActive('ability_overdrive')
      ? MUTATORS.ABILITY_OVERDRIVE_RECHARGE_MULTIPLIER
      : 1;
    for (const player of this.players.values()) {
      if (player.abilityActiveSeconds > 0) {
        player.abilityActiveSeconds = Math.max(0, player.abilityActiveSeconds - dt);
        if (player.abilityActiveSeconds <= 0) {
          // Natural expiry — clear the per-cast counter so the next cast
          // starts fresh.
          this.fireBreathTicksByPlayer.delete(player.id);
        }
      }
      if (player.abilityCooldownSeconds > 0) {
        const boonMultiplier = this.hasGauntletBoon(player.id, 'quick_charge')
          ? PRACTICE_GAUNTLET.BOON_QUICK_CHARGE_MULTIPLIER
          : 1;
        player.abilityCooldownSeconds = Math.max(
          0,
          player.abilityCooldownSeconds - dt * globalRechargeMultiplier * boonMultiplier,
        );
      }
      // Decrement Frost Wizard freeze on every player — anyone can be
      // frozen, not just wizards.
      if (player.frozenTimer > 0) {
        player.frozenTimer = Math.max(0, player.frozenTimer - dt);
      }
    }
  }

  /**
   * Per-tick fire-breath logic for every Bruce currently breathing.
   *
   * Wall destruction runs every server tick so the cone visibly burns
   * through interior walls as it sweeps. Damage, by contrast, is
   * scheduled: each cast fires DAMAGE_TICK_COUNT evenly-spaced damage
   * ticks across the active window. On each scheduled damage tick, every
   * victim currently inside the cone takes a flat DAMAGE_PER_TICK — the
   * longer they stay in the breath, the more ticks they eat.
   */
  private tickFireBreath(): void {
    const range = ABILITY.BRUCE_FIRE_BREATH.RANGE_TILES * MAP.TILE_SIZE;
    // big_heads scales the victim-hitbox half of the sum, not the breath width.
    const hitboxScale = this.hitValidationScale();
    const breathHalfWidth = ABILITY.BRUCE_FIRE_BREATH.WIDTH / 2;
    const tileSize = MAP.TILE_SIZE;
    const halfTileDiag = (tileSize * Math.SQRT2) / 2;
    const mapData = this.mapManager.getMapData();
    const duration = ABILITY.BRUCE_FIRE_BREATH.DURATION;
    const tickCount = ABILITY.BRUCE_FIRE_BREATH.DAMAGE_TICK_COUNT;
    const tickInterval = duration / tickCount;
    const damagePerTick = ABILITY.BRUCE_FIRE_BREATH.DAMAGE_PER_TICK;

    for (const [playerId, player] of this.players) {
      if (player.characterId !== 'bruce') continue;
      if (player.abilityActiveSeconds <= 0) continue;
      if (player.isDead) continue;

      const dirX = Math.cos(player.aimAngle);
      const dirY = Math.sin(player.aimAngle);

      // Burn down interior wall tiles inside the cone every server tick.
      // Outer-perimeter walls are spared so the playfield stays bounded;
      // cover (low) is also spared — fire breaks walls, not crates.
      this.destroyWallsInCone(
        mapData,
        player.position.x,
        player.position.y,
        dirX,
        dirY,
        range,
        breathHalfWidth,
        tileSize,
        halfTileDiag,
      );

      // Decide whether a scheduled damage tick fires this server tick.
      // Tick k fires once elapsed >= k * tickInterval. The activation
      // server tick has elapsed = 0 (tickFireBreath runs before
      // tickAbilities decrements), so tick 0 lands on activation.
      const elapsed = duration - player.abilityActiveSeconds;
      const ticksFired = this.fireBreathTicksByPlayer.get(playerId) ?? 0;
      const expected = Math.min(tickCount, Math.floor(elapsed / tickInterval) + 1);
      if (expected <= ticksFired) continue;

      for (const [otherId, other] of this.players) {
        if (otherId === playerId) continue;
        if (other.isDead) continue;
        if (other.invulnerableTimer > 0) continue;

        // Per-victim hit-validation dims (Bubba's 30px box eats more
        // breath), scaled by big_heads, plus the breath's own thickness.
        const victimBox = characterHitbox(other.characterId);
        const halfW = (victimBox.width / 2) * hitboxScale + breathHalfWidth;
        const halfH = (victimBox.height / 2) * hitboxScale + breathHalfWidth;

        const hitDist = rayIntersectsAABB(
          player.position.x,
          player.position.y,
          dirX,
          dirY,
          other.position.x,
          other.position.y,
          halfW,
          halfH,
        );
        if (hitDist === null || hitDist <= 0 || hitDist > range) continue;

        const result = this.combatManager.applyDamage(
          other,
          damagePerTick,
          playerId,
          this.canDamagePlayer,
        );
        this.recordAttributedDamage(playerId, otherId, result.damageApplied);
        this.applyVampireHeal(playerId, otherId, result.damageApplied);
        if (result.killed) {
          this.onKill(playerId, otherId, 'fire');
        }
      }

      this.fireBreathTicksByPlayer.set(playerId, expected);
    }
  }

  /**
   * Destroy any interior WALL tile whose centre lies within the
   * fire-breath wedge. Mutates the live collision grid and queues a
   * broadcast entry for each newly destroyed tile so clients can hide
   * the wall sprite and clear their prediction grid.
   *
   * Outer-perimeter walls are intentionally spared (same rule as the
   * piercing-grenade containment fix) so the playfield stays bounded.
   * COVER_LOW is also spared — fire breaks walls, not crates.
   *
   * Each cast clears all reachable walls on the first active tick (the
   * cone is locked in place for the 1.2 s duration), so subsequent ticks
   * of the same cast find no remaining walls and broadcast nothing.
   */
  private destroyWallsInCone(
    mapData: MapData,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    range: number,
    breathHalfWidth: number,
    tileSize: number,
    halfTileDiag: number,
  ): void {
    const perpX = -dirY;
    const perpY = dirX;

    // Cone AABB → tile range. Use the origin-to-tip segment expanded by
    // the breath half-width + one tile of margin in each axis. Cheap;
    // costs us a few extra candidate tiles outside the wedge that the
    // perp test below rejects.
    const aabbMinX = Math.min(originX, originX + dirX * range) - breathHalfWidth - tileSize;
    const aabbMaxX = Math.max(originX, originX + dirX * range) + breathHalfWidth + tileSize;
    const aabbMinY = Math.min(originY, originY + dirY * range) - breathHalfWidth - tileSize;
    const aabbMaxY = Math.max(originY, originY + dirY * range) + breathHalfWidth + tileSize;

    const colMin = Math.max(0, Math.floor(aabbMinX / tileSize));
    const colMax = Math.min(mapData.width - 1, Math.floor(aabbMaxX / tileSize));
    const rowMin = Math.max(0, Math.floor(aabbMinY / tileSize));
    const rowMax = Math.min(mapData.height - 1, Math.floor(aabbMaxY / tileSize));

    const widthMargin = breathHalfWidth + halfTileDiag;

    for (let row = rowMin; row <= rowMax; row++) {
      // Outer perimeter row: nothing here is destructible.
      if (row === 0 || row === mapData.height - 1) continue;
      for (let col = colMin; col <= colMax; col++) {
        if (col === 0 || col === mapData.width - 1) continue;
        if (mapData.tiles[row][col] !== TileType.WALL) continue;

        const cx = col * tileSize + tileSize / 2;
        const cy = row * tileSize + tileSize / 2;
        const relX = cx - originX;
        const relY = cy - originY;
        const along = relX * dirX + relY * dirY;
        if (along < -halfTileDiag || along > range + halfTileDiag) continue;
        const perp = Math.abs(relX * perpX + relY * perpY);
        if (perp > widthMargin) continue;

        if (this.mapManager.destroyTile(col, row)) {
          this.activeGates.delete(this.tileKey(col, row));
          this.tickDestroyedTiles.push({ col, row });
        }
      }
    }
  }
}

/**
 * Resolve regulation length: the FORCE_MATCH_SECONDS smoke pin when set to
 * a positive number of seconds, else MATCH.TIME_LIMIT. Invalid values are
 * ignored with a warning (smoke tooling must never kill a match).
 */
function resolveTimeLimitSeconds(): number {
  const forced = process.env.FORCE_MATCH_SECONDS;
  if (forced === undefined || forced === '') return MATCH.TIME_LIMIT;
  const seconds = Number(forced);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    logger.warn({ forced }, 'Ignoring invalid FORCE_MATCH_SECONDS');
    return MATCH.TIME_LIMIT;
  }
  logger.warn({ seconds }, 'FORCE_MATCH_SECONDS pin active — regulation length overridden');
  return seconds;
}
