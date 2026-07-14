import { describe, expect, it } from 'vitest';
import { MUTATORS } from '@shared/config/game.js';
import { GameModeType } from '@shared/types/game.js';
import {
  nextPracticeMutatorPreference,
  normalizePracticeMutatorPreference,
  practiceMutatorBriefingLabel,
  practiceMutatorPreferenceLabel,
} from './practice-mutator.js';

describe('practice mutator preferences', () => {
  it('normalizes untrusted storage and rejects mode conflicts', () => {
    expect(normalizePracticeMutatorPreference('blackout')).toBe('blackout');
    expect(normalizePracticeMutatorPreference('weapon_roulette', GameModeType.GUN_GAME)).toBeNull();
    expect(normalizePracticeMutatorPreference('not-chaos')).toBeNull();
    expect(normalizePracticeMutatorPreference(null)).toBeNull();
  });

  it('cycles the shared pool and skips incompatible events for a pinned mode', () => {
    expect(nextPracticeMutatorPreference(null)).toBe(MUTATORS.POOL[0]);
    const compatible: (typeof MUTATORS.POOL)[number][] = [];
    let current = nextPracticeMutatorPreference(null, GameModeType.ONE_IN_THE_CHAMBER);
    while (current !== null) {
      compatible.push(current);
      current = nextPracticeMutatorPreference(current, GameModeType.ONE_IN_THE_CHAMBER);
    }
    expect(compatible).not.toContain('weapon_roulette');
    expect(compatible).toContain('blackout');
  });

  it('authors compact lobby and pre-fight copy from the shared display name', () => {
    expect(practiceMutatorPreferenceLabel(null)).toBe('SOLO CHAOS: RANDOM');
    expect(practiceMutatorPreferenceLabel('blackout')).toBe('SOLO CHAOS: BLACKOUT');
    expect(practiceMutatorBriefingLabel('ability_overdrive')).toBe('MID-MATCH: ABILITY OVERDRIVE');
  });
});
