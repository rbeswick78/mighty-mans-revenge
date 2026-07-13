import { describe, expect, it } from 'vitest';
import { ABILITY, CHARACTERS, MAP, SERVER, WEAPONS, PLAYER } from '@shared/config/game.js';
import type { CollisionGrid } from '@shared/types/map.js';
import type { PlayerInput, PlayerState } from '@shared/types/player.js';
import type { SerializedPlayerState } from '@shared/types/network.js';
import { playerMovementModifiers } from '@shared/utils/event-modifiers.js';
import { calculateMovement } from '@shared/utils/physics.js';
import { ServerReconciliation } from './reconciliation.js';

function makePlayerState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'player-1',
    characterId: null,
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: PLAYER.MAX_HEALTH,
    maxHealth: PLAYER.MAX_HEALTH,
    armor: 0,
    ammo: WEAPONS.rifle.magazineSize,
    isReloading: false,
    reloadTimer: 0,
    weaponId: 'rifle',
    specialAmmo: 0,
    specialReserve: 0,
    grenades: 3,
    grenadeRegenSeconds: 0,
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
    abilityLockedAim: 0,
    frozenTimer: 0,
    secondWindTimer: 0,
    ...overrides,
  };
}

function makeServerState(
  overrides: Partial<SerializedPlayerState> = {},
): SerializedPlayerState {
  return {
    id: 'player-1',
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

  it('replays unacked inputs with the character speed multiplier — zero drift for Bubba', () => {
    // The rubber-banding regression guard for per-character speed: replaying
    // an unacked input with playerMovementModifiers('bubba') must land on
    // exactly the position the server will compute for that same input.
    const grid: CollisionGrid = {
      width: 20,
      height: 20,
      tileSize: 48,
      solid: Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => false)),
    };
    const dt = 1 / SERVER.TICK_RATE;
    const input: PlayerInput = {
      sequenceNumber: 5,
      moveX: 1,
      moveY: 0,
      aimAngle: 0,
      aimingGun: false,
      firePressed: false,
      aimingGrenade: false,
      throwPressed: false,
      detonatePressed: false,
      sprint: false,
      reload: false,
      abilityPressed: false,
      tick: 5,
    };
    const modifiers = playerMovementModifiers('bubba', []);

    // What the server will authoritatively compute for this input:
    const serverSide = calculateMovement(input, { x: 200, y: 200 }, 3, dt, grid, modifiers);
    expect(serverSide.newPos.x).toBeCloseTo(
      200 + PLAYER.BASE_SPEED * CHARACTERS.bubba.speedMultiplier * dt,
      8,
    );

    // Client reconciliation: server acked seq 4 at (200,200); replay seq 5.
    const reconciliation = new ServerReconciliation();
    const server = makeServerState({
      characterId: 'bubba',
      position: { x: 200, y: 200 },
      lastProcessedInput: 4,
    });
    const predicted = makePlayerState({
      characterId: 'bubba',
      position: serverSide.newPos,
      lastProcessedInput: 5,
    });
    const result = reconciliation.reconcile(
      server,
      [{ input, predictedState: predicted }],
      grid,
      modifiers,
    );

    // Identical physics → identical endpoint → no correction at all.
    expect(result.shouldSnap).toBe(false);
    expect(result.position.x).toBeCloseTo(serverSide.newPos.x, 8);
    expect(result.position.y).toBeCloseTo(serverSide.newPos.y, 8);
  });

  it('replays an unacknowledged Rook dash with the server-identical endpoint', () => {
    const grid: CollisionGrid = {
      width: 20,
      height: 20,
      tileSize: MAP.TILE_SIZE,
      solid: Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => false)),
    };
    const input: PlayerInput = {
      sequenceNumber: 5,
      moveX: 0,
      moveY: 0,
      aimAngle: 0,
      aimingGun: false,
      firePressed: false,
      aimingGrenade: false,
      throwPressed: false,
      detonatePressed: false,
      sprint: false,
      reload: false,
      abilityPressed: true,
      tick: 5,
    };
    const endpoint = {
      x: 200 + ABILITY.ROOK_BREACH_DASH.DISTANCE_TILES * MAP.TILE_SIZE,
      y: 200,
    };
    const server = makeServerState({
      characterId: 'rook',
      position: { x: 200, y: 200 },
      lastProcessedInput: 4,
    });
    const predicted = makePlayerState({
      characterId: 'rook',
      position: endpoint,
      lastProcessedInput: 5,
    });

    const result = new ServerReconciliation().reconcile(
      server,
      [{ input, predictedState: predicted }],
      grid,
    );

    expect(result.shouldSnap).toBe(false);
    expect(result.position).toEqual(endpoint);
  });

  it('does not replay Rook dash when the mode disables abilities', () => {
    const grid: CollisionGrid = {
      width: 20,
      height: 20,
      tileSize: MAP.TILE_SIZE,
      solid: Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => false)),
    };
    const input: PlayerInput = {
      sequenceNumber: 5,
      moveX: 0,
      moveY: 0,
      aimAngle: 0,
      aimingGun: false,
      firePressed: false,
      aimingGrenade: false,
      throwPressed: false,
      detonatePressed: false,
      sprint: false,
      reload: false,
      abilityPressed: true,
      tick: 5,
    };
    const predicted = makePlayerState({
      characterId: 'rook',
      position: { x: 200, y: 200 },
      lastProcessedInput: 5,
    });

    const result = new ServerReconciliation().reconcile(
      makeServerState({
        characterId: 'rook',
        position: { x: 200, y: 200 },
        lastProcessedInput: 4,
      }),
      [{ input, predictedState: predicted }],
      grid,
      undefined,
      false,
    );

    expect(result.position).toEqual({ x: 200, y: 200 });
  });
});
