import type { PlayerId, Vec2 } from '@shared/types/common.js';
import type { CollisionGrid } from '@shared/types/map.js';
import type { PlayerInput, PlayerState } from '@shared/types/player.js';
import type { AxeState, GrenadeState, PunchEvent } from '@shared/types/projectile.js';
import type { PickupState } from '@shared/types/pickup.js';
import type {
  KillConfirmedTagState,
  MatchContractHudState,
  GameModeType,
  PracticeGauntletRouteId,
  CoreRunState,
  BountyHuntState,
  WastelandWarpState,
  RadiationStormState,
  ScrapstormState,
} from '@shared/types/game.js';
import type {
  DraftCategory,
  ServerMessage,
  ServerGameStateMessage,
  KothHudState,
} from '@shared/types/network.js';
import { MatchPhase } from '@shared/types/game.js';
import {
  SERVER,
  type BotDifficulty,
  type PracticeKind,
  type CharacterId,
  type MutatorId,
} from '@shared/config/game.js';
import { playerMovementModifiers } from '@shared/utils/event-modifiers.js';
import { NetworkConnection } from './connection.js';
import { ClientPrediction } from './prediction.js';
import { ServerReconciliation } from './reconciliation.js';
import { EntityInterpolation } from './interpolation.js';
import type { ConnectionState, InterpolatedState } from './types.js';

type EventName =
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'welcome'
  | 'matchFound'
  | 'draftState'
  | 'matchCountdown'
  | 'matchStart'
  | 'matchEnd'
  | 'playerKilled'
  | 'playerRespawned'
  | 'pickupCollected'
  | 'confirmedTagCollected'
  | 'matchmakingStatus'
  | 'rematchStatus'
  | 'opponentDisconnected'
  | 'characterSelectState'
  | 'bulletTrail'
  | 'grenadeThrown'
  | 'grenadeExploded'
  | 'axeThrown'
  | 'axeResolved'
  | 'punchSwung'
  | 'localCorrection'
  | 'eventWarning'
  | 'eventStart'
  | 'weaponIncoming'
  | 'tilesDestroyed'
  | 'overtimeStart'
  | 'leaderboard'
  | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventCallback = (...args: any[]) => void;

export interface LocalCorrection {
  previousPosition: Vec2;
  correctedPosition: Vec2;
  delta: Vec2;
  shouldSnap: boolean;
}

export class NetworkManager {
  private connection: NetworkConnection;
  private prediction: ClientPrediction;
  private reconciliation: ServerReconciliation;
  private interpolation: EntityInterpolation;

  private localPlayerId: PlayerId | null = null;
  private localPlayerState: PlayerState | null = null;
  private collisionGrid: CollisionGrid | null = null;
  private lastCountdownEmitted = -1;
  /** False in modes whose server contract disables character abilities. */
  private abilitiesEnabled = true;

  /**
   * Most recent grenades from server gameState. Scene polls this each
   * frame to render in-flight grenades. We also diff between updates to
   * emit explosion events when a grenade disappears from the list.
   */
  private latestGrenades: GrenadeState[] = [];
  private lastGrenadePositions = new Map<string, Vec2>();

  /**
   * Most recent thrown axes from server gameState, polled per frame for
   * flight rendering. Throw/landing effects are NOT frame-driven: an axe
   * thrown point-blank at a wall lives for as little as one snapshot, and
   * bursty message delivery can overwrite that snapshot before the next
   * render frame samples it. So handleGameState diffs axes per MESSAGE
   * (same rationale as grenadeExploded below) and emits axeThrown /
   * axeResolved events that can never be swallowed.
   */
  private latestAxes: AxeState[] = [];
  private lastAxeStates = new Map<string, { position: Vec2; angle: number }>();

  /** Most recent pickups from server gameState. Scene polls for rendering. */
  private latestPickups: PickupState[] = [];
  private latestConfirmedTags: KillConfirmedTagState[] = [];
  private _coreRunState: CoreRunState | null = null;
  private _bountyHuntState: BountyHuntState | null = null;
  private _wastelandWarpState: WastelandWarpState | null = null;
  private _radiationStormState: RadiationStormState | null = null;
  private _scrapstormState: ScrapstormState | null = null;

