import type { PlayerId } from '@shared/types/common.js';
import type { PlayerInput } from '@shared/types/player.js';
import type {
  MatchResult,
  GameModeType,
  KillConfirmedCollection,
  PracticeGauntletMatch,
  PracticeGauntletRouteId,
  RumbleCrownState,
  RumbleGrudge,
  RumbleLeadState,
  TeamId,
  MatchKind,
} from '@shared/types/game.js';
import type {
  DraftCategory,
  LeaderboardEntry,
  ServerDailyGauntletLeaderboardMessage,
  ServerDraftStateMessage,
  ServerMatchFoundMessage,
  ServerMatchmakingStatusMessage,
  ServerPlayerKilledMessage,
  ServerCharacterSelectStateMessage,
  ServerCapabilities,
  SerializedPlayerState,
  ServerPartyErrorMessage,
  ServerPartyLeftMessage,
  BattleRoyaleMatchLaunch,
} from '@shared/types/network.js';
import type { ArenaWins } from '@shared/types/map.js';
import { createEmptyCharacterWins } from '@shared/config/game.js';
import type { BotDifficulty, PracticeKind } from '@shared/config/game.js';
import type { CharacterId, WeaponId, MutatorId, TauntId } from '@shared/config/game.js';
import { listMapNames } from '@shared/maps/registry.js';
import { NetworkManager, type LocalCorrection } from '../network/network-manager.js';
import type { NormalizedArenaSchedule } from '../network/arena-schedule.js';
import {
  normalizeStandardMatchLaunch,
  type MatchIntent,
  type StandardMatchLaunch,
} from '@shared/matchmaking/match-intent.js';
import type { PartyState } from '@shared/matchmaking/party.js';
import { localArenaWinsFromDraft, mergeArenaWinsFromResult } from './record-snapshots.js';

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
  matchKind?: MatchKind;
  /** Client validation result for the additive direct-launch projection. */
  standardLaunchStatus?: 'absent' | 'valid' | 'invalid';
  /** Present only when the complete server-owned projection validates. */
  standardMatch?: Readonly<StandardMatchLaunch>;
  /** Client validation result for the complete eight-slot launch projection. */
  battleRoyaleLaunchStatus?: 'absent' | 'valid' | 'invalid';
  battleRoyale?: Readonly<BattleRoyaleMatchLaunch>;
  /** Immutable server-authored sides for Crew Battle. */
  playerTeams?: Record<PlayerId, TeamId>;
  practiceKind?: PracticeKind;
  /** Reigning champion in this connected Rumble rematch chain. */
  rumbleCrown?: RumbleCrownState;
  /** Local fighter's personal target from the previous Rumble round. */
  rumbleGrudge?: RumbleGrudge;
  /** Persisted real-match wins for every selectable fighter. */
  characterWins: Record<CharacterId, number>;
  /** Present only during the escalating three-fight solo run. */
  gauntlet?: PracticeGauntletMatch;
  /** Accepted player-authored mid-match event for an ordinary Spar. */
  practiceMutatorId?: MutatorId;
}

