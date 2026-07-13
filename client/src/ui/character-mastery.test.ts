import { describe, expect, it } from 'vitest';
import { characterMasteryLabel } from './character-mastery.js';

describe('characterMasteryLabel', () => {
  it('shows the next tier target for an untested fighter', () => {
    expect(characterMasteryLabel(0)).toBe('UNTESTED · 0/1 WIN');
  });

  it('shows progress through intermediate tiers', () => {
    expect(characterMasteryLabel(1)).toBe('BLOODED · 1/3 WINS');
    expect(characterMasteryLabel(9)).toBe('VETERAN · 9/15 WINS');
  });

  it('shows open-ended wins at maximum mastery', () => {
    expect(characterMasteryLabel(18)).toBe('MASTER · 18 WINS');
  });

  it('backfills missing old-server values as untested', () => {
    expect(characterMasteryLabel(undefined)).toBe('UNTESTED · 0/1 WIN');
  });
});
