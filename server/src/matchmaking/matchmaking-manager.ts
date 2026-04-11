import {
  MatchPhase,
  GameModeType,
} from '@shared/game';
import type {
  PlayerId,
  MatchResult,
  MapData,
  ServerGameStateMessage,
  SerializedPlayerState,
} from '@shared/game';
import { Match } from '../game/match.js';
import { GameServer } from '../network/server.js';
import { MatchmakingQueue } from './matchmaking-queue.js';
import { logger } from '../utils/logger.js';

// Vite/tsc can resolve JSON via resolveJsonModule, but for Node ESM we use
// a createRequire workaround or inline the import assertion.  Since the server
// tsconfig targets NodeNext, use import with assertion.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const wastelandOutpost: MapData = require('../../../shared/maps/wasteland-outpost.json') as MapData;

const REMATCH_TIMEOUT_MS = 30_000;

interface PostMatchState {
  matchId: string;
  playerIds: PlayerId[];
  rematchRequests: Set<PlayerId>;
  returnedToLobby: Set<PlayerId>;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

export class MatchmakingManager {
  private readonly queue: MatchmakingQueue;
  private readonly server: GameServer;
  private readonly activeMatches: Map<string, Match> = new Map();
  /** Maps playerId -> matchId for routing messages. */
  private readonly playerMatchMap: Map<PlayerId, string> = new Map();
  /** Post-match state for rematch handling. */
  private readonly postMatchStates: Map<string, PostMatchState> = new Map();
  /** Track nicknames for players (set when they join matchmaking). */
  private readonly playerNicknames: Map<PlayerId, string> = new Map();

  constructor(server: GameServer) {
    this.server = server;
    this.queue = new MatchmakingQueue();
  }

  handleJoinMatchmaking(playerId: PlayerId, nickname: string): void {
    // If player is already in a match, ignore
    if (this.playerMatchMap.has(playerId)) {
      logger.debug({ playerId }, 'Player already in a match, ignoring matchmaking request');
      return;
    }

    this.playerNicknames.set(playerId, nickname);
    this.queue.addPlayer(playerId, nickname);

    logger.info({ playerId, nickname, queueLength: this.queue.getQueueLength() }, 'Player joined matchmaking');

    this.server.sendTo(playerId, {
      type: 'server:matchmakingStatus',
      status: 'queued',
      queuePosition: this.queue.getQueueLength(),
      playersOnline: this.getOnlinePlayerCount(),
    });

    // Try to match immediately
    this.tryCreateMatch();
  }

  handleCancelMatchmaking(playerId: PlayerId): void {
    const removed = this.queue.removePlayer(playerId);
    if (removed) {
      logger.info({ playerId }, 'Player cancelled matchmaking');
      this.server.sendTo(playerId, {
        type: 'server:matchmakingStatus',
        status: 'cancelled',
        playersOnline: this.getOnlinePlayerCount(),
      });
    }
  }