  /**
   * Local-clock timestamp (performance.now() ms) at which the current
   * match ends. Initially set from ServerMatchStartMessage.matchEndsInMs,
   * then re-anchored every gameState while phase===ACTIVE from the
   * authoritative matchTimer. Re-anchoring keeps the displayed clock
   * drift-free even if the initial anchor was perturbed by message
   * delivery latency, paint stalls, or audio-context warm-up.
   * Null outside an active match.
   */
  private matchEndsAtLocalMs: number | null = null;

  /**
   * All currently active mutators, in activation order. Driven
   * authoritatively from ServerGameStateMessage.activeMutators (every
   * snapshot) and bumped early by ServerEventStartMessage so each
   * modifier engages on the same frame its banner shows.
   */
  private _activeMutators: MutatorId[] = [];

  /**
   * King of the Hill HUD state from the latest snapshot; null in DM
   * matches and while the hill is retired for overtime. Scene polls this
   * each frame like grenades/pickups.
   */
  private _kothState: KothHudState | null = null;
  /** Shared side objective and progress from the latest snapshot. */
  private _contractState: MatchContractHudState | null = null;

  /**
   * True while the match is in sudden-death overtime. Mirrored from every
   * snapshot (the one-shot overtimeStart message additionally re-anchors
   * the clock and fires the banner).
   */
  private _isOvertime = false;

  private listeners = new Map<EventName, EventCallback[]>();

  constructor(serverUrl?: string) {
    this.connection = new NetworkConnection(serverUrl);
    this.prediction = new ClientPrediction();
    this.reconciliation = new ServerReconciliation();
    this.interpolation = new EntityInterpolation();

    this.connection.onMessage((msg) => this.handleMessage(msg));

    this.connection.onStateChange((state) => {
      if (state === 'connected') this.emit('connected');
      else if (state === 'disconnected') this.emit('disconnected');
      else if (state === 'reconnecting') this.emit('reconnecting');
    });
  }

  /** Set the collision grid used for prediction and reconciliation. */
  setCollisionGrid(grid: CollisionGrid): void {
    this.collisionGrid = grid;
  }

  /** Connect to the game server. */
  async connect(): Promise<void> {
    await this.connection.connect();
  }

  /** Disconnect from the game server. */
  disconnect(): void {
    this.connection.disconnect();
    this.localPlayerId = null;
    this.resetMatchState();
  }

  /**
   * Drop all per-match state. Runs on disconnect AND on every
   * server:matchFound — the connection (and localPlayerId) persist across
   * rematch/re-queue, so anything match-scoped that lingers here leaks
   * into the next match. The first gameState snapshot of the new match
   * re-seeds localPlayerState via serverStateToPlayerState (fresh
   * characterId included).
   */
  private resetMatchState(): void {
    this.localPlayerState = null;
    this.prediction = new ClientPrediction();
    this.interpolation = new EntityInterpolation();
    this.remotePlayerIds = [];
    this.latestGrenades = [];
    this.lastGrenadePositions.clear();
    this.latestAxes = [];
    this.lastAxeStates.clear();
    this.latestPickups = [];
    this.latestConfirmedTags = [];
    this._coreRunState = null;
    this._bountyHuntState = null;
    this._wastelandWarpState = null;
    this._radiationStormState = null;
    this._scrapstormState = null;
    this.matchEndsAtLocalMs = null;
    this._activeMutators = [];
    this._kothState = null;
    this._contractState = null;
    this._isOvertime = false;
    this.lastCountdownEmitted = -1;
    this.abilitiesEnabled = true;
  }

  /** Currently active mutators, in activation order (empty if none). */
  getActiveMutators(): readonly MutatorId[] {
    return this._activeMutators;
  }

  getWastelandWarpState(): WastelandWarpState | null {
    return this._wastelandWarpState;
  }

  getRadiationStormState(): RadiationStormState | null {
    return this._radiationStormState;
  }

  getScrapstormState(): ScrapstormState | null {
    return this._scrapstormState;
  }

  setAbilitiesEnabled(enabled: boolean): void {
    this.abilitiesEnabled = enabled;
  }

  /** Latest KOTH hill state; null in DM matches and during overtime. */
  getKothState(): KothHudState | null {
    return this._kothState;
  }

  /** True while the match is in sudden-death overtime. */
  isOvertime(): boolean {
    return this._isOvertime;
  }

