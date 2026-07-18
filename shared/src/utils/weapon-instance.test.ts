import { describe, expect, it } from 'vitest';
import { WEAPON_RARITY } from '../config/game.js';
import { WEAPON_RARITIES } from '../types/weapon.js';
import {
  applyWeaponRarityDamage,
  createWeaponInstance,
  normalizeWeaponInstance,
  rollWeaponRarity,
} from './weapon-instance.js';

describe('Battle Royale weapon instances', () => {
  it('keeps the locked weights and multiplier order exact', () => {
    expect(WEAPON_RARITIES.map((rarity) => WEAPON_RARITY[rarity].weight)).toEqual([
      0.1, 0.7, 0.1, 0.06, 0.03, 0.01,
    ]);
    expect(WEAPON_RARITIES.map((rarity) => WEAPON_RARITY[rarity].damageMultiplier)).toEqual([
      0.8, 0.9, 1, 1.1, 1.2, 1.3,
    ]);
  });

  it.each([
    [0, 'common'],
    [0.099999, 'common'],
    [0.1, 'uncommon'],
    [0.799999, 'uncommon'],
    [0.8, 'rare'],
    [0.9, 'epic'],
    [0.96, 'legendary'],
    [0.99, 'mythical'],
    [0.999999, 'mythical'],
  ] as const)('maps roll %s to %s', (roll, rarity) => {
    expect(rollWeaponRarity(roll)).toBe(rarity);
  });

  it('rejects invalid rolls and malformed or non-arsenal instances', () => {
    expect(rollWeaponRarity(-1)).toBeNull();
    expect(rollWeaponRarity(1)).toBeNull();
    expect(rollWeaponRarity(Number.NaN)).toBeNull();
    expect(
      normalizeWeaponInstance({ instanceId: 'bad space', weaponId: 'smg', rarity: 'rare' }),
    ).toBeNull();
    expect(
      normalizeWeaponInstance({ instanceId: 'ok', weaponId: 'bat', rarity: 'rare' }),
    ).toBeNull();
    expect(
      normalizeWeaponInstance({ instanceId: 'ok', weaponId: 'smg', rarity: 'ultra' }),
    ).toBeNull();
  });

  it('creates a frozen immutable identity and scales damage only', () => {
    const instance = createWeaponInstance('weapon:match-42:7', 'sniper_rifle', 0.905);
    expect(instance).toEqual({
      instanceId: 'weapon:match-42:7',
      weaponId: 'sniper_rifle',
      rarity: 'epic',
    });
    expect(Object.isFrozen(instance)).toBe(true);
    expect(applyWeaponRarityDamage(25, 'common')).toBe(20);
    expect(applyWeaponRarityDamage(25, 'mythical')).toBe(32.5);
    expect(applyWeaponRarityDamage(Number.NaN, 'rare')).toBe(0);
  });
});