  handlePlayerDisconnect(playerId: PlayerId): void {
    // Remove from queue if queued
    this.queue.removePlayer(playerId);
    this.playerNicknames.delete(playerId);

    // Handle disconnect in active match
    const matchId = this.playerMatchMap.get(playerId);
    if (matchId) {
      const match = this.activeMatches.get(matchId);
      if (match) {
        match.onPlayerDisconnect(playerId);

        // Notify other players in the match
        for (const [pid] of match.players) {
          if (pid !== playerId) {
            this.server.sendTo(pid, {
              type: 'server:opponentDisconnected',
              playerId,
            });
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
            this.server.sendTo(pid, {
              type: 'server:opponentDisconnected',
              playerId,
            });
          }
        }
        clearTimeout(state.timeoutHandle);
        this.postMatchStates.delete(postMatchId);
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

  handleRematchRequest(playerId: PlayerId): void {
    const matchId = this.playerMatchMap.get(playerId);
    if (!matchId) return;

    const postMatch = this.postMatchStates.get(matchId);
    if (!postMatch) return;

    postMatch.rematchRequests.add(playerId);

    // Notify other players that this player wants a rematch
    for (const pid of postMatch.playerIds) {
      if (pid !== playerId) {
        this.server.sendTo(pid, {
          type: 'server:rematchStatus',
          opponentWantsRematch: true,
        });
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

    const postMatch = this.postMatchStates.get(matchId);
    if (postMatch) {
      postMatch.returnedToLobby.add(playerId);
      this.playerMatchMap.delete(playerId);

      // Notify other players
      for (const pid of postMatch.playerIds) {
        if (pid !== playerId) {
          this.server.sendTo(pid, {
            type: 'server:opponentDisconnected',
            playerId,
          });
          // Return them to lobby too
          this.playerMatchMap.delete(pid);
        }
      }

      clearTimeout(postMatch.timeoutHandle);
      this.postMatchStates.delete(matchId);
    } else {
      // Player returning to lobby from an active match (forfeit)
      this.playerMatchMap.delete(playerId);
    }
  }

  /** Called each server tick. */
  tick(dt: number): void {
    // Try to create matches from queued players
    this.tryCreateMatch();

    // Update active matches
    for (const [matchId, match] of this.activeMatches) {
      match.update(dt);

      // Broadcast game state to match players
      this.broadcastMatchState(match);

      // Check if match ended
      if (match.phase === MatchPhase.ENDED) {
        this.onMatchEnded(matchId, match);
      }
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

    const player = match.players.get(playerId);
    if (!player) return;

    // Apply input to the player's state in the match
    // The match's player state will be updated by the server physics
    player.lastProcessedInput = input.sequenceNumber;

    // Store movement intent on player velocity based on input
    // Actual physics is processed by the match/combat system
    player.aimAngle = input.aimAngle;

    // Movement is handled by the shared physics in the match tick
    // For now, we store raw input so the match can process it
    if (!match.players.has(playerId)) return;

    // Movement input is stored for processing
    const speed = input.sprint ? 320 : 200; // PLAYER.SPRINT_SPEED : PLAYER.BASE_SPEED
    player.velocity = {
      x: input.moveX * speed,
      y: input.moveY * speed,
    };
    player.isSprinting = input.sprint;
  }

  // ──────────────────────────── Private ────────────────────────────

  private tryCreateMatch(): void {
    const pair = this.queue.tryMatch();
    if (!pair) return;

    const { player1, player2 } = pair;
    const matchId = crypto.randomUUID();
    const mapData = wastelandOutpost;

    const playerEntries = [
      { id: player1.playerId, nickname: player1.nickname },
      { id: player2.playerId, nickname: player2.nickname },
    ];

    const match = new Match(matchId, mapData, playerEntries, GameModeType.DEATHMATCH);
    this.activeMatches.set(matchId, match);
    this.playerMatchMap.set(player1.playerId, matchId);
    this.playerMatchMap.set(player2.playerId, matchId);

    logger.info(
      {
        matchId,
        player1: player1.playerId,
        player2: player2.playerId,
        map: mapData.name,
      },
      'Match created',
    );

    // Notify both players
    this.server.sendTo(player1.playerId, {
      type: 'server:matchFound',
      matchId,
      opponents: [{ id: player2.playerId, nickname: player2.nickname }],
      mapName: mapData.name,
    });

    this.server.sendTo(player2.playerId, {
      type: 'server:matchFound',
      matchId,
      opponents: [{ id: player1.playerId, nickname: player1.nickname }],
      mapName: mapData.name,
    });

    // Send matchmaking status update
    for (const entry of playerEntries) {
      this.server.sendTo(entry.id, {
        type: 'server:matchmakingStatus',
        status: 'matched',
        playersOnline: this.getOnlinePlayerCount(),
      });
    }

    // Start countdown
    match.startCountdown();
  }

  private broadcastMatchState(match: Match): void {
    const players: SerializedPlayerState[] = [];

    for (const [, player] of match.players) {
      players.push({
        id: player.id,
        position: player.position,
        velocity: player.velocity,
        aimAngle: player.aimAngle,
        health: player.health,
        ammo: player.ammo,
        grenades: player.grenades,
        isReloading: player.isReloading,
        isSprinting: player.isSprinting,
        stamina: player.stamina,
        isDead: player.isDead,
        invulnerableTimer: player.invulnerableTimer,
        lastProcessedInput: player.lastProcessedInput,
        score: player.score,
        deaths: player.deaths,
        nickname: player.nickname,
      });
    }

    const stateMessage: ServerGameStateMessage = {
      type: 'server:gameState',
      tick: 0, // Will be set properly when we integrate with game loop tick
      phase: match.phase,
      matchTimer: match.matchTimer,
      countdownTimer: match.countdownTimer,
      players,
      grenades: [],
      bulletTrails: [],
      pickups: match.pickupManager.getPickups(),
    };

    // Send only to players in this match
    for (const [playerId] of match.players) {
      this.server.sendTo(playerId, stateMessage);
    }
  }

  private onMatchEnded(matchId: string, match: Match): void {
    const result = match.getResult();

    // Send match end to all players
    // MatchResult uses Map for playerStats, but JSON.stringify can't serialize Maps.
    // Convert to a plain-object-friendly structure for the wire format.
    const serializableResult = {
      ...result,
      playerStats: Object.fromEntries(result.playerStats),
    };

    for (const [playerId] of match.players) {
      this.server.sendTo(playerId, {
        type: 'server:matchEnd',
        result: serializableResult as unknown as MatchResult,
      });
    }

    logger.info(
      { matchId, winnerId: result.winnerId, duration: result.duration },
      'Match ended',
    );

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
    });

    // Remove from active matches
    this.activeMatches.delete(matchId);
  }

  private onRematchTimeout(matchId: string): void {
    const postMatch = this.postMatchStates.get(matchId);
    if (!postMatch) return;

    logger.info({ matchId }, 'Rematch timeout expired');

    // Return all players to lobby
    for (const pid of postMatch.playerIds) {
      this.playerMatchMap.delete(pid);
      this.server.sendTo(pid, {
        type: 'server:matchmakingStatus',
        status: 'cancelled',
        playersOnline: this.getOnlinePlayerCount(),
      });
    }

    this.postMatchStates.delete(matchId);
  }

  private startRematch(postMatch: PostMatchState): void {
    clearTimeout(postMatch.timeoutHandle);

    const matchId = crypto.randomUUID();
    const mapData = wastelandOutpost;

    const playerEntries = postMatch.playerIds.map((pid) => ({
      id: pid,
      nickname: this.playerNicknames.get(pid) ?? `Player_${pid.slice(0, 4)}`,
    }));

    const match = new Match(matchId, mapData, playerEntries, GameModeType.DEATHMATCH);
    this.activeMatches.set(matchId, match);

    // Update player-match mapping
    for (const pid of postMatch.playerIds) {
      this.playerMatchMap.delete(pid);
      this.playerMatchMap.set(pid, matchId);
    }

    // Clean up old post-match state
    this.postMatchStates.delete(postMatch.matchId);

    logger.info(
      { matchId, players: postMatch.playerIds },
      'Rematch started',
    );

    // Notify players
    for (let i = 0; i < playerEntries.length; i++) {
      const entry = playerEntries[i];
      const opponents = playerEntries
        .filter((e) => e.id !== entry.id)
        .map((e) => ({ id: e.id, nickname: e.nickname }));

      this.server.sendTo(entry.id, {
        type: 'server:matchFound',
        matchId,
        opponents,
        mapName: mapData.name,
      });
    }

    match.startCountdown();
  }
}
