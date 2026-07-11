import type { PlayerId } from '@shared/types/common.js';
import type { PlayerInput } from '@shared/types/player.js';
import type {
  MatchResult,
  GameModeType,
  KillConfirmedCollection,
} from '@shared/types/game.js';
import type {
  DraftCategory,
  LeaderboardEntry,
  ServerDraftStateMessage,
  ServerMatchFoundMessage,
  ServerMatchmakingStatusMessage,
  ServerPlayerKilledMessage,
  ServerCharacterSelectStateMessage,
} from '@shared/types/network.js';
import type { BotDifficulty } from '@shared/config/game.js';
import type { CharacterId, WeaponId, MutatorId } from '@shared/config/game.js';
import { NetworkManager, type LocalCorrection } from '../network/network-manager.js';

export interface EventWarningPayload {
  event: MutatorId;
  activatesInMs: number;
  /** True for the guaranteed final-minute slot, false for mid-match. */
  isFinalMinute: boolean;
}

export interface EventStartPayload {
  event: MutatorId;
  isFinalMinute: boolean;
}

/** "SHOTGUN INCOMING" — a weapon pickup is about to (re)spawn. */
export interface WeaponIncomingPayload {
  weaponId: WeaponId;
  landsInMs: number;
}

export interface MatchData {
  matchId: string;
  opponents: { id: PlayerId; nickname: string }[];
  mapName: string;
  /** Mode this match will be played in — drives the pre-match mode label. */
  gameMode: GameModeType;
}

type GameServiceEvent =
  | 'connected'
  | 'disconnected'
  | 'matchFound'
  | 'draftState'
  | 'matchCountdown'
  | 'matchStart'
  | 'matchEnd'
  | 'matchmakingStatus'
  | 'rematchStatus'
  | 'opponentDisconnected'
  | 'characterSelectState'
  | 'playerKilled'
  | 'pickupCollected'
  | 'confirmedTagCollected'
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
  | 'leaderboard';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GameServiceCallback = (...args: any[]) => void;

/**
 * Singleton glue layer between Phaser scenes and networking.
 * Owns the NetworkManager and provides methods scenes can call.
 */
export class GameService {
  private static instance: GameService | null = null;

  private readonly networkManager: NetworkManager;
  private currentMatch: MatchData | null = null;
  private lastMatchResult: MatchResult | null = null;
  /**
   * Latest all-time leaderboard from the server (empty until the first
   * server:leaderboard arrives). Cached so a scene created after the
   * message — LobbyScene mounts before the connection opens, and again
   * after every match — can render it immediately via getLeaderboard().
   */
  private latestLeaderboard: LeaderboardEntry[] = [];
  /**
   * Latest pre-match draft snapshot, cached like the leaderboard so the
   * DraftScene — created only AFTER the first draftState routed the lobby
   * or results screen there — renders immediately from getDraftState().
   * Cleared on matchFound (the message that ends every draft).
   */
  private latestDraftState: ServerDraftStateMessage | null = null;
  private localNickname = '';
  private listeners = new Map<GameServiceEvent, GameServiceCallback[]>();

  private constructor() {
    this.networkManager = new NetworkManager();
    this.wireNetworkEvents();
  }

  static getInstance(): GameService {
    if (!GameService.instance) {
      GameService.instance = new GameService();
    }
    return GameService.instance;
  }

  /** For testing — reset the singleton. */
  static resetInstance(): void {
    if (GameService.instance) {
      GameService.instance.disconnect();
      GameService.instance = null;
    }
  }

  getNetworkManager(): NetworkManager {
    return this.networkManager;
  }

  async connect(): Promise<void> {
    await this.networkManager.connect();
  }

  disconnect(): void {
    this.networkManager.disconnect();
  }

  getPlayerId(): PlayerId | null {
    return this.networkManager.getPlayerId();
  }

  getNickname(): string {
    return this.localNickname;
  }

  getCurrentMatch(): MatchData | null {
    return this.currentMatch;
  }

  getLastMatchResult(): MatchResult | null {
    return this.lastMatchResult;
  }

  /** Latest cached all-time top players (empty before the first message). */
  getLeaderboard(): LeaderboardEntry[] {
    return this.latestLeaderboard;
  }

  /** Latest cached draft snapshot; null outside an active draft. */
  getDraftState(): ServerDraftStateMessage | null {
    return this.latestDraftState;
  }

  joinMatchmaking(nickname: string): void {
    this.localNickname = nickname;
    this.networkManager.joinMatchmaking(nickname);
  }

  startPractice(nickname: string, difficulty: BotDifficulty): void {
    this.localNickname = nickname;
    this.networkManager.startPractice(nickname, difficulty);
  }

  cancelMatchmaking(): void {
    this.networkManager.cancelMatchmaking();
  }

  sendCharacterHover(characterId: CharacterId): void {
    this.networkManager.sendCharacterHover(characterId);
  }

  sendCharacterLock(characterId: CharacterId): void {
    this.networkManager.sendCharacterLock(characterId);
  }

  sendDraftPick(category: DraftCategory, value: string): void {
    this.networkManager.sendDraftPick(category, value);
  }

  sendInput(input: PlayerInput): void {
    this.networkManager.sendInput(input);
  }

