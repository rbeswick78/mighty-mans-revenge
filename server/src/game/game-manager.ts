import {
  DAILY_GAUNTLET_LEADERBOARD,
  LEADERBOARD,
  SERVER,
  dailyChallengeKey,
  listMapNames,
  normalizeMatchIntent,
} from '@shared/game';
import type {
  PlayerId,
  ClientMessage,
  GameModeType,
  MatchIntent,
  ScheduledArenaLock,
} from '@shared/game';
import { GameLoop } from './game-loop.js';
import { GameServer } from '../network/server.js';
import { MatchmakingManager } from '../matchmaking/matchmaking-manager.js';
import { logger } from '../utils/logger.js';
import type { PersistentStatsStore } from '../persistence/persistent-stats-store.js';
import { createArenaScheduleMessage, lockScheduledArena } from '../matchmaking/arena-schedule.js';
import { PartyManager } from '../matchmaking/party-manager.js';

export class GameManager {
  private readonly gameLoop: GameLoop;
  private readonly server: GameServer;
  private readonly matchmaking: MatchmakingManager;
  private readonly parties: PartyManager;
  /**
   * Most recent measured round-trip time per connected player, in ms,
   * derived from the client:ping/server:pong cycle. Used by lag
   * compensation to rewind opponent positions to the shooter's render
   * time. Defaults to 0 for players who haven't yet sent a ping.
   */
  private readonly playerRTTs: Map<PlayerId, number> = new Map();
  /**
   * Lifetime stats store, shared with matchmaking. Kept here too so the
   * connect handler can ship the all-time leaderboard alongside the
   * welcome. Optional — tests and store-less embeddings just skip it.
   */
  private readonly statsStore: PersistentStatsStore | undefined;
  /** Shared UTC clock for Daily Run creation and connect-time standings. */
  private readonly now: () => Date;
  /** Last board announced to connected clients; advances at UTC rollover. */
  private currentDailyChallengeKey: string;
  /** Last whole server-clock second broadcast for schedule countdown repair. */
  private lastArenaScheduleSecond = -1;
  /** Per-player server locks retained through later schedule clock refreshes. */
  private readonly arenaScheduleLocks = new Map<PlayerId, Readonly<ScheduledArenaLock>>();

  constructor(
    server: GameServer,
    statsStore?: PersistentStatsStore,
    now: () => Date = () => new Date(),
  ) {
    this.server = server;
    this.statsStore = statsStore;
    this.now = now;
    this.currentDailyChallengeKey = dailyChallengeKey(now());
    this.matchmaking = new MatchmakingManager(
      server,
      (pid) => this.playerRTTs.get(pid) ?? 0,
      statsStore,
      Math.random,
      now,
      {
        lock: (playerId, mode) => this.lockArenaForQueue(playerId, mode),
        release: (playerId) => this.releaseArenaScheduleLock(playerId),
      },
    );
    this.parties = new PartyManager({
      sendTo: (playerId, message) => this.server.sendTo(playerId, message, { reliable: true }),
      normalizeIntent: (value) => this.normalizePartyIntent(value),
      canEnterParty: (playerId) => !this.matchmaking.isPlayerBusy(playerId),
      queueParty: (state) => this.matchmaking.handleSubmitParty(state),
      rematchParty: (state) => this.matchmaking.handleSubmitPartyRematch(state),
      refreshRematchIntent: (intent) => this.refreshPartyRematchIntent(intent),
      now: () => this.now().getTime(),
      monotonicNow: () => performance.now(),
    });
    this.matchmaking.setPartyLifecycleListener((partyId, lifecycle, matchId) => {
      this.parties.markLifecycle(partyId, lifecycle, matchId);
    });

    this.gameLoop = new GameLoop((dt, tick) => {
      this.tick(dt, tick);
    }, SERVER.TICK_RATE);

    this.wireEvents();
  }

  /** Most recent RTT for a player in ms, or 0 if no ping has landed yet. */
  getPlayerRTT(playerId: PlayerId): number {
    return this.playerRTTs.get(playerId) ?? 0;
  }

  /** Expose the game loop for health check / admin status. */
  get loop(): GameLoop {
    return this.gameLoop;
  }

  /** Expose matchmaking for admin status queries. */
  get matchmakingManager(): MatchmakingManager {
    return this.matchmaking;
  }

  start(): void {
    this.gameLoop.start();
    logger.info('Game manager started');
  }

  stop(): void {
    this.gameLoop.stop();
    logger.info('Game manager stopped');
  }

