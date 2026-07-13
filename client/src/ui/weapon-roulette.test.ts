import { describe, expect, it } from 'vitest';
import { weaponRouletteCallout } from './weapon-roulette.js';

describe('weaponRouletteCallout', () => {
  it('stays quiet until an active roulette weapon actually changes', () => {
    expect(weaponRouletteCallout(null, 'shotgun', true)).toBeNull();
    expect(weaponRouletteCallout('shotgun', 'shotgun', true)).toBeNull();
    expect(weaponRouletteCallout('shotgun', 'pistol', false)).toBeNull();
  });

  it('names every authoritative weapon transition with HUD-ready copy', () => {
    expect(weaponRouletteCallout('shotgun', 'pistol', true)).toBe('PISTOL!');
    expect(weaponRouletteCallout('pistol', 'punch', true)).toBe('FISTS!');
    expect(weaponRouletteCallout('punch', 'rifle', true)).toBe('RIFLE!');
    expect(weaponRouletteCallout('rifle', 'shotgun', true)).toBe('SHOTGUN!');
  });
});