  requestRematch(): void {
    this.networkManager.requestRematch();
  }

  returnToLobby(): void {
    this.networkManager.returnToLobby();
    this.currentMatch = null;
  }

  on(event: GameServiceEvent, callback: GameServiceCallback): void {
    const list = this.listeners.get(event);
    if (list) {
      list.push(callback);
    } else {
      this.listeners.set(event, [callback]);
    }
  }

  off(event: GameServiceEvent, callback: GameServiceCallback): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(callback);
    if (idx !== -1) list.splice(idx, 1);
  }

  // ──────────────────────────── Private ────────────────────────────

  private wireNetworkEvents(): void {
    this.networkManager.on('connected', () => {
      this.emit('connected');
    });

    this.networkManager.on('disconnected', () => {
      // A dropped connection tears down any in-flight draft server-side.
      this.latestDraftState = null;
      this.emit('disconnected');
    });

    this.networkManager.on('matchFound', (msg: ServerMatchFoundMessage) => {
      this.currentMatch = {
        matchId: msg.matchId,
        opponents: msg.opponents,
        mapName: msg.mapName,
        gameMode: msg.gameMode,
      };
      // matchFound ends any draft (both picks in, or the FORCE/no-draft
      // path) — drop the cache so a later scene can't render a stale one.
      this.latestDraftState = null;
      this.emit('matchFound', this.currentMatch);
    });

    this.networkManager.on('draftState', (msg: ServerDraftStateMessage) => {
      this.latestDraftState = msg;
      this.emit('draftState', msg);
    });

    this.networkManager.on('matchCountdown', (countdown: number) => {
      this.emit('matchCountdown', countdown);
    });

    this.networkManager.on('matchStart', () => {
      this.emit('matchStart');
    });

    this.networkManager.on('matchEnd', (msg: { result: MatchResult }) => {
      this.lastMatchResult = msg.result;
      this.emit('matchEnd', msg.result);
    });

    this.networkManager.on('matchmakingStatus', (msg: ServerMatchmakingStatusMessage) => {
      this.emit('matchmakingStatus', msg);
    });

    this.networkManager.on('rematchStatus', (opponentWantsRematch: boolean) => {
      this.emit('rematchStatus', opponentWantsRematch);
    });

    this.networkManager.on('opponentDisconnected', (playerId: PlayerId) => {
      // Same contract as post-match: an opponent leaving mid-draft
      // dissolves it (the server stops broadcasting draftState).
      this.latestDraftState = null;
      this.emit('opponentDisconnected', playerId);
    });

    this.networkManager.on('characterSelectState', (msg: ServerCharacterSelectStateMessage) => {
      this.emit('characterSelectState', msg);
    });

    this.networkManager.on('playerKilled', (msg: ServerPlayerKilledMessage) => {
      this.emit('playerKilled', msg.entry);
    });

    this.networkManager.on('pickupCollected', (pickupId: string, pid: PlayerId) => {
      this.emit('pickupCollected', pickupId, pid);
    });

    this.networkManager.on(
      'confirmedTagCollected',
      (collection: KillConfirmedCollection) => {
        this.emit('confirmedTagCollected', collection);
      },
    );

    this.networkManager.on('bulletTrail', (trail: unknown) => {
      this.emit('bulletTrail', trail);
    });

    this.networkManager.on('grenadeThrown', (pos: unknown) => {
      this.emit('grenadeThrown', pos);
    });

    this.networkManager.on('grenadeExploded', (pos: unknown) => {
      this.emit('grenadeExploded', pos);
    });

    this.networkManager.on('axeThrown', (pos: unknown) => {
      this.emit('axeThrown', pos);
    });

    this.networkManager.on('axeResolved', (payload: unknown) => {
      this.emit('axeResolved', payload);
    });

    this.networkManager.on('punchSwung', (punch: unknown) => {
      this.emit('punchSwung', punch);
    });

    this.networkManager.on('localCorrection', (correction: LocalCorrection) => {
      this.emit('localCorrection', correction);
    });

    this.networkManager.on('eventWarning', (payload: EventWarningPayload) => {
      this.emit('eventWarning', payload);
    });

    this.networkManager.on('eventStart', (payload: EventStartPayload) => {
      this.emit('eventStart', payload);
    });

    this.networkManager.on('weaponIncoming', (payload: WeaponIncomingPayload) => {
      this.emit('weaponIncoming', payload);
    });

    this.networkManager.on('tilesDestroyed', (tiles: Array<{ col: number; row: number }>) => {
      this.emit('tilesDestroyed', tiles);
    });

    this.networkManager.on('overtimeStart', () => {
      this.emit('overtimeStart');
    });

    this.networkManager.on('leaderboard', (entries: LeaderboardEntry[]) => {
      this.latestLeaderboard = entries;
      this.emit('leaderboard', entries);
    });
  }

  private emit(event: GameServiceEvent, ...args: unknown[]): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const cb of list) {
      try {
        cb(...args);
      } catch (err) {
        // Isolate per-listener exceptions — a stale scene's handler
        // throwing must not stop the live scene's handler from running.
        console.error('[GameService] listener for', event, 'threw', err);
      }
    }
  }
}
