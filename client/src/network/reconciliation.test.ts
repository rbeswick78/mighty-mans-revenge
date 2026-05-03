import { describe, expect, it } from 'vitest';
import { GUN, PLAYER } from '@shared/config/game.js';
import type { PlayerState } from '@shared/types/player.js';
import type { SerializedPlayerState } from '@shared/types/network.js';
import { ServerReconciliation } from './reconciliation.js';

function makePlayerState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'player-1',
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: PLAYER.MAX_HEALTH,
    maxHealth: PLAYER.MAX_HEALTH,
    ammo: GUN.MAGAZINE_SIZE,
    isReloading: false,
    reloadTimer: 0,
    grenades: 3,
    isSprinting: false,
    stamina: 3,
    isDead: false,
    respawnTimer: 0,
    invulnerableTimer: 0,
    lastProcessedInput: 0,
    score: 0,
    deaths: 0,
    nickname: 'Player',
    ...overrides,
  };
}

function makeServerState(
  overrides: Partial<SerializedPlayerState> = {},
): SerializedPlayerState {
  return {
    id: 'player-1',
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: PLAYER.MAX_HEALTH,
    ammo: GUN.MAGAZINE_SIZE,
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
    ...overrides,
  };
}

describe('ServerReconciliation', () => {
  it('smooths authoritative corrections when no predictions remain', () => {
    const reconciliation = new ServerReconciliation();
    const current = makePlayerState({ position: { x: 100, y: 100 } });
    const server = makeServerState({ position: { x: 110, y: 100 } });

    const result = reconciliation.reconcileAuthoritative(server, current);

    expect(result.shouldSnap).toBe(false);
    expect(result.position.x).toBeCloseTo(103, 5);
    expect(result.position.y).toBeCloseTo(100, 5);
  });

  it('snaps authoritative corrections for large mismatches', () => {
    const reconciliation = new ServerReconciliation();
    const current = makePlayerState({ position: { x: 100, y: 100 } });
    const server = makeServerState({ position: { x: 180, y: 100 } });

    const result = reconciliation.reconcileAuthoritative(server, current);

    expect(result.shouldSnap).toBe(true);
    expect(result.position).toEqual({ x: 180, y: 100 });
  });

  it('snaps when death or respawn changes visibility state', () => {
    const reconciliation = new ServerReconciliation();
    const current = makePlayerState({ isDead: false });
    const server = makeServerState({
      isDead: true,
      position: { x: 140, y: 100 },
    });

    const result = reconciliation.reconcileAuthoritative(server, current);

    expect(result.shouldSnap).toBe(true);
    expect(result.position).toEqual({ x: 140, y: 100 });
  });
});
