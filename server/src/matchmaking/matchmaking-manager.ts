import {
  MatchPhase,
  GameModeType,
  GAME_MODE_ROTATION,
  DRAFT,
  RUMBLE,
  BATTLE_ROYALE_QUEUE,
  CREW_BATTLE,
  CREW_BATTLE_MODES,
  RIVALRY_SET,
  BOT,
  BOT_DIFFICULTIES,
  DEFAULT_BOT_DIFFICULTY,
  SCRAP_PIT_RIVALS,
  PRACTICE_KINDS,
  CHARACTER_IDS,
  MUTATORS,
  createEmptyArenaWins,
  createEmptyCharacterWins,
  DAILY_GAUNTLET_LEADERBOARD,
  LEADERBOARD,
  getNextGameMode,
  getNextCrewBattleMode,
  isCrewBattleMode,
  getMap,
  getBattleRoyaleMap,
  getNextMapName,
  listMapNames,
  MAP_REGISTRY,
  practiceGauntletMatch,
  dailyChallengeKey,
  practiceDailyGauntletOpening,
  practiceDailyGauntletRng,
  practiceGauntletBoonChoice,
  practiceGauntletMutatorChoice,
  practiceGauntletOpponentChoices,
  practiceGauntletRoutes,
  practiceGauntletStyleBonus,
  resolvePracticeGauntlet,
  selectPracticeGauntletRoute,
  isMutatorCompatibleWithMode,
  isMutatorId,
  mutatorsConflict,
  matchIntentQueueKey,
} from '@shared/game';
import type { ArenaWins, MapData } from '@shared/game';
import type {
  PlayerId,
  MatchResult,
  ServerGameStateMessage,
  ServerDraftStateMessage,
  SerializedPlayerState,
  CharacterId,
  DraftCategory,
  DraftFirstPickerReason,
  RivalrySetResult,
  RumbleCrownState,
  RumbleGrudges,
  BotDifficulty,
  GauntletBoonId,
  MutatorId,
  TauntId,
  MatchContractId,
  PracticeKind,
  PracticeGauntletMatch,
  PracticeGauntletRoute,
  PracticeGauntletRouteId,
  TeamId,
  MatchIntent,
  StandardMatchLaunch,
  PartyState,
  PartyParticipant,
  ScheduledArenaLock,
  BattleRoyaleMatchLaunch,
} from '@shared/game';
import { Match } from '../game/match.js';
import type { MatchLifecycleOptions } from '../game/match.js';
import { BotController } from '../game/bot-controller.js';
import { getGameMode } from '../game/modes/index.js';
import { GameServer } from '../network/server.js';
import { MatchmakingQueue } from './matchmaking-queue.js';
import { RumbleQueue } from './rumble-queue.js';
import { BattleRoyaleQueue, type BattleRoyaleQueueLaunch } from './battle-royale-queue.js';
import { CrewQueue, type CrewQueueEntry } from './crew-queue.js';
import { MatchIntentQueue, type MatchIntentQueueEntry } from './match-intent-queue.js';
import { resolveRumbleCrown } from './rumble-crown.js';
import { resolveRumbleGrudges } from './rumble-grudges.js';
import { logger } from '../utils/logger.js';
import type { PartyLaunchResult } from './party-manager.js';
import type {
  PersistentStatsStore,
  MatchStatsEntry,
} from '../persistence/persistent-stats-store.js';

/**
 * How long the post-match state is kept alive while waiting for both players
 * to click rematch (or one to bail to lobby). Reset every time *either*
 * player presses REMATCH so the opponent always has the full window to
 * respond after they see "Opponent wants a rematch!" — without that reset,
 * the timer runs from match end, the stats screen + read time eats most of
 * it, and the second player's click silently no-ops because the state was
 * already torn down. See handleRematchRequest.
 */
const REMATCH_TIMEOUT_MS = 60_000;

interface PracticeGauntletRunHistory {
  opponentCharacterIds: CharacterId[];
  forecastMutatorIds: MutatorId[];
}

interface PostMatchState {
  matchId: string;
  playerIds: PlayerId[];
  rematchRequests: Set<PlayerId>;
  returnedToLobby: Set<PlayerId>;
  timeoutHandle: ReturnType<typeof setTimeout>;
  /**
   * Map a rematch will be played on — pinned at match end so it always
   * agrees with the "NEXT MAP: X" line the results screen promised.
   */
  nextMapName: string;
  /**
   * Mode a rematch will be played in — same pinning contract as
   * nextMapName.
   */
  nextGameMode: GameModeType;
  /** Previous round's loser earns first pick in the rematch draft. */
  revengePickerId: PlayerId | null;
  /** A rematch after a clinch starts a clean first-to-N set. */
  setComplete: boolean;
  /** Practice rematches auto-accept for the synthetic opponent. */
  isPractice: boolean;
  practiceDifficulty: BotDifficulty | null;
  /** Player-selected Spar mode retained across direct Practice rematches. */
  practiceModePin: GameModeType | null;
  /** Player-selected Rusty fighter retained across direct Practice rematches. */
  practiceRivalPin: CharacterId | null;
  /** Player-selected Spar chaos retained across direct Practice rematches. */
  practiceMutatorPreference: MutatorId | null;
  /** Next Gauntlet fight, or stage one when the completed run must retry. */
  nextGauntlet: PracticeGauntletMatch | null;
  /** Server-authored advancement choices; empty for retries and non-Gauntlet matches. */
  gauntletRoutes: PracticeGauntletRoute[];
  /** Server-only no-repeat history carried only while a Gauntlet advances. */
  gauntletRunHistory: PracticeGauntletRunHistory;
  /** Both mutators from the completed round; random rematch rolls skip them. */
  previousMutators: MutatorId[];
  /** Previous round's contract; direct rematches must roll something fresh. */
  previousContractId: MatchContractId;
  /** Crown carried only if this exact connected Rumble group runs it back. */
  rumbleCrown: RumbleCrownState | null;
  /** Personal targets carried only into this connected group's direct rematch. */
  rumbleGrudges: RumbleGrudges;
  /** Crew Battle sides retained unchanged through direct rematches. */
  playerTeams: ReadonlyMap<PlayerId, TeamId>;
}

type MatchKind = 'duel' | 'rumble' | 'duos' | 'practice' | 'battle_royale';

interface MatchIntentArenaAuthority {
  lock(playerId: PlayerId, mode: GameModeType): Readonly<ScheduledArenaLock> | null;
  release(playerId: PlayerId): void;
}

interface PartyMatchContext {
  readonly partyId: string;
  readonly format: MatchIntent['format'];
  readonly mode: GameModeType;
  readonly participants: readonly PartyParticipant[];
}

interface IntentRematchContext {
  readonly previousMutators: readonly MutatorId[];
  readonly previousContractId: MatchContractId;
  readonly rumbleCrown: RumbleCrownState | null;
  readonly rumbleGrudges: RumbleGrudges;
}

interface IntentGroupLaunchResult {
  readonly matchId: string;
  readonly participants: readonly PartyParticipant[];
}

/**
 * A pre-match map/mode draft in progress. Lives BEFORE Match construction —
 * Match takes mapData/gameMode in its constructor (map manager, pickups,
 * mode instance all wire off them), so drafting inside Match would mean
 * rebuilding managers post-hoc. Keyed by the FUTURE matchId (generated up
 * front) so every draftState snapshot and the eventual matchFound carry the
 * same id; entrants sit in playerMatchMap under that id for the whole draft
 * so the queue guard and disconnect routing treat them as in-match.
 */
interface DraftState {
  matchId: string;
  playerEntries: { id: PlayerId; nickname: string; arenaWins: ArenaWins }[];
  /** Three-plus-player Rumbles vote together; every other draft uses two roles. */
  draftKind: 'turn' | 'rally';
  /** Winner of the who-picks-first roll — claims a category by picking. */
  firstPickerId: PlayerId;
  firstPickerReason: DraftFirstPickerReason;
  /** The entrant who picks whatever category the first picker leaves. */
  secondPickerId: PlayerId;
  /**
   * Whose pick the server is waiting on in a turn draft. Rally drafts keep
   * this null because every entrant acts during the same ballot phase.
   */
  currentPickerId: PlayerId | null;
  /** Active category and one immutable vote per entrant during a rally. */
  rallyCategory: DraftCategory | null;
  rallyVotes: Map<PlayerId, string>;
  mapPick: string | null;
  modePick: GameModeType | null;
  /**
   * Seconds until the server auto-picks for the current picker. Ticked
   * down by tick(dt) — no setTimeout, so tests drive it deterministically.
   */
  pickTimerSeconds: number;
  /** Previous round's mutators, carried through the draft into Match construction. */
  rematchMutatorExclusions: MutatorId[];
  /** Previous round's contract, carried through the draft into Match. */
  previousContractId?: MatchContractId;
  matchKind: 'duel' | 'rumble';
  /** Personal targets resolved from the immediately previous Rumble. */
  rumbleGrudges: RumbleGrudges;
}

interface RivalrySetState {
  playerIds: PlayerId[];
  wins: Map<PlayerId, number>;
  roundsPlayed: number;
  championId: PlayerId | null;
}

export class MatchmakingManager {
  private readonly queue: MatchmakingQueue;
  private readonly rumbleQueue: RumbleQueue;
  private readonly battleRoyaleQueue: BattleRoyaleQueue;
  private readonly crewQueue: CrewQueue;
  private readonly matchIntentQueue: MatchIntentQueue;
  private readonly server: GameServer;
  private readonly activeMatches: Map<string, Match> = new Map();
  /** Queue family survives draft, live match, results, and direct rematches. */
  private readonly matchKinds: Map<string, MatchKind> = new Map();
  /** Crown entering each live/drafting Rumble, keyed by that match id. */
  private readonly rumbleCrowns: Map<string, RumbleCrownState> = new Map();
  /** Maps playerId -> matchId for routing messages. */
  private readonly playerMatchMap: Map<PlayerId, string> = new Map();
  /** Post-match state for rematch handling. */
  private readonly postMatchStates: Map<string, PostMatchState> = new Map();
  /** Pre-match drafts in progress, keyed by the future matchId. */
  private readonly draftStates: Map<string, DraftState> = new Map();
  /** Ephemeral first-to-N scores shared by consecutive rematches. */
  private readonly playerRivalrySets: Map<PlayerId, RivalrySetState> = new Map();
  /** Every live authoritative controller per practice match. */
  private readonly botControllers: Map<string, BotController[]> = new Map();
  /** Match ids whose lifetime stats must stay out of friend leaderboards. */
  private readonly practiceDifficulties: Map<string, BotDifficulty> = new Map();
  /** Optional validated mode choice for ordinary Sparring matches. */
  private readonly practiceModePins: Map<string, GameModeType> = new Map();
  /** Optional validated Rusty fighter choice for ordinary Sparring matches. */
  private readonly practiceRivalPins: Map<string, CharacterId> = new Map();
  /** Optional validated mid-match chaos choice for ordinary Sparring matches. */
  private readonly practiceMutatorPreferences: Map<string, MutatorId> = new Map();
  /** Authoritative stage metadata for live Gauntlet matches. */
  private readonly practiceGauntlets: Map<string, PracticeGauntletMatch> = new Map();
  /** Ordered rival/forecast history for each live Gauntlet run. */
  private readonly practiceGauntletRunHistories: Map<string, PracticeGauntletRunHistory> =
    new Map();
  /** Synthetic ids survive across direct practice rematches. */
  private readonly botPlayerIds: Set<PlayerId> = new Set();
  /** Track nicknames for players (set when they join matchmaking). */
  private readonly playerNicknames: Map<PlayerId, string> = new Map();
  /** Previous-tick phase per match, for detecting phase transitions. */
  private readonly previousPhases: Map<string, MatchPhase> = new Map();
  /**
   * Resolver for per-player RTT in milliseconds, supplied by GameManager.
   * Each new Match installs this so its lag-compensated shot path can
   * rewind to the shooter's render time. Defaults to 0 (no compensation)
   * when GameManager hasn't been given one — keeps tests trivial.
   */
  private readonly getPlayerRTT: (playerId: PlayerId) => number;
  /**
   * Lifetime kills/wins/head-to-head store. Optional so unit tests (and
   * any embedding without persistence) can skip it — results then ship
   * with rivalry: null.
   */
  private readonly statsStore: PersistentStatsStore | undefined;
  /**
   * Randomness source for the draft: the who-picks-first roll and every
   * timeout auto-pick. Injectable so tests can drive the draft
   * deterministically; production uses Math.random. Contract: [0, 1).
   */
  private readonly rng: () => number;
  /** UTC wall clock used only to name the shared Daily Run challenge. */
  private readonly now: () => Date;
  /** Server-owned schedule lock/release seam supplied by GameManager. */
  private readonly matchIntentArenaAuthority: MatchIntentArenaAuthority | undefined;
  /** Per-connection replay protection retained through cancellation. */
  private readonly seenMatchIntentIds = new Map<PlayerId, Set<string>>();
  /** Party identity follows its authoritative match through Results/rematches. */
  private readonly partyIdByMatchId = new Map<string, string>();
  private readonly partyMatchContexts = new Map<string, Readonly<PartyMatchContext>>();
  private partyLifecycleListener:
    | ((partyId: string, lifecycle: 'match' | 'results' | 'assembling', matchId?: string) => void)
    | null = null;
  /**
   * Round-robin cursor over registry order, consulted ONLY when a FORCE
   * pin skips the draft (the pinned category is forced; the other one
   * rotates). Real matches draft their map, so the cursor survives just
   * for the smoke-pin/kill-switch path.
   */
  private mapRotationIndex = 0;
  /** Same contract for game modes (FORCE-pinned matches only). */
  private modeRotationIndex = 0;
  /** Suppress 20Hz reliable queue spam; the lobby only renders whole seconds. */
  private lastRumbleStatusKey = '';
  /** Same throttle contract for the one-to-eight-human Battle Royale wait. */
  private lastBattleRoyaleStatusKey = '';
  /** Same throttle contract for the one-or-two-human Crew ally window. */
  private lastCrewStatusKey = '';

  constructor(
    server: GameServer,
    getPlayerRTT: (playerId: PlayerId) => number = () => 0,
    statsStore?: PersistentStatsStore,
    rng: () => number = Math.random,
    now: () => Date = () => new Date(),
    matchIntentArenaAuthority?: MatchIntentArenaAuthority,
  ) {
    this.server = server;
    this.queue = new MatchmakingQueue();
    this.rumbleQueue = new RumbleQueue();
    this.battleRoyaleQueue = new BattleRoyaleQueue(() => now().getTime());
    this.crewQueue = new CrewQueue();
    this.matchIntentQueue = new MatchIntentQueue();
    this.getPlayerRTT = getPlayerRTT;
    this.statsStore = statsStore;
    this.rng = rng;
    this.now = now;
    this.matchIntentArenaAuthority = matchIntentArenaAuthority;
  }

  /** Party creation/joining is mutually exclusive with every queue or match. */
  isPlayerBusy(playerId: PlayerId): boolean {
    return (
      this.playerMatchMap.has(playerId) ||
      this.queue.isPlayerQueued(playerId) ||
      this.rumbleQueue.isPlayerQueued(playerId) ||
      this.battleRoyaleQueue.isPlayerQueued(playerId) ||
      this.crewQueue.isPlayerQueued(playerId) ||
      this.matchIntentQueue.isPlayerQueued(playerId)
    );
  }

