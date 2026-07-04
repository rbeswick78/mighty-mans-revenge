import {
  MatchPhase,
  GameModeType,
  getMap,
  getNextMapName,
  listMapNames,
  MAP_REGISTRY,
} from '@shared/game';
import type { MapData } from '@shared/game';
import type {
  PlayerId,
  MatchResult,
  ServerGameStateMessage,
  SerializedPlayerState,
  CharacterId,
} from '@shared/game';
import { Match } from '../game/match.js';
import { GameServer } from '../network/server.js';
import { MatchmakingQueue } from './matchmaking-queue.js';
import { logger } from '../utils/logger.js';
import type { PersistentStatsStore, MatchStatsEntry } from '../persistence/persistent-stats-store.js';

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
   * Round-robin cursor over registry order for FRESH (queue-created)
   * matches. Rematches don't consult it — they play the nextMapName
   * pinned in their PostMatchState so consecutive matches of the same
   * pairing never repeat a map.
   */
  private mapRotationIndex = 0;

  constructor(
    server: GameServer,
    getPlayerRTT: (playerId: PlayerId) => number = () => 0,
    statsStore?: PersistentStatsStore,
  ) {
    this.server = server;
    this.queue = new MatchmakingQueue();
    this.getPlayerRTT = getPlayerRTT;
    this.statsStore = statsStore;
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
    }, { reliable: true });

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
      }, { reliable: true });
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
            }, { reliable: true });
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
            }, { reliable: true });
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

    postMatch.rematchRequests.add(playerId);

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
        this.server.sendTo(pid, {
          type: 'server:rematchStatus',
          opponentWantsRematch: true,
        }, { reliable: true });
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
          }, { reliable: true });
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
  tick(dt: number, serverTick: number): void {
    // Try to create matches from queued players
    this.tryCreateMatch();

    // Update active matches
    for (const [matchId, match] of this.activeMatches) {
      const prevPhase = this.previousPhases.get(matchId);
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
      this.server.sendTo(playerId, {
        type: 'server:matchStart',
        matchEndsInMs,
      }, { reliable: true });
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

  /** Next fresh-match map: FORCE_MAP if set, else advance the rotation. */
  private pickRotationMap(): MapData {
    const forced = this.forcedMap();
    if (forced) return forced;
    const names = listMapNames();
    const name = names[this.mapRotationIndex % names.length];
    this.mapRotationIndex++;
    return getMap(name);
  }

  private tryCreateMatch(): void {
    const pair = this.queue.tryMatch();
    if (!pair) return;

    const { player1, player2 } = pair;
    const matchId = crypto.randomUUID();
    const mapData = this.pickRotationMap();

    const playerEntries = [
      { id: player1.playerId, nickname: player1.nickname },
      { id: player2.playerId, nickname: player2.nickname },
    ];

    const match = new Match(matchId, mapData, playerEntries, GameModeType.DEATHMATCH);
    match.setRttResolver(this.getPlayerRTT);
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
    }, { reliable: true });

    this.server.sendTo(player2.playerId, {
      type: 'server:matchFound',
      matchId,
      opponents: [{ id: player1.playerId, nickname: player1.nickname }],
      mapName: mapData.name,
    }, { reliable: true });

    // Send matchmaking status update
    for (const entry of playerEntries) {
      this.server.sendTo(entry.id, {
        type: 'server:matchmakingStatus',
        status: 'matched',
        playersOnline: this.getOnlinePlayerCount(),
      }, { reliable: true });
    }

    // The match starts itself in CHARACTER_SELECT (set by Match's
    // constructor); per-tick update() drives the transition into
    // COUNTDOWN once both players lock in or the select timer expires.
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
      bulletTrails: match.getTickBulletTrails(),
      pickups: match.pickupManager.getPickups(),
      activeMutators: [...match.activeMutators],
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
        this.server.sendTo(playerId, {
          type: 'server:eventWarning',
          event: warning.event,
          activatesInMs: warning.activatesInMs,
          isFinalMinute: warning.isFinalMinute,
        }, { reliable: true });
      }
    }

    // Broadcast one-shot weapon-incoming warnings ("SHOTGUN INCOMING") —
    // fired ~5s before a weapon pickup (re)spawns. Reliable: it's a single
    // dramatic beat and a drop would kill the whole point.
    for (const incoming of match.consumeTickWeaponIncoming()) {
      for (const [playerId] of match.players) {
        this.server.sendTo(playerId, {
          type: 'server:weaponIncoming',
          weaponId: incoming.weaponId,
          landsInMs: incoming.landsInMs,
        }, { reliable: true });
      }
    }

    // Broadcast one-shot mutator starts at activation. Drives the HUD
    // reveal banner + flash + horn; client modifier kicks in immediately
    // so prediction matches authority.
    for (const started of match.consumeTickMutatorStarts()) {
      for (const [playerId] of match.players) {
        this.server.sendTo(playerId, {
          type: 'server:eventStart',
          event: started.event,
          isFinalMinute: started.isFinalMinute,
        }, { reliable: true });
      }
    }
  }

  private onMatchEnded(matchId: string, match: Match): void {
    const result = match.getResult();

    // Rotation: a rematch plays the map AFTER this one (registry order).
    // Attached to the result so the results screen's "NEXT MAP: X" line
    // and the map the rematch actually starts on can never disagree.
    const nextMapName =
      this.forcedMap()?.name ??
      getNextMapName(match.mapManager.getMapData().name);
    result.nextMapName = nextMapName;

    // Fold this match into the lifetime records and attach the pairing's
    // all-time rivalry line before shipping the result. The in-memory
    // update is synchronous and O(players); the file write is queued onto
    // fs.promises — nothing here blocks the tick.
    if (this.statsStore) {
      const entries: MatchStatsEntry[] = [];
      for (const [playerId, player] of match.players) {
        const stats = result.playerStats.get(playerId);
        if (!stats) continue;
        entries.push({
          nickname: player.nickname,
          kills: stats.kills,
          deaths: stats.deaths,
          killsByWeapon: stats.killsByWeapon,
        });
      }
      const winnerNickname =
        result.winnerId !== null
          ? (match.players.get(result.winnerId)?.nickname ?? null)
          : null;
      this.statsStore.recordMatch(entries, winnerNickname);
      if (entries.length === 2) {
        result.rivalry = this.statsStore.getRivalry(
          entries[0].nickname,
          entries[1].nickname,
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
      this.server.sendTo(playerId, {
        type: 'server:matchEnd',
        result: serializableResult as unknown as MatchResult,
      }, { reliable: true });
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
      nextMapName,
    });

    // Remove from active matches
    this.activeMatches.delete(matchId);
    this.previousPhases.delete(matchId);
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
      }, { reliable: true });
    }

    this.postMatchStates.delete(matchId);
  }

  private sendRematchUnavailable(playerId: PlayerId): void {
    this.server.sendTo(playerId, {
      type: 'server:matchmakingStatus',
      status: 'cancelled',
      playersOnline: this.getOnlinePlayerCount(),
    }, { reliable: true });
  }

  private startRematch(postMatch: PostMatchState): void {
    clearTimeout(postMatch.timeoutHandle);

    const matchId = crypto.randomUUID();
    // The map promised on the results screen ("NEXT MAP: X").
    const mapData = getMap(postMatch.nextMapName);

    const playerEntries = postMatch.playerIds.map((pid) => ({
      id: pid,
      nickname: this.playerNicknames.get(pid) ?? `Player_${pid.slice(0, 4)}`,
    }));

    const match = new Match(matchId, mapData, playerEntries, GameModeType.DEATHMATCH);
    match.setRttResolver(this.getPlayerRTT);
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

      logger.info(
        { playerId: entry.id, matchId },
        'Sending rematch matchFound',
      );
      this.server.sendTo(entry.id, {
        type: 'server:matchFound',
        matchId,
        opponents,
        mapName: mapData.name,
      }, { reliable: true });
    }

    // Like fresh matches, the rematch starts in CHARACTER_SELECT — no
    // direct startCountdown call here. Players re-pick characters each
    // rematch.
  }
}