  /**
   * Send a player input to the server AND predict locally.
   * The input is applied immediately via shared physics so the player
   * feels zero latency, then sent to the server for authoritative processing.
   */
  sendInput(input: PlayerInput): void {
    // Always send to the server — prediction is a best-effort overlay.
    this.connection.send({ type: 'client:input', input });

    if (!this.localPlayerState || !this.collisionGrid) return;

    // Predict locally using shared physics, applying the active mutators'
    // movement modifiers so prediction matches server authority during
    // e.g. super_speed, Second Wind, or Blood Rush. The boost timer
    // comes from the last snapshot — the server consumes the same value
    // when it processes this input, so the two stay aligned.
    const predicted = this.prediction.predictInput(
      input,
      this.localPlayerState,
      this.collisionGrid,
      playerMovementModifiers(
        this.localPlayerState.characterId,
        this._activeMutators,
        this.localPlayerState.secondWindTimer,
      ),
      this.abilitiesEnabled,
    );

    this.prediction.addPrediction(input, predicted);
    this.localPlayerState = predicted;
  }

  /** Join matchmaking with a nickname. */
  joinMatchmaking(nickname: string): void {
    this.connection.send({ type: 'client:joinMatchmaking', nickname });
  }

  getContractState(): MatchContractHudState | null {
    return this._contractState;
  }

  /** Start an immediate authoritative solo match. */
  startPractice(
    nickname: string,
    difficulty: BotDifficulty,
    kind: PracticeKind = 'sparring',
    gameMode?: GameModeType,
    opponentCharacterId?: CharacterId,
  ): void {
    this.connection.send({
      type: 'client:startPractice',
      nickname,
      difficulty,
      kind,
      ...(gameMode ? { gameMode } : {}),
      ...(opponentCharacterId ? { opponentCharacterId } : {}),
    });
  }

  /** Cancel matchmaking. */
  cancelMatchmaking(): void {
    this.connection.send({ type: 'client:cancelMatchmaking' });
  }

  /** Send a hover update during the character-select phase. */
  sendCharacterHover(characterId: CharacterId): void {
    this.connection.send({ type: 'client:characterHover', characterId });
  }

  /**
   * Send a map/mode pick during the pre-match draft. The server validates
   * turn + category availability + value and silently ignores anything
   * invalid, so this is safe to fire-and-forget — the next draftState
   * snapshot echoes an accepted pick.
   */
  sendDraftPick(category: DraftCategory, value: string): void {
    this.connection.send({ type: 'client:draftPick', category, value });
  }

  /** Lock in the chosen character for the character-select phase. */
  sendCharacterLock(characterId: CharacterId): void {
    this.connection.send({ type: 'client:characterLock', characterId });
  }

  /** Request a rematch, optionally selecting a server-authored Gauntlet route. */
  requestRematch(gauntletRouteId?: PracticeGauntletRouteId): void {
    this.connection.send(
      gauntletRouteId
        ? { type: 'client:rematchRequest', gauntletRouteId }
        : { type: 'client:rematchRequest' },
    );
  }

  /** Return to lobby. */
  returnToLobby(): void {
    this.connection.send({ type: 'client:returnToLobby' });
  }

  /** Get the current local player state (with client-side prediction applied). */
  getLocalPlayerState(): PlayerState | null {
    return this.localPlayerState;
  }

  /**
   * Get interpolated states for all remote players.
   *
   * Rendered ONE server tick behind real time. With server-side rewind on
   * (match.ts → lagCompensator.processShootWithRewind), the server already
   * accounts for half-RTT when validating hits, so the render delay here
   * is mostly a jitter buffer. Two ticks would tolerate more loss but
   * widens the gap the rewind has to cover; keep at one tick until
   * playtesting says otherwise.
   */
  getInterpolatedPlayers(): Map<PlayerId, InterpolatedState> {
    const renderTime = performance.now() - SERVER.TICK_INTERVAL;
    const result = new Map<PlayerId, InterpolatedState>();

    for (const playerId of this.remotePlayerIds) {
      const state = this.interpolation.getInterpolatedState(playerId, renderTime);
      if (state) {
        result.set(playerId, state);
      }
    }

    return result;
  }

  /** Get an interpolated state for a specific remote player. */
  getInterpolatedPlayer(playerId: PlayerId): InterpolatedState | null {
    const renderTime = performance.now() - SERVER.TICK_INTERVAL;
    return this.interpolation.getInterpolatedState(playerId, renderTime);
  }