  setPartyLifecycleListener(
    listener: (
      partyId: string,
      lifecycle: 'match' | 'results' | 'assembling',
      matchId?: string,
    ) => void,
  ): void {
    this.partyLifecycleListener = listener;
  }

  /** Queue a complete ready room through the same locks and launch path as Batch 11. */
  handleSubmitParty(state: Readonly<PartyState>): Readonly<PartyLaunchResult> | null {
    if (
      state.lifecycle !== 'queued' ||
      state.members.length !== state.capacity ||
      !state.members.every((member) => member.ready) ||
      !this.matchIntentArenaAuthority
    ) {
      return null;
    }
    const lockedPlayers: PlayerId[] = [];
    const entries: MatchIntentQueueEntry[] = [];
    for (const member of state.members) {
      if (this.isPlayerBusy(member.playerId)) {
        for (const playerId of lockedPlayers) this.matchIntentArenaAuthority.release(playerId);
        return null;
      }
      const lock = this.matchIntentArenaAuthority.lock(member.playerId, state.intent.mode);
      if (
        lock === null ||
        lock.mode !== state.intent.mode ||
        lock.mapName !== state.intent.scheduledArena.mapName ||
        lock.rotationEndsAt !== state.intent.scheduledArena.rotationEndsAt
      ) {
        if (lock !== null) this.matchIntentArenaAuthority.release(member.playerId);
        for (const playerId of lockedPlayers) this.matchIntentArenaAuthority.release(playerId);
        return null;
      }
      lockedPlayers.push(member.playerId);
      this.playerNicknames.set(member.playerId, member.nickname);
      entries.push({
        playerId: member.playerId,
        nickname: member.nickname,
        joinedAt: member.joinedAt,
        intent: Object.freeze({
          ...state.intent,
          fighterId: member.fighterId,
          scheduledArena: Object.freeze({
            mode: lock.mode,
            mapName: lock.mapName,
            rotationEndsAt: lock.rotationEndsAt,
          }),
        }),
      });
    }
    for (const member of state.members) {
      this.server.sendTo(
        member.playerId,
        {
          type: 'server:matchmakingStatus',
          status: 'queued',
          matchKind: this.matchKindForFormat(state.format),
          groupSize: state.members.length,
          maxGroupSize: state.capacity,
          playersOnline: this.getOnlinePlayerCount(),
        },
        { reliable: true },
      );
    }
    const launch = this.launchIntentGroup(entries);
    for (const playerId of lockedPlayers) this.matchIntentArenaAuthority.release(playerId);
    this.partyIdByMatchId.set(launch.matchId, state.partyId);
    this.partyMatchContexts.set(
      launch.matchId,
      Object.freeze({
        partyId: state.partyId,
        format: state.format,
        mode: state.intent.mode,
        participants: launch.participants,
      }),
    );
    return Object.freeze({ matchId: launch.matchId, participants: launch.participants });
  }

  /** Results consensus keeps explicit mode/composition but re-locks the current arena. */
  handleSubmitPartyRematch(state: Readonly<PartyState>): Readonly<PartyLaunchResult> | null {
    if (
      state.lifecycle !== 'results' ||
      state.matchId === undefined ||
      state.rematch?.status !== 'ready' ||
      state.rematch.eligiblePlayerIds.length !== 0 ||
      !state.members.every((member) => member.ready) ||
      !this.matchIntentArenaAuthority
    ) {
      return null;
    }
    const previousMatchId = state.matchId;
    const postMatch = this.postMatchStates.get(previousMatchId);
    const context = this.partyMatchContexts.get(previousMatchId);
    if (
      !postMatch ||
      !context ||
      context.partyId !== state.partyId ||
      context.format !== state.format ||
      context.mode !== state.intent.mode ||
      this.partyIdByMatchId.get(previousMatchId) !== state.partyId
    ) {
      return null;
    }
    const expectedHumans = context.participants
      .filter((participant) => participant.source === 'human')
      .map((participant) => participant.playerId)
      .sort();
    const requestedHumans = state.members.map((member) => member.playerId).sort();
    const expectedBots = context.participants.filter(
      (participant) => participant.source === 'standard_bot',
    );
    if (
      expectedHumans.length !== requestedHumans.length ||
      expectedHumans.some((playerId, index) => playerId !== requestedHumans[index]) ||
      expectedBots.length !== state.intent.composition.botCount ||
      context.participants.length !== postMatch.playerIds.length ||
      context.participants.some(
        (participant) => !postMatch.playerIds.includes(participant.playerId),
      ) ||
      state.members.some(
        (member) =>
          context.participants.find((participant) => participant.playerId === member.playerId)
            ?.fighterId !== member.fighterId,
      )
    ) {
      return null;
    }

    const lockedPlayers: PlayerId[] = [];
    for (const member of state.members) {
      if (this.playerMatchMap.get(member.playerId) !== previousMatchId) {
        for (const playerId of lockedPlayers) this.matchIntentArenaAuthority.release(playerId);
        return null;
      }
      const lock = this.matchIntentArenaAuthority.lock(member.playerId, state.intent.mode);
      if (
        lock === null ||
        lock.mode !== state.rematch.currentArena.mode ||
        lock.mapName !== state.rematch.currentArena.mapName ||
        lock.rotationEndsAt !== state.rematch.currentArena.rotationEndsAt
      ) {
        if (lock !== null) this.matchIntentArenaAuthority.release(member.playerId);
        for (const playerId of lockedPlayers) this.matchIntentArenaAuthority.release(playerId);
        return null;
      }
      lockedPlayers.push(member.playerId);
    }

    const rematchIntent: Readonly<MatchIntent> = Object.freeze({
      ...state.intent,
      intentId: crypto.randomUUID(),
      scheduledArena: Object.freeze({ ...state.rematch.currentArena }),
    });
    const entries: MatchIntentQueueEntry[] = state.members.map((member) => ({
      playerId: member.playerId,
      nickname: member.nickname,
      joinedAt: member.joinedAt,
      intent: Object.freeze({ ...rematchIntent, fighterId: member.fighterId }),
    }));

    clearTimeout(postMatch.timeoutHandle);
    this.postMatchStates.delete(previousMatchId);
    this.matchKinds.delete(previousMatchId);
    this.rumbleCrowns.delete(previousMatchId);
    this.partyIdByMatchId.delete(previousMatchId);
    this.partyMatchContexts.delete(previousMatchId);
    for (const playerId of postMatch.playerIds) this.playerMatchMap.delete(playerId);
    this.releasePracticePlayers(postMatch.playerIds);
    if (postMatch.setComplete) this.releaseRivalrySet(postMatch.playerIds);

    const launch = this.launchIntentGroup(entries, {
      previousMutators: postMatch.previousMutators,
      previousContractId: postMatch.previousContractId,
      rumbleCrown: postMatch.rumbleCrown,
      rumbleGrudges: postMatch.rumbleGrudges,
    });
    for (const playerId of lockedPlayers) this.matchIntentArenaAuthority.release(playerId);
    this.partyIdByMatchId.set(launch.matchId, state.partyId);
    this.partyMatchContexts.set(
      launch.matchId,
      Object.freeze({
        partyId: state.partyId,
        format: state.format,
        mode: state.intent.mode,
        participants: launch.participants,
      }),
    );
    return Object.freeze({ matchId: launch.matchId, participants: launch.participants });
  }

  handleJoinMatchmaking(playerId: PlayerId, nickname: string): void {
    // If player is already in a match, ignore
    if (
      this.playerMatchMap.has(playerId) ||
      this.rumbleQueue.isPlayerQueued(playerId) ||
      this.battleRoyaleQueue.isPlayerQueued(playerId) ||
      this.crewQueue.isPlayerQueued(playerId) ||
      this.matchIntentQueue.isPlayerQueued(playerId)
    ) {
      logger.debug({ playerId }, 'Player already in a match, ignoring matchmaking request');
      return;
    }

    this.playerNicknames.set(playerId, nickname);
    this.queue.addPlayer(playerId, nickname);

    logger.info(
      { playerId, nickname, queueLength: this.queue.getQueueLength() },
      'Player joined matchmaking',
    );

    this.server.sendTo(
      playerId,
      {
        type: 'server:matchmakingStatus',
        status: 'queued',
        queuePosition: this.queue.getQueueLength(),
        playersOnline: this.getOnlinePlayerCount(),
      },
      { reliable: true },
    );

    // Try to match immediately
    this.tryCreateMatch();
  }

  handleJoinRumble(playerId: PlayerId, nickname: string): void {
    if (
      this.playerMatchMap.has(playerId) ||
      this.queue.isPlayerQueued(playerId) ||
      this.battleRoyaleQueue.isPlayerQueued(playerId) ||
      this.crewQueue.isPlayerQueued(playerId) ||
      this.matchIntentQueue.isPlayerQueued(playerId)
    ) {
      return;
    }
    this.playerNicknames.set(playerId, nickname);
    if (!this.rumbleQueue.addPlayer(playerId, nickname)) return;
    logger.info(
      { playerId, nickname, queueLength: this.rumbleQueue.getQueueLength() },
      'Player joined Wasteland Rumble',
    );
    this.broadcastRumbleStatus();
  }

  /** Enter the dormant capability-owned solo queue with one validated fighter. */
  handleJoinBattleRoyale(playerId: PlayerId, nickname: string, fighterId: CharacterId): boolean {
    if (
      !this.server.getCapabilities().battleRoyale ||
      !/^[A-Za-z0-9_.-]{2,16}$/.test(nickname) ||
      !CHARACTER_IDS.includes(fighterId) ||
      this.isPlayerBusy(playerId)
    ) {
      return false;
    }
    this.playerNicknames.set(playerId, nickname);
    if (!this.battleRoyaleQueue.addPlayer(playerId, nickname, fighterId)) return false;
    logger.info(
      { playerId, nickname, queueLength: this.battleRoyaleQueue.getQueueLength() },
      'Player joined Battle Royale queue',
    );
    this.tryCreateBattleRoyale(0);
    return true;
  }

  /** Queue one normalized generalized request against a fresh server-owned lock. */
  handleSubmitMatchIntent(
    playerId: PlayerId,
    nickname: string,
    intent: Readonly<MatchIntent>,
  ): boolean {
    const seen = this.seenMatchIntentIds.get(playerId) ?? new Set<string>();
    this.seenMatchIntentIds.set(playerId, seen);
    if (seen.has(intent.intentId)) return false;
    seen.add(intent.intentId);

    if (
      this.playerMatchMap.has(playerId) ||
      this.queue.isPlayerQueued(playerId) ||
      this.rumbleQueue.isPlayerQueued(playerId) ||
      this.battleRoyaleQueue.isPlayerQueued(playerId) ||
      this.crewQueue.isPlayerQueued(playerId) ||
      this.matchIntentQueue.isPlayerQueued(playerId) ||
      !this.matchIntentArenaAuthority
    ) {
      return false;
    }

    const lock = this.matchIntentArenaAuthority.lock(playerId, intent.mode);
    if (
      lock === null ||
      lock.mode !== intent.mode ||
      lock.mapName !== intent.scheduledArena.mapName ||
      lock.rotationEndsAt !== intent.scheduledArena.rotationEndsAt
    ) {
      this.matchIntentArenaAuthority.release(playerId);
      return false;
    }

    const authoritativeIntent: Readonly<MatchIntent> = Object.freeze({
      ...intent,
      composition: Object.freeze({ ...intent.composition }),
      scheduledArena: Object.freeze({
        mode: lock.mode,
        mapName: lock.mapName,
        rotationEndsAt: lock.rotationEndsAt,
      }),
    });
    this.playerNicknames.set(playerId, nickname);
    if (
      !this.matchIntentQueue.add({
        playerId,
        nickname,
        intent: authoritativeIntent,
        joinedAt: this.now().getTime(),
      })
    ) {
      this.matchIntentArenaAuthority.release(playerId);
      return false;
    }

    this.server.sendTo(
      playerId,
      {
        type: 'server:matchmakingStatus',
        status: 'queued',
        matchKind: this.matchKindForFormat(intent.format),
        groupSize: this.intentCompatibleQueueSize(authoritativeIntent),
        maxGroupSize: intent.composition.humanCount,
        playersOnline: this.getOnlinePlayerCount(),
      },
      { reliable: true },
    );
    this.tryCreateIntentMatches();
    return true;
  }

  /** Start solo Practice immediately, or enter Crew's short optional-ally window. */
  handleStartPractice(
    playerId: PlayerId,
    nickname: string,
    difficulty: BotDifficulty = DEFAULT_BOT_DIFFICULTY,
    kind: PracticeKind = 'sparring',
    gameMode?: GameModeType,
    opponentCharacterId?: CharacterId,
    mutatorId?: MutatorId,
  ): void {
    if (this.playerMatchMap.has(playerId) || this.matchIntentQueue.isPlayerQueued(playerId)) return;
    const safeDifficulty = BOT_DIFFICULTIES.includes(difficulty)
      ? difficulty
      : DEFAULT_BOT_DIFFICULTY;
    const safeKind = PRACTICE_KINDS.includes(kind) ? kind : 'sparring';
    const usesSparRules =
      safeKind === 'sparring' || safeKind === 'rusty_rumble' || safeKind === 'crew_battle';
    const practiceModePin =
      safeKind === 'crew_battle'
        ? gameMode !== undefined && isCrewBattleMode(gameMode)
          ? gameMode
          : null
        : usesSparRules && gameMode !== undefined && GAME_MODE_ROTATION.includes(gameMode)
          ? gameMode
          : null;
    const practiceRivalPin =
      safeKind !== 'crew_battle' &&
      usesSparRules &&
      opponentCharacterId !== undefined &&
      CHARACTER_IDS.includes(opponentCharacterId)
        ? opponentCharacterId
        : null;
    const practiceMutatorPreference = usesSparRules && isMutatorId(mutatorId) ? mutatorId : null;
    const dailyKey = safeKind === 'daily' ? dailyChallengeKey(this.now()) : undefined;
    const dailyOpening = dailyKey
      ? practiceDailyGauntletOpening(dailyKey, listMapNames(), GAME_MODE_ROTATION, CHARACTER_IDS)
      : null;
    const gauntlet =
      safeKind === 'gauntlet' || safeKind === 'daily'
        ? practiceGauntletMatch(1, 0, dailyKey)
        : null;
    if (gauntlet && dailyOpening) {
      gauntlet.opponentCharacterId = dailyOpening.opponentCharacterId;
      if (this.statsStore && dailyKey) {
        gauntlet.dailyChase = this.statsStore.getDailyGauntletChaseTarget(
          dailyKey,
          nickname,
          DAILY_GAUNTLET_LEADERBOARD.SIZE,
        );
      }
    }
    this.queue.removePlayer(playerId);
    const leftRumbleQueue = this.rumbleQueue.removePlayer(playerId);
    if (leftRumbleQueue) this.broadcastRumbleStatus();
    const leftBattleRoyaleQueue = this.battleRoyaleQueue.removePlayer(playerId);
    if (leftBattleRoyaleQueue) this.broadcastBattleRoyaleStatus();
    this.playerNicknames.set(playerId, nickname);

    if (safeKind === 'crew_battle') {
      if (
        this.crewQueue.addPlayer({
          playerId,
          nickname,
          difficulty: safeDifficulty,
          gameMode: practiceModePin,
          mutatorId: practiceMutatorPreference,
        })
      ) {
        logger.info(
          { playerId, nickname, queueLength: this.crewQueue.getQueueLength() },
          'Player opened Crew ally window',
        );
      }
      this.broadcastCrewStatus();
      return;
    }

    const leftCrewQueue = this.crewQueue.removePlayer(playerId);
    if (leftCrewQueue) this.broadcastCrewStatus();

    const botNicknames =
      safeKind === 'rusty_rumble'
        ? SCRAP_PIT_RIVALS.map((rival) => rival.nickname)
        : [BOT.NICKNAME];
    const botEntries = botNicknames.map((botNickname) => {
      const id = `${BOT.PLAYER_ID_PREFIX}${crypto.randomUUID()}` as PlayerId;
      this.botPlayerIds.add(id);
      this.playerNicknames.set(id, botNickname);
      return { id, nickname: botNickname };
    });
    const names = listMapNames();
    const mapName =
      dailyOpening?.mapName ??
      names[Math.min(Math.floor(this.rng() * names.length), names.length - 1)];
    const eligibleModePool = GAME_MODE_ROTATION;
    const randomModePool = practiceMutatorPreference
      ? eligibleModePool.filter((mode) =>
          isMutatorCompatibleWithMode(practiceMutatorPreference, mode),
        )
      : eligibleModePool;
    const forcedMode = this.forcedMode();
    const selectedMode =
      forcedMode ??
      practiceModePin ??
      dailyOpening?.gameMode ??
      randomModePool[
        Math.min(Math.floor(this.rng() * randomModePool.length), randomModePool.length - 1)
      ];
    const matchId = crypto.randomUUID();
    if (safeKind === 'rusty_rumble') this.matchKinds.set(matchId, 'rumble');
    this.launchMatch(
      matchId,
      this.forcedMap() ?? this.resolveMap(mapName),
      selectedMode,
      [{ id: playerId, nickname }, ...botEntries],
      {},
      gauntlet?.difficulty ?? safeDifficulty,
      [],
      undefined,
      gauntlet,
      undefined,
      practiceModePin,
      practiceRivalPin,
      practiceMutatorPreference,
    );
  }

