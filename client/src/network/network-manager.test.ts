import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAYER, WEAPONS } from '@shared/config/game.js';
import { MatchPhase, GameModeType } from '@shared/types/game.js';
import type {
  ClientMessage,
  SerializedPlayerState,
  ServerGameStateMessage,
  ServerMessage,
} from '@shared/types/network.js';

// NetworkManager builds a NetworkConnection in its constructor, which
// would pull in the geckos.io client (and import.meta.env). Replace it
// with a recorder so tests can drive handleMessage through the same
// onMessage callback production uses. vi.mock is hoisted above the
// imports, so the shared handle must be hoisted too.
const hoisted = vi.hoisted(() => ({
  messageCb: null as ((msg: unknown) => void) | null,
  sentMessages: [] as ClientMessage[],
}));

vi.mock('./connection.js', () => ({
  NetworkConnection: class {
    onMessage(cb: (msg: unknown) => void): void {
      hoisted.messageCb = cb;
    }
    onStateChange(): void {}
    send(message: ClientMessage): void {
      hoisted.sentMessages.push(message);
    }
    connect(): Promise<void> {
      return Promise.resolve();
    }
    disconnect(): void {}
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

function makeSerialized(
  overrides: Partial<SerializedPlayerState> = {},
): SerializedPlayerState {
  return {
    id: LOCAL_ID,
    characterId: 'mighty_man',
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: PLAYER.MAX_HEALTH,
    maxHealth: PLAYER.MAX_HEALTH,
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
    hoisted.sentMessages = [];
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

  it('forwards characterId through the reconciliation spread path', () => {
    // First snapshot seeds the state; the second flows through
    // applyReconciledLocalState, which spreads the OLD state — without
    // explicit forwarding the stale id survives (the pre-fix bug).
    deliver(makeGameState([makeSerialized({ characterId: 'bubba' })]));
    deliver(
      makeGameState([makeSerialized({ characterId: 'frost_wizard' })], { tick: 2 }),
    );
    expect(manager.getLocalPlayerState()?.characterId).toBe('frost_wizard');
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
      makeGameState(
        [makeSerialized(), makeSerialized({ id: REMOTE_ID, nickname: 'Rival' })],
        {
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
            players: [
              { playerId: LOCAL_ID, progress: 5, completed: false },
            ],
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
        },
      ),
    );
    expect(manager.getActiveGrenades()).toHaveLength(1);
    expect(manager.getRemotePlayerIds()).toEqual([REMOTE_ID]);
    expect(manager.getActiveMutators()).toEqual(['big_heads']);
    expect(manager.getConfirmedTags()).toHaveLength(1);
    expect(manager.getCoreRunState()?.carrierId).toBe(LOCAL_ID);
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

  it('sends an explicit authoritative practice request', () => {
    manager.startPractice('Alpha', 'warlord');
    expect(hoisted.sentMessages).toContainEqual({
      type: 'client:startPractice',
      nickname: 'Alpha',
      difficulty: 'warlord',
    });
  });
});
