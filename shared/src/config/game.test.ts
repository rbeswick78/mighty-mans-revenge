import { describe, it, expect } from 'vitest';
import {
  CHARACTERS,
  CHARACTER_IDS,
  WEAPONS,
  WEAPON_IDS,
  PICKUP,
  type CharacterId,
  type WeaponId,
} from './game.js';
import { DIRECTIONS } from '../types/character.js';

describe('CHARACTERS registry', () => {
  it('contains at least mighty_man and bruce', () => {
    expect(Object.keys(CHARACTERS).length).toBeGreaterThanOrEqual(2);
    expect(CHARACTERS).toHaveProperty('mighty_man');
    expect(CHARACTERS).toHaveProperty('bruce');
  });

  it('every entry has the required string fields', () => {
    for (const [key, def] of Object.entries(CHARACTERS)) {
      expect(typeof def.id).toBe('string');
      expect(typeof def.displayName).toBe('string');
      expect(typeof def.spritePrefix).toBe('string');
      expect(typeof def.assetFolder).toBe('string');
      expect(typeof def.assetBaseName).toBe('string');

      expect(def.id.length).toBeGreaterThan(0);
      expect(def.displayName.length).toBeGreaterThan(0);
      expect(def.spritePrefix.length).toBeGreaterThan(0);
      expect(def.assetFolder.length).toBeGreaterThan(0);
      expect(def.assetBaseName.length).toBeGreaterThan(0);

      // The entry's id must match its key in the registry.
      expect(def.id).toBe(key);
    }
  });

  it('every entry has idleFrames and runFrames for all four directions with positive dimensions', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(def.idleFrames).toBeDefined();
      expect(def.runFrames).toBeDefined();

      for (const dir of DIRECTIONS) {
        const idle = def.idleFrames[dir];
        const run = def.runFrames[dir];

        expect(idle, `${def.id} missing idle frame for ${dir}`).toBeDefined();
        expect(run, `${def.id} missing run frame for ${dir}`).toBeDefined();

        expect(idle.w).toBeGreaterThan(0);
        expect(idle.h).toBeGreaterThan(0);
        expect(run.w).toBeGreaterThan(0);
        expect(run.h).toBeGreaterThan(0);
      }
    }
  });

  it('CHARACTER_IDS contains exactly the keys of CHARACTERS', () => {
    const keys = Object.keys(CHARACTERS) as CharacterId[];
    expect([...CHARACTER_IDS].sort()).toEqual([...keys].sort());
    expect(CHARACTER_IDS.length).toBe(keys.length);
  });

  it('every entry declares a hasGun boolean', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(typeof def.hasGun).toBe('boolean');
    }
  });

  it('CHARACTERS is frozen', () => {
    expect(Object.isFrozen(CHARACTERS)).toBe(true);
  });
});

describe('WEAPONS registry', () => {
  it('contains the rifle and the shotgun', () => {
    expect(WEAPONS).toHaveProperty('rifle');
    expect(WEAPONS).toHaveProperty('shotgun');
  });

  it('WEAPON_IDS contains exactly the keys of WEAPONS', () => {
    const keys = Object.keys(WEAPONS) as WeaponId[];
    expect([...WEAPON_IDS].sort()).toEqual([...keys].sort());
  });

  it('every entry has coherent tuning values', () => {
    for (const [key, def] of Object.entries(WEAPONS)) {
      expect(def.id).toBe(key);
      expect(def.displayName.length).toBeGreaterThan(0);
      expect(def.damageMin).toBeGreaterThan(0);
      expect(def.damageMax).toBeGreaterThanOrEqual(def.damageMin);
      expect(def.falloffRangeMin).toBeGreaterThan(0);
      expect(def.falloffRangeMax).toBeGreaterThan(def.falloffRangeMin);
      expect(def.burstSize).toBeGreaterThanOrEqual(1);
      expect(def.burstInterval).toBeGreaterThanOrEqual(0);
      expect(def.magazineSize).toBeGreaterThan(0);
      expect(def.reloadTime).toBeGreaterThan(0);
      expect(def.pelletCount).toBeGreaterThanOrEqual(1);
      expect(def.spreadAngle).toBeGreaterThanOrEqual(0);
      expect(def.fireCooldown).toBeGreaterThanOrEqual(0);
      expect(def.pickupAmmo).toBeGreaterThanOrEqual(0);
    }
  });

  it('rifle keeps the pre-weapon-system tuning (regression)', () => {
    const r = WEAPONS.rifle;
    expect(r.damageMin).toBe(8);
    expect(r.damageMax).toBe(25);
    expect(r.falloffRangeMin).toBe(64);
    expect(r.falloffRangeMax).toBe(400);
    expect(r.burstSize).toBe(3);
    expect(r.burstInterval).toBeCloseTo(0.15, 10);
    expect(r.magazineSize).toBe(30);
    expect(r.reloadTime).toBeCloseTo(2.0, 10);
    expect(r.pelletCount).toBe(1);
    expect(r.spreadAngle).toBe(0);
    expect(r.fireCooldown).toBe(0);
  });

  it('a shotgun weapon pickup fills the magazine plus a non-negative reserve', () => {
    const s = WEAPONS.shotgun;
    expect(s.pickupAmmo).toBeGreaterThanOrEqual(s.magazineSize);
  });

  it('weapon announce lead fits inside the weapon respawn cycle', () => {
    expect(PICKUP.WEAPON_ANNOUNCE_LEAD).toBeLessThan(PICKUP.WEAPON_RESPAWN_TIME);
  });

  it('WEAPONS and every entry are frozen', () => {
    expect(Object.isFrozen(WEAPONS)).toBe(true);
    for (const def of Object.values(WEAPONS)) {
      expect(Object.isFrozen(def)).toBe(true);
    }
  });
});
