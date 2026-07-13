import { describe, expect, it } from 'vitest';
import { GAME_MODE_ROTATION, gameModeDisplayName } from '@shared/config/game.js';
import {
  nextPracticeModePreference,
  normalizePracticeModePreference,
  practiceModePreferenceLabel,
} from './practice-mode.js';

describe('Practice mode preference', () => {
  it('normalizes saved shared modes and rejects stale values', () => {
    for (const mode of GAME_MODE_ROTATION) {
      expect(normalizePracticeModePreference(mode)).toBe(mode);
    }
    expect(normalizePracticeModePreference(null)).toBeNull();
    expect(normalizePracticeModePreference('not-a-mode')).toBeNull();
  });

  it('cycles random through every mode and back to random', () => {
    let current = nextPracticeModePreference(null);
    const visited = [];
    while (current !== null) {
      visited.push(current);
      current = nextPracticeModePreference(current);
    }
    expect(visited).toEqual(GAME_MODE_ROTATION);
  });

  it('uses the shared player-facing mode names', () => {
    expect(practiceModePreferenceLabel(null)).toBe('SPAR MODE: RANDOM');
    for (const mode of GAME_MODE_ROTATION) {
      expect(practiceModePreferenceLabel(mode)).toBe(
        `SPAR MODE: ${gameModeDisplayName(mode)}`,
      );
    }
  });
});
