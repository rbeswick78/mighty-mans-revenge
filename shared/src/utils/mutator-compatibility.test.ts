import { describe, expect, it } from 'vitest';
import { GAME_MODE_ROTATION, MUTATORS } from '../config/game.js';
import { GameModeType } from '../types/game.js';
import {
  MODE_MUTATOR_EXCLUSIONS,
  compatibleGameModesForMutator,
  isMutatorCompatibleWithMode,
  isMutatorId,
} from './mutator-compatibility.js';

describe('mutator mode compatibility', () => {
  it('defines one frozen exclusion list for every mode', () => {
    expect(Object.isFrozen(MODE_MUTATOR_EXCLUSIONS)).toBe(true);
    expect(Object.keys(MODE_MUTATOR_EXCLUSIONS)).toEqual(GAME_MODE_ROTATION);
    for (const exclusions of Object.values(MODE_MUTATOR_EXCLUSIONS)) {
      expect(Object.isFrozen(exclusions)).toBe(true);
      expect(new Set(exclusions).size).toBe(exclusions.length);
      expect(exclusions.every((id) => MUTATORS.POOL.includes(id))).toBe(true);
    }
  });

  it('keeps ordinary modes open while protecting complete weapon economies', () => {
    expect(isMutatorCompatibleWithMode('weapon_roulette', GameModeType.DEATHMATCH)).toBe(true);
    expect(isMutatorCompatibleWithMode('weapon_roulette', GameModeType.GUN_GAME)).toBe(false);
    expect(isMutatorCompatibleWithMode('ability_overdrive', GameModeType.ONE_IN_THE_CHAMBER)).toBe(
      false,
    );
    expect(compatibleGameModesForMutator('weapon_roulette')).not.toContain(GameModeType.GUN_GAME);
  });

  it('guards untrusted mutator ids', () => {
    for (const mutator of MUTATORS.POOL) expect(isMutatorId(mutator)).toBe(true);
    expect(isMutatorId('not-chaos')).toBe(false);
    expect(isMutatorId(null)).toBe(false);
  });
});