  handleCancelMatchmaking(playerId: PlayerId): void {
    const removedDuel = this.queue.removePlayer(playerId);
    const removedRumble = this.rumbleQueue.removePlayer(playerId);
    const removedBattleRoyale = this.battleRoyaleQueue.removePlayer(playerId);
    const removedCrew = this.crewQueue.removePlayer(playerId);
    const removedIntent = this.matchIntentQueue.removePlayer(playerId) !== null;
    if (removedIntent) this.matchIntentArenaAuthority?.release(playerId);
    const removed =
      removedDuel || removedRumble || removedBattleRoyale || removedCrew || removedIntent;
    if (removed) {
      logger.info({ playerId }, 'Player cancelled matchmaking');
      this.server.sendTo(
        playerId,
        {
          type: 'server:matchmakingStatus',
          status: 'cancelled',
          playersOnline: this.getOnlinePlayerCount(),
        },
        { reliable: true },
      );
      if (removedRumble) this.broadcastRumbleStatus();
      if (removedBattleRoyale) this.broadcastBattleRoyaleStatus();
      if (removedCrew) this.broadcastCrewStatus();
    }
  }

  handlePlayerDisconnect(playerId: PlayerId): void {
    // Remove from queue if queued
    this.queue.removePlayer(playerId);
    const leftRumbleQueue = this.rumbleQueue.removePlayer(playerId);
    if (leftRumbleQueue) this.broadcastRumbleStatus();
    const leftBattleRoyaleQueue = this.battleRoyaleQueue.removePlayer(playerId);
    if (leftBattleRoyaleQueue) this.broadcastBattleRoyaleStatus();
    const leftCrewQueue = this.crewQueue.removePlayer(playerId);
    if (leftCrewQueue) this.broadcastCrewStatus();
    this.playerNicknames.delete(playerId);
    if (this.matchIntentQueue.removePlayer(playerId))
      this.matchIntentArenaAuthority?.release(playerId);
    this.seenMatchIntentIds.delete(playerId);

    // Handle disconnect in active match
    const matchId = this.playerMatchMap.get(playerId);
    if (matchId) {
      // Mid-draft disconnect: same contract as post-match teardown — the
      // rest get opponentDisconnected and return to lobby. A drafting
      // player can't also be in a post-match state (their map entry
      // points at the draft's future matchId), so we're done.
      const draft = this.draftStates.get(matchId);
      if (draft) {
        this.teardownDraft(draft, playerId);
        return;
      }

      const match = this.activeMatches.get(matchId);
      if (match) {
        this.releasePartyMatch(matchId);
        this.departActiveMatch(matchId, match, playerId);
        return;
      }
      this.playerMatchMap.delete(playerId);
    }

    // Handle disconnect in post-match state
    for (const [postMatchId, state] of this.postMatchStates) {
      if (state.playerIds.includes(playerId)) {
        // Notify other players
        for (const pid of state.playerIds) {
          if (pid !== playerId) {
            this.server.sendTo(
              pid,
              {
                type: 'server:opponentDisconnected',
                playerId,
              },
              { reliable: true },
            );
          }
        }
        clearTimeout(state.timeoutHandle);
        this.releasePartyMatch(postMatchId);
        this.postMatchStates.delete(postMatchId);
        this.matchKinds.delete(postMatchId);
        this.rumbleCrowns.delete(postMatchId);
        this.releaseRivalrySet(state.playerIds);
        this.releasePracticePlayers(state.playerIds);
        // Return remaining players to lobby state
        for (const pid of state.playerIds) {
          if (pid !== playerId) {
            this.playerMatchMap.delete(pid);
          }
        }
        break;
      }
    }
  }

  handleRematchRequest(playerId: PlayerId, gauntletRouteId?: PracticeGauntletRouteId): void {
    const matchId = this.playerMatchMap.get(playerId);
    if (!matchId) {
      logger.warn({ playerId }, 'Ignoring rematch request from player with no match');
      this.sendRematchUnavailable(playerId);
      return;
    }

    const postMatch = this.postMatchStates.get(matchId);
    if (!postMatch) {
      logger.warn({ playerId, matchId }, 'Ignoring rematch request outside post-match state');
      this.sendRematchUnavailable(playerId);
      return;
    }
    // Capability-owned parties use the version-fenced consensus message so
    // bots, roster, explicit mode, and the current scheduled arena are all
    // revalidated. Never let an old/stale generic request bypass that path.
    if (this.partyIdByMatchId.has(matchId)) {
      logger.warn({ playerId, matchId }, 'Ignoring generic rematch request for retained party');
      this.sendRematchUnavailable(playerId);
      return;
    }

    // The route is server-authored and selected only while this completed
    // Gauntlet stage is awaiting advancement. Missing or tampered values
    // preserve the legacy Route A behavior.
    if (postMatch.gauntletRoutes.length > 0) {
      const route = selectPracticeGauntletRoute(postMatch.gauntletRoutes, gauntletRouteId);
      if (route) {
        postMatch.nextMapName = route.mapName;
        postMatch.nextGameMode = route.gameMode;
        if (postMatch.nextGauntlet && route.opponentCharacterId) {
          postMatch.nextGauntlet.opponentCharacterId = route.opponentCharacterId;
        }
        if (postMatch.nextGauntlet && route.forecastMutatorId) {
          postMatch.nextGauntlet.forecastMutatorId = route.forecastMutatorId;
        }
        if (postMatch.nextGauntlet && route.boonId) {
          const owned = postMatch.nextGauntlet.boonIds ?? [];
          if (!owned.includes(route.boonId)) {
            postMatch.nextGauntlet.boonIds = [...owned, route.boonId];
          }
        }
      }
    }

    postMatch.rematchRequests.add(playerId);
    if (postMatch.isPractice) {
      for (const pid of postMatch.playerIds) {
        if (this.botPlayerIds.has(pid)) postMatch.rematchRequests.add(pid);
      }
    }

    logger.info(
      {
        playerId,
        matchId,
        requested: postMatch.rematchRequests.size,
        required: postMatch.playerIds.length,
      },
      'Rematch requested',
    );

    // Reset the post-match expiry: the opponent now has the full window to
    // click after they see this player's rematch prompt, instead of racing
    // a timer that started at match end.
    clearTimeout(postMatch.timeoutHandle);
    postMatch.timeoutHandle = setTimeout(() => {
      this.onRematchTimeout(matchId);
    }, REMATCH_TIMEOUT_MS);

    // Notify other players that this player wants a rematch
    for (const pid of postMatch.playerIds) {
      if (pid !== playerId) {
        this.server.sendTo(
          pid,
          {
            type: 'server:rematchStatus',
            opponentWantsRematch: true,
          },
          { reliable: true },
        );
      }
    }

    // Check if all players want a rematch
    if (postMatch.rematchRequests.size === postMatch.playerIds.length) {
      this.startRematch(postMatch);
    }
  }

  handleReturnToLobby(playerId: PlayerId): void {
    const matchId = this.playerMatchMap.get(playerId);
    if (!matchId) return;

    // Defensive: the draft UI has no bail button, but a stale
    // returnToLobby (results-screen click racing the draft start) must
    // not orphan the draft — treat it like a disconnect.
    const draft = this.draftStates.get(matchId);
    if (draft) {
      this.teardownDraft(draft, playerId);
      return;
    }

    const postMatch = this.postMatchStates.get(matchId);
    if (postMatch) {
      postMatch.returnedToLobby.add(playerId);
      this.playerMatchMap.delete(playerId);

      // Notify other players
      for (const pid of postMatch.playerIds) {
        if (pid !== playerId) {
          this.server.sendTo(
            pid,
            {
              type: 'server:opponentDisconnected',
              playerId,
            },
            { reliable: true },
          );
          // Return them to lobby too
          this.playerMatchMap.delete(pid);
        }
      }

      clearTimeout(postMatch.timeoutHandle);
      this.releasePartyMatch(matchId);
      this.postMatchStates.delete(matchId);
      this.matchKinds.delete(matchId);
      this.rumbleCrowns.delete(matchId);
      this.releaseRivalrySet(postMatch.playerIds);
      this.releasePracticePlayers(postMatch.playerIds);
    } else {
      const match = this.activeMatches.get(matchId);
      if (match) {
        this.releasePartyMatch(matchId);
        this.departActiveMatch(matchId, match, playerId);
        return;
      }
      this.playerMatchMap.delete(playerId);
    }
  }

  /** Called each server tick. */
  tick(dt: number, serverTick: number): void {
    // Try to create matches from queued players
    this.tryCreateMatch();
    this.tryCreateRumble(dt);
    this.tryCreateBattleRoyale(dt);
    this.tryCreateCrew(dt);
    this.tryCreateIntentMatches();

    // Drive pre-match draft deadlines + snapshots
    this.tickDrafts(dt);

    // Update active matches
    for (const [matchId, match] of this.activeMatches) {
      const prevPhase = this.previousPhases.get(matchId);
      for (const botController of this.botControllers.get(matchId) ?? []) {
        botController.update(dt, match, serverTick);
      }
      match.update(dt);
      const newPhase = match.phase;

      // Fire one-time phase-transition messages BEFORE broadcasting the
      // new state, so the client has the context it needs to interpret
      // the state that follows in the same frame.
      if (prevPhase !== MatchPhase.ACTIVE && newPhase === MatchPhase.ACTIVE) {
        this.sendMatchStart(match);
      }
      this.previousPhases.set(matchId, newPhase);

      // Phase-aware broadcast: while the match is in CHARACTER_SELECT we
      // ship the lightweight selection snapshot only — clients have no
      // need for positions, grenades, or pickups during select. From
      // COUNTDOWN onward we run the regular gameState pipeline.
      if (match.phase === MatchPhase.CHARACTER_SELECT) {
        this.broadcastCharacterSelectState(match);
      } else {
        this.broadcastMatchState(match, serverTick);
      }

      // Check if match ended
      if (match.phase === MatchPhase.ENDED) {
        this.onMatchEnded(matchId, match);
      }
    }
  }

  /**
   * Tell both players in a match that it just transitioned to ACTIVE and
   * how much time remains. Client extrapolates the clock locally from
   * here; we don't need to re-send it every tick.
   */
  private sendMatchStart(match: Match): void {
    const matchEndsInMs = match.matchTimer * 1000;
    for (const [playerId] of match.players) {
      this.server.sendTo(
        playerId,
        {
          type: 'server:matchStart',
          matchEndsInMs,
        },
        { reliable: true },
      );
    }
  }

  getActiveMatches(): Match[] {
    return [...this.activeMatches.values()];
  }

  getOnlinePlayerCount(): number {
    return this.server.playerCount;
  }

  getQueueLength(): number {
    return (
      this.queue.getQueueLength() +
      this.rumbleQueue.getQueueLength() +
      this.battleRoyaleQueue.getQueueLength() +
      this.crewQueue.getQueueLength() +
      this.matchIntentQueue.getQueueLength()
    );
  }

  /** Route a player input to the correct match. */
  routeInput(playerId: PlayerId, input: import('@shared/game').PlayerInput): void {
    const matchId = this.playerMatchMap.get(playerId);
    if (!matchId) return;

    const match = this.activeMatches.get(matchId);
    if (!match) return;

    // The match's updateActive tick will consume this input via shared
    // physics (calculateMovement), keeping client prediction and server
    // authority in sync.
    match.queueInput(playerId, input);
  }

  // ──────────────────────────── Private ────────────────────────────

  /**
   * FORCE_MAP env override for manual smoke tests (mirrors FORCE_EVENT):
   * a valid map name pins every match to that map AND freezes the
   * rotation. Invalid values are ignored with a warning.
   */
  private forcedMap(): MapData | null {
    const forced = process.env.FORCE_MAP;
    if (!forced) return null;
    if (!MAP_REGISTRY.has(forced)) {
      logger.warn({ forced, known: listMapNames() }, 'Ignoring unknown FORCE_MAP');
      return null;
    }
    return this.resolveMap(forced);
  }

  /** Resolve the server-owned arena document from the advertised capability. */
  private resolveMap(name: string): MapData {
    return getMap(name, { largeWorlds: this.server.getCapabilities().largeWorlds });
  }

  /**
   * FORCE-pinned path only (real matches draft their map): FORCE_MAP if
   * valid, else advance the rotation.
   */
  private pickRotationMap(): MapData {
    const forced = this.forcedMap();
    if (forced) return forced;
    const names = listMapNames();
    const name = names[this.mapRotationIndex % names.length];
    this.mapRotationIndex++;
    return this.resolveMap(name);
  }

  /**
   * FORCE_MODE env override for manual smoke tests (mirrors FORCE_MAP):
   * a valid mode id pins every match to that mode AND freezes the
   * rotation. Invalid values are ignored with a warning.
   */
  private forcedMode(): GameModeType | null {
    const forced = process.env.FORCE_MODE;
    if (!forced) return null;
    if (!(GAME_MODE_ROTATION as readonly string[]).includes(forced)) {
      logger.warn({ forced, known: GAME_MODE_ROTATION }, 'Ignoring unknown FORCE_MODE');
      return null;
    }
    return forced as GameModeType;
  }

