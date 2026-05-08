import {
  SERVER,
} from '@shared/game';
import type {
  PlayerId,
  ClientMessage,
} from '@shared/game';
import { GameLoop } from './game-loop.js';
import { GameServer } from '../network/server.js';
import { MatchmakingManager } from '../matchmaking/matchmaking-manager.js';
import { logger } from '../utils/logger.js';

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

  constructor(server: GameServer) {
    this.server = server;
    this.matchmaking = new MatchmakingManager(server, (pid) =>
      this.playerRTTs.get(pid) ?? 0,
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
    this.server.onConnect((_playerId: PlayerId) => {
      // Player connected — they'll join matchmaking via a client message
      logger.debug({ playerId: _playerId }, 'Player connected, awaiting matchmaking join');
    });

    this.server.onDisconnect((playerId: PlayerId) => {
      this.playerRTTs.delete(playerId);
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

      case 'client:cancelMatchmaking':
        this.matchmaking.handleCancelMatchmaking(playerId);
        break;

      case 'client:rematchRequest':
        this.matchmaking.handleRematchRequest(playerId);
        break;

      case 'client:returnToLobby':
        this.matchmaking.handleReturnToLobby(playerId);
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
  }
}
