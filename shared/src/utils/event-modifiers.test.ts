import { describe, it, expect } from 'vitest';
import { mutatorsToMovementModifiers, eventDisplayName } from './event-modifiers.js';
import { MUTATORS, type MutatorId } from '../config/game.js';

describe('mutatorsToMovementModifiers', () => {
  it('returns the super-speed modifier set for super_speed', () => {
    expect(mutatorsToMovementModifiers(['super_speed'])).toEqual({
      speedMultiplier: MUTATORS.SUPER_SPEED_MULTIPLIER,
      sprintEnabled: false,
      staminaFrozen: true,
    });
  });

  it('returns no modifier for mutators that do not change movement', () => {
    const passthrough: MutatorId[] = [
      'grenades_only',
      'infinite_ammo',
      'low_health',
      'big_heads',
      'vampire',
      'turbo_grenades',
    ];
    for (const mutator of passthrough) {
      expect(mutatorsToMovementModifiers([mutator])).toEqual({});
    }
  });

  it('returns no modifier when no mutator is active', () => {
    expect(mutatorsToMovementModifiers([])).toEqual({});
  });

  it('second_wind boosts speed only while the respawn timer is running', () => {
    expect(mutatorsToMovementModifiers(['second_wind'], 2.5)).toEqual({
      speedMultiplier: MUTATORS.SECOND_WIND_SPEED_MULTIPLIER,
      sprintEnabled: true,
      staminaFrozen: false,
    });
    expect(mutatorsToMovementModifiers(['second_wind'], 0)).toEqual({});
  });

  it('second_wind timer alone does nothing without the mutator active', () => {
    expect(mutatorsToMovementModifiers([], 3)).toEqual({});
  });

  it('stacked super_speed + second_wind multiply their speed multipliers', () => {
    const stacked = mutatorsToMovementModifiers(['super_speed', 'second_wind'], 1);
    expect(stacked.speedMultiplier).toBeCloseTo(
      MUTATORS.SUPER_SPEED_MULTIPLIER * MUTATORS.SECOND_WIND_SPEED_MULTIPLIER,
      10,
    );
    // super_speed's sprint/stamina rules survive the stack.
    expect(stacked.sprintEnabled).toBe(false);
    expect(stacked.staminaFrozen).toBe(true);
  });
});

describe('eventDisplayName', () => {
  it('returns an uppercase label for every mutator in the pool', () => {
    for (const mutator of MUTATORS.POOL) {
      const label = eventDisplayName(mutator);
      expect(label).toBeTruthy();
      expect(label).toBe(label.toUpperCase());
    }
  });
});
