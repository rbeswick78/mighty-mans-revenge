import { describe, it, expect } from 'vitest';
import {
  mutatorsToMovementModifiers,
  playerMovementModifiers,
  eventDisplayName,
  mutatorsConflict,
} from './event-modifiers.js';
import { CHARACTERS, MUTATORS, type MutatorId } from '../config/game.js';

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
      'blackout',
      'fists_only',
      'weapon_roulette',
      'wasteland_warp',
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

describe('playerMovementModifiers', () => {
  it('passes mutator modifiers through untouched for 1.0x characters', () => {
    expect(playerMovementModifiers('mighty_man', [])).toEqual({});
    expect(playerMovementModifiers('jack', ['super_speed'])).toEqual(
      mutatorsToMovementModifiers(['super_speed']),
    );
  });

  it('applies the character speed multiplier with no mutators active', () => {
    expect(playerMovementModifiers('bubba', [])).toEqual({
      speedMultiplier: CHARACTERS.bubba.speedMultiplier,
    });
    expect(playerMovementModifiers('frost_wizard', [])).toEqual({
      speedMultiplier: CHARACTERS.frost_wizard.speedMultiplier,
    });
  });

  it('composes character speed multiplicatively with mutator speed', () => {
    const stacked = playerMovementModifiers('bubba', ['super_speed']);
    expect(stacked.speedMultiplier).toBeCloseTo(
      CHARACTERS.bubba.speedMultiplier * MUTATORS.SUPER_SPEED_MULTIPLIER,
      10,
    );
    // super_speed's sprint/stamina rules survive the character fold.
    expect(stacked.sprintEnabled).toBe(false);
    expect(stacked.staminaFrozen).toBe(true);

    const boosted = playerMovementModifiers('bruce', ['second_wind'], 2);
    expect(boosted.speedMultiplier).toBeCloseTo(
      CHARACTERS.bruce.speedMultiplier * MUTATORS.SECOND_WIND_SPEED_MULTIPLIER,
      10,
    );
  });

  it('treats a null characterId (pre-select) as neutral', () => {
    expect(playerMovementModifiers(null, [])).toEqual({});
    expect(playerMovementModifiers(null, ['super_speed'])).toEqual(
      mutatorsToMovementModifiers(['super_speed']),
    );
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

  it('identifies symmetric ownership conflicts between forced loadouts', () => {
    expect(mutatorsConflict('fists_only', 'grenades_only')).toBe(true);
    expect(mutatorsConflict('grenades_only', 'fists_only')).toBe(true);
    expect(mutatorsConflict('weapon_roulette', 'fists_only')).toBe(true);
    expect(mutatorsConflict('fists_only', 'weapon_roulette')).toBe(true);
    expect(mutatorsConflict('weapon_roulette', 'grenades_only')).toBe(true);
    expect(mutatorsConflict('grenades_only', 'weapon_roulette')).toBe(true);
    expect(mutatorsConflict('fists_only', 'super_speed')).toBe(false);
    expect(mutatorsConflict('grenades_only', 'turbo_grenades')).toBe(false);
    expect(mutatorsConflict('weapon_roulette', 'weapon_roulette')).toBe(false);
  });
});
