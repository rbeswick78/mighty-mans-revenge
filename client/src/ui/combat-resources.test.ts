import { describe, expect, it } from 'vitest';

import { grenadePresentation, rifleAmmoPresentation } from './combat-resources.js';

describe('rifleAmmoPresentation', () => {
  it('labels the weapon and turns low, empty, and reloading states into glanceable warnings', () => {
    expect(rifleAmmoPresentation(30, 30, false)).toEqual({
      label: 'RIFLE  30/30',
      tone: 'normal',
    });
    expect(rifleAmmoPresentation(7, 30, false)).toEqual({
      label: 'RIFLE  7/30',
      tone: 'warning',
    });
    expect(rifleAmmoPresentation(0, 30, false)).toEqual({
      label: 'RIFLE  0/30',
      tone: 'danger',
    });
    expect(rifleAmmoPresentation(0, 30, true)).toEqual({
      label: 'RIFLE  RELOADING',
      tone: 'warning',
    });
  });
});

describe('grenadePresentation', () => {
  it('spells out ready, scarce, live, and disabled grenade states', () => {
    expect(grenadePresentation(false, 3, false)).toEqual({
      label: 'GRENADES  3',
      tone: 'normal',
    });
    expect(grenadePresentation(false, 1, false)).toEqual({
      label: 'GRENADES  1',
      tone: 'warning',
    });
    expect(grenadePresentation(false, 0, false)).toEqual({
      label: 'GRENADES  0',
      tone: 'danger',
    });
    expect(grenadePresentation(true, 2, false)).toEqual({
      label: 'GRENADE  LIVE',
      tone: 'live',
    });
    expect(grenadePresentation(true, 2, true)).toEqual({
      label: 'GRENADES  OFF',
      tone: 'disabled',
    });
  });
});
