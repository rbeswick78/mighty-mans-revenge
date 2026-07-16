import {
  DAILY_GAUNTLET_LEADERBOARD,
  LEADERBOARD,
  SERVER,
  dailyChallengeKey,
  listMapNames,
  normalizeMatchIntent,
} from '@shared/game';
import type { PlayerId, ClientMessage, GameModeType, ScheduledArenaLock } from '@shared/game';
import { GameLoop } from './game-loop.js';
import { GameServer } from '../network/server.js';
import { MatchmakingManager } from '../matchmaking/matchmaking-manager.js';
import { logger } from '../utils/logger.js';
import type { PersistentStatsStore } from '../persistence/persistent-stats-store.js';
import { createArenaScheduleMessage, lockScheduledArena } from '../matchmaking/arena-schedule.js';

export class GameManager {
  private readonly gameLoop: GameLoop;
  private readonly server: GameServer;
  private readonly matchmaking: MatchmakingManager;
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
    this.broadcastArenaScheduleClock();
    if (!this.statsStore || tick % SERVER.TICK_RATE !== 0) return;
    const challengeKey = dailyChallengeKey(this.now());
    if (challengeKey === this.currentDailyChallengeKey) return;
    this.currentDailyChallengeKey = challengeKey;
    for (const playerId of this.server.getConnectedPlayerIds()) {
      this.sendDailyGauntletLeaderboard(playerId, challengeKey);
    }
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