  /**
   * FORCE-pinned path only (real matches draft their mode): FORCE_MODE if
   * valid, else advance the rotation.
   */
  private pickRotationMode(): GameModeType {
    const forced = this.forcedMode();
    if (forced) return forced;
    const mode = GAME_MODE_ROTATION[this.modeRotationIndex % GAME_MODE_ROTATION.length];
    this.modeRotationIndex++;
    return mode;
  }

  /**
   * Whether either FORCE pin is present in the environment. Presence —
   * not validity — is the signal: a typo'd pin should degrade to the
   * deterministic rotation (the forced*() helpers warn and fall through),
   * never to a surprise draft, because the pins double as the draft's
   * kill switch for smoke tests and e2e.
   */
  private forcePinsActive(): boolean {
    return !!process.env.FORCE_MAP || !!process.env.FORCE_MODE;
  }

  /**
   * Resolve whether an ordinary Spar preference can own this match's
   * mid-match slot. Smoke pins stay strongest, Gauntlet owns its forecast,
   * and mode/final-minute conflicts are rejected before we advertise the
   * preference in matchFound.
   */
  private appliedPracticeMutator(
    practiceDifficulty: BotDifficulty | null,
    gauntlet: PracticeGauntletMatch | null,
    gameMode: GameModeType,
    preference: MutatorId | null,
  ): MutatorId | null {
    if (practiceDifficulty === null || gauntlet !== null || preference === null) return null;
    if (isMutatorId(process.env.FORCE_MIDMATCH_MUTATOR)) return null;
    if (!isMutatorCompatibleWithMode(preference, gameMode)) return null;

    const forcedFinal = process.env.FORCE_EVENT;
    if (
      isMutatorId(forcedFinal) &&
      (preference === forcedFinal || mutatorsConflict(preference, forcedFinal))
    ) {
      return null;
    }
    return preference;
  }

  /** Keep a Random-mode Spar rematch on the next mode that honors its chaos. */
  private nextCompatiblePracticeMode(
    current: GameModeType,
    preference: MutatorId | null,
  ): GameModeType {
    let next = getNextGameMode(current);
    if (preference === null) return next;

    for (let checked = 0; checked < GAME_MODE_ROTATION.length; checked++) {
      if (isMutatorCompatibleWithMode(preference, next)) return next;
      next = getNextGameMode(next);
    }
    return getNextGameMode(current);
  }

  /** Keep Random Crew rematches inside modes with complete team semantics. */
  private nextCompatibleCrewBattleMode(
    current: GameModeType,
    preference: MutatorId | null,
  ): GameModeType {
    let next = getNextCrewBattleMode(current);
    if (preference === null) return next;

    for (let checked = 0; checked < CREW_BATTLE_MODES.length; checked++) {
      if (isMutatorCompatibleWithMode(preference, next)) return next;
      next = getNextCrewBattleMode(next);
    }
    return getNextCrewBattleMode(current);
  }

  private matchKindForFormat(format: MatchIntent['format']): 'duel' | 'rumble' | 'duos' {
    return format === 'crew' ? 'duos' : format;
  }

  private intentCompatibleQueueSize(intent: Readonly<MatchIntent>): number {
    const key = matchIntentQueueKey(intent);
    return new Set(
      this.matchIntentQueue
        .getEntries()
        .filter((entry) => matchIntentQueueKey(entry.intent) === key)
        .map((entry) => entry.intent.fighterId),
    ).size;
  }

  /** Launch every exact compatible group without draft or random selection. */
  private tryCreateIntentMatches(): void {
    let group = this.matchIntentQueue.takeReadyGroup();
    while (group !== null) {
      const matchId = this.launchIntentGroup(group).matchId;
      for (const entry of group) this.matchIntentArenaAuthority?.release(entry.playerId);
      const intent = group[0]!.intent;
      logger.info(
        {
          matchId,
          format: intent.format,
          humans: group.map((entry) => entry.playerId),
          botCount: intent.composition.botCount,
          map: intent.scheduledArena.mapName,
          mode: intent.mode,
        },
        'General match intent group launched',
      );
      group = this.matchIntentQueue.takeReadyGroup();
    }
  }

  private launchIntentGroup(
    group: readonly MatchIntentQueueEntry[],
    rematch?: Readonly<IntentRematchContext>,
  ): Readonly<IntentGroupLaunchResult> {
    const intent = group[0]!.intent;
    const humanEntries = group.map((entry) => ({ id: entry.playerId, nickname: entry.nickname }));
    const selectedFighters = new Map<PlayerId, CharacterId>(
      group.map((entry) => [entry.playerId, entry.intent.fighterId] as const),
    );
    const remainingFighters = CHARACTER_IDS.filter(
      (fighterId) => ![...selectedFighters.values()].includes(fighterId),
    );
    const botEntries = Array.from({ length: intent.composition.botCount }, (_, index) => {
      const id = `${BOT.PLAYER_ID_PREFIX}${crypto.randomUUID()}` as PlayerId;
      const nickname = BOT.RUMBLE_NICKNAMES[index] ?? BOT.NICKNAME;
      const fighterId = remainingFighters[index] ?? CHARACTER_IDS[index % CHARACTER_IDS.length]!;
      this.botPlayerIds.add(id);
      this.playerNicknames.set(id, nickname);
      selectedFighters.set(id, fighterId);
      return { id, nickname };
    });
    const playerEntries = [...humanEntries, ...botEntries];
    const matchId = crypto.randomUUID();
    const matchKind = this.matchKindForFormat(intent.format);
    this.matchKinds.set(matchId, matchKind);
    if (matchKind === 'rumble' && rematch?.rumbleCrown) {
      this.rumbleCrowns.set(matchId, rematch.rumbleCrown);
    }
    let playerTeams: ReadonlyMap<PlayerId, TeamId> = new Map();
    if (intent.format === 'crew') {
      playerTeams = new Map<PlayerId, TeamId>([
        ...playerEntries.slice(0, 2).map((entry) => [entry.id, 'blue'] as const),
        ...playerEntries.slice(2, 4).map((entry) => [entry.id, 'red'] as const),
      ]);
    }
    const humanIds = new Set(group.map((entry) => entry.playerId));
    const participants = Object.freeze(
      playerEntries.map((entry) =>
        Object.freeze({
          playerId: entry.id,
          nickname: entry.nickname,
          fighterId: selectedFighters.get(entry.id)!,
          source: humanIds.has(entry.id) ? ('human' as const) : ('standard_bot' as const),
          ready: true,
        }),
      ),
    );
    const standardMatch: Readonly<StandardMatchLaunch> = Object.freeze({
      format: intent.format,
      composition: Object.freeze({ ...intent.composition }),
      scheduledArena: Object.freeze({ ...intent.scheduledArena }),
      participants: Object.freeze(
        participants.map(({ playerId, nickname, fighterId, source }) =>
          Object.freeze({ playerId, nickname, fighterId, source }),
        ),
      ),
      ...(playerTeams.size > 0
        ? {
            playerTeams: Object.freeze(Object.fromEntries(playerTeams) as Record<PlayerId, TeamId>),
          }
        : {}),
    });
    this.launchMatch(
      matchId,
      this.resolveMap(intent.scheduledArena.mapName),
      intent.mode,
      playerEntries,
      matchKind === 'rumble' ? (rematch?.rumbleGrudges ?? {}) : {},
      null,
      rematch?.previousMutators ?? [],
      rematch?.previousContractId,
      null,
      undefined,
      null,
      null,
      null,
      playerTeams,
      selectedFighters,
      standardMatch,
    );
    return Object.freeze({ matchId, participants });
  }

  /**
   * Build a route's deterministic mid-match forecast before the Match exists.
   * Smoke overrides remain strongest; ordinary offers respect mode vetoes,
   * final-minute pins, recent active events, and this run's prior forecasts.
   */
  private pickPracticeGauntletForecast(
    routeId: PracticeGauntletRouteId,
    route: Omit<PracticeGauntletRoute, 'id' | 'forecastMutatorId'>,
    nextStage: number,
    blocked: readonly MutatorId[],
  ): MutatorId | undefined {
    const pool = MUTATORS.POOL as readonly MutatorId[];
    const forcedMid = process.env.FORCE_MIDMATCH_MUTATOR;
    if (forcedMid && (pool as readonly string[]).includes(forcedMid)) {
      return forcedMid as MutatorId;
    }

    const excluded = new Set<MutatorId>(blocked);
    for (const mutator of getGameMode(route.gameMode).excludedMutators ?? []) {
      excluded.add(mutator);
    }
    const forcedFinal = process.env.FORCE_EVENT;
    if (forcedFinal && (pool as readonly string[]).includes(forcedFinal)) {
      const finalMutator = forcedFinal as MutatorId;
      excluded.add(finalMutator);
      for (const candidate of pool) {
        if (mutatorsConflict(candidate, finalMutator)) excluded.add(candidate);
      }
    }

    return practiceGauntletMutatorChoice(
      pool,
      [...excluded],
      [
        nextStage,
        routeId,
        route.mapName,
        route.gameMode,
        route.opponentCharacterId ?? 'unknown_rival',
      ].join('|'),
    );
  }

  /** Build one stable, distinct run reward for a server-authored route. */
  private pickPracticeGauntletBoon(
    routeId: PracticeGauntletRouteId,
    route: Omit<PracticeGauntletRoute, 'id' | 'forecastMutatorId' | 'boonId'>,
    nextStage: number,
    owned: readonly GauntletBoonId[],
    challengeKey?: string,
  ): GauntletBoonId | undefined {
    return practiceGauntletBoonChoice(
      owned,
      [
        challengeKey ?? 'gauntlet',
        nextStage,
        routeId,
        route.mapName,
        route.gameMode,
        route.opponentCharacterId ?? 'unknown_rival',
      ].join('|'),
    );
  }

  private tryCreateMatch(): void {
    const pair = this.queue.tryMatch();
    if (!pair) return;

    const playerEntries = [
      { id: pair.player1.playerId, nickname: pair.player1.nickname },
      { id: pair.player2.playerId, nickname: pair.player2.nickname },
    ];

    // FORCE pins skip the draft entirely: forced value + rotation cursor
    // for the other category, exactly as before drafting existed.
    if (this.forcePinsActive()) {
      this.launchMatch(
        crypto.randomUUID(),
        this.pickRotationMap(),
        this.pickRotationMode(),
        playerEntries,
      );
      return;
    }

    this.startDraft(playerEntries);
  }

  private tryCreateRumble(dt: number): void {
    const group = this.rumbleQueue.tick(dt);
    if (!group) {
      if (this.rumbleQueue.getQueueLength() > 0) this.broadcastRumbleStatus();
      return;
    }
    const entries = group.map((entry) => ({ id: entry.playerId, nickname: entry.nickname }));
    logger.info({ players: entries.map((entry) => entry.id) }, 'Wasteland Rumble group ready');
    if (this.forcePinsActive()) {
      const matchId = crypto.randomUUID();
      this.matchKinds.set(matchId, 'rumble');
      this.launchMatch(matchId, this.pickRotationMap(), this.pickRotationMode(), entries);
    } else {
      this.startDraft(entries, null, [], undefined, 'rumble');
    }
    this.broadcastRumbleStatus();
  }

  private broadcastRumbleStatus(): void {
    const groupSize = this.rumbleQueue.getQueueLength();
    const launchInMs = this.rumbleQueue.getLaunchInMs();
    const statusKey = `${groupSize}:${launchInMs === undefined ? 'waiting' : Math.ceil(launchInMs / 1000)}`;
    if (statusKey === this.lastRumbleStatusKey) return;
    this.lastRumbleStatusKey = statusKey;
    for (const entry of this.rumbleQueue.getEntries()) {
      this.server.sendTo(
        entry.playerId,
        {
          type: 'server:matchmakingStatus',
          status: 'queued',
          matchKind: 'rumble',
          groupSize,
          maxGroupSize: RUMBLE.MAX_PLAYERS,
          ...(launchInMs === undefined ? {} : { launchInMs }),
          playersOnline: this.getOnlinePlayerCount(),
        },
        { reliable: true },
      );
    }
  }

  private tryCreateBattleRoyale(dt: number): void {
    const launch = this.battleRoyaleQueue.tick(dt);
    if (!launch) {
      if (this.battleRoyaleQueue.getQueueLength() > 0) this.broadcastBattleRoyaleStatus();
      return;
    }
    this.launchBattleRoyale(launch);
    this.broadcastBattleRoyaleStatus();
  }

  private launchBattleRoyale(launch: BattleRoyaleQueueLaunch): void {
    const humanEntries = launch.humans.map((entry) => ({
      id: entry.playerId,
      nickname: entry.nickname,
    }));
    const botEntries = Array.from({ length: launch.botCount }, (_, index) => {
      const id = `${BOT.PLAYER_ID_PREFIX}${crypto.randomUUID()}` as PlayerId;
      const nickname = `Scrapper BR ${index + 1}`;
      this.botPlayerIds.add(id);
      this.playerNicknames.set(id, nickname);
      return { id, nickname };
    });
    const entries = [...humanEntries, ...botEntries];
    const preselectedFighters = new Map<PlayerId, CharacterId>();
    for (const human of launch.humans) {
      preselectedFighters.set(human.playerId, human.fighterId);
    }
    for (const [index, bot] of botEntries.entries()) {
      preselectedFighters.set(bot.id, CHARACTER_IDS[index % CHARACTER_IDS.length]);
    }
    const matchId = crypto.randomUUID();
    this.matchKinds.set(matchId, 'battle_royale');
    logger.info(
      {
        matchId,
        humanCount: launch.humans.length,
        botCount: launch.botCount,
        reason: launch.reason,
      },
      'Battle Royale queue ready',
    );
    this.launchMatch(
      matchId,
      getBattleRoyaleMap(),
      GameModeType.DEATHMATCH,
      entries,
      {},
      null,
      [],
      undefined,
      null,
      undefined,
      null,
      null,
      null,
      new Map(),
      preselectedFighters,
      undefined,
      { format: 'battle_royale' },
      Object.freeze({
        participantCount: entries.length,
        humanCount: launch.humans.length,
        botCount: launch.botCount,
      }),
    );
  }

  private broadcastBattleRoyaleStatus(): void {
    const groupSize = this.battleRoyaleQueue.getQueueLength();
    const launchInMs = this.battleRoyaleQueue.getLaunchInMs();
    const statusKey = `${groupSize}:${launchInMs === undefined ? 'idle' : Math.ceil(launchInMs / 1000)}`;
    if (statusKey === this.lastBattleRoyaleStatusKey) return;
    this.lastBattleRoyaleStatusKey = statusKey;
    for (const entry of this.battleRoyaleQueue.getEntries()) {
      this.server.sendTo(
        entry.playerId,
        {
          type: 'server:matchmakingStatus',
          status: 'queued',
          matchKind: 'battle_royale',
          groupSize,
          maxGroupSize: BATTLE_ROYALE_QUEUE.MAX_PLAYERS,
          botFillCount: BATTLE_ROYALE_QUEUE.MAX_PLAYERS - groupSize,
          ...(launchInMs === undefined ? {} : { launchInMs }),
          playersOnline: this.getOnlinePlayerCount(),
        },
        { reliable: true },
      );
    }
  }

  private tryCreateCrew(dt: number): void {
    const group = this.crewQueue.tick(dt);
    if (!group) {
      if (this.crewQueue.getQueueLength() > 0) this.broadcastCrewStatus();
      return;
    }
    this.launchCrewBattle(group);
    this.broadcastCrewStatus();
  }