  private wireEvents(): void {
    this.server.onConnect((playerId: PlayerId) => {
      // Player connected — they'll join matchmaking via a client message
      logger.debug({ playerId }, 'Player connected, awaiting matchmaking join');

      if (this.server.getCapabilities().schedules) {
        this.sendArenaSchedule(playerId, true);
      }

      // Ship the all-time leaderboard right behind the welcome. Reliable:
      // it's a one-shot — the next refresh only comes when a match ends.
      // Empty entries are still sent so the client knows to hide the panel.
      if (this.statsStore) {
        this.server.sendTo(
          playerId,
          {
            type: 'server:leaderboard',
            entries: this.statsStore.getTopPlayers(LEADERBOARD.SIZE),
          },
          { reliable: true },
        );
        this.currentDailyChallengeKey = dailyChallengeKey(this.now());
        this.sendDailyGauntletLeaderboard(playerId, this.currentDailyChallengeKey);
      }
    });

    this.server.onDisconnect((playerId: PlayerId) => {
      this.playerRTTs.delete(playerId);
      this.arenaScheduleLocks.delete(playerId);
      this.parties.disconnect(playerId);
      this.matchmaking.handlePlayerDisconnect(playerId);
    });

    this.server.onMessage((playerId: PlayerId, message: ClientMessage) => {
      this.handleMessage(playerId, message);
    });
  }

  private handleMessage(playerId: PlayerId, message: ClientMessage): void {
    switch (message.type) {
      case 'client:input':
        this.matchmaking.routeInput(playerId, message.input);
        break;

      case 'client:joinMatchmaking':
        this.matchmaking.handleJoinMatchmaking(playerId, message.nickname);
        break;

      case 'client:joinRumble':
        this.matchmaking.handleJoinRumble(playerId, message.nickname);
        break;

      case 'client:joinBattleRoyale':
        if (this.server.getCapabilities().battleRoyale) {
          this.matchmaking.handleJoinBattleRoyale(playerId, message.nickname, message.fighterId);
        }
        break;

      case 'client:submitMatchIntent': {
        const nickname = message.nickname;
        const intent = normalizeMatchIntent(message.intent, {
          serverTime: this.now().getTime(),
          allowedArenaNames: listMapNames(),
        });
        if (/^[A-Za-z0-9_.-]{2,16}$/.test(nickname) && intent !== null) {
          this.matchmaking.handleSubmitMatchIntent(playerId, nickname, intent);
        }
        break;
      }

      case 'client:createParty':
        this.parties.create(
          playerId,
          message.requestId,
          message.nickname,
          message.format,
          message.fighterId,
          message.intent,
        );
        break;

      case 'client:joinParty':
        this.parties.join(
          playerId,
          message.requestId,
          message.nickname,
          message.joinTarget,
          message.fighterId,
        );
        break;

      case 'client:leaveParty':
        this.parties.leave(playerId, message.requestId, message.partyId, message.expectedVersion);
        break;

      case 'client:kickPartyMember':
        this.parties.kick(
          playerId,
          message.requestId,
          message.partyId,
          message.expectedVersion,
          message.memberId,
        );
        break;

      case 'client:updatePartyIntent':
        this.parties.updateIntent(
          playerId,
          message.requestId,
          message.partyId,
          message.expectedVersion,
          message.intent,
        );
        break;

      case 'client:updatePartyFighter':
        this.parties.updateFighter(
          playerId,
          message.requestId,
          message.partyId,
          message.expectedVersion,
          message.fighterId,
        );
        break;

      case 'client:setPartyReady':
        this.parties.setReady(
          playerId,
          message.requestId,
          message.partyId,
          message.expectedVersion,
          message.ready,
        );
        break;

      case 'client:cancelPartyQueue':
        this.parties.cancelQueue(
          playerId,
          message.requestId,
          message.partyId,
          message.expectedVersion,
        );
        break;

      case 'client:confirmPartyBotFill':
        this.parties.confirmBotFill(
          playerId,
          message.requestId,
          message.partyId,
          message.expectedVersion,
        );
        break;

      case 'client:requestPartyRematch':
        this.parties.requestRematch(
          playerId,
          message.requestId,
          message.partyId,
          message.expectedVersion,
        );
        break;

      case 'client:startPractice':
        this.matchmaking.handleStartPractice(
          playerId,
          message.nickname,
          message.difficulty,
          message.kind,
          message.gameMode,
          message.opponentCharacterId,
          message.mutatorId,
        );
        break;

      case 'client:cancelMatchmaking':
        this.matchmaking.handleCancelMatchmaking(playerId);
        break;

      case 'client:rematchRequest':
        this.matchmaking.handleRematchRequest(playerId, message.gauntletRouteId);
        break;

      case 'client:returnToLobby':
        this.matchmaking.handleReturnToLobby(playerId);
        break;

      case 'client:characterHover':
        this.matchmaking.handleCharacterHover(playerId, message.characterId);
        break;

      case 'client:characterLock':
        this.matchmaking.handleCharacterLock(playerId, message.characterId);
        break;

      case 'client:draftPick':
        this.matchmaking.handleDraftPick(playerId, message.category, message.value);
        break;

      case 'client:taunt':
        this.matchmaking.handleTaunt(playerId, message.tauntId);
        break;

      case 'client:ping': {
        // Cache server-side RTT estimate so lag compensation can rewind
        // opponent positions to this player's render time on shoot. The
        // pong handler on the client does its own clock-anchored RTT for
        // display; this is the server's parallel measurement.
        const rtt = Math.max(0, Date.now() - message.clientTime);
        this.playerRTTs.set(playerId, rtt);
        this.server.sendTo(playerId, {
          type: 'server:pong',
          clientTime: message.clientTime,
          serverTime: Date.now(),
        });
        break;
      }
    }
  }

