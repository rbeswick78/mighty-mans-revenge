import { describe, expect, it } from 'vitest';
import { WEAPON_RARITIES } from '@shared/types/weapon.js';
import { weaponRarityPresentation } from './weapon-rarity-presentation.js';

describe('weaponRarityPresentation', () => {
  it('keeps all six tiers distinct by label, shape, and color', () => {
    const values = WEAPON_RARITIES.map(weaponRarityPresentation);
    expect(new Set(values.map((value) => value.label)).size).toBe(6);
    expect(new Set(values.map((value) => value.glyph)).size).toBe(6);
    expect(new Set(values.map((value) => value.color)).size).toBe(6);
  });
});