  /** Captain settings author the fight; a second entrant contributes only their fighter. */
  private launchCrewBattle(group: CrewQueueEntry[]): void {
    const captain = group[0];
    if (!captain) return;

    const humanEntries = group.map((entry) => ({ id: entry.playerId, nickname: entry.nickname }));
    const rivalNicknames =
      group.length >= CREW_BATTLE.MAX_HUMANS
        ? SCRAP_PIT_RIVALS.slice(1).map((rival) => rival.nickname)
        : SCRAP_PIT_RIVALS.map((rival) => rival.nickname);
    const botEntries = rivalNicknames.map((nickname) => {
      const id = `${BOT.PLAYER_ID_PREFIX}${crypto.randomUUID()}` as PlayerId;
      this.botPlayerIds.add(id);
      this.playerNicknames.set(id, nickname);
      return { id, nickname };
    });

    const captainMutatorId = captain.mutatorId;
    const compatibleModes = captainMutatorId
      ? CREW_BATTLE_MODES.filter((mode) => isMutatorCompatibleWithMode(captainMutatorId, mode))
      : [...CREW_BATTLE_MODES];
    const randomModePool = compatibleModes.length > 0 ? compatibleModes : [...CREW_BATTLE_MODES];
    const forcedMode = this.forcedMode();
    const acceptedForcedMode =
      forcedMode !== null &&
      isCrewBattleMode(forcedMode) &&
      (!captain.mutatorId || isMutatorCompatibleWithMode(captain.mutatorId, forcedMode))
        ? forcedMode
        : null;
    const acceptedCaptainMode =
      captain.gameMode !== null &&
      (!captain.mutatorId || isMutatorCompatibleWithMode(captain.mutatorId, captain.gameMode))
        ? captain.gameMode
        : null;
    const selectedMode =
      acceptedForcedMode ??
      acceptedCaptainMode ??
      randomModePool[
        Math.min(Math.floor(this.rng() * randomModePool.length), randomModePool.length - 1)
      ];
    const mapNames = listMapNames();
    const mapName =
      mapNames[Math.min(Math.floor(this.rng() * mapNames.length), mapNames.length - 1)];
    const matchId = crypto.randomUUID();
    this.matchKinds.set(matchId, 'duos');

    const blueEntries =
      group.length >= CREW_BATTLE.MAX_HUMANS ? humanEntries : [...humanEntries, botEntries[0]];
    const redEntries = group.length >= CREW_BATTLE.MAX_HUMANS ? botEntries : botEntries.slice(1);
    const playerTeams = new Map<PlayerId, TeamId>([
      ...blueEntries.map((entry) => [entry.id, 'blue'] as const),
      ...redEntries.map((entry) => [entry.id, 'red'] as const),
    ]);
    const allEntries = [...blueEntries, ...redEntries];

    logger.info(
      {
        captainId: captain.playerId,
        humanPlayers: humanEntries.map((entry) => entry.id),
        rustyFilled: group.length === 1,
        gameMode: selectedMode,
      },
      'Crew group ready',
    );
    this.launchMatch(
      matchId,
      this.forcedMap() ?? this.resolveMap(mapName),
      selectedMode,
      allEntries,
      {},
      captain.difficulty,
      [],
      undefined,
      null,
      undefined,
      acceptedCaptainMode,
      null,
      captain.mutatorId,
      playerTeams,
    );
  }

  private broadcastCrewStatus(): void {
    const groupSize = this.crewQueue.getQueueLength();
    const launchInMs = this.crewQueue.getLaunchInMs();
    const statusKey = `${groupSize}:${launchInMs === undefined ? 'idle' : Math.ceil(launchInMs / 1000)}`;
    if (statusKey === this.lastCrewStatusKey) return;
    this.lastCrewStatusKey = statusKey;
    for (const entry of this.crewQueue.getEntries()) {
      this.server.sendTo(
        entry.playerId,
        {
          type: 'server:matchmakingStatus',
          status: 'queued',
          matchKind: 'duos',
          groupSize,
          maxGroupSize: CREW_BATTLE.MAX_HUMANS,
          ...(launchInMs === undefined ? {} : { launchInMs }),
          playersOnline: this.getOnlinePlayerCount(),
        },
        { reliable: true },
      );
    }
  }

  /**
   * Apply one authoritative departure contract to disconnects and the
   * explicit in-match leave action. Pre-fight and active Practice groups
   * dissolve together; live real Rumbles eliminate only the leaver; live
   * duels end as a forfeit on the next match tick.
   */
  private departActiveMatch(matchId: string, match: Match, playerId: PlayerId): void {
    const matchKind = this.matchKinds.get(matchId) ?? 'duel';
    const isRumble = matchKind === 'rumble';
    const isBattleRoyale = matchKind === 'battle_royale';
    const isPreFight =
      match.phase === MatchPhase.CHARACTER_SELECT || match.phase === MatchPhase.COUNTDOWN;
    const isActivePractice =
      match.phase === MatchPhase.ACTIVE && this.practiceDifficulties.has(matchId);

    if (isPreFight || isActivePractice) {
      this.teardownActiveGroupAfterDeparture(matchId, match, playerId);
      return;
    }

    const nickname = match.players.get(playerId)?.nickname ?? 'A fighter';
    const eliminate = (isRumble || isBattleRoyale) && match.phase === MatchPhase.ACTIVE;
    match.onPlayerDisconnect(playerId, eliminate);
    this.playerMatchMap.delete(playerId);

    const remainingPlayerIds = new Set(match.getConnectedPlayerIds());
    for (const pid of remainingPlayerIds) {
      this.server.sendTo(
        pid,
        eliminate
          ? {
              type: 'server:playerLeft',
              playerId,
              nickname,
            }
          : { type: 'server:opponentDisconnected', playerId },
        { reliable: true },
      );
    }
    logger.info({ matchId, playerId, eliminate }, 'Player left active match');
  }

  /** Dissolve a pre-fight or bot-backed group without leaving match state behind. */
  private teardownActiveGroupAfterDeparture(
    matchId: string,
    match: Match,
    leavingPlayerId: PlayerId,
  ): void {
    for (const [playerId] of match.players) {
      this.playerMatchMap.delete(playerId);
      if (playerId !== leavingPlayerId) {
        this.server.sendTo(
          playerId,
          { type: 'server:opponentDisconnected', playerId: leavingPlayerId },
          { reliable: true },
        );
      }
    }
    this.activeMatches.delete(matchId);
    this.previousPhases.delete(matchId);
    this.botControllers.delete(matchId);
    this.practiceDifficulties.delete(matchId);
    this.practiceModePins.delete(matchId);
    this.practiceRivalPins.delete(matchId);
    this.practiceMutatorPreferences.delete(matchId);
    this.practiceGauntlets.delete(matchId);
    this.practiceGauntletRunHistories.delete(matchId);
    this.matchKinds.delete(matchId);
    this.rumbleCrowns.delete(matchId);
    const playerIds = [...match.players.keys()];
    this.releaseRivalrySet(playerIds);
    this.releasePracticePlayers(playerIds);
    logger.info({ matchId, leavingPlayerId }, 'Active group dissolved after player departure');
  }

  /**
   * Construct and register the Match and tell every entrant. Shared by
   * the FORCE-pinned fresh path, draft finalization, and pinned rematches
   * so the matchFound contract ("match exists; here are the FINAL
   * map+mode") is written exactly once.
   */
  private launchMatch(
    matchId: string,
    mapData: MapData,
    gameMode: GameModeType,
    playerEntries: { id: PlayerId; nickname: string }[],
    rumbleGrudges: RumbleGrudges = {},
    practiceDifficulty: BotDifficulty | null = null,
    rematchMutatorExclusions: readonly MutatorId[] = [],
    previousContractId?: MatchContractId,
    gauntlet: PracticeGauntletMatch | null = null,
    gauntletRunHistory: Readonly<PracticeGauntletRunHistory> = {
      opponentCharacterIds: [],
      forecastMutatorIds: [],
    },
    practiceModePin: GameModeType | null = null,
    practiceRivalPin: CharacterId | null = null,
    practiceMutatorPreference: MutatorId | null = null,
    playerTeams: ReadonlyMap<PlayerId, TeamId> = new Map(),
    preselectedFighters: ReadonlyMap<PlayerId, CharacterId> = new Map(),
    standardMatch?: Readonly<StandardMatchLaunch>,
    lifecycleOptions?: MatchLifecycleOptions,
    battleRoyale?: Readonly<BattleRoyaleMatchLaunch>,
  ): void {
    const matchKind =
      this.matchKinds.get(matchId) ?? (practiceDifficulty === null ? 'duel' : 'practice');
    this.matchKinds.set(matchId, matchKind);
    const practiceKind: PracticeKind | undefined =
      practiceDifficulty === null
        ? undefined
        : gauntlet?.challengeKey
          ? 'daily'
          : gauntlet
            ? 'gauntlet'
            : matchKind === 'rumble'
              ? 'rusty_rumble'
              : matchKind === 'duos'
                ? 'crew_battle'
                : 'sparring';
    const dailySeed = gauntlet?.challengeKey
      ? [
          gauntlet.challengeKey,
          gauntlet.stage,
          mapData.name,
          gameMode,
          gauntlet.opponentCharacterId ?? 'unknown_rival',
        ].join('|')
      : undefined;
    const appliedPracticeMutator = this.appliedPracticeMutator(
      practiceDifficulty,
      gauntlet,
      gameMode,
      practiceMutatorPreference,
    );
    const boonAssignments = new Map<PlayerId, readonly GauntletBoonId[]>();
    if (gauntlet?.boonIds?.length) {
      for (const entry of playerEntries) {
        if (!this.botPlayerIds.has(entry.id)) boonAssignments.set(entry.id, gauntlet.boonIds);
      }
    }
    const match = new Match(
      matchId,
      mapData,
      playerEntries,
      gameMode,
      dailySeed ? practiceDailyGauntletRng(dailySeed) : Math.random,
      rematchMutatorExclusions,
      undefined,
      dailySeed ? undefined : previousContractId,
      gauntlet?.forecastMutatorId ?? appliedPracticeMutator ?? undefined,
      dailySeed,
      boonAssignments,
      playerTeams,
      lifecycleOptions,
    );
    match.setRttResolver(this.getPlayerRTT);
    this.activeMatches.set(matchId, match);
    for (const entry of playerEntries) {
      this.playerMatchMap.set(entry.id, matchId);
    }
    if (practiceDifficulty !== null) {
      this.practiceDifficulties.set(matchId, practiceDifficulty);
      if (practiceModePin !== null) this.practiceModePins.set(matchId, practiceModePin);
      if (practiceRivalPin !== null) this.practiceRivalPins.set(matchId, practiceRivalPin);
      if (practiceMutatorPreference !== null) {
        this.practiceMutatorPreferences.set(matchId, practiceMutatorPreference);
      }
      if (gauntlet) this.practiceGauntlets.set(matchId, gauntlet);
      const botEntries = playerEntries.filter((entry) => this.botPlayerIds.has(entry.id));
      if (botEntries.length > 0) {
        this.botControllers.set(
          matchId,
          botEntries.map((entry) => {
            const rival =
              practiceKind === 'rusty_rumble' || practiceKind === 'crew_battle'
                ? SCRAP_PIT_RIVALS.find((candidate) => candidate.nickname === entry.nickname)
                : undefined;
            if (rival) match.registerAutonomousTaunt(entry.id, rival.signatureTauntId);
            return new BotController(entry.id, practiceDifficulty, rival?.tactic);
          }),
        );
        const availableCharacters = [...CHARACTER_IDS];
        for (const [botIndex, botEntry] of botEntries.entries()) {
          let character: CharacterId;
          if (gauntlet?.opponentCharacterId) {
            character = gauntlet.opponentCharacterId;
          } else if (botIndex === 0 && practiceRivalPin) {
            character = practiceRivalPin;
            availableCharacters.splice(availableCharacters.indexOf(character), 1);
          } else {
            const randomIndex = Math.min(
              Math.floor(this.rng() * availableCharacters.length),
              availableCharacters.length - 1,
            );
            character = availableCharacters.splice(randomIndex, 1)[0];
          }
          if (gauntlet) {
            gauntlet.opponentCharacterId = character;
            this.practiceGauntletRunHistories.set(matchId, {
              opponentCharacterIds: gauntletRunHistory.opponentCharacterIds.includes(character)
                ? [...gauntletRunHistory.opponentCharacterIds]
                : [...gauntletRunHistory.opponentCharacterIds, character],
              forecastMutatorIds:
                gauntlet.forecastMutatorId &&
                !gauntletRunHistory.forecastMutatorIds.includes(gauntlet.forecastMutatorId)
                  ? [...gauntletRunHistory.forecastMutatorIds, gauntlet.forecastMutatorId]
                  : [...gauntletRunHistory.forecastMutatorIds],
            });
          }
          match.setLock(botEntry.id, character);
        }
      }
    }
    if (practiceDifficulty === null) {
      const standardBotEntries = playerEntries.filter((entry) => this.botPlayerIds.has(entry.id));
      if (standardBotEntries.length > 0) {
        this.botControllers.set(
          matchId,
          standardBotEntries.map((entry) => new BotController(entry.id, DEFAULT_BOT_DIFFICULTY)),
        );
      }
    }
    for (const [playerId, fighterId] of preselectedFighters) {
      match.setLock(playerId, fighterId);
    }
    if (lifecycleOptions?.format === 'battle_royale') {
      // The queue already carries the persisted fighter choice. Commit the
      // complete server-owned roster synchronously so BR never opens the
      // standard Character Select route or its uniqueness constraint.
      match.updateCharacterSelect(0);
    }

    logger.info(
      {
        matchId,
        players: playerEntries.map((e) => e.id),
        map: mapData.name,
        gameMode,
      },
      'Match created',
    );

    for (const entry of playerEntries) {
      const opponents = playerEntries
        .filter((e) => e.id !== entry.id)
        .map((e) => ({ id: e.id, nickname: e.nickname }));
      const characterWins = {
        ...createEmptyCharacterWins(),
        ...this.statsStore?.getLifetime(entry.nickname)?.characterWins,
      };
      const grudge = rumbleGrudges[entry.id];
      const activeGrudge =
        grudge && playerEntries.some((candidate) => candidate.id === grudge.targetId)
          ? grudge
          : undefined;
      this.server.sendTo(
        entry.id,
        {
          type: 'server:matchFound',
          matchId,
          opponents,
          mapName: mapData.name,
          gameMode,
          matchKind,
          battleRoyale,
          standardMatch,
          playerTeams:
            playerTeams.size > 0
              ? (Object.fromEntries(playerTeams) as Record<PlayerId, TeamId>)
              : undefined,
          practiceKind,
          rumbleCrown: this.rumbleCrowns.get(matchId),
          rumbleGrudge: activeGrudge,
          characterWins,
          gauntlet: gauntlet ?? undefined,
          practiceMutatorId: appliedPracticeMutator ?? undefined,
        },
        { reliable: true },
      );
      this.server.sendTo(
        entry.id,
        {
          type: 'server:matchmakingStatus',
          status: 'matched',
          playersOnline: this.getOnlinePlayerCount(),
        },
        { reliable: true },
      );
    }

    // The match starts itself in CHARACTER_SELECT (set by Match's
    // constructor); per-tick update() drives the transition into
    // COUNTDOWN once both players lock in or the select timer expires.
  }