type GameServiceEvent =
  | 'connecting'
  | 'connected'
  | 'capabilitiesChanged'
  | 'lobbyConfig'
  | 'partyState'
  | 'partyLeft'
  | 'partyError'
  | 'reconnecting'
  | 'disconnected'
  | 'matchFound'
  | 'draftState'
  | 'matchCountdown'
  | 'matchStart'
  | 'matchEnd'
  | 'matchmakingStatus'
  | 'rematchStatus'
  | 'opponentDisconnected'
  | 'playerLeft'
  | 'characterSelectState'
  | 'playerKilled'
  | 'pickupCollected'
  | 'confirmedTagCollected'
  | 'rumbleLeadChanged'
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
  | 'taunt'
  | 'leaderboard'
  | 'dailyGauntletLeaderboard';

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
  /** Latest server-authored mastery snapshot, zero-filled until one arrives. */
  private latestCharacterWins: Readonly<Record<CharacterId, number>> = Object.freeze(
    createEmptyCharacterWins(),
  );
  /** Latest local server-authored arena record, retained for Records presentation. */
  private latestArenaWins: Readonly<ArenaWins> | null = null;
  private lastMatchResult: MatchResult | null = null;
  /**
   * Latest all-time leaderboard from the server (empty until the first
   * server:leaderboard arrives). Cached so a scene created after the
   * message — LobbyScene mounts before the connection opens, and again
   * after every match — can render it immediately via getLeaderboard().
   */
  private latestLeaderboard: LeaderboardEntry[] = [];
  /** Latest server-clock Daily Run board; null until the connect snapshot. */
  private latestDailyGauntletLeaderboard: ServerDailyGauntletLeaderboardMessage | null = null;
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

  retryConnection(): void {
    this.networkManager.retryConnection();
  }

  disconnect(): void {
    this.networkManager.disconnect();
  }

  getPlayerId(): PlayerId | null {
    return this.networkManager.getPlayerId();
  }

  getServerCapabilities(): Readonly<ServerCapabilities> {
    return this.networkManager.getServerCapabilities();
  }

  getArenaSchedule(): NormalizedArenaSchedule | null {
    return this.networkManager.getArenaSchedule();
  }

  getNickname(): string {
    return this.localNickname;
  }

  getCurrentMatch(): MatchData | null {
    return this.currentMatch;
  }

  getLatestCharacterWins(): Readonly<Record<CharacterId, number>> {
    return this.latestCharacterWins;
  }

  getLatestArenaWins(): Readonly<ArenaWins> | null {
    return this.latestArenaWins;
  }

  getLastMatchResult(): MatchResult | null {
    return this.lastMatchResult;
  }

  /** Latest cached all-time top players (empty before the first message). */
  getLeaderboard(): LeaderboardEntry[] {
    return this.latestLeaderboard;
  }

  /** Current server-authored Daily Run board, if the connect snapshot arrived. */
  getDailyGauntletLeaderboard(): ServerDailyGauntletLeaderboardMessage | null {
    return this.latestDailyGauntletLeaderboard;
  }

  /** Latest cached draft snapshot; null outside an active draft. */
  getDraftState(): ServerDraftStateMessage | null {
    return this.latestDraftState;
  }

  joinMatchmaking(nickname: string): void {
    this.localNickname = nickname;
    this.networkManager.joinMatchmaking(nickname);
  }

  joinRumble(nickname: string): void {
    this.localNickname = nickname;
    this.networkManager.joinRumble(nickname);
  }

  joinBattleRoyale(nickname: string, fighterId: CharacterId): void {
    this.localNickname = nickname;
    this.networkManager.joinBattleRoyale(nickname, fighterId);
  }

  submitMatchIntent(nickname: string, intent: Readonly<MatchIntent>): void {
    this.localNickname = nickname;
    this.networkManager.submitMatchIntent(nickname, intent);
  }

  createParty(nickname: string, intent: Readonly<MatchIntent>): void {
    this.networkManager.createParty(nickname, intent);
  }

  joinParty(nickname: string, joinTarget: string, fighterId: CharacterId): void {
    this.networkManager.joinParty(nickname, joinTarget, fighterId);
  }

  leaveParty(): void {
    this.networkManager.leaveParty();
  }

  kickPartyMember(memberId: PlayerId): void {
    this.networkManager.kickPartyMember(memberId);
  }

  updatePartyIntent(intent: Readonly<MatchIntent>): void {
    this.networkManager.updatePartyIntent(intent);
  }

  updatePartyFighter(fighterId: CharacterId): void {
    this.networkManager.updatePartyFighter(fighterId);
  }

  setPartyReady(ready: boolean): void {
    this.networkManager.setPartyReady(ready);
  }

  cancelPartyQueue(): void {
    this.networkManager.cancelPartyQueue();
  }

  confirmPartyBotFill(): void {
    this.networkManager.confirmPartyBotFill();
  }

  getPartyState(): Readonly<PartyState> | null {
    return this.networkManager.getPartyState();
  }

  startPractice(
    nickname: string,
    difficulty: BotDifficulty,
    kind: PracticeKind = 'sparring',
    gameMode?: GameModeType,
    opponentCharacterId?: CharacterId,
    mutatorId?: MutatorId,
  ): void {
    this.localNickname = nickname;
    this.networkManager.startPractice(
      nickname,
      difficulty,
      kind,
      gameMode,
      opponentCharacterId,
      mutatorId,
    );
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

  sendTaunt(tauntId: TauntId): void {
    this.networkManager.sendTaunt(tauntId);
  }

  requestRematch(gauntletRouteId?: PracticeGauntletRouteId): void {
    this.networkManager.requestRematch(gauntletRouteId);
  }

  requestPartyRematch(): void {
    this.networkManager.requestPartyRematch();
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
    this.networkManager.on('connecting', () => {
      this.emit('connecting');
    });

    this.networkManager.on('connected', () => {
      this.emit('connected');
    });

    this.networkManager.on('welcome', () => {
      this.emit('capabilitiesChanged', this.networkManager.getServerCapabilities());
    });

    this.networkManager.on('lobbyConfig', (schedule: NormalizedArenaSchedule | null) => {
      this.emit('lobbyConfig', schedule);
    });
    this.networkManager.on('partyState', (state: Readonly<PartyState> | null) => {
      this.emit('partyState', state);
    });
    this.networkManager.on('partyLeft', (message: ServerPartyLeftMessage) => {
      this.emit('partyLeft', message);
    });
    this.networkManager.on('partyError', (message: ServerPartyErrorMessage) => {
      this.emit('partyError', message);
    });

    this.networkManager.on('reconnecting', () => {
      this.currentMatch = null;
      this.latestDraftState = null;
      this.emit('reconnecting');
    });

    this.networkManager.on('disconnected', () => {
      // A dropped connection tears down any in-flight draft server-side.
      this.currentMatch = null;
      this.latestDraftState = null;
      this.emit('disconnected');
    });

    this.networkManager.on('matchFound', (msg: ServerMatchFoundMessage) => {
      const characterWins = Object.freeze({
        ...createEmptyCharacterWins(),
        ...msg.characterWins,
      });
      this.latestCharacterWins = characterWins;
      const rawStandardMatch = msg.standardMatch;
      const standardMatch =
        rawStandardMatch !== undefined &&
        (msg.matchKind === 'duel' || msg.matchKind === 'rumble' || msg.matchKind === 'duos')
          ? normalizeStandardMatchLaunch(rawStandardMatch, {
              localPlayerId: this.getPlayerId(),
              expectedMapName: msg.mapName,
              expectedMode: msg.gameMode,
              expectedMatchKind: msg.matchKind,
              expectedPlayerTeams: msg.playerTeams,
              allowedArenaNames: listMapNames(),
            })
          : null;
      const rawBattleRoyale = msg.battleRoyale;
      const battleRoyale =
        msg.matchKind === 'battle_royale' &&
        rawBattleRoyale !== undefined &&
        Number.isInteger(rawBattleRoyale.participantCount) &&
        Number.isInteger(rawBattleRoyale.humanCount) &&
        Number.isInteger(rawBattleRoyale.botCount) &&
        rawBattleRoyale.participantCount === 8 &&
        rawBattleRoyale.humanCount >= 1 &&
        rawBattleRoyale.humanCount <= 8 &&
        rawBattleRoyale.botCount >= 0 &&
        rawBattleRoyale.humanCount + rawBattleRoyale.botCount === 8 &&
        msg.opponents.length === 7
          ? Object.freeze({ ...rawBattleRoyale })
          : null;
      this.currentMatch = {
        matchId: msg.matchId,
        opponents: msg.opponents,
        mapName: msg.mapName,
        gameMode: msg.gameMode,
        matchKind: msg.matchKind ?? (msg.gauntlet ? 'practice' : 'duel'),
        standardLaunchStatus:
          rawStandardMatch === undefined ? 'absent' : standardMatch === null ? 'invalid' : 'valid',
        ...(standardMatch ? { standardMatch } : {}),
        battleRoyaleLaunchStatus:
          rawBattleRoyale === undefined ? 'absent' : battleRoyale === null ? 'invalid' : 'valid',
        ...(battleRoyale ? { battleRoyale } : {}),
        playerTeams: msg.playerTeams,
        practiceKind: msg.practiceKind,
        rumbleCrown: msg.rumbleCrown,
        rumbleGrudge: msg.rumbleGrudge,
        characterWins: { ...characterWins },
        gauntlet: msg.gauntlet,
        practiceMutatorId: msg.practiceMutatorId,
      };
      // matchFound ends any draft (both picks in, or the FORCE/no-draft
      // path) — drop the cache so a later scene can't render a stale one.
      this.latestDraftState = null;
      this.emit('matchFound', this.currentMatch);
    });

    this.networkManager.on('draftState', (msg: ServerDraftStateMessage) => {
      this.latestDraftState = msg;
      const arenaWins = localArenaWinsFromDraft(msg.players, this.getPlayerId());
      if (arenaWins) this.latestArenaWins = Object.freeze(arenaWins);
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
      const arenaWins = mergeArenaWinsFromResult(
        this.latestArenaWins,
        msg.result,
        this.getPlayerId(),
      );
      this.latestArenaWins = arenaWins ? Object.freeze(arenaWins) : null;
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

    this.networkManager.on('playerLeft', (playerId: PlayerId, nickname: string) => {
      this.emit('playerLeft', playerId, nickname);
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

    this.networkManager.on('confirmedTagCollected', (collection: KillConfirmedCollection) => {
      this.emit('confirmedTagCollected', collection);
    });

    this.networkManager.on(
      'rumbleLeadChanged',
      (state: RumbleLeadState, players: SerializedPlayerState[]) => {
        this.emit('rumbleLeadChanged', state, players);
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

    this.networkManager.on('taunt', (playerId: PlayerId, tauntId: TauntId) => {
      this.emit('taunt', playerId, tauntId);
    });

    this.networkManager.on('leaderboard', (entries: LeaderboardEntry[]) => {
      this.latestLeaderboard = entries;
      this.emit('leaderboard', entries);
    });

    this.networkManager.on(
      'dailyGauntletLeaderboard',
      (snapshot: ServerDailyGauntletLeaderboardMessage) => {
        this.latestDailyGauntletLeaderboard = snapshot;
        this.emit('dailyGauntletLeaderboard', snapshot);
      },
    );
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
