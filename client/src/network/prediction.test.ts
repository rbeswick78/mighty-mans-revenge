import { describe, expect, it } from 'vitest';
import { ABILITY, MAP, PLAYER, WEAPONS } from '@shared/config/game.js';
import type { CollisionGrid } from '@shared/types/map.js';
import type { PlayerInput, PlayerState } from '@shared/types/player.js';
import { ClientPrediction } from './prediction.js';

function openGrid(): CollisionGrid {
  return {
    width: 20,
    height: 20,
    tileSize: MAP.TILE_SIZE,
    solid: Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => false)),
  };
}

function input(overrides: Partial<PlayerInput> = {}): PlayerInput {
  return {
    sequenceNumber: 1,
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
    abilityPressed: false,
    tick: 1,
    ...overrides,
  };
}

function rook(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'rook-player',
    characterId: 'rook',
    position: { x: 200, y: 200 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: 95,
    maxHealth: 95,
    ammo: WEAPONS.rifle.magazineSize,
    isReloading: false,
    reloadTimer: 0,
    weaponId: 'rifle',
    specialAmmo: 0,
    specialReserve: 0,
    grenades: 3,
    grenadeRegenSeconds: 0,
    isSprinting: false,
    stamina: PLAYER.SPRINT_DURATION,
    isDead: false,
    respawnTimer: 0,
    invulnerableTimer: 0,
    lastProcessedInput: 0,
    score: 0,
    deaths: 0,
    nickname: 'Rook',
    abilityActiveSeconds: 0,
    abilityCooldownSeconds: 0,
    abilityLockedAim: 0,
    frozenTimer: 0,
    secondWindTimer: 0,
    ...overrides,
  };
}

describe('ClientPrediction Rook dash', () => {
  it('predicts the full dash immediately and starts its local cooldown edge', () => {
    const result = new ClientPrediction().predictInput(
      input({ abilityPressed: true }),
      rook(),
      openGrid(),
    );

    expect(result.position.x).toBeCloseTo(
      200 + ABILITY.ROOK_BREACH_DASH.DISTANCE_TILES * MAP.TILE_SIZE,
      8,
    );
    expect(result.position.y).toBe(200);
    expect(result.abilityCooldownSeconds).toBe(ABILITY.ROOK_BREACH_DASH.COOLDOWN);
  });

  it('does not predict through cooldown or an ability-disabled mode', () => {
    const pressed = input({ abilityPressed: true });
    const cooling = new ClientPrediction().predictInput(
      pressed,
      rook({ abilityCooldownSeconds: 1 }),
      openGrid(),
    );
    const disabled = new ClientPrediction().predictInput(
      pressed,
      rook(),
      openGrid(),
      undefined,
      false,
    );

    expect(cooling.position).toEqual({ x: 200, y: 200 });
    expect(disabled.position).toEqual({ x: 200, y: 200 });
  });

  it('refunds the cooldown when geometry leaves no legal dash distance', () => {
    const grid = openGrid();
    const maxX = grid.width * grid.tileSize - PLAYER.HITBOX_WIDTH / 2;
    const result = new ClientPrediction().predictInput(
      input({ abilityPressed: true }),
      rook({ position: { x: maxX, y: 200 } }),
      grid,
    );

    expect(result.position).toEqual({ x: maxX, y: 200 });
    expect(result.abilityCooldownSeconds).toBe(0);
  });
});
