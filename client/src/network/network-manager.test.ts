import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAYER, WEAPONS } from '@shared/config/game.js';
import { MatchPhase, GameModeType } from '@shared/types/game.js';
import type {
  ClientMessage,
  SerializedPlayerState,
  ServerGameStateMessage,
  ServerMessage,
} from '@shared/types/network.js';
import type { ConnectionState } from './types.js';

// NetworkManager builds a NetworkConnection in its constructor, which
// would pull in the geckos.io client (and import.meta.env). Replace it
// with a recorder so tests can drive handleMessage through the same
// onMessage callback production uses. vi.mock is hoisted above the
// imports, so the shared handle must be hoisted too.
const hoisted = vi.hoisted(() => ({
  messageCb: null as ((msg: unknown) => void) | null,
  stateCb: null as ((state: ConnectionState) => void) | null,
  sentMessages: [] as ClientMessage[],
  retryCalls: 0,
}));

vi.mock('./connection.js', () => ({
  NetworkConnection: class {
    onMessage(cb: (msg: unknown) => void): void {
      hoisted.messageCb = cb;
    }
    onStateChange(cb: (state: ConnectionState) => void): void {
      hoisted.stateCb = cb;
    }
    send(message: ClientMessage): void {
      hoisted.sentMessages.push(message);
    }
    connect(): Promise<void> {
      return Promise.resolve();
    }
    disconnect(): void {}
    retryNow(): void {
      hoisted.retryCalls++;
    }
    handlePong(): void {}
    getRTT(): number {
      return 0;
    }
    getState(): string {
      return 'connected';
    }
  },
}));

import { NetworkManager } from './network-manager.js';

const LOCAL_ID = 'local-player';
const REMOTE_ID = 'remote-player';

function makeSerialized(overrides: Partial<SerializedPlayerState> = {}): SerializedPlayerState {
  return {
    id: LOCAL_ID,
    characterId: 'mighty_man',
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: PLAYER.MAX_HEALTH,
    maxHealth: PLAYER.MAX_HEALTH,
    armor: 0,
    ammo: WEAPONS.rifle.magazineSize,
    weaponId: 'rifle',
    specialAmmo: 0,
    specialReserve: 0,
    grenades: 3,
    isReloading: false,
    isSprinting: false,
    stamina: 3,
    isDead: false,
    respawnTimer: 0,
    invulnerableTimer: 0,
    lastProcessedInput: 0,
    score: 0,
    deaths: 0,
    nickname: 'Player',
    abilityActiveSeconds: 0,
    abilityCooldownSeconds: 0,
    frozenTimer: 0,
    secondWindTimer: 0,
    spawnRushTimer: 0,
    ...overrides,
  };
}

function makeGameState(
  players: SerializedPlayerState[],
  overrides: Partial<ServerGameStateMessage> = {},
): ServerGameStateMessage {
  return {
    type: 'server:gameState',
    tick: 1,
    phase: MatchPhase.ACTIVE,
    countdownTimer: 0,
    matchTimer: 120,
    players,
    grenades: [],
    axes: [],
    bulletTrails: [],
    barrelExplosions: [],
    contract: {
      id: 'hot_shot',
      title: 'HOT SHOT',
      objective: 'LAND 8 ATTACKS',
      target: 8,
      players: [],
    },
    punches: [],
    pickups: [],
    activeMutators: [],
    isOvertime: false,
    ...overrides,
  };
}

