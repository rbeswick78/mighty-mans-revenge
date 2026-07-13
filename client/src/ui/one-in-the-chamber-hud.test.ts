import { describe, expect, it } from 'vitest';
import { oneInTheChamberStatus } from './one-in-the-chamber-hud.js';

describe('oneInTheChamberStatus', () => {
  it('announces the single live pistol round', () => {
    expect(oneInTheChamberStatus('pistol', 1)).toBe('CHAMBER LOADED');
  });

  it('prompts the fighter to earn a round after a miss', () => {
    expect(oneInTheChamberStatus('punch', 0)).toBe('FISTS - EARN A ROUND');
    expect(oneInTheChamberStatus('pistol', 0)).toBe('FISTS - EARN A ROUND');
  });

  it('describes pending rounds during countdown and death', () => {
    expect(oneInTheChamberStatus('rifle', 0, false, false)).toBe(
      'ROUND LOADS ON FIGHT',
    );
    expect(oneInTheChamberStatus('rifle', 0, true, true)).toBe(
      'ROUND LOADS ON RESPAWN',
    );
  });
});