  // ─────────────────────── Pre-match draft ───────────────────────

  /**
   * Open the pre-match draft for a freshly paired (or rematching) set of
   * players. The matchId is generated NOW — before the Match exists — so
   * every draftState snapshot and the eventual matchFound share one id.
   */
  private startDraft(
    playerEntries: { id: PlayerId; nickname: string }[],
    revengePickerId: PlayerId | null = null,
    rematchMutatorExclusions: readonly MutatorId[] = [],
    previousContractId?: MatchContractId,
    matchKind: 'duel' | 'rumble' = 'duel',
    rumbleCrown: RumbleCrownState | null = null,
    rumbleGrudges: RumbleGrudges = {},
  ): string {
    const matchId = crypto.randomUUID();
    const draftEntries = playerEntries.map((entry) => ({
      ...entry,
      arenaWins: {
        ...createEmptyArenaWins(),
        ...this.statsStore?.getLifetime(entry.nickname)?.arenaWins,
      },
    }));

    // Three-plus-player Rumbles use a group vote. Duels and two-player
    // Rumbles keep the fast two-role draft (including revenge priority).
    const draftKind = matchKind === 'rumble' && playerEntries.length >= 3 ? 'rally' : 'turn';
    const revengeIdx =
      revengePickerId === null
        ? -1
        : playerEntries.findIndex((entry) => entry.id === revengePickerId);
    const firstIdx =
      revengeIdx >= 0
        ? revengeIdx
        : Math.min(Math.floor(this.rng() * playerEntries.length), playerEntries.length - 1);
    let secondIdx = Math.min(
      Math.floor(this.rng() * (playerEntries.length - 1)),
      playerEntries.length - 2,
    );
    if (secondIdx >= firstIdx) secondIdx++;

    const draft: DraftState = {
      matchId,
      playerEntries: draftEntries,
      draftKind,
      firstPickerId: playerEntries[firstIdx].id,
      firstPickerReason: revengeIdx >= 0 ? 'revenge' : 'coin_toss',
      secondPickerId: playerEntries[secondIdx].id,
      currentPickerId: draftKind === 'turn' ? playerEntries[firstIdx].id : null,
      rallyCategory: draftKind === 'rally' ? 'map' : null,
      rallyVotes: new Map(),
      mapPick: null,
      modePick: null,
      pickTimerSeconds: draftKind === 'rally' ? DRAFT.RALLY_VOTE_SECONDS : DRAFT.FIRST_PICK_SECONDS,
      rematchMutatorExclusions: [...rematchMutatorExclusions],
      previousContractId,
      matchKind,
      rumbleGrudges: { ...rumbleGrudges },
    };
    this.draftStates.set(matchId, draft);
    this.matchKinds.set(matchId, matchKind);
    if (rumbleCrown) this.rumbleCrowns.set(matchId, rumbleCrown);

    // Register under the future matchId immediately: the queue guard
    // ("already in a match") and disconnect routing must treat drafting
    // players as in-match.
    for (const entry of playerEntries) {
      this.playerMatchMap.set(entry.id, matchId);
    }

    logger.info(
      {
        matchId,
        players: playerEntries.map((e) => e.id),
        firstPicker: draft.firstPickerId,
        firstPickerReason: draft.firstPickerReason,
        draftKind,
      },
      'Draft started',
    );
    return matchId;
  }

  /**
   * Drive draft pick deadlines and broadcast the full draft snapshot to
   * every entrant — every tick, unreliable, same cadence contract as
   * broadcastCharacterSelectState (the next tick repairs a drop). Values
   * are copied first: an expiring second pick finalizes and mutates the
   * map mid-iteration.
   */
  private tickDrafts(dt: number): void {
    for (const draft of [...this.draftStates.values()]) {
      draft.pickTimerSeconds -= dt;
      if (draft.pickTimerSeconds <= 0) {
        if (draft.draftKind === 'rally') {
          this.resolveRallyVote(draft, 'timeout');
        } else {
          this.autoDraftPick(draft);
        }
      }
      // An auto-picked SECOND pick finalizes the draft immediately; only
      // still-live drafts keep broadcasting.
      if (this.draftStates.has(draft.matchId)) {
        this.broadcastDraftState(draft);
      }
    }
  }

  private broadcastDraftState(draft: DraftState): void {
    const message: ServerDraftStateMessage = {
      type: 'server:draftState',
      matchId: draft.matchId,
      draftKind: draft.draftKind,
      players: draft.playerEntries.map((e) => ({
        id: e.id,
        nickname: e.nickname,
        arenaWins: { ...e.arenaWins },
      })),
      firstPickerId: draft.firstPickerId,
      secondPickerId: draft.secondPickerId,
      firstPickerReason: draft.firstPickerReason,
      currentPickerId: draft.currentPickerId,
      rallyCategory: draft.rallyCategory,
      rallyVotes: [...draft.rallyVotes].map(([playerId, value]) => ({ playerId, value })),
      mapPick: draft.mapPick,
      modePick: draft.modePick,
      mapOptions: [...listMapNames()],
      modeOptions: [...GAME_MODE_ROTATION],
      pickDeadlineMs: Math.max(0, draft.pickTimerSeconds * 1000),
    };
    for (const entry of draft.playerEntries) {
      this.server.sendTo(entry.id, message);
    }
  }

  /**
   * Validate and record a pick. Silently ignores (debug log) anything
   * off-contract: a claimed category (the second picker must take the
   * remaining one) or a value outside the offered options. `source`
   * distinguishes player picks from timeout auto-picks in the logs.
   */
  private applyDraftPick(
    draft: DraftState,
    category: DraftCategory,
    value: string,
    source: 'player' | 'timeout',
  ): void {
    if (category === 'map') {
      if (draft.mapPick !== null || !listMapNames().includes(value)) {
        logger.debug(
          { matchId: draft.matchId, category, value },
          'Ignoring invalid draft map pick',
        );
        return;
      }
      draft.mapPick = value;
    } else {
      if (draft.modePick !== null || !(GAME_MODE_ROTATION as readonly string[]).includes(value)) {
        logger.debug(
          { matchId: draft.matchId, category, value },
          'Ignoring invalid draft mode pick',
        );
        return;
      }
      draft.modePick = value as GameModeType;
    }

    logger.info(
      {
        matchId: draft.matchId,
        picker: draft.currentPickerId,
        category,
        value,
        source,
      },
      'Draft pick recorded',
    );

    if (draft.mapPick !== null && draft.modePick !== null) {
      this.finalizeDraft(draft);
      return;
    }

    // First pick landed: hand the remaining category to the other role
    // with a fresh window.
    draft.currentPickerId =
      draft.currentPickerId === draft.firstPickerId ? draft.secondPickerId : draft.firstPickerId;
    draft.pickTimerSeconds = DRAFT.SECOND_PICK_SECONDS;
  }

  /** Record one immutable ballot in the active Rumble rally phase. */
  private applyRallyVote(
    draft: DraftState,
    playerId: PlayerId,
    category: DraftCategory,
    value: string,
  ): void {
    if (draft.rallyCategory !== category || draft.rallyVotes.has(playerId)) return;
    const valid =
      category === 'map'
        ? listMapNames().includes(value)
        : (GAME_MODE_ROTATION as readonly string[]).includes(value);
    if (!valid) {
      logger.debug(
        { matchId: draft.matchId, playerId, category, value },
        'Ignoring invalid rally vote',
      );
      return;
    }

    draft.rallyVotes.set(playerId, value);
    logger.info(
      { matchId: draft.matchId, playerId, category, value },
      'Rumble rally vote recorded',
    );
    if (draft.rallyVotes.size === draft.playerEntries.length) {
      this.resolveRallyVote(draft, 'all_voted');
    }
  }

  /**
   * Resolve the current ballot by plurality. Registry order makes the tied
   * candidate set stable; the injected RNG breaks a real tie once so every
   * client receives the same authoritative outcome. Abstainers never gain
   * random votes, while a fully AFK phase still selects a legal option.
   */
  private resolveRallyVote(draft: DraftState, reason: 'all_voted' | 'timeout'): void {
    const category = draft.rallyCategory;
    if (category === null) return;
    const options: readonly string[] = category === 'map' ? listMapNames() : GAME_MODE_ROTATION;
    const counts = new Map(options.map((option) => [option, 0]));
    for (const value of draft.rallyVotes.values()) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const highest = Math.max(...counts.values());
    const leaders = options.filter((option) => counts.get(option) === highest);
    const winner = leaders[Math.min(Math.floor(this.rng() * leaders.length), leaders.length - 1)];

    logger.info(
      {
        matchId: draft.matchId,
        category,
        winner,
        reason,
        ballots: draft.rallyVotes.size,
        counts: Object.fromEntries(counts),
      },
      'Rumble rally vote resolved',
    );

    if (category === 'map') {
      draft.mapPick = winner;
      draft.rallyCategory = 'mode';
      draft.rallyVotes.clear();
      draft.pickTimerSeconds = DRAFT.RALLY_VOTE_SECONDS;
      return;
    }

    draft.modePick = winner as GameModeType;
    draft.rallyCategory = null;
    draft.rallyVotes.clear();
    this.finalizeDraft(draft);
  }

  /**
   * Deadline expiry: pick uniformly at random on the AFK picker's behalf
   * (mirrors the character-select auto-lock) so a stalled player can't
   * hold the match hostage. First pick pending → random category, then
   * random option; second pick pending → random option of the remaining
   * category.
   */
  private autoDraftPick(draft: DraftState): void {
    const category: DraftCategory =
      draft.mapPick === null && draft.modePick === null
        ? this.rng() < 0.5
          ? 'map'
          : 'mode'
        : draft.mapPick === null
          ? 'map'
          : 'mode';
    const options: readonly string[] = category === 'map' ? listMapNames() : GAME_MODE_ROTATION;
    const value = options[Math.min(Math.floor(this.rng() * options.length), options.length - 1)];
    logger.info(
      {
        matchId: draft.matchId,
        picker: draft.currentPickerId,
        category,
        value,
      },
      'Draft pick timed out — auto-picking',
    );
    this.applyDraftPick(draft, category, value, 'timeout');
  }

  /** Both picks are in — the draft becomes a real Match, same id. */
  private finalizeDraft(draft: DraftState): void {
    this.draftStates.delete(draft.matchId);
    // Both picks were validated against the registry/rotation on entry,
    // so these lookups can't miss.
    this.launchMatch(
      draft.matchId,
      this.resolveMap(draft.mapPick!),
      draft.modePick!,
      draft.playerEntries,
      draft.rumbleGrudges,
      null,
      draft.rematchMutatorExclusions,
      draft.previousContractId,
    );
  }

  /**
   * Tear a draft down because an entrant left (disconnect, or a stale
   * returnToLobby). Same contract as post-match teardown: everyone else
   * gets opponentDisconnected and returns to lobby.
   */
  private teardownDraft(draft: DraftState, leavingPlayerId: PlayerId): void {
    this.draftStates.delete(draft.matchId);
    this.matchKinds.delete(draft.matchId);
    this.rumbleCrowns.delete(draft.matchId);
    this.releaseRivalrySet(draft.playerEntries.map((entry) => entry.id));
    for (const entry of draft.playerEntries) {
      this.playerMatchMap.delete(entry.id);
      if (entry.id !== leavingPlayerId) {
        this.server.sendTo(
          entry.id,
          {
            type: 'server:opponentDisconnected',
            playerId: leavingPlayerId,
          },
          { reliable: true },
        );
      }
    }
    logger.info({ matchId: draft.matchId, leavingPlayerId }, 'Draft torn down');
  }

  /**
   * Send the per-tick character-select snapshot to every player in the
   * match. Replaces the regular gameState broadcast while the match is
   * in CHARACTER_SELECT.
   */
  private broadcastCharacterSelectState(match: Match): void {
    const message = match.getSelectStateMessage();
    for (const [playerId] of match.players) {
      this.server.sendTo(playerId, message);
    }
  }

  /** Forward a character hover from a client into the player's match. */
  handleCharacterHover(playerId: PlayerId, characterId: CharacterId): void {
    const matchId = this.playerMatchMap.get(playerId);
    if (!matchId) return;
    const match = this.activeMatches.get(matchId);
    if (!match) return;
    match.setHover(playerId, characterId);
  }

  /** Forward a character lock from a client into the player's match. */
  handleCharacterLock(playerId: PlayerId, characterId: CharacterId): void {
    const matchId = this.playerMatchMap.get(playerId);
    if (!matchId) return;
    const match = this.activeMatches.get(matchId);
    if (!match) return;
    match.setLock(playerId, characterId);
  }

  /** Broadcast an accepted, server-rate-limited battle cry to the whole match. */
  handleTaunt(playerId: PlayerId, tauntId: TauntId): void {
    const matchId = this.playerMatchMap.get(playerId);
    if (!matchId) return;
    const match = this.activeMatches.get(matchId);
    const accepted = match?.tryTaunt(playerId, tauntId);
    if (!match || !accepted) return;

    this.broadcastTaunt(match, playerId, accepted);
    const response = match.tryAutonomousTauntResponse(playerId);
    if (response) this.broadcastTaunt(match, response.playerId, response.tauntId);
  }

  /** Send one already-authorized cry reliably to every participant. */
  private broadcastTaunt(match: Match, playerId: PlayerId, tauntId: TauntId): void {
    for (const [recipientId] of match.players) {
      this.server.sendTo(
        recipientId,
        { type: 'server:taunt', playerId, tauntId },
        { reliable: true },
      );
    }
  }

  /**
   * A pick in the pre-match draft. Only the current picker is heard;
   * everything else — wrong turn, no draft, claimed category, unknown
   * value — is silently ignored (loss-tolerant clients just keep
   * clicking against the per-tick snapshot).
   */
  handleDraftPick(playerId: PlayerId, category: DraftCategory, value: string): void {
    const matchId = this.playerMatchMap.get(playerId);
    const draft = matchId !== undefined ? this.draftStates.get(matchId) : undefined;
    if (!draft) {
      logger.debug({ playerId, category, value }, 'Ignoring draft pick from player not in a draft');
      return;
    }
    if (draft.draftKind === 'rally') {
      this.applyRallyVote(draft, playerId, category, value);
      return;
    }
    if (draft.currentPickerId !== playerId) {
      logger.debug(
        { playerId, category, value, currentPickerId: draft.currentPickerId },
        'Ignoring out-of-turn draft pick',
      );
      return;
    }
    this.applyDraftPick(draft, category, value, 'player');
  }