  /** Get all remote player IDs currently being tracked. */
  getRemotePlayerIds(): PlayerId[] {
    return this.remotePlayerIds;
  }

  /** Most recent active grenades from the server, for rendering. */
  getActiveGrenades(): GrenadeState[] {
    return this.latestGrenades;
  }

  /** Most recent thrown axes from the server, for rendering. */
  getActiveAxes(): AxeState[] {
    return this.latestAxes;
  }

  /** Most recent pickups from the server, for rendering. */
  getPickups(): PickupState[] {
    return this.latestPickups;
  }

  getConfirmedTags(): readonly KillConfirmedTagState[] {
    return this.latestConfirmedTags;
  }

  getCoreRunState(): CoreRunState | null {
    return this._coreRunState;
  }

  getBountyHuntState(): BountyHuntState | null {
    return this._bountyHuntState;
  }

  /**
   * Remaining match time in seconds, extrapolated from the one-time
   * ServerMatchStartMessage. Counts down smoothly at render rate between
   * server ticks and continues ticking through packet loss. Returns 0
   * when no match is active or the timer has expired.
   */
  getMatchTimer(): number {
    if (this.matchEndsAtLocalMs === null) return 0;
    const remainingMs = this.matchEndsAtLocalMs - performance.now();
    return Math.max(0, remainingMs / 1000);
  }

  /** Get the local player's ID (assigned by server on welcome). */
  getPlayerId(): PlayerId | null {
    return this.localPlayerId;
  }

  /** Current round-trip time in milliseconds. */
  getRTT(): number {
    return this.connection.getRTT();
  }

  /** Current connection state. */
  getConnectionState(): ConnectionState {
    return this.connection.getState();
  }

  /** Register a listener for a game event. */
  on(event: EventName, callback: EventCallback): void {
    const list = this.listeners.get(event);
    if (list) {
      list.push(callback);
    } else {
      this.listeners.set(event, [callback]);
    }
  }

