import {
  MatchPhase,
  GameModeType,
  GAME_MODE_ROTATION,
  DRAFT,
  RIVALRY_SET,
  BOT,
  BOT_DIFFICULTIES,
  DEFAULT_BOT_DIFFICULTY,
  PRACTICE_KINDS,
  CHARACTER_IDS,
  createEmptyCharacterWins,
  LEADERBOARD,
  getNextGameMode,
  getMap,
  getNextMapName,
  listMapNames,
  MAP_REGISTRY,
  practiceGauntletMatch,
  practiceGauntletOpponentChoices,
  practiceGauntletRoutes,
  resolvePracticeGauntlet,
  selectPracticeGauntletRoute,
} from '@shared/game';
import type { MapData } from '@shared/game';
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
  BotDifficulty,
  MutatorId,
  MatchContractId,
  PracticeKind,
  PracticeGauntletMatch,
  PracticeGauntletRoute,
  PracticeGauntletRouteId,
} from '@shared/game';
import { Match } from '../game/match.js';
import { BotController } from '../game/bot-controller.js';
import { GameServer } from '../network/server.js';
import { MatchmakingQueue } from './matchmaking-queue.js';
import { logger } from '../utils/logger.js';
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
  /** Next Gauntlet fight, or stage one when the completed run must retry. */
  nextGauntlet: PracticeGauntletMatch | null;
  /** Server-authored advancement choices; empty for retries and non-Gauntlet matches. */
  gauntletRoutes: PracticeGauntletRoute[];
  /** Rivals already faced in this run, carried only while advancing. */
  gauntletOpponentHistory: CharacterId[];
  /** Both mutators from the completed round; random rematch rolls skip them. */
  previousMutators: MutatorId[];
  /** Previous round's contract; direct rematches must roll something fresh. */
  previousContractId: MatchContractId;
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
  playerEntries: { id: PlayerId; nickname: string }[];
  /** Winner of the who-picks-first roll — claims a category by picking. */
  firstPickerId: PlayerId;
  firstPickerReason: DraftFirstPickerReason;
  /** The entrant who picks whatever category the first picker leaves. */
  secondPickerId: PlayerId;
  /**
   * Whose pick the server is waiting on. Never null while the draft is
   * stored: the second pick finalizes (and deletes) the draft immediately,
   * so the wire's "complete" state is never broadcast.
   */
  currentPickerId: PlayerId;
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
}

interface RivalrySetState {
  playerIds: PlayerId[];
  wins: Map<PlayerId, number>;
  roundsPlayed: number;
  championId: PlayerId | null;
}

export class MatchmakingManager {
  private readonly queue: MatchmakingQueue;
  private readonly server: GameServer;
  private readonly activeMatches: Map<string, Match> = new Map();
  /** Maps playerId -> matchId for routing messages. */
  private readonly playerMatchMap: Map<PlayerId, string> = new Map();
  /** Post-match state for rematch handling. */
  private readonly postMatchStates: Map<string, PostMatchState> = new Map();
  /** Pre-match drafts in progress, keyed by the future matchId. */
  private readonly draftStates: Map<string, DraftState> = new Map();
  /** Ephemeral first-to-N scores shared by consecutive rematches. */
  private readonly playerRivalrySets: Map<PlayerId, RivalrySetState> = new Map();
  /** One live authoritative controller per practice match. */
  private readonly botControllers: Map<string, BotController> = new Map();
  /** Match ids whose lifetime stats must stay out of friend leaderboards. */
  private readonly practiceDifficulties: Map<string, BotDifficulty> = new Map();
  /** Authoritative stage metadata for live Gauntlet matches. */
  private readonly practiceGauntlets: Map<string, PracticeGauntletMatch> = new Map();
  /** Ordered, non-repeating Rusty fighters encountered by each live run. */
  private readonly practiceGauntletOpponentHistories: Map<string, CharacterId[]> = new Map();
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
  /**
   * Round-robin cursor over registry order, consulted ONLY when a FORCE
   * pin skips the draft (the pinned category is forced; the other one
   * rotates). Real matches draft their map, so the cursor survives just
   * for the smoke-pin/kill-switch path.
   */
  private mapRotationIndex = 0;
  /** Same contract for game modes (FORCE-pinned matches only). */
  private modeRotationIndex = 0;

  constructor(
    server: GameServer,
    getPlayerRTT: (playerId: PlayerId) => number = () => 0,
    statsStore?: PersistentStatsStore,
    rng: () => number = Math.random,
  ) {
    this.server = server;
    this.queue = new MatchmakingQueue();
    this.getPlayerRTT = getPlayerRTT;
    this.statsStore = statsStore;
    this.rng = rng;
  }