  private broadcastMatchState(match: Match, serverTick: number): void {
    const players: SerializedPlayerState[] = [];

    const connectedPlayerIds = new Set(match.getConnectedPlayerIds());
    for (const [playerId, player] of match.players) {
      if (!connectedPlayerIds.has(playerId)) continue;
      players.push({
        id: player.id,
        // SerializedPlayerState requires characterId non-null. By the time we
        // reach this branch the match has transitioned out of
        // CHARACTER_SELECT, so updateCharacterSelect has committed every
        // player's locked selection onto playerState.characterId. Defensive
        // fallback to CHARACTER_IDS[0] is just to satisfy the type system.
        characterId: (player.characterId ?? 'mighty_man') as CharacterId,
        position: player.position,
        velocity: player.velocity,
        aimAngle: player.aimAngle,
        health: player.health,
        maxHealth: player.maxHealth,
        armor: player.armor,
        ammo: player.ammo,
        weaponId: player.weaponId,
        weaponInstance: player.weaponInstance,
        battleRoyaleInventory: player.battleRoyaleInventory,
        specialAmmo: player.specialAmmo,
        specialReserve: player.specialReserve,
        grenades: player.grenades,
        isReloading: player.isReloading,
        isSprinting: player.isSprinting,
        stamina: player.stamina,
        isDead: player.isDead,
        respawnTimer: player.respawnTimer,
        invulnerableTimer: player.invulnerableTimer,
        lastProcessedInput: player.lastProcessedInput,
        score: player.score,
        deaths: player.deaths,
        nickname: player.nickname,
        abilityActiveSeconds: player.abilityActiveSeconds,
        abilityCooldownSeconds: player.abilityCooldownSeconds,
        frozenTimer: player.frozenTimer,
        secondWindTimer: player.secondWindTimer,
        spawnRushTimer: player.spawnRushTimer ?? 0,
      });
    }

    const stateMessage: ServerGameStateMessage = {
      type: 'server:gameState',
      tick: serverTick,
      phase: match.phase,
      countdownTimer: match.countdownTimer,
      matchTimer: match.matchTimer,
      players,
      grenades: match.getActiveGrenades(),
      axes: match.getActiveAxes(),
      rockets: match.getActiveRockets().length > 0 ? match.getActiveRockets() : undefined,
      droppedWeapons: match.battleRoyaleInventoryManager ? match.getDroppedWeapons() : undefined,
      battleRoyaleContainers: match.battleRoyaleLootManager
        ? match.getBattleRoyaleContainers()
        : undefined,
      battleRoyaleSupplyBundles: match.battleRoyaleLootManager
        ? match.getBattleRoyaleSupplyBundles()
        : undefined,
      bulletTrails: match.getTickBulletTrails(),
      barrelExplosions: match.getTickBarrelExplosions(),
      contract: match.getContractHudState(),
      punches: match.getTickPunchEvents(),
      pickups: match.pickupManager.getPickups(),
      activeMutators: [...match.activeMutators],
      isOvertime: match.isOvertime,
      koth: match.getKothHudState() ?? undefined,
      confirmedTags:
        match.gameModeType === GameModeType.KILL_CONFIRMED
          ? [...match.getKillConfirmedTags()]
          : undefined,
      confirmedTagCollections:
        match.gameModeType === GameModeType.KILL_CONFIRMED
          ? [...match.getKillConfirmedCollections()]
          : undefined,
      coreRun:
        match.gameModeType === GameModeType.CORE_RUN
          ? (match.getCoreRunState() ?? undefined)
          : undefined,
      bountyHunt:
        match.gameModeType === GameModeType.BOUNTY_HUNT
          ? (match.getBountyHuntState() ?? undefined)
          : undefined,
      rumbleLead: match.getRumbleLeadState() ?? undefined,
      wastelandWarp: match.getWastelandWarpState() ?? undefined,
      radiationStorm: match.getRadiationStormState() ?? undefined,
      battleRoyaleSafeZone: match.getBattleRoyaleSafeZoneState() ?? undefined,
      scrapstorm: match.getScrapstormState() ?? undefined,
    };

    // Send only to players in this match
    for (const [playerId] of match.players) {
      this.server.sendTo(playerId, stateMessage);
    }

    // Broadcast each kill recorded this tick. The client uses these for
    // kill-feed entries and per-side kill/death SFX.
    for (const entry of match.getTickKillFeedEntries()) {
      for (const [playerId] of match.players) {
        this.server.sendTo(playerId, { type: 'server:playerKilled', entry });
      }
    }
    for (const taunt of match.getTickAutonomousTaunts()) {
      this.broadcastTaunt(match, taunt.playerId, taunt.tauntId);
    }

    // Broadcast each pickup collected this tick (for the pickup SFX).
    for (const collection of match.getTickPickupCollections()) {
      for (const [playerId] of match.players) {
        this.server.sendTo(playerId, {
          type: 'server:pickupCollected',
          pickupId: collection.pickupId,
          playerId: collection.playerId,
        });
      }
    }

    // Walls burned away by a fire-breath this tick. Reliable: a drop
    // would leave the client rendering a wall the server already treats
    // as passable, which is a hard desync (player walks through what
    // looks like a solid wall).
    const destroyedTiles = match.getTickDestroyedTiles();
    if (destroyedTiles.length > 0) {
      const tilesPayload = destroyedTiles.map(({ col, row }) => ({ col, row }));
      for (const [playerId] of match.players) {
        this.server.sendTo(
          playerId,
          { type: 'server:tilesDestroyed', tiles: tilesPayload },
          { reliable: true },
        );
      }
    }

    // Broadcast one-shot mutator warnings (5s before activation) generated
    // this tick. Drives the HUD pre-mutator banner + horn. Usually 0 or 1;
    // both slots can warn in the same tick in degenerate timings.
    for (const warning of match.consumeTickMutatorWarnings()) {
      for (const [playerId] of match.players) {
        this.server.sendTo(
          playerId,
          {
            type: 'server:eventWarning',
            event: warning.event,
            activatesInMs: warning.activatesInMs,
            isFinalMinute: warning.isFinalMinute,
          },
          { reliable: true },
        );
      }
    }

    // Broadcast one-shot weapon-incoming warnings ("SHOTGUN INCOMING") —
    // fired ~5s before a weapon pickup (re)spawns. Reliable: it's a single
    // dramatic beat and a drop would kill the whole point.
    for (const incoming of match.consumeTickWeaponIncoming()) {
      for (const [playerId] of match.players) {
        this.server.sendTo(
          playerId,
          {
            type: 'server:weaponIncoming',
            weaponId: incoming.weaponId,
            landsInMs: incoming.landsInMs,
          },
          { reliable: true },
        );
      }
    }

    // Broadcast one-shot mutator starts at activation. Drives the HUD
    // reveal banner + flash + horn; client modifier kicks in immediately
    // so prediction matches authority.
    for (const started of match.consumeTickMutatorStarts()) {
      for (const [playerId] of match.players) {
        this.server.sendTo(
          playerId,
          {
            type: 'server:eventStart',
            event: started.event,
            isFinalMinute: started.isFinalMinute,
          },
          { reliable: true },
        );
      }
    }

    // Broadcast the one-shot overtime announcement. Reliable: it carries
    // the clock re-anchor and the banner beat — a drop would leave the
    // client's countdown stuck at 0:00 until the next snapshot fixes it.
    const overtimeStart = match.consumeTickOvertimeStart();
    if (overtimeStart) {
      for (const [playerId] of match.players) {
        this.server.sendTo(
          playerId,
          {
            type: 'server:overtimeStart',
            overtimeEndsInMs: overtimeStart.overtimeEndsInMs,
          },
          { reliable: true },
        );
      }
    }
  }

  private onMatchEnded(matchId: string, match: Match): void {
    const result = match.getResult();
    const matchKind = this.matchKinds.get(matchId) ?? 'duel';
    const isBattleRoyale = matchKind === 'battle_royale';
    result.matchKind = matchKind;
    result.scores = Object.fromEntries(
      [...match.players].map(([playerId, player]) => [playerId, player.score]),
    );
    result.playerNicknames = Object.fromEntries(
      [...match.players].map(([playerId, player]) => [playerId, player.nickname]),
    );
    result.playerCharacters = Object.fromEntries(
      [...match.players]
        .filter(([, player]) => player.characterId !== null)
        .map(([playerId, player]) => [playerId, player.characterId as CharacterId]),
    );
    result.departedPlayerIds = match.getDepartedPlayerIds();
    const connectedPlayerIds = match.getConnectedPlayerIds();
    const partyId = this.partyIdByMatchId.get(matchId);
    if (partyId) this.partyLifecycleListener?.(partyId, 'results', matchId);
    const rumbleGrudges =
      matchKind === 'rumble' && match.players.size >= 3
        ? resolveRumbleGrudges(
            match.getKillFeed(),
            [...match.players.values()].map((player) => ({
              id: player.id,
              nickname: player.nickname,
            })),
            connectedPlayerIds,
          )
        : {};
    if (Object.keys(rumbleGrudges).length > 0) result.rumbleGrudges = rumbleGrudges;
    const rumbleCrownResult =
      matchKind === 'rumble'
        ? resolveRumbleCrown(
            this.rumbleCrowns.get(matchId) ?? null,
            result.winnerId,
            [...match.players.values()].map((player) => ({
              id: player.id,
              nickname: player.nickname,
            })),
            connectedPlayerIds,
          )
        : null;
    if (rumbleCrownResult) result.rumbleCrown = rumbleCrownResult;
    const practiceDifficulty = this.practiceDifficulties.get(matchId) ?? null;
    const practiceModePin = this.practiceModePins.get(matchId) ?? null;
    const practiceRivalPin = this.practiceRivalPins.get(matchId) ?? null;
    const practiceMutatorPreference = this.practiceMutatorPreferences.get(matchId) ?? null;
    const gauntlet = this.practiceGauntlets.get(matchId) ?? null;
    const gauntletRunHistory = this.practiceGauntletRunHistories.get(matchId) ?? {
      opponentCharacterIds: [],
      forecastMutatorIds: [],
    };
    const isPractice = practiceDifficulty !== null;
    result.isPractice = isPractice;
    result.rivalrySet =
      gauntlet || matchKind === 'rumble' || matchKind === 'duos' || isBattleRoyale
        ? null
        : this.recordRivalrySet(match, result.winnerId);
    const humanPlayerId = gauntlet
      ? [...match.players.keys()].find((playerId) => !this.botPlayerIds.has(playerId))
      : undefined;
    if (gauntlet) {
      if (humanPlayerId) {
        const contractCompleted =
          result.contract?.players.find((progress) => progress.playerId === humanPlayerId)
            ?.completed ?? false;
        result.gauntlet = resolvePracticeGauntlet(gauntlet, humanPlayerId, result.winnerId, {
          contractCompleted,
          wentToOvertime: result.wentToOvertime,
          deaths: result.playerStats.get(humanPlayerId)?.deaths,
          regulationSecondsRemaining: result.wentToOvertime ? 0 : match.matchTimer,
          stylePointsEarned: practiceGauntletStyleBonus(match.getKillFeed(), humanPlayerId),
        });
        if (
          this.statsStore &&
          result.gauntlet.challengeKey &&
          result.gauntlet.outcome === 'cleared'
        ) {
          const human = match.players.get(humanPlayerId);
          if (human) {
            const standing = this.statsStore.recordDailyGauntletClear(
              result.gauntlet.challengeKey,
              human.nickname,
              result.gauntlet.runScore,
              this.now().getTime(),
            );
            result.gauntlet.dailyRank = standing.rank;
            result.gauntlet.dailyBestScore = standing.bestScore;
            const entries = this.statsStore.getDailyGauntletLeaderboard(
              result.gauntlet.challengeKey,
              DAILY_GAUNTLET_LEADERBOARD.SIZE,
            );
            for (const connectedId of this.server.getConnectedPlayerIds()) {
              this.server.sendTo(
                connectedId,
                {
                  type: 'server:dailyGauntletLeaderboard',
                  challengeKey: result.gauntlet.challengeKey,
                  entries,
                },
                { reliable: true },
              );
            }
          }
        }
      }
    }

    // Rotation: a rematch plays the map AND mode AFTER this one (registry/
    // rotation order). Attached to the result so the results screen's
    // "NEXT: X" promises and what the rematch actually starts can never
    // disagree.
    const dailyOpening = gauntlet?.challengeKey
      ? practiceDailyGauntletOpening(
          gauntlet.challengeKey,
          listMapNames(),
          GAME_MODE_ROTATION,
          CHARACTER_IDS,
        )
      : null;
    const restartingDaily = dailyOpening !== null && result.gauntlet?.outcome !== 'advanced';
    const nextMapName =
      this.forcedMap()?.name ??
      (restartingDaily ? dailyOpening.mapName : getNextMapName(match.mapManager.getMapData().name));
    if (!isBattleRoyale) result.nextMapName = nextMapName;
    const forcedNextMode = this.forcedMode();
    const nextGameMode =
      matchKind === 'duos'
        ? forcedNextMode !== null &&
          isCrewBattleMode(forcedNextMode) &&
          (!practiceMutatorPreference ||
            isMutatorCompatibleWithMode(practiceMutatorPreference, forcedNextMode))
          ? forcedNextMode
          : (practiceModePin ??
            this.nextCompatibleCrewBattleMode(match.gameModeType, practiceMutatorPreference))
        : (this.forcedMode() ??
          practiceModePin ??
          (restartingDaily
            ? dailyOpening.gameMode
            : this.nextCompatiblePracticeMode(match.gameModeType, practiceMutatorPreference)));
    if (!isBattleRoyale) result.nextGameMode = nextGameMode;
    const nextGauntlet = result.gauntlet
      ? practiceGauntletMatch(
          result.gauntlet.nextStage,
          result.gauntlet.outcome === 'advanced' ? result.gauntlet.runScore : 0,
          result.gauntlet.challengeKey,
          result.gauntlet.outcome === 'advanced' ? gauntlet?.boonIds : [],
        )
      : null;
    if (nextGauntlet?.challengeKey && humanPlayerId) {
      const humanNickname = match.players.get(humanPlayerId)?.nickname;
      const chase =
        result.gauntlet?.outcome === 'advanced'
          ? gauntlet?.dailyChase
          : humanNickname
            ? this.statsStore?.getDailyGauntletChaseTarget(
                nextGauntlet.challengeKey,
                humanNickname,
                DAILY_GAUNTLET_LEADERBOARD.SIZE,
              )
            : undefined;
      if (chase) nextGauntlet.dailyChase = chase;
    }
    if (nextGauntlet && restartingDaily) {
      nextGauntlet.opponentCharacterId = dailyOpening.opponentCharacterId;
    }
    const rivalChoices =
      result.gauntlet?.outcome === 'advanced'
        ? practiceGauntletOpponentChoices(CHARACTER_IDS, gauntletRunHistory.opponentCharacterIds)
        : [];
    const primaryRoute = {
      mapName: nextMapName,
      gameMode: nextGameMode,
      opponentCharacterId: rivalChoices[0],
    };
    const alternateRoute = {
      mapName: this.forcedMap()?.name ?? getNextMapName(nextMapName),
      gameMode: this.forcedMode() ?? getNextGameMode(nextGameMode),
      opponentCharacterId: rivalChoices[1],
    };
    const priorForecasts = [...gauntletRunHistory.forecastMutatorIds, ...match.activeMutators];
    const primaryForecast =
      result.gauntlet?.outcome === 'advanced'
        ? this.pickPracticeGauntletForecast(
            'route_a',
            primaryRoute,
            result.gauntlet.nextStage,
            priorForecasts,
          )
        : undefined;
    const alternateForecast =
      result.gauntlet?.outcome === 'advanced'
        ? this.pickPracticeGauntletForecast(
            'route_b',
            alternateRoute,
            result.gauntlet.nextStage,
            primaryForecast ? [...priorForecasts, primaryForecast] : priorForecasts,
          )
        : undefined;
    const ownedBoons = nextGauntlet?.boonIds ?? [];
    const primaryBoon =
      result.gauntlet?.outcome === 'advanced'
        ? this.pickPracticeGauntletBoon(
            'route_a',
            primaryRoute,
            result.gauntlet.nextStage,
            ownedBoons,
            result.gauntlet.challengeKey,
          )
        : undefined;
    const alternateBoon =
      result.gauntlet?.outcome === 'advanced'
        ? this.pickPracticeGauntletBoon(
            'route_b',
            alternateRoute,
            result.gauntlet.nextStage,
            primaryBoon ? [...ownedBoons, primaryBoon] : ownedBoons,
            result.gauntlet.challengeKey,
          )
        : undefined;
    const gauntletRoutes =
      result.gauntlet?.outcome === 'advanced'
        ? practiceGauntletRoutes(
            {
              ...primaryRoute,
              ...(primaryForecast ? { forecastMutatorId: primaryForecast } : {}),
              ...(primaryBoon ? { boonId: primaryBoon } : {}),
            },
            {
              ...alternateRoute,
              ...(alternateForecast ? { forecastMutatorId: alternateForecast } : {}),
              ...(alternateBoon ? { boonId: alternateBoon } : {}),
            },
          )
        : [];
    if (result.gauntlet?.outcome === 'advanced') {
      result.gauntlet.routeOptions = gauntletRoutes;
      if (nextGauntlet && gauntletRoutes[0]?.opponentCharacterId) {
        nextGauntlet.opponentCharacterId = gauntletRoutes[0].opponentCharacterId;
      }
      if (nextGauntlet && gauntletRoutes[0]?.forecastMutatorId) {
        nextGauntlet.forecastMutatorId = gauntletRoutes[0].forecastMutatorId;
      }
    }

    // Fold this match into the lifetime records and attach the pairing's
    // all-time rivalry line before shipping the result. The in-memory
    // update is synchronous and O(players); the file write is queued onto
    // fs.promises — nothing here blocks the tick.
    if (this.statsStore && !isPractice && !isBattleRoyale) {
      const entries: MatchStatsEntry[] = [];
      const previousStreaks = new Map<PlayerId, { current: number; best: number }>();
      const arenaName = match.getMapData().name;
      const previousArenaWins = new Map<PlayerId, number>();
      for (const [playerId, player] of match.players) {
        const stats = result.playerStats.get(playerId);
        if (!stats) continue;
        const previousLifetime = this.statsStore.getLifetime(player.nickname);
        previousStreaks.set(playerId, {
          current: previousLifetime?.currentWinStreak ?? 0,
          best: previousLifetime?.bestWinStreak ?? 0,
        });
        previousArenaWins.set(playerId, previousLifetime?.arenaWins[arenaName] ?? 0);
        entries.push({
          nickname: player.nickname,
          kills: stats.kills,
          deaths: stats.deaths,
          killsByWeapon: stats.killsByWeapon,
          characterId: player.characterId,
          contractCompleted:
            result.contract?.players.find((progress) => progress.playerId === playerId)
              ?.completed ?? false,
        });
      }
      const winnerNickname =
        result.winnerId !== null ? (match.players.get(result.winnerId)?.nickname ?? null) : null;
      this.statsStore.recordMatch(entries, winnerNickname, arenaName, matchKind !== 'rumble');
      result.winStreaks = {};
      result.arenaMastery = {};
      for (const [playerId, player] of match.players) {
        const lifetime = this.statsStore.getLifetime(player.nickname);
        const previous = previousStreaks.get(playerId);
        if (!lifetime || !previous) continue;
        result.winStreaks[playerId] = {
          current: lifetime.currentWinStreak,
          best: lifetime.bestWinStreak,
          previous: previous.current,
          previousBest: previous.best,
        };
        result.arenaMastery[playerId] = {
          mapName: arenaName,
          previousWins: previousArenaWins.get(playerId) ?? 0,
          wins: lifetime.arenaWins[arenaName] ?? 0,
        };
      }
      if (result.contract) {
        for (const [playerId, player] of match.players) {
          result.contract.careerCompletions[playerId] =
            this.statsStore.getLifetime(player.nickname)?.contractsCompleted ?? 0;
        }
      }
      if (entries.length === 2 && matchKind !== 'rumble') {
        result.rivalry = this.statsStore.getRivalry(entries[0].nickname, entries[1].nickname);
      }

      // The lifetime records just changed — refresh every connected
      // client's all-time leaderboard (idle lobbies included). Reliable:
      // one-shot per match end, the next refresh is a match away.
      const leaderboardEntries = this.statsStore.getTopPlayers(LEADERBOARD.SIZE);
      for (const connectedId of this.server.getConnectedPlayerIds()) {
        this.server.sendTo(
          connectedId,
          { type: 'server:leaderboard', entries: leaderboardEntries },
          { reliable: true },
        );
      }
    }

    // Send match end only to players who still belong to this match.
    // MatchResult uses Map for playerStats, but JSON.stringify can't serialize Maps.
    // Convert to a plain-object-friendly structure for the wire format.
    const serializableResult = {
      ...result,
      playerStats: Object.fromEntries(result.playerStats),
    };

    // A player who deliberately left may already be queued for a new match.
    // Never let this old match deliver results or own post-match state for them.
    for (const playerId of connectedPlayerIds) {
      this.server.sendTo(
        playerId,
        {
          type: 'server:matchEnd',
          result: serializableResult as unknown as MatchResult,
        },
        { reliable: true },
      );
    }

    logger.info({ matchId, winnerId: result.winnerId, duration: result.duration }, 'Match ended');

    if (isBattleRoyale) {
      // BR has no rematch contract and Batch 49 owns its separate persistence.
      // Keep each connected human mapped only until their reachable Results
      // leave action arrives; release synthetic players immediately.
      this.activeMatches.delete(matchId);
      this.previousPhases.delete(matchId);
      this.botControllers.delete(matchId);
      this.matchKinds.delete(matchId);
      this.releasePracticePlayers([...match.players.keys()]);
      return;
    }

    // Move to post-match state for rematch handling
    const playerIds = connectedPlayerIds;
    const timeoutHandle = setTimeout(() => {
      this.onRematchTimeout(matchId);
    }, REMATCH_TIMEOUT_MS);

    this.postMatchStates.set(matchId, {
      matchId,
      playerIds,
      rematchRequests: new Set(),
      returnedToLobby: new Set(),
      timeoutHandle,
      nextMapName,
      nextGameMode,
      revengePickerId:
        isPractice || result.rivalrySet === null || result.winnerId === null
          ? null
          : (playerIds.find((id) => id !== result.winnerId) ?? null),
      setComplete: result.rivalrySet?.championId != null,
      isPractice,
      practiceDifficulty,
      practiceModePin,
      practiceRivalPin,
      practiceMutatorPreference,
      nextGauntlet,
      gauntletRoutes,
      gauntletRunHistory:
        result.gauntlet?.outcome === 'advanced'
          ? {
              opponentCharacterIds: [...gauntletRunHistory.opponentCharacterIds],
              forecastMutatorIds: [...gauntletRunHistory.forecastMutatorIds],
            }
          : { opponentCharacterIds: [], forecastMutatorIds: [] },
      previousMutators: [...match.activeMutators],
      previousContractId: result.contract?.id ?? match.getContractHudState().id,
      rumbleCrown: rumbleCrownResult?.crown ?? null,
      rumbleGrudges,
      playerTeams: match.getTeamAssignments(),
    });

    // Remove from active matches
    this.activeMatches.delete(matchId);
    this.previousPhases.delete(matchId);
    this.botControllers.delete(matchId);
    this.practiceDifficulties.delete(matchId);
    this.practiceModePins.delete(matchId);
    this.practiceRivalPins.delete(matchId);
    this.practiceMutatorPreferences.delete(matchId);
    this.practiceGauntlets.delete(matchId);
    this.practiceGauntletRunHistories.delete(matchId);
    this.rumbleCrowns.delete(matchId);
  }

