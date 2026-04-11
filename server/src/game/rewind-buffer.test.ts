import { describe, it, expect, beforeEach } from 'vitest';
import { RewindBuffer } from './rewind-buffer.js';
import {
  type PlayerState,
  type PlayerId,
  PLAYER,
  GUN,
  GRENADE,
  SERVER,
} from '@shared/game';

function createPlayer(overrides: Partial<PlayerState> & { id: PlayerId }): PlayerState {
  return {
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: PLAYER.MAX_HEALTH,
    maxHealth: PLAYER.MAX_HEALTH,
    ammo: GUN.MAGAZINE_SIZE,
    grenades: GRENADE.MAX_CARRY,
    isReloading: false,
    reloadTimer: 0,
    isSprinting: false,
    stamina: PLAYER.SPRINT_DURATION,
    isDead: false,
    respawnTimer: 0,
    invulnerableTimer: 0,
    lastProcessedInput: 0,
    score: 0,
    deaths: 0,
    nickname: 'test',
    ...overrides,
  };
}

describe('RewindBuffer', () => {
  let buffer: RewindBuffer;

  beforeEach(() => {
    buffer = new RewindBuffer(5);
  });

  it('stores and retrieves states by tick', () => {
    const players = new Map<PlayerId, PlayerState>([
      ['p1', createPlayer({ id: 'p1', position: { x: 50, y: 50 } })],
    ]);

    buffer.saveState(1, 1000, players);
    const state = buffer.getStateAtTick(1);

    expect(state).not.toBeNull();
    expect(state!.tick).toBe(1);
    expect(state!.players.get('p1')!.position.x).toBe(50);
  });

  it('returns null for non-existent tick', () => {
    const state = buffer.getStateAtTick(999);
    expect(state).toBeNull();
  });

  it('wraps around correctly (circular buffer)', () => {
    const bufferSize = 5;
    const smallBuffer = new RewindBuffer(bufferSize);

    // Fill beyond capacity
    for (let i = 0; i < 8; i++) {
      const players = new Map<PlayerId, PlayerState>([
        ['p1', createPlayer({ id: 'p1', position: { x: i * 10, y: 0 } })],
      ]);
      smallBuffer.saveState(i, 1000 + i * 50, players);
    }

    // Oldest entries (ticks 0-2) should be overwritten
    expect(smallBuffer.getStateAtTick(0)).toBeNull();
    expect(smallBuffer.getStateAtTick(1)).toBeNull();
    expect(smallBuffer.getStateAtTick(2)).toBeNull();

    // Recent entries should still exist
    expect(smallBuffer.getStateAtTick(3)).not.toBeNull();
    expect(smallBuffer.getStateAtTick(7)).not.toBeNull();
    expect(smallBuffer.getStateAtTick(7)!.players.get('p1')!.position.x).toBe(70);
  });

  it('retrieves state at exact timestamp', () => {
    const players = new Map<PlayerId, PlayerState>([
      ['p1', createPlayer({ id: 'p1', position: { x: 100, y: 200 } })],
    ]);

    buffer.saveState(1, 1000, players);
    const state = buffer.getStateAtTime(1000);

    expect(state).not.toBeNull();
    expect(state!.players.get('p1')!.position.x).toBe(100);
  });

  it('interpolates between two ticks', () => {
    const players1 = new Map<PlayerId, PlayerState>([
      ['p1', createPlayer({ id: 'p1', position: { x: 0, y: 0 } })],
    ]);
    const players2 = new Map<PlayerId, PlayerState>([
      ['p1', createPlayer({ id: 'p1', position: { x: 100, y: 200 } })],
    ]);

    buffer.saveState(1, 1000, players1);
    buffer.saveState(2, 1050, players2);

    // Request time halfway between
    const state = buffer.getStateAtTime(1025);

    expect(state).not.toBeNull();
    expect(state!.players.get('p1')!.position.x).toBeCloseTo(50);
    expect(state!.players.get('p1')!.position.y).toBeCloseTo(100);
  });

  it('returns earliest state when target time is before buffer', () => {
    const players = new Map<PlayerId, PlayerState>([
      ['p1', createPlayer({ id: 'p1', position: { x: 10, y: 20 } })],
    ]);

    buffer.saveState(1, 1000, players);
    buffer.saveState(2, 1050, players);

    const state = buffer.getStateAtTime(500);

    expect(state).not.toBeNull();
    expect(state!.tick).toBe(1);
  });

  it('returns latest state when target time is after buffer', () => {
    const players = new Map<PlayerId, PlayerState>([
      ['p1', createPlayer({ id: 'p1', position: { x: 10, y: 20 } })],
    ]);

    buffer.saveState(1, 1000, players);
    buffer.saveState(2, 1050, players);

    const state = buffer.getStateAtTime(2000);

    expect(state).not.toBeNull();
    expect(state!.tick).toBe(2);
  });

  it('returns null from getStateAtTime on empty buffer', () => {
    const state = buffer.getStateAtTime(1000);
    expect(state).toBeNull();
  });

  it('stores positions as copies, not references', () => {
    const player = createPlayer({ id: 'p1', position: { x: 100, y: 200 } });
    const players = new Map<PlayerId, PlayerState>([['p1', player]]);

    buffer.saveState(1, 1000, players);

    // Mutate the original
    player.position.x = 999;

    const state = buffer.getStateAtTick(1);
    expect(state!.players.get('p1')!.position.x).toBe(100);
  });

  it('has correct default buffer size', () => {
    const defaultBuffer = new RewindBuffer();
    const expectedSize = SERVER.TICK_RATE * SERVER.REWIND_BUFFER_SECONDS;

    // Fill to capacity
    for (let i = 0; i < expectedSize + 5; i++) {
      defaultBuffer.saveState(i, i * 50, new Map());
    }

    expect(defaultBuffer.getCount()).toBe(expectedSize);
  });
});

describe('RewindBuffer — lag compensation scenario', () => {
  it('hit that would miss in current state but hits in rewound state', () => {
    const buffer = new RewindBuffer(20);

    // Tick 1: target at x=200 (in the ray path)
    const tick1Players = new Map<PlayerId, PlayerState>([
      ['shooter', createPlayer({ id: 'shooter', position: { x: 100, y: 100 } })],
      ['target', createPlayer({ id: 'target', position: { x: 200, y: 100 } })],
    ]);
    buffer.saveState(1, 1000, tick1Players);

    // Tick 2-5: target moved away to y=300 (out of ray path)
    for (let i = 2; i <= 5; i++) {
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', createPlayer({ id: 'shooter', position: { x: 100, y: 100 } })],
        ['target', createPlayer({ id: 'target', position: { x: 200, y: 300 } })],
      ]);
      buffer.saveState(i, 1000 + (i - 1) * 50, players);
    }

    // Get rewound state at tick 1's time
    const rewoundState = buffer.getStateAtTime(1000);

    expect(rewoundState).not.toBeNull();
    // The rewound target should be at y=100 (in the ray path)
    expect(rewoundState!.players.get('target')!.position.y).toBe(100);

    // Current state has target at y=300 (would miss)
    const currentState = buffer.getStateAtTick(5);
    expect(currentState!.players.get('target')!.position.y).toBe(300);
  });
});
