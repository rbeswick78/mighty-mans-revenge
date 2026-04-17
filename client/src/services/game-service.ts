import type { PlayerId } from '@shared/types/common.js';
import type { PlayerInput } from '@shared/types/player.js';
import type { MatchResult } from '@shared/types/game.js';
import type {
  ServerMatchFoundMessage,
  ServerMatchmakingStatusMessage,
} from '@shared/types/network.js';
import { NetworkManager } from '../network/network-manager.js';

export interface MatchData {
  matchId: string;
  opponents: { id: PlayerId; nickname: string }[];
  mapName: string;
}

type GameServiceEvent =
  | 'connected'
  | 'disconnected'
  | 'matchFound'
  | 'matchCountdown'
  | 'matchStart'
  | 'matchEnd'
  | 'matchmakingStatus'
  | 'rematchStatus'
  | 'opponentDisconnected'
  | 'bulletTrail'
  | 'grenadeExploded';

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

  joinMatchmaking(nickname: string): void {
    this.localNickname = nickname;
    this.networkManager.joinMatchmaking(nickname);
  }

  cancelMatchmaking(): void {
    this.networkManager.cancelMatchmaking();
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
      this.emit('disconnected');
    });

    this.networkManager.on('matchFound', (msg: ServerMatchFoundMessage) => {
      this.currentMatch = {
        matchId: msg.matchId,
        opponents: msg.opponents,
        mapName: msg.mapName,
      };
      this.emit('matchFound', this.currentMatch);
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
      this.emit('opponentDisconnected', playerId);
    });

    this.networkManager.on('bulletTrail', (trail: unknown) => {
      this.emit('bulletTrail', trail);
    });

    this.networkManager.on('grenadeExploded', (pos: unknown) => {
      this.emit('grenadeExploded', pos);
    });
  }

  private emit(event: GameServiceEvent, ...args: unknown[]): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const cb of list) {
      cb(...args);
    }
  }
}