  /** Remove a listener. */
  off(event: EventName, callback: EventCallback): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(callback);
    if (idx !== -1) list.splice(idx, 1);
  }

  // ---- Internal message handling ----

  private remotePlayerIds: PlayerId[] = [];

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'server:welcome':
        this.localPlayerId = msg.playerId;
        this.emit('welcome', msg.playerId);
        break;

      case 'server:gameState':
        this.handleGameState(msg);
        break;

      case 'server:matchFound':
        // A new match is starting on this same connection (rematch or
        // re-queue). Drop every piece of per-match client state BEFORE
        // the scenes react: localPlayerState survives across matches
        // otherwise, and reconciliation never rewrites characterId — so
        // without this reset the local player renders as their PREVIOUS
        // character and prediction runs at the previous character's
        // speed (permanent rubber-banding when the speeds differ).
        // Fresh buffers also stop last match's grenades/axes/pickups
        // from ghost-rendering during the new countdown.
        this.resetMatchState();
        this.emit('matchFound', msg);
        break;

      case 'server:draftState':
        // Pre-match draft snapshot, broadcast every tick while drafting
        // (before any match exists — no per-match state to reset here;
        // that happens on the server:matchFound that ends the draft).
        this.emit('draftState', msg);
        break;

      case 'server:characterSelectState':
        this.emit('characterSelectState', msg);
        break;

      case 'server:matchCountdown':
        this.emit('matchCountdown', msg.countdown);
        break;

      case 'server:matchStart':
        // Authoritative source of the match clock. Anchor the countdown
        // to our local performance.now() so the display stays smooth
        // regardless of gameState cadence or packet loss.
        this.matchEndsAtLocalMs = performance.now() + msg.matchEndsInMs;
        this.emit('matchStart');
        break;

      case 'server:matchEnd':
        this.matchEndsAtLocalMs = null;
        this._activeMutators = [];
        this._kothState = null;
        this._isOvertime = false;
        this.emit('matchEnd', msg);
        break;

      case 'server:overtimeStart':
        // Sudden death: re-anchor the clock the same way matchStart does
        // (the per-snapshot re-anchor would fix it within a tick anyway,
        // but the banner beat shouldn't show a stale 0:00).
        this.matchEndsAtLocalMs = performance.now() + msg.overtimeEndsInMs;
        this._isOvertime = true;
        this.emit('overtimeStart');
        break;

      case 'server:eventWarning':
        this.emit('eventWarning', {
          event: msg.event,
          activatesInMs: msg.activatesInMs,
          isFinalMinute: msg.isFinalMinute,
        });
        break;

      case 'server:eventStart':
        if (!this._activeMutators.includes(msg.event)) {
          this._activeMutators.push(msg.event);
        }
        this.emit('eventStart', { event: msg.event, isFinalMinute: msg.isFinalMinute });
        break;

      case 'server:weaponIncoming':
        this.emit('weaponIncoming', { weaponId: msg.weaponId, landsInMs: msg.landsInMs });
        break;

      case 'server:playerKilled':
        this.emit('playerKilled', msg);
        break;

      case 'server:playerRespawned':
        this.emit('playerRespawned', msg);
        break;

      case 'server:pickupCollected':
        this.emit('pickupCollected', msg.pickupId, msg.playerId);
        break;

      case 'server:tilesDestroyed':
        this.emit('tilesDestroyed', msg.tiles);
        break;

      case 'server:matchmakingStatus':
        this.emit('matchmakingStatus', msg);
        break;

      case 'server:leaderboard':
        // All-time top players — sent on connection open and rebroadcast
        // after each match's stats are recorded.
        this.emit('leaderboard', msg.entries);
        break;

      case 'server:rematchStatus':
        this.emit('rematchStatus', msg.opponentWantsRematch);
        break;

      case 'server:opponentDisconnected':
        this.interpolation.removeEntity(msg.playerId);
        this.remotePlayerIds = this.remotePlayerIds.filter((id) => id !== msg.playerId);
        this.emit('opponentDisconnected', msg.playerId);
        break;

      case 'server:pong':
        this.connection.handlePong(msg.clientTime);
        break;

      case 'server:error':
        this.emit('error', msg.message);
        break;
    }
  }

  private handleGameState(msg: ServerGameStateMessage): void {
    if (!this.localPlayerId) return;

    // Emit bullet trails so scenes can render them as effects.
    for (const trail of msg.bulletTrails) {
      this.emit('bulletTrail', trail);
    }

    // Environmental blasts reuse the grenade presentation path, but are
    // explicit transient cues because no in-flight grenade exists to diff.
    for (const position of msg.barrelExplosions ?? []) {
      this.emit('grenadeExploded', position);
    }

    // Punch swings are transient like bulletTrails — one event per entry,
    // processed per message and never diffed (a swing resolves within a
    // single server tick, so there is no list to mirror). Each entry
    // drives the puncher's attack anim + whoosh/impact SFX in the scene.
    for (const punch of msg.punches ?? []) {
      this.emit('punchSwung', punch satisfies PunchEvent);
    }

    // Grenades: mirror the server list and emit explosion events for any
    // that disappeared since the last gameState. A grenade vanishing from
    // the active list means its fuse expired and it detonated; show an
    // explosion at its last known position. New IDs (not seen last frame)
    // emit a 'grenadeThrown' event so scenes can play the throw SFX.
    const incomingIds = new Set<string>();
    for (const g of msg.grenades) {
      incomingIds.add(g.id);
      if (!this.lastGrenadePositions.has(g.id)) {
        this.emit('grenadeThrown', { x: g.position.x, y: g.position.y });
      }
      this.lastGrenadePositions.set(g.id, { x: g.position.x, y: g.position.y });
    }
    for (const [id, pos] of this.lastGrenadePositions) {
      if (!incomingIds.has(id)) {
        this.emit('grenadeExploded', pos);
        this.lastGrenadePositions.delete(id);
      }
    }
    this.latestGrenades = msg.grenades;

    // Axes: same per-message diffing as grenades. An axe's whole flight
    // can span a single snapshot (point-blank wall throw), so throw SFX
    // and landing FX must key off message transitions — a frame-rate poll
    // of latestAxes can miss the entire lifetime under bursty delivery.
    const incomingAxeIds = new Set<string>();
    for (const axe of msg.axes ?? []) {
      incomingAxeIds.add(axe.id);
      if (!this.lastAxeStates.has(axe.id)) {
        this.emit('axeThrown', { x: axe.position.x, y: axe.position.y });
      }
      this.lastAxeStates.set(axe.id, {
        position: { x: axe.position.x, y: axe.position.y },
        angle: axe.angle,
      });
    }
    for (const [id, last] of this.lastAxeStates) {
      if (!incomingAxeIds.has(id)) {
        this.emit('axeResolved', { position: last.position, angle: last.angle });
        this.lastAxeStates.delete(id);
      }
    }
    this.latestAxes = msg.axes ?? [];
    this.latestPickups = msg.pickups;
    this.latestConfirmedTags = msg.confirmedTags ?? [];
    this._coreRunState = msg.coreRun ?? null;
    this._bountyHuntState = msg.bountyHunt ?? null;
    this._wastelandWarpState = msg.wastelandWarp ?? null;
    this._radiationStormState = msg.radiationStorm ?? null;
    this._scrapstormState = msg.scrapstorm ?? null;
    for (const collection of msg.confirmedTagCollections ?? []) {
      this.emit('confirmedTagCollected', collection);
    }
    // Server is authoritative for the active mutators. Mirror every
    // snapshot so reconnects pick up the modifiers without an extra
    // round-trip.
    this._activeMutators = msg.activeMutators;
    // Same contract for KOTH hill state and the overtime flag.
    this._kothState = msg.koth ?? null;
    this._contractState = msg.contract ?? null;
    this._isOvertime = msg.isOvertime;

    // Re-anchor the match clock from every active-phase snapshot. The
    // initial anchor came from ServerMatchStartMessage; this corrects
    // any drift between local extrapolation and the server's authoritative
    // tick-driven matchTimer. The eventStart message is sent in the same
    // tick as the gameState that crosses the threshold, so by the time
    // the client renders the event, the timer display already reflects
    // server-truth.
    if (msg.phase === MatchPhase.ACTIVE) {
      this.matchEndsAtLocalMs = performance.now() + msg.matchTimer * 1000;
    }

    // matchStart is driven by the explicit ServerMatchStartMessage (which
    // also carries the music-start trigger), so this block only debounces
    // and forwards per-second countdown emits for the 3/2/1/FIGHT overlay.
    if (msg.phase === MatchPhase.COUNTDOWN) {
      const countdownInt = Math.ceil(msg.countdownTimer);
      if (countdownInt !== this.lastCountdownEmitted) {
        this.lastCountdownEmitted = countdownInt;
        this.emit('matchCountdown', msg.countdownTimer);
      }
    }

    const newRemoteIds: PlayerId[] = [];

    for (const playerState of msg.players) {
      if (playerState.id === this.localPlayerId) {
        // --- Local player: reconciliation ---
        this.reconcileLocalPlayer(playerState);
      } else {
        // --- Remote player: entity interpolation ---
        this.interpolation.pushState(playerState.id, playerState, msg.tick);
        newRemoteIds.push(playerState.id);
      }
    }

    this.remotePlayerIds = newRemoteIds;
  }

  private reconcileLocalPlayer(
    serverState: ServerGameStateMessage['players'][number],
  ): void {
    if (!this.collisionGrid || !this.localPlayerState) {
      // No grid yet or no local state — just accept server state directly
      this.localPlayerState = this.serverStateToPlayerState(serverState);
      return;
    }

    // Clear acknowledged predictions
    this.prediction.clearBefore(serverState.lastProcessedInput + 1);

    const predictions = this.prediction.getHistory();

    if (predictions.length === 0) {
      // No unacknowledged inputs remain. Smooth any residual difference
      // instead of visibly jumping to the authoritative state.
      const result = this.reconciliation.reconcileAuthoritative(
        serverState,
        this.localPlayerState,
      );
      this.applyReconciledLocalState(serverState, result);
      return;
    }

    const result = this.reconciliation.reconcile(
      serverState,
      predictions,
      this.collisionGrid,
      playerMovementModifiers(
        serverState.characterId,
        this._activeMutators,
        serverState.secondWindTimer,
      ),
      this.abilitiesEnabled,
    );

    this.applyReconciledLocalState(serverState, result);
  }

  private applyReconciledLocalState(
    serverState: ServerGameStateMessage['players'][number],
    result: ReturnType<ServerReconciliation['reconcile']>,
  ): void {
    if (!this.localPlayerState) return;

    const previousPosition = {
      x: this.localPlayerState.position.x,
      y: this.localPlayerState.position.y,
    };

    // Apply reconciled position to local state, keep server-authoritative
    // values for health, ammo, etc.
    this.localPlayerState = {
      ...this.localPlayerState,
      position: result.position,
      velocity: result.velocity,
      stamina: result.stamina,
      // Server-authoritative and immutable per match — forwarded so a
      // localPlayerState that predates the lock commit (or survived a
      // match boundary) can never feed a stale id into rendering or
      // playerMovementModifiers.
      characterId: serverState.characterId,
      // Always trust server for these values
      health: serverState.health,
      maxHealth: serverState.maxHealth,
      armor: serverState.armor,
      ammo: serverState.ammo,
      // Weapon slot is server-authoritative (auto-equip on pickup,
      // auto-revert on empty) — the client never predicts it.
      weaponId: serverState.weaponId,
      specialAmmo: serverState.specialAmmo,
      specialReserve: serverState.specialReserve,
      grenades: serverState.grenades,
      isReloading: serverState.isReloading,
      isDead: serverState.isDead,
      respawnTimer: serverState.respawnTimer,
      invulnerableTimer: serverState.invulnerableTimer,
      score: serverState.score,
      deaths: serverState.deaths,
      nickname: serverState.nickname,
      // Ability state is server-authoritative — without forwarding here, the
      // local snapshot stays at 0/0 forever, which kills HUD feedback, the
      // fire-cone VFX, x-ray tint, and aim-line piercing for the local player.
      abilityActiveSeconds: serverState.abilityActiveSeconds,
      abilityCooldownSeconds: serverState.abilityCooldownSeconds,
      // Frost Wizard freeze is server-authoritative — forward so the local
      // player's prediction next tick respects the lockout via the shared
      // calculateMovement frozen modifier.
      frozenTimer: serverState.frozenTimer,
      // Temporary mutator boost timer — forwarded so the next predictInput
      // applies the same Second Wind / Blood Rush multiplier as the server.
      secondWindTimer: serverState.secondWindTimer,
    };

    const dx = result.position.x - previousPosition.x;
    const dy = result.position.y - previousPosition.y;
    if (dx !== 0 || dy !== 0) {
      this.emit('localCorrection', {
        previousPosition,
        correctedPosition: {
          x: result.position.x,
          y: result.position.y,
        },
        delta: { x: dx, y: dy },
        shouldSnap: result.shouldSnap,
      } satisfies LocalCorrection);
    }
  }

  private serverStateToPlayerState(
    s: ServerGameStateMessage['players'][number],
  ): PlayerState {
    return {
      id: s.id,
      // Mirror server: SerializedPlayerState.characterId is non-null in
      // gameState messages (those only ship from COUNTDOWN onward), so we
      // can carry it straight through to PlayerState.
      characterId: s.characterId,
      position: { x: s.position.x, y: s.position.y },
      velocity: { x: s.velocity.x, y: s.velocity.y },
      aimAngle: s.aimAngle,
      health: s.health,
      maxHealth: s.maxHealth,
      armor: s.armor,
      ammo: s.ammo,
      isReloading: s.isReloading,
      reloadTimer: 0,
      weaponId: s.weaponId,
      specialAmmo: s.specialAmmo,
      specialReserve: s.specialReserve,
      grenades: s.grenades,
      grenadeRegenSeconds: 0,
      isSprinting: s.isSprinting,
      stamina: s.stamina,
      isDead: s.isDead,
      respawnTimer: s.respawnTimer,
      invulnerableTimer: s.invulnerableTimer,
      lastProcessedInput: s.lastProcessedInput,
      score: s.score,
      deaths: s.deaths,
      nickname: s.nickname,
      abilityActiveSeconds: s.abilityActiveSeconds,
      abilityCooldownSeconds: s.abilityCooldownSeconds,
      abilityLockedAim: 0,
      frozenTimer: s.frozenTimer,
      secondWindTimer: s.secondWindTimer,
    };
  }

  /** True if this player has a grenade currently in flight. */
  hasActiveGrenadeFor(playerId: PlayerId): boolean {
    return this.latestGrenades.some((g) => g.throwerId === playerId);
  }

  private emit(event: EventName, ...args: unknown[]): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const cb of list) {
      try {
        cb(...args);
      } catch (err) {
        // Isolate per-listener exceptions so a single throwing handler
        // doesn't strand later listeners. See the rematch hang where a
        // stale scene listener threw and silently dropped subsequent
        // listeners' chance to run.
        console.error('[NetworkManager] listener for', event, 'threw', err);
      }
    }
  }
}