  private onRematchTimeout(matchId: string): void {
    const postMatch = this.postMatchStates.get(matchId);
    if (!postMatch) return;

    logger.info({ matchId }, 'Rematch timeout expired');

    // Return all players to lobby
    for (const pid of postMatch.playerIds) {
      this.playerMatchMap.delete(pid);
      this.server.sendTo(
        pid,
        {
          type: 'server:matchmakingStatus',
          status: 'cancelled',
          playersOnline: this.getOnlinePlayerCount(),
        },
        { reliable: true },
      );
    }

    this.postMatchStates.delete(matchId);
    this.releasePartyMatch(matchId);
    this.matchKinds.delete(matchId);
    this.rumbleCrowns.delete(matchId);
    this.releaseRivalrySet(postMatch.playerIds);
    this.releasePracticePlayers(postMatch.playerIds);
  }

  private sendRematchUnavailable(playerId: PlayerId): void {
    this.server.sendTo(
      playerId,
      {
        type: 'server:matchmakingStatus',
        status: 'cancelled',
        playersOnline: this.getOnlinePlayerCount(),
      },
      { reliable: true },
    );
  }

  private startRematch(postMatch: PostMatchState): void {
    const partyId = this.partyIdByMatchId.get(postMatch.matchId);
    clearTimeout(postMatch.timeoutHandle);
    this.postMatchStates.delete(postMatch.matchId);

    const playerEntries = postMatch.playerIds.map((pid) => ({
      id: pid,
      nickname: this.playerNicknames.get(pid) ?? `Player_${pid.slice(0, 4)}`,
    }));
    const rematchKind = this.matchKinds.get(postMatch.matchId) ?? 'duel';
    this.matchKinds.delete(postMatch.matchId);
    this.rumbleCrowns.delete(postMatch.matchId);

    if (postMatch.setComplete) {
      this.releaseRivalrySet(postMatch.playerIds);
    }

    logger.info({ players: postMatch.playerIds }, 'Rematch starting');

    if (postMatch.isPractice) {
      const nextMatchId = crypto.randomUUID();
      this.matchKinds.set(
        nextMatchId,
        rematchKind === 'rumble' ? 'rumble' : rematchKind === 'duos' ? 'duos' : 'practice',
      );
      if (rematchKind === 'rumble' && postMatch.rumbleCrown) {
        this.rumbleCrowns.set(nextMatchId, postMatch.rumbleCrown);
      }
      this.launchMatch(
        nextMatchId,
        this.resolveMap(postMatch.nextMapName),
        postMatch.nextGameMode,
        playerEntries,
        rematchKind === 'rumble' ? postMatch.rumbleGrudges : {},
        postMatch.nextGauntlet?.difficulty ?? postMatch.practiceDifficulty,
        postMatch.previousMutators,
        postMatch.previousContractId,
        postMatch.nextGauntlet,
        postMatch.gauntletRunHistory,
        postMatch.practiceModePin,
        postMatch.practiceRivalPin,
        postMatch.practiceMutatorPreference,
        postMatch.playerTeams,
      );
      if (partyId) this.transferPartyMatch(postMatch.matchId, nextMatchId, partyId);
      return;
    }

    // FORCE pins skip the draft here too, playing the map/mode promised
    // at match end ("NEXT: X"). Real play drafts again — rematches are
    // the friend group's main pattern, and the draft IS the feature.
    // Either path re-points playerMatchMap at the new id (draft or match)
    // for every entrant, replacing the ended match's mapping.
    if (this.forcePinsActive()) {
      const nextMatchId = crypto.randomUUID();
      this.matchKinds.set(nextMatchId, rematchKind);
      if (postMatch.rumbleCrown) this.rumbleCrowns.set(nextMatchId, postMatch.rumbleCrown);
      this.launchMatch(
        nextMatchId,
        this.resolveMap(postMatch.nextMapName),
        postMatch.nextGameMode,
        playerEntries,
        postMatch.rumbleGrudges,
        null,
        postMatch.previousMutators,
        postMatch.previousContractId,
      );
      if (partyId) this.transferPartyMatch(postMatch.matchId, nextMatchId, partyId);
      return;
    }

    const nextMatchId = this.startDraft(
      playerEntries,
      postMatch.revengePickerId,
      postMatch.previousMutators,
      postMatch.previousContractId,
      rematchKind === 'rumble' ? 'rumble' : 'duel',
      postMatch.rumbleCrown,
      postMatch.rumbleGrudges,
    );
    if (partyId) this.transferPartyMatch(postMatch.matchId, nextMatchId, partyId);
  }

  private transferPartyMatch(previousMatchId: string, nextMatchId: string, partyId: string): void {
    this.partyIdByMatchId.delete(previousMatchId);
    const context = this.partyMatchContexts.get(previousMatchId);
    this.partyMatchContexts.delete(previousMatchId);
    this.partyIdByMatchId.set(nextMatchId, partyId);
    if (context) this.partyMatchContexts.set(nextMatchId, context);
    this.partyLifecycleListener?.(partyId, 'match', nextMatchId);
  }

  private releasePartyMatch(matchId: string): void {
    const partyId = this.partyIdByMatchId.get(matchId);
    if (!partyId) return;
    this.partyIdByMatchId.delete(matchId);
    this.partyMatchContexts.delete(matchId);
    this.partyLifecycleListener?.(partyId, 'assembling');
  }

  /** Record one 1v1 result into the pairing's immediate rematch set. */
  private recordRivalrySet(match: Match, winnerId: PlayerId | null): RivalrySetResult | null {
    const players = [...match.players.values()];
    if (players.length !== 2) return null;
    const playerIds = players.map((player) => player.id);

    let state = this.playerRivalrySets.get(playerIds[0]);
    if (
      !state ||
      state.playerIds.length !== playerIds.length ||
      !playerIds.every(
        (id) => state?.playerIds.includes(id) === true && this.playerRivalrySets.get(id) === state,
      )
    ) {
      this.releaseRivalrySet(playerIds);
      state = {
        playerIds: [...playerIds],
        wins: new Map(playerIds.map((id) => [id, 0])),
        roundsPlayed: 0,
        championId: null,
      };
      for (const id of playerIds) this.playerRivalrySets.set(id, state);
    }

    const activeState = state;
    activeState.roundsPlayed++;
    if (winnerId !== null && activeState.wins.has(winnerId)) {
      const wins = (activeState.wins.get(winnerId) ?? 0) + 1;
      activeState.wins.set(winnerId, wins);
      if (wins >= RIVALRY_SET.WINS_TO_CLINCH) activeState.championId = winnerId;
    }

    return {
      winsToClinch: RIVALRY_SET.WINS_TO_CLINCH,
      roundsPlayed: activeState.roundsPlayed,
      players: players.map((player) => ({
        playerId: player.id,
        nickname: player.nickname,
        wins: activeState.wins.get(player.id) ?? 0,
      })),
      championId: activeState.championId,
    };
  }

  /** Release every shared set object touched by these players. */
  private releaseRivalrySet(playerIds: PlayerId[]): void {
    const states = new Set<RivalrySetState>();
    for (const id of playerIds) {
      const state = this.playerRivalrySets.get(id);
      if (state) states.add(state);
    }
    for (const state of states) {
      for (const id of state.playerIds) {
        if (this.playerRivalrySets.get(id) === state) {
          this.playerRivalrySets.delete(id);
        }
      }
    }
  }

  private releasePracticePlayers(playerIds: PlayerId[]): void {
    for (const id of playerIds) {
      if (!this.botPlayerIds.delete(id)) continue;
      this.playerNicknames.delete(id);
      this.playerMatchMap.delete(id);
    }
  }
}