describe('NetworkManager per-match state (stale characterId bug)', () => {
  let manager: NetworkManager;
  let deliver: (msg: ServerMessage) => void;

  beforeEach(() => {
    hoisted.messageCb = null;
    hoisted.stateCb = null;
    hoisted.sentMessages = [];
    hoisted.retryCalls = 0;
    manager = new NetworkManager('http://localhost:0');
    const cb = hoisted.messageCb as ((msg: ServerMessage) => void) | null;
    if (!cb) throw new Error('NetworkManager never registered onMessage');
    deliver = cb;
    deliver({ type: 'server:welcome', playerId: LOCAL_ID });
  });

  it('seeds localPlayerState.characterId from the first snapshot', () => {
    deliver(makeGameState([makeSerialized({ characterId: 'bubba' })]));
    expect(manager.getLocalPlayerState()?.characterId).toBe('bubba');
  });

  it('clears stale identity and match state as soon as the transport begins reconnecting', () => {
    deliver(makeGameState([makeSerialized(), makeSerialized({ id: REMOTE_ID })]));
    const reconnecting = vi.fn();
    manager.on('reconnecting', reconnecting);

    hoisted.stateCb?.('reconnecting');

    expect(reconnecting).toHaveBeenCalledOnce();
    expect(manager.getPlayerId()).toBeNull();
    expect(manager.getLocalPlayerState()).toBeNull();
    expect(manager.getRemotePlayerIds()).toHaveLength(0);
  });

  it('forwards explicit retry input to the transport', () => {
    manager.retryConnection();
    expect(hoisted.retryCalls).toBe(1);
  });

  it('forwards characterId through the reconciliation spread path', () => {
    // First snapshot seeds the state; the second flows through
    // applyReconciledLocalState, which spreads the OLD state — without
    // explicit forwarding the stale id survives (the pre-fix bug).
    deliver(makeGameState([makeSerialized({ characterId: 'bubba' })]));
    deliver(
      makeGameState([makeSerialized({ characterId: 'frost_wizard' })], {
        tick: 2,
      }),
    );
    expect(manager.getLocalPlayerState()?.characterId).toBe('frost_wizard');
  });

  it('forwards authoritative armor changes through reconciliation', () => {
    deliver(makeGameState([makeSerialized({ armor: 0 })]));
    deliver(makeGameState([makeSerialized({ armor: 35 })], { tick: 2 }));
    expect(manager.getLocalPlayerState()?.armor).toBe(35);

    deliver(makeGameState([makeSerialized({ armor: 9 })], { tick: 3 }));
    expect(manager.getLocalPlayerState()?.armor).toBe(9);
  });

  it('forwards the authoritative Spawn Rush timer through reconciliation', () => {
    deliver(makeGameState([makeSerialized({ spawnRushTimer: 4 })]));
    expect(manager.getLocalPlayerState()?.spawnRushTimer).toBe(4);

    deliver(makeGameState([makeSerialized({ spawnRushTimer: 2.5 })], { tick: 2 }));
    expect(manager.getLocalPlayerState()?.spawnRushTimer).toBe(2.5);
  });

  it('resets localPlayerState on matchFound so a rematch re-seeds fresh', () => {
    deliver(makeGameState([makeSerialized({ characterId: 'bubba' })]));
    expect(manager.getLocalPlayerState()?.characterId).toBe('bubba');

    deliver({
      type: 'server:matchFound',
      matchId: 'rematch-1',
      opponents: [{ id: REMOTE_ID, nickname: 'Rival' }],
      mapName: 'Wasteland Outpost',
      gameMode: GameModeType.DEATHMATCH,
    });
    expect(manager.getLocalPlayerState()).toBeNull();

    // First snapshot of the new match: the player switched to Jack.
    deliver(makeGameState([makeSerialized({ characterId: 'jack' })], { tick: 2 }));
    expect(manager.getLocalPlayerState()?.characterId).toBe('jack');
  });

  it('clears projectiles, pickups, objectives, mutators, and remote buffers on matchFound', () => {
    deliver(
      makeGameState([makeSerialized(), makeSerialized({ id: REMOTE_ID, nickname: 'Rival' })], {
        grenades: [
          {
            id: 'g1',
            throwerId: REMOTE_ID,
            position: { x: 10, y: 10 },
            velocity: { x: 0, y: 0 },
            safetyFuseTimer: 2,
            piercing: false,
          },
        ],
        activeMutators: ['big_heads'],
        contract: {
          id: 'hot_shot',
          title: 'HOT SHOT',
          objective: 'LAND 8 ATTACKS',
          target: 8,
          players: [{ playerId: LOCAL_ID, progress: 5, completed: false }],
        },
        confirmedTags: [
          {
            id: 'tag-1',
            ownerId: REMOTE_ID,
            position: { x: 20, y: 30 },
            expiresInSeconds: 15,
          },
        ],
        coreRun: {
          position: { x: 480, y: 288 },
          carrierId: LOCAL_ID,
          returnInSeconds: null,
          carryFraction: 0.4,
        },
        bountyHunt: { targetId: REMOTE_ID },
        wastelandWarp: { secondsUntilSwap: 5.5, sequence: 2 },
        radiationStorm: {
          center: { x: 480, y: 288 },
          radius: 240,
          shrinkSecondsRemaining: 9,
        },
      }),
    );
    expect(manager.getActiveGrenades()).toHaveLength(1);
    expect(manager.getRemotePlayerIds()).toEqual([REMOTE_ID]);
    expect(manager.getActiveMutators()).toEqual(['big_heads']);
    expect(manager.getConfirmedTags()).toHaveLength(1);
    expect(manager.getCoreRunState()?.carrierId).toBe(LOCAL_ID);
    expect(manager.getBountyHuntState()).toEqual({ targetId: REMOTE_ID });
    expect(manager.getWastelandWarpState()).toEqual({
      secondsUntilSwap: 5.5,
      sequence: 2,
    });
    expect(manager.getRadiationStormState()?.radius).toBe(240);
    expect(manager.getContractState()).toMatchObject({ id: 'hot_shot' });

    deliver({
      type: 'server:matchFound',
      matchId: 'rematch-2',
      opponents: [{ id: REMOTE_ID, nickname: 'Rival' }],
      mapName: 'Scrapyard',
      gameMode: GameModeType.KOTH,
    });

    expect(manager.getActiveGrenades()).toHaveLength(0);
    expect(manager.getActiveAxes()).toHaveLength(0);
    expect(manager.getPickups()).toHaveLength(0);
    expect(manager.getConfirmedTags()).toHaveLength(0);
    expect(manager.getCoreRunState()).toBeNull();
    expect(manager.getBountyHuntState()).toBeNull();
    expect(manager.getWastelandWarpState()).toBeNull();
    expect(manager.getRadiationStormState()).toBeNull();
    expect(manager.getScrapstormState()).toBeNull();
    expect(manager.getRemotePlayerIds()).toHaveLength(0);
    expect(manager.getActiveMutators()).toHaveLength(0);
    expect(manager.getContractState()).toBeNull();
    expect(manager.getInterpolatedPlayers().size).toBe(0);
    expect(manager.getMatchTimer()).toBe(0);
  });

  it('mirrors persistent Core Run state from each authoritative snapshot', () => {
    const coreRun = {
      position: { x: 240, y: 144 },
      carrierId: REMOTE_ID,
      returnInSeconds: null,
      carryFraction: 0.65,
    };
    deliver(makeGameState([makeSerialized()], { coreRun }));
    expect(manager.getCoreRunState()).toEqual(coreRun);

    deliver(makeGameState([makeSerialized()], { tick: 2 }));
    expect(manager.getCoreRunState()).toBeNull();
  });

  it('mirrors and clears the authoritative Bounty Hunt target', () => {
    deliver(
      makeGameState([makeSerialized()], {
        bountyHunt: { targetId: REMOTE_ID },
      }),
    );
    expect(manager.getBountyHuntState()).toEqual({ targetId: REMOTE_ID });

    deliver(makeGameState([makeSerialized()], { tick: 2 }));
    expect(manager.getBountyHuntState()).toBeNull();
  });

  it('emits only forward Rumble lead edges and suppresses snapshot seeding', () => {
    const seen: unknown[] = [];
    manager.on('rumbleLeadChanged', (state, players) => {
      seen.push({ state, playerIds: players.map((player: SerializedPlayerState) => player.id) });
    });
    const group = [
      makeSerialized(),
      makeSerialized({ id: REMOTE_ID, nickname: 'Rival' }),
      makeSerialized({ id: 'remote-two', nickname: 'Nomad' }),
    ];

    deliver(
      makeGameState(group, {
        rumbleLead: { leaderIds: group.map((player) => player.id), sequence: 0 },
      }),
    );
    expect(seen).toEqual([]);

    deliver(
      makeGameState(group, {
        tick: 2,
        rumbleLead: { leaderIds: [REMOTE_ID], sequence: 1 },
      }),
    );
    expect(seen).toEqual([
      {
        state: { leaderIds: [REMOTE_ID], sequence: 1 },
        playerIds: [LOCAL_ID, REMOTE_ID, 'remote-two'],
      },
    ]);

    // Duplicate and out-of-order unreliable snapshots cannot replay a beat.
    deliver(
      makeGameState(group, {
        tick: 3,
        rumbleLead: { leaderIds: [REMOTE_ID], sequence: 1 },
      }),
    );
    deliver(
      makeGameState(group, {
        tick: 2,
        rumbleLead: { leaderIds: group.map((player) => player.id), sequence: 0 },
      }),
    );
    expect(seen).toHaveLength(1);

    deliver({
      type: 'server:matchFound',
      matchId: 'next-rumble',
      opponents: group.slice(1).map((player) => ({
        id: player.id,
        nickname: player.nickname,
      })),
      mapName: 'Scrapyard',
      gameMode: GameModeType.KOTH,
      matchKind: 'rumble',
    });
    deliver(
      makeGameState(group, {
        tick: 4,
        rumbleLead: { leaderIds: [LOCAL_ID], sequence: 7 },
      }),
    );
    expect(seen).toHaveLength(1);
  });

  it('mirrors and clears the persistent Wasteland Warp countdown', () => {
    const wastelandWarp = { secondsUntilSwap: 6.25, sequence: 4 };
    deliver(makeGameState([makeSerialized()], { wastelandWarp }));
    expect(manager.getWastelandWarpState()).toEqual(wastelandWarp);

    deliver(makeGameState([makeSerialized()], { tick: 2 }));
    expect(manager.getWastelandWarpState()).toBeNull();
  });

  it('mirrors and clears the authoritative Radiation Storm zone', () => {
    const radiationStorm = {
      center: { x: 240, y: 144 },
      radius: 180,
      shrinkSecondsRemaining: 4.5,
    };
    deliver(makeGameState([makeSerialized()], { radiationStorm }));
    expect(manager.getRadiationStormState()).toEqual(radiationStorm);

    deliver(makeGameState([makeSerialized()], { tick: 2 }));
    expect(manager.getRadiationStormState()).toBeNull();
  });

  it('mirrors and clears the authoritative Scrapstorm warning', () => {
    const scrapstorm = {
      targetPosition: { x: 240, y: 144 },
      targetPlayerId: REMOTE_ID,
      secondsUntilImpact: 1.1,
      radius: 96,
    };
    deliver(makeGameState([makeSerialized()], { scrapstorm }));
    expect(manager.getScrapstormState()).toEqual(scrapstorm);

    deliver(makeGameState([makeSerialized()], { tick: 2 }));
    expect(manager.getScrapstormState()).toBeNull();
  });

  it('still emits matchFound to listeners after the reset', () => {
    const seen: unknown[] = [];
    manager.on('matchFound', (msg) => seen.push(msg));
    deliver({
      type: 'server:matchFound',
      matchId: 'fresh-1',
      opponents: [{ id: REMOTE_ID, nickname: 'Rival' }],
      mapName: 'Overgrown Suburb',
      gameMode: GameModeType.GUN_GAME,
    });
    expect(seen).toHaveLength(1);
  });

  it('emits authoritative Kill Confirmed collection feedback', () => {
    const seen: unknown[] = [];
    manager.on('confirmedTagCollected', (event) => seen.push(event));
    const collection = {
      tagId: 'tag-1',
      collectorId: LOCAL_ID,
      ownerId: REMOTE_ID,
      confirmed: true,
    };
    deliver(
      makeGameState([makeSerialized()], {
        confirmedTagCollections: [collection],
      }),
    );
    expect(seen).toEqual([collection]);
  });

  it('emits authoritative post-mitigation bullet-hit confirmation intact', () => {
    const seen: unknown[] = [];
    manager.on('bulletTrail', (trail) => seen.push(trail));
    const trail = {
      startPos: { x: 100, y: 100 },
      endPos: { x: 180, y: 100 },
      shooterId: LOCAL_ID,
      timestamp: 1234,
      weaponId: 'rifle' as const,
      hitPlayerId: REMOTE_ID,
      damageApplied: 17,
    };
    deliver(makeGameState([makeSerialized()], { bulletTrails: [trail] }));
    expect(seen).toEqual([trail]);
  });

  it('forwards transient barrel blasts through the grenade explosion presentation', () => {
    const seen: unknown[] = [];
    manager.on('grenadeExploded', (position) => seen.push(position));
    deliver(
      makeGameState([makeSerialized()], {
        barrelExplosions: [
          { x: 168, y: 120 },
          { x: 264, y: 120 },
        ],
      }),
    );
    expect(seen).toEqual([
      { x: 168, y: 120 },
      { x: 264, y: 120 },
    ]);
  });

  it('forwards server-authored Daily Run standings intact', () => {
    const seen: unknown[] = [];
    manager.on('dailyGauntletLeaderboard', (snapshot) => seen.push(snapshot));
    const snapshot = {
      type: 'server:dailyGauntletLeaderboard' as const,
      challengeKey: '2026-07-13',
      entries: [
        { nickname: 'Alpha', score: 7200 },
        { nickname: 'Bravo', score: 6800 },
      ],
    };

    deliver(snapshot);

    expect(seen).toEqual([snapshot]);
  });

  it('sends an explicit authoritative practice request', () => {
    manager.startPractice('Alpha', 'warlord');
    expect(hoisted.sentMessages).toContainEqual({
      type: 'client:startPractice',
      nickname: 'Alpha',
      difficulty: 'warlord',
      kind: 'sparring',
    });
    manager.startPractice('Bravo', 'scrapper', 'gauntlet');
    expect(hoisted.sentMessages).toContainEqual({
      type: 'client:startPractice',
      nickname: 'Bravo',
      difficulty: 'scrapper',
      kind: 'gauntlet',
    });
    manager.startPractice(
      'Charlie',
      'rookie',
      'sparring',
      GameModeType.CORE_RUN,
      'frost_wizard',
      'blackout',
    );
    expect(hoisted.sentMessages).toContainEqual({
      type: 'client:startPractice',
      nickname: 'Charlie',
      difficulty: 'rookie',
      kind: 'sparring',
      gameMode: GameModeType.CORE_RUN,
      opponentCharacterId: 'frost_wizard',
      mutatorId: 'blackout',
    });
  });

  it('sends backward-compatible rematches and optional Gauntlet route choices', () => {
    manager.requestRematch();
    manager.requestRematch('route_b');
    expect(hoisted.sentMessages).toContainEqual({
      type: 'client:rematchRequest',
    });
    expect(hoisted.sentMessages).toContainEqual({
      type: 'client:rematchRequest',
      gauntletRouteId: 'route_b',
    });
  });

  it('sends and emits shared battle cry ids without client-authored copy', () => {
    const seen: unknown[] = [];
    manager.on('taunt', (playerId, tauntId) => seen.push({ playerId, tauntId }));

    manager.sendTaunt('come_get_some');
    expect(hoisted.sentMessages).toContainEqual({
      type: 'client:taunt',
      tauntId: 'come_get_some',
    });

    deliver({
      type: 'server:taunt',
      playerId: REMOTE_ID,
      tauntId: 'still_standing',
    });
    expect(seen).toEqual([{ playerId: REMOTE_ID, tauntId: 'still_standing' }]);
  });

  it('sends Rumble joins and forwards non-fatal fighter departures', () => {
    const seen: unknown[] = [];
    manager.on('playerLeft', (playerId, nickname) => seen.push({ playerId, nickname }));

    manager.joinRumble('Alpha');
    expect(hoisted.sentMessages).toContainEqual({
      type: 'client:joinRumble',
      nickname: 'Alpha',
    });

    deliver({ type: 'server:playerLeft', playerId: REMOTE_ID, nickname: 'Bravo' });
    expect(seen).toEqual([{ playerId: REMOTE_ID, nickname: 'Bravo' }]);
  });
});
