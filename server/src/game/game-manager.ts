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
  constructor(server: GameServer) {
    this.server = server;
    this.matchmaking = new MatchmakingManager(server);

    this.gameLoop = new GameLoop((dt, tick) => {
      this.tick(dt, tick);
    }, SERVER.TICK_RATE);

    this.wireEvents();
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

      case 'client:ping':
        this.server.sendTo(playerId, {
          type: 'server:pong',
          clientTime: message.clientTime,
          serverTime: Date.now(),
        });
        break;
    }
  }

  private tick(dt: number, tick: number): void {
    this.matchmaking.tick(dt, tick);
  }
}
