import { describe, expect, it } from 'vitest';
import { activeMutatorLabel, didWastelandWarp } from './wasteland-warp.js';

describe('Wasteland Warp HUD helpers', () => {
  it('adds a rounded authoritative countdown to stacked mutator copy', () => {
    expect(activeMutatorLabel(
      ['blackout', 'wasteland_warp'],
      { secondsUntilSwap: 4.1, sequence: 2 },
    )).toBe('BLACKOUT + WASTELAND WARP · 5S');
  });

  it('treats only later sequence changes as warp feedback edges', () => {
    expect(didWastelandWarp(undefined, { secondsUntilSwap: 8, sequence: 3 })).toBe(false);
    expect(didWastelandWarp(3, { secondsUntilSwap: 12, sequence: 3 })).toBe(false);
    expect(didWastelandWarp(3, { secondsUntilSwap: 12, sequence: 4 })).toBe(true);
    expect(didWastelandWarp(3, null)).toBe(false);
  });
});