  handleJoinMatchmaking(playerId: PlayerId, nickname: string): void {
    // If player is already in a match, ignore
    if (this.playerMatchMap.has(playerId)) {
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

  /** Start a real authoritative match immediately with a synthetic opponent. */
  handleStartPractice(
    playerId: PlayerId,
    nickname: string,
    difficulty: BotDifficulty = DEFAULT_BOT_DIFFICULTY,
    kind: PracticeKind = 'sparring',
  ): void {
    if (this.playerMatchMap.has(playerId)) return;
    const safeDifficulty = BOT_DIFFICULTIES.includes(difficulty)
      ? difficulty
      : DEFAULT_BOT_DIFFICULTY;
    const safeKind = PRACTICE_KINDS.includes(kind) ? kind : 'sparring';
    const gauntlet = safeKind === 'gauntlet' ? practiceGauntletMatch(1) : null;
    this.queue.removePlayer(playerId);
    this.playerNicknames.set(playerId, nickname);

    const botId = `${BOT.PLAYER_ID_PREFIX}${crypto.randomUUID()}` as PlayerId;
    this.botPlayerIds.add(botId);
    this.playerNicknames.set(botId, BOT.NICKNAME);
    const names = listMapNames();
    const mapName = names[Math.min(Math.floor(this.rng() * names.length), names.length - 1)];
    const gameMode =
      GAME_MODE_ROTATION[
        Math.min(Math.floor(this.rng() * GAME_MODE_ROTATION.length), GAME_MODE_ROTATION.length - 1)
      ];
    this.launchMatch(
      crypto.randomUUID(),
      this.forcedMap() ?? getMap(mapName),
      this.forcedMode() ?? gameMode,
      [
        { id: playerId, nickname },
        { id: botId, nickname: BOT.NICKNAME },
      ],
      gauntlet?.difficulty ?? safeDifficulty,
      [],
      undefined,
      gauntlet,
    );
  }

  handleCancelMatchmaking(playerId: PlayerId): void {
    const removed = this.queue.removePlayer(playerId);
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
    }
  }

  handlePlayerDisconnect(playerId: PlayerId): void {
    // Remove from queue if queued
    this.queue.removePlayer(playerId);
    this.playerNicknames.delete(playerId);

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
        match.onPlayerDisconnect(playerId);

        // Notify other players in the match
        for (const [pid] of match.players) {
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
        this.postMatchStates.delete(postMatchId);
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
      this.postMatchStates.delete(matchId);
      this.releaseRivalrySet(postMatch.playerIds);
      this.releasePracticePlayers(postMatch.playerIds);
    } else {
      // Player returning to lobby from an active match (forfeit)
      this.playerMatchMap.delete(playerId);
    }
  }

  /** Called each server tick. */
  tick(dt: number, serverTick: number): void {
    // Try to create matches from queued players
    this.tryCreateMatch();

    // Drive pre-match draft deadlines + snapshots
    this.tickDrafts(dt);

    // Update active matches
    for (const [matchId, match] of this.activeMatches) {
      const prevPhase = this.previousPhases.get(matchId);
      this.botControllers.get(matchId)?.update(dt, match, serverTick);
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
    return this.queue.getQueueLength();
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
    return getMap(forced);
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
    return getMap(name);
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
    practiceDifficulty: BotDifficulty | null = null,
    rematchMutatorExclusions: readonly MutatorId[] = [],
    previousContractId?: MatchContractId,
    gauntlet: PracticeGauntletMatch | null = null,
    gauntletOpponentHistory: readonly CharacterId[] = [],
  ): void {
    const match = new Match(
      matchId,
      mapData,
      playerEntries,
      gameMode,
      Math.random,
      rematchMutatorExclusions,
      undefined,
      previousContractId,
    );
    match.setRttResolver(this.getPlayerRTT);
    this.activeMatches.set(matchId, match);
    for (const entry of playerEntries) {
      this.playerMatchMap.set(entry.id, matchId);
    }
    if (practiceDifficulty !== null) {
      this.practiceDifficulties.set(matchId, practiceDifficulty);
      if (gauntlet) this.practiceGauntlets.set(matchId, gauntlet);
      const botEntry = playerEntries.find((entry) => this.botPlayerIds.has(entry.id));
      if (botEntry) {
        this.botControllers.set(matchId, new BotController(botEntry.id, practiceDifficulty));
        const character =
          gauntlet?.opponentCharacterId ??
          CHARACTER_IDS[
            Math.min(Math.floor(this.rng() * CHARACTER_IDS.length), CHARACTER_IDS.length - 1)
          ];
        if (gauntlet) {
          gauntlet.opponentCharacterId = character;
          this.practiceGauntletOpponentHistories.set(
            matchId,
            gauntletOpponentHistory.includes(character)
              ? [...gauntletOpponentHistory]
              : [...gauntletOpponentHistory, character],
          );
        }
        match.setLock(botEntry.id, character);
      }
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
      this.server.sendTo(
        entry.id,
        {
          type: 'server:matchFound',
          matchId,
          opponents,
          mapName: mapData.name,
          gameMode,
          characterWins,
          gauntlet: gauntlet ?? undefined,
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
  ): void {
    const matchId = crypto.randomUUID();

    // Roll two DISTINCT picker roles (N-player safe: any extra entrants
    // just spectate the draft). Decided here, once — the client's
    // who-picks-first spectacle only animates toward this outcome.
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
      playerEntries,
      firstPickerId: playerEntries[firstIdx].id,
      firstPickerReason: revengeIdx >= 0 ? 'revenge' : 'coin_toss',
      secondPickerId: playerEntries[secondIdx].id,
      currentPickerId: playerEntries[firstIdx].id,
      mapPick: null,
      modePick: null,
      pickTimerSeconds: DRAFT.FIRST_PICK_SECONDS,
      rematchMutatorExclusions: [...rematchMutatorExclusions],
      previousContractId,
    };
    this.draftStates.set(matchId, draft);

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
      },
      'Draft started',
    );
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
        this.autoDraftPick(draft);
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
      players: draft.playerEntries.map((e) => ({ id: e.id, nickname: e.nickname })),
      firstPickerId: draft.firstPickerId,
      firstPickerReason: draft.firstPickerReason,
      currentPickerId: draft.currentPickerId,
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
      { matchId: draft.matchId, picker: draft.currentPickerId, category, value, source },
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
      { matchId: draft.matchId, picker: draft.currentPickerId, category, value },
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
      getMap(draft.mapPick!),
      draft.modePick!,
      draft.playerEntries,
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

    for (const [, player] of match.players) {
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
      wastelandWarp: match.getWastelandWarpState() ?? undefined,
      radiationStorm: match.getRadiationStormState() ?? undefined,
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
    const practiceDifficulty = this.practiceDifficulties.get(matchId) ?? null;
    const gauntlet = this.practiceGauntlets.get(matchId) ?? null;
    const gauntletOpponentHistory = this.practiceGauntletOpponentHistories.get(matchId) ?? [];
    const isPractice = practiceDifficulty !== null;
    result.isPractice = isPractice;
    result.rivalrySet = gauntlet ? null : this.recordRivalrySet(match, result.winnerId);
    if (gauntlet) {
      const humanPlayerId = [...match.players.keys()].find(
        (playerId) => !this.botPlayerIds.has(playerId),
      );
      if (humanPlayerId) {
        const contractCompleted =
          result.contract?.players.find((progress) => progress.playerId === humanPlayerId)
            ?.completed ?? false;
        result.gauntlet = resolvePracticeGauntlet(gauntlet, humanPlayerId, result.winnerId, {
          contractCompleted,
          wentToOvertime: result.wentToOvertime,
          deaths: result.playerStats.get(humanPlayerId)?.deaths,
          regulationSecondsRemaining: result.wentToOvertime ? 0 : match.matchTimer,
        });
      }
    }

    // Rotation: a rematch plays the map AND mode AFTER this one (registry/
    // rotation order). Attached to the result so the results screen's
    // "NEXT: X" promises and what the rematch actually starts can never
    // disagree.
    const nextMapName =
      this.forcedMap()?.name ?? getNextMapName(match.mapManager.getMapData().name);
    result.nextMapName = nextMapName;
    const nextGameMode = this.forcedMode() ?? getNextGameMode(match.gameModeType);
    result.nextGameMode = nextGameMode;
    const nextGauntlet = result.gauntlet
      ? practiceGauntletMatch(
          result.gauntlet.nextStage,
          result.gauntlet.outcome === 'advanced' ? result.gauntlet.runScore : 0,
        )
      : null;
    const rivalChoices =
      result.gauntlet?.outcome === 'advanced'
        ? practiceGauntletOpponentChoices(CHARACTER_IDS, gauntletOpponentHistory)
        : [];
    const gauntletRoutes =
      result.gauntlet?.outcome === 'advanced'
        ? practiceGauntletRoutes(
            {
              mapName: nextMapName,
              gameMode: nextGameMode,
              opponentCharacterId: rivalChoices[0],
            },
            {
              mapName: this.forcedMap()?.name ?? getNextMapName(nextMapName),
              gameMode: this.forcedMode() ?? getNextGameMode(nextGameMode),
              opponentCharacterId: rivalChoices[1],
            },
          )
        : [];
    if (result.gauntlet?.outcome === 'advanced') {
      result.gauntlet.routeOptions = gauntletRoutes;
      if (nextGauntlet && gauntletRoutes[0]?.opponentCharacterId) {
        nextGauntlet.opponentCharacterId = gauntletRoutes[0].opponentCharacterId;
      }
    }

    // Fold this match into the lifetime records and attach the pairing's
    // all-time rivalry line before shipping the result. The in-memory
    // update is synchronous and O(players); the file write is queued onto
    // fs.promises — nothing here blocks the tick.
    if (this.statsStore && !isPractice) {
      const entries: MatchStatsEntry[] = [];
      const previousStreaks = new Map<PlayerId, { current: number; best: number }>();
      for (const [playerId, player] of match.players) {
        const stats = result.playerStats.get(playerId);
        if (!stats) continue;
        const previousLifetime = this.statsStore.getLifetime(player.nickname);
        previousStreaks.set(playerId, {
          current: previousLifetime?.currentWinStreak ?? 0,
          best: previousLifetime?.bestWinStreak ?? 0,
        });
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
      this.statsStore.recordMatch(entries, winnerNickname);
      result.winStreaks = {};
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
      }
      if (result.contract) {
        for (const [playerId, player] of match.players) {
          result.contract.careerCompletions[playerId] =
            this.statsStore.getLifetime(player.nickname)?.contractsCompleted ?? 0;
        }
      }
      if (entries.length === 2) {
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

    // Send match end to all players
    // MatchResult uses Map for playerStats, but JSON.stringify can't serialize Maps.
    // Convert to a plain-object-friendly structure for the wire format.
    const serializableResult = {
      ...result,
      playerStats: Object.fromEntries(result.playerStats),
    };

    for (const [playerId] of match.players) {
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

    // Move to post-match state for rematch handling
    const playerIds = [...match.players.keys()];
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
      nextGauntlet,
      gauntletRoutes,
      gauntletOpponentHistory:
        result.gauntlet?.outcome === 'advanced' ? [...gauntletOpponentHistory] : [],
      previousMutators: [...match.activeMutators],
      previousContractId: result.contract?.id ?? match.getContractHudState().id,
    });

    // Remove from active matches
    this.activeMatches.delete(matchId);
    this.previousPhases.delete(matchId);
    this.botControllers.delete(matchId);
    this.practiceDifficulties.delete(matchId);
    this.practiceGauntlets.delete(matchId);
    this.practiceGauntletOpponentHistories.delete(matchId);
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
    clearTimeout(postMatch.timeoutHandle);
    this.postMatchStates.delete(postMatch.matchId);

    const playerEntries = postMatch.playerIds.map((pid) => ({
      id: pid,
      nickname: this.playerNicknames.get(pid) ?? `Player_${pid.slice(0, 4)}`,
    }));

    if (postMatch.setComplete) {
      this.releaseRivalrySet(postMatch.playerIds);
    }

    logger.info({ players: postMatch.playerIds }, 'Rematch starting');

    if (postMatch.isPractice) {
      this.launchMatch(
        crypto.randomUUID(),
        getMap(postMatch.nextMapName),
        postMatch.nextGameMode,
        playerEntries,
        postMatch.nextGauntlet?.difficulty ?? postMatch.practiceDifficulty,
        postMatch.previousMutators,
        postMatch.previousContractId,
        postMatch.nextGauntlet,
        postMatch.gauntletOpponentHistory,
      );
      return;
    }

    // FORCE pins skip the draft here too, playing the map/mode promised
    // at match end ("NEXT: X"). Real play drafts again — rematches are
    // the friend group's main pattern, and the draft IS the feature.
    // Either path re-points playerMatchMap at the new id (draft or match)
    // for every entrant, replacing the ended match's mapping.
    if (this.forcePinsActive()) {
      this.launchMatch(
        crypto.randomUUID(),
        getMap(postMatch.nextMapName),
        postMatch.nextGameMode,
        playerEntries,
        null,
        postMatch.previousMutators,
        postMatch.previousContractId,
      );
      return;
    }

    this.startDraft(
      playerEntries,
      postMatch.revengePickerId,
      postMatch.previousMutators,
      postMatch.previousContractId,
    );
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
