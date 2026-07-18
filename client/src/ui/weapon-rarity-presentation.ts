import type { WeaponRarity } from '@shared/types/weapon.js';

const PRESENTATION: Readonly<Record<WeaponRarity, { glyph: string; color: string }>> =
  Object.freeze({
    common: Object.freeze({ glyph: '•', color: '#9babb2' }),
    uncommon: Object.freeze({ glyph: '▁', color: '#91db69' }),
    rare: Object.freeze({ glyph: '◌', color: '#4d9be6' }),
    epic: Object.freeze({ glyph: '◆', color: '#a884f3' }),
    legendary: Object.freeze({ glyph: '♛', color: '#f79617' }),
    mythical: Object.freeze({ glyph: '»', color: '#e83b3b' }),
  });

export function weaponRarityPresentation(rarity: WeaponRarity): Readonly<{
  label: string;
  glyph: string;
  color: string;
}> {
  return Object.freeze({
    label: rarity.toUpperCase(),
    ...PRESENTATION[rarity],
  });
}
