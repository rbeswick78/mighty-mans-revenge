import type { PlayerId, Vec2 } from '@shared/types/common.js';
import type { CollisionGrid } from '@shared/types/map.js';
import type { PlayerInput, PlayerState } from '@shared/types/player.js';
import type { GrenadeState } from '@shared/types/projectile.js';
import type {
  ServerMessage,
  ServerGameStateMessage,
} from '@shared/types/network.js';
import { MatchPhase } from '@shared/types/game.js';
import { SERVER, PLAYER } from '@shared/config/game.js';
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
  | 'bulletTrail'
  | 'grenadeExploded'
  | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventCallback = (...args: any[]) => void;

export class NetworkManager {
  private connection: NetworkConnection;
  private prediction: ClientPrediction;
  private reconciliation: ServerReconciliation;
  private interpolation: EntityInterpolation;

  private localPlayerId: PlayerId | null = null;
  private localPlayerState: PlayerState | null = null;
  private collisionGrid: CollisionGrid | null = null;
  private lastPhase: MatchPhase | null = null;
  private lastCountdownEmitted = -1;

  /**
   * Most recent grenades from server gameState. Scene polls this each
   * frame to render in-flight grenades. We also diff between updates to
   * emit explosion events when a grenade disappears from the list.
   */
  private latestGrenades: GrenadeState[] = [];
  private lastGrenadePositions = new Map<string, Vec2>();

  /** Remaining match time in seconds, from the most recent gameState. */
  private matchTimer = 0;

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

    // Predict locally using shared physics
    const predicted = this.prediction.predictInput(
      input,
      this.localPlayerState,
      this.collisionGrid,
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
   * Render time is one tick behind real-time by design.
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

  /**
   * Get an interpolated state for a specific remote player.
   * Render time is one tick behind real-time by design.
   */
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

  /** Remaining match time in seconds from the most recent gameState. */
  getMatchTimer(): number {
    return this.matchTimer;
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

      case 'server:matchCountdown':
        this.emit('matchCountdown', msg.countdown);
        break;

      case 'server:matchStart':
        this.emit('matchStart');
        break;

      case 'server:matchEnd':
        this.emit('matchEnd', msg);
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

    this.matchTimer = msg.matchTimer;

    // Emit bullet trails so scenes can render them as effects.
    for (const trail of msg.bulletTrails) {
      this.emit('bulletTrail', trail);
    }

    // Grenades: mirror the server list and emit explosion events for any
    // that disappeared since the last gameState. A grenade vanishing from
    // the active list means its fuse expired and it detonated; show an
    // explosion at its last known position.
    const incomingIds = new Set<string>();
    for (const g of msg.grenades) {
      incomingIds.add(g.id);
      this.lastGrenadePositions.set(g.id, { x: g.position.x, y: g.position.y });
    }
    for (const [id, pos] of this.lastGrenadePositions) {
      if (!incomingIds.has(id)) {
        this.emit('grenadeExploded', pos);
        this.lastGrenadePositions.delete(id);
      }
    }
    this.latestGrenades = msg.grenades;

    // Derive phase transition events from the game state stream, since the
    // server only broadcasts phase info inline with gameState messages.
    if (msg.phase !== this.lastPhase) {
      if (msg.phase === MatchPhase.ACTIVE) {
        this.emit('matchStart');
      }
      this.lastPhase = msg.phase;
    }
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
      // No unacknowledged inputs — just accept server state
      this.localPlayerState = this.serverStateToPlayerState(serverState);
      return;
    }

    const result = this.reconciliation.reconcile(
      serverState,
      predictions,
      this.collisionGrid,
    );

    // Apply reconciled position to local state, keep server-authoritative
    // values for health, ammo, etc.
    this.localPlayerState = {
      ...this.localPlayerState,
      position: result.position,
      velocity: result.velocity,
      stamina: result.stamina,
      // Always trust server for these values
      health: serverState.health,
      ammo: serverState.ammo,
      grenades: serverState.grenades,
      isReloading: serverState.isReloading,
      isDead: serverState.isDead,
      respawnTimer: serverState.respawnTimer,
      invulnerableTimer: serverState.invulnerableTimer,
      score: serverState.score,
      deaths: serverState.deaths,
      nickname: serverState.nickname,
    };
  }

  private serverStateToPlayerState(
    s: ServerGameStateMessage['players'][number],
  ): PlayerState {
    return {
      id: s.id,
      position: { x: s.position.x, y: s.position.y },
      velocity: { x: s.velocity.x, y: s.velocity.y },
      aimAngle: s.aimAngle,
      health: s.health,
      maxHealth: PLAYER.MAX_HEALTH,
      ammo: s.ammo,
      grenades: s.grenades,
      isReloading: s.isReloading,
      reloadTimer: 0,
      isSprinting: s.isSprinting,
      stamina: s.stamina,
      isDead: s.isDead,
      respawnTimer: s.respawnTimer,
      invulnerableTimer: s.invulnerableTimer,
      lastProcessedInput: s.lastProcessedInput,
      score: s.score,
      deaths: s.deaths,
      nickname: s.nickname,
    };
  }

  private emit(event: EventName, ...args: unknown[]): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const cb of list) {
      cb(...args);
    }
  }
}