  private tick(dt: number, tick: number): void {
    this.matchmaking.tick(dt, tick);
    this.parties.tick();
    this.parties.expireEmptyRooms();
    this.broadcastArenaScheduleClock();
    if (!this.statsStore || tick % SERVER.TICK_RATE !== 0) return;
    const challengeKey = dailyChallengeKey(this.now());
    if (challengeKey === this.currentDailyChallengeKey) return;
    this.currentDailyChallengeKey = challengeKey;
    for (const playerId of this.server.getConnectedPlayerIds()) {
      this.sendDailyGauntletLeaderboard(playerId, challengeKey);
    }
  }

  private normalizePartyIntent(value: unknown): Readonly<MatchIntent> | null {
    const serverTime = this.now().getTime();
    const intent = normalizeMatchIntent(value, {
      serverTime,
      allowedArenaNames: listMapNames(),
    });
    if (
      intent === null ||
      !this.server.getCapabilities().newShell ||
      !this.server.getCapabilities().schedules
    ) {
      return null;
    }
    const schedule = createArenaScheduleMessage(serverTime);
    if (schedule.forcedMode !== undefined && schedule.forcedMode !== intent.mode) return null;
    const authoritativeArena = schedule.schedules.find((entry) => entry.mode === intent.mode);
    if (
      !authoritativeArena ||
      authoritativeArena.mapName !== intent.scheduledArena.mapName ||
      authoritativeArena.rotationEndsAt !== intent.scheduledArena.rotationEndsAt
    ) {
      return null;
    }
    return Object.freeze({
      ...intent,
      composition: Object.freeze({ ...intent.composition }),
      scheduledArena: Object.freeze({ ...authoritativeArena }),
    });
  }

  private refreshPartyRematchIntent(intent: Readonly<MatchIntent>): Readonly<MatchIntent> | null {
    if (!this.server.getCapabilities().newShell || !this.server.getCapabilities().schedules) {
      return null;
    }
    const serverTime = this.now().getTime();
    const schedule = createArenaScheduleMessage(serverTime);
    if (schedule.forcedMode !== undefined && schedule.forcedMode !== intent.mode) return null;
    const currentArena = schedule.schedules.find((entry) => entry.mode === intent.mode);
    if (!currentArena) return null;
    return Object.freeze({
      ...intent,
      scheduledArena: Object.freeze({ ...currentArena }),
    });
  }

  private broadcastArenaScheduleClock(): void {
    if (!this.server.getCapabilities().schedules) return;
    const serverTime = this.now().getTime();
    const second = Math.floor(serverTime / 1000);
    if (second === this.lastArenaScheduleSecond) return;
    this.lastArenaScheduleSecond = second;
    for (const playerId of this.server.getConnectedPlayerIds()) {
      this.sendArenaSchedule(playerId, false, serverTime);
    }
  }

  /**
   * Server-authoritative queue-entry lock consumed by the generalized intent
   * path. Schedule derivation and lock ownership stay inside GameManager.
   */
  lockArenaForQueue(playerId: PlayerId, mode: GameModeType): ScheduledArenaLock | null {
    if (!this.server.getCapabilities().schedules) return null;
    const serverTime = this.now().getTime();
    const schedule = createArenaScheduleMessage(serverTime);
    if (schedule.forcedMode !== undefined && schedule.forcedMode !== mode) return null;
    const lock = lockScheduledArena(schedule, mode, serverTime);
    if (lock === null) return null;
    this.arenaScheduleLocks.set(playerId, lock);
    this.sendArenaSchedule(playerId, true, serverTime);
    return lock;
  }

  /** Release a queue lock and immediately restore the current server snapshot. */
  releaseArenaScheduleLock(playerId: PlayerId): void {
    if (!this.arenaScheduleLocks.delete(playerId)) return;
    this.sendArenaSchedule(playerId, true);
  }

  private sendArenaSchedule(
    playerId: PlayerId,
    reliable: boolean,
    serverTime = this.now().getTime(),
  ): void {
    this.server.sendTo(
      playerId,
      createArenaScheduleMessage(serverTime, process.env, this.arenaScheduleLocks.get(playerId)),
      { reliable },
    );
  }

  private sendDailyGauntletLeaderboard(playerId: PlayerId, challengeKey: string): void {
    if (!this.statsStore) return;
    this.server.sendTo(
      playerId,
      {
        type: 'server:dailyGauntletLeaderboard',
        challengeKey,
        entries: this.statsStore.getDailyGauntletLeaderboard(
          challengeKey,
          DAILY_GAUNTLET_LEADERBOARD.SIZE,
        ),
      },
      { reliable: true },
    );
  }
}
