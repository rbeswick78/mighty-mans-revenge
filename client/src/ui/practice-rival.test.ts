import { describe, expect, it } from 'vitest';
import { CHARACTERS, CHARACTER_IDS } from '@shared/config/game.js';
import {
  nextPracticeRivalPreference,
  normalizePracticeRivalPreference,
  practiceRivalPreferenceLabel,
} from './practice-rival.js';

describe('Practice rival preference', () => {
  it('normalizes saved roster fighters and rejects stale values', () => {
    for (const characterId of CHARACTER_IDS) {
      expect(normalizePracticeRivalPreference(characterId)).toBe(characterId);
    }
    expect(normalizePracticeRivalPreference(null)).toBeNull();
    expect(normalizePracticeRivalPreference('not-a-fighter')).toBeNull();
  });

  it('cycles random through every fighter and back to random', () => {
    let current = nextPracticeRivalPreference(null);
    const visited = [];
    while (current !== null) {
      visited.push(current);
      current = nextPracticeRivalPreference(current);
    }
    expect(visited).toEqual(CHARACTER_IDS);
  });

  it('uses the shared player-facing fighter names', () => {
    expect(practiceRivalPreferenceLabel(null)).toBe('RIVAL: RANDOM');
    for (const characterId of CHARACTER_IDS) {
      expect(practiceRivalPreferenceLabel(characterId)).toBe(
        `RIVAL: ${CHARACTERS[characterId].displayName.toUpperCase()}`,
      );
    }
  });
});
