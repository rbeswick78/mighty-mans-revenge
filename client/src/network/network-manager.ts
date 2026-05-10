import type { PlayerId, Vec2 } from '@shared/types/common.js';
import type { CollisionGrid } from '@shared/types/map.js';
import type { PlayerInput, PlayerState } from '@shared/types/player.js';
import type { GrenadeState } from '@shared/types/projectile.js';
import type { PickupState } from '@shared/types/pickup.js';
import type {
  ServerMessage,
  ServerGameStateMessage,
  FinalMinuteEvent,
} from '@shared/types/network.js';
import { MatchPhase } from '@shared/types/game.js';
import { SERVER, type CharacterId } from '@shared/config/game.js';
import { eventToMovementModifiers } from '@shared/utils/event-modifiers.js';
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
  | 'matchCountdown'
  | 'matchStart'
  | 'matchEnd'
  | 'playerKilled'
  | 'playerRespawned'
  | 'pickupCollected'
  | 'matchmakingStatus'
  | 'rematchStatus'
  | 'opponentDisconnected'
  | 'characterSelectState'
  | 'bulletTrail'
  | 'grenadeThrown'
  | 'grenadeExploded'
  | 'localCorrection'
  | 'eventWarning'
  | 'eventStart'
  | 'tilesDestroyed'
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

  /**
   * Most recent grenades from server gameState. Scene polls this each
   * frame to render in-flight grenades. We also diff between updates to
   * emit explosion events when a grenade disappears from the list.
   */
  private latestGrenades: GrenadeState[] = [];
  private lastGrenadePositions = new Map<string, Vec2>();

  /** Most recent pickups from server gameState. Scene polls for rendering. */
  private latestPickups: PickupState[] = [];

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
   * The active final-minute event, or null. Driven authoritatively from
   * ServerGameStateMessage.activeEvent (every snapshot) and bumped early
   * by ServerEventStartMessage so the modifier engages on the same frame
   * the banner shows.
   */
  private _activeEvent: FinalMinuteEvent | null = null;

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
    this.localPlayerState = null;
    this.matchEndsAtLocalMs = null;
    this._activeEvent = null;
  }

  /** The currently active final-minute event, or null if none. */
  getActiveEvent(): FinalMinuteEvent | null {
    return this._activeEvent;
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

    // Predict locally using shared physics, applying the active event's
    // movement modifier so prediction matches server authority during e.g.
    // super_speed.
    const predicted = this.prediction.predictInput(
      input,
      this.localPlayerState,
      this.collisionGrid,
      eventToMovementModifiers(this._activeEvent),
    );

    this.prediction.addPrediction(input, predicted);
    this.localPlayerState = predicted;
  }

  /** Join matchmaking with a nickname. */
  joinMatchmaking(nickname: string): void {
    this.connection.send({ type: 'client:joinMatchmaking', nickname });
  }

  /** Cancel matchmaking. */
  cancelMatchmaking(): void {
    this.connection.send({ type: 'client:cancelMatchmaking' });
  }

  /** Send a hover update during the character-select phase. */
  sendCharacterHover(characterId: CharacterId): void {
    this.connection.send({ type: 'client:characterHover', characterId });
  }

  /** Lock in the chosen character for the character-select phase. */
  sendCharacterLock(characterId: CharacterId): void {
    this.connection.send({ type: 'client:characterLock', characterId });
  }

  /** Request a rematch. */
  requestRematch(): void {
    this.connection.send({ type: 'client:rematchRequest' });
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

  /** Most recent pickups from the server, for rendering. */
  getPickups(): PickupState[] {
    return this.latestPickups;
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
        this.emit('matchFound', msg);
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
        this._activeEvent = null;
        this.emit('matchEnd', msg);
        break;

      case 'server:eventWarning':
        this.emit('eventWarning', { event: msg.event, activatesInMs: msg.activatesInMs });
        break;

      case 'server:eventStart':
        this._activeEvent = msg.event;
        this.emit('eventStart', { event: msg.event });
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
    this.latestPickups = msg.pickups;
    // Server is authoritative for the active event. Mirror every snapshot
    // so reconnects pick up the modifier without an extra round-trip.
    this._activeEvent = msg.activeEvent;

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
      eventToMovementModifiers(this._activeEvent),
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
      // Always trust server for these values
      health: serverState.health,
      maxHealth: serverState.maxHealth,
      ammo: serverState.ammo,
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
      ammo: s.ammo,
      isReloading: s.isReloading,
      reloadTimer: 0,
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
