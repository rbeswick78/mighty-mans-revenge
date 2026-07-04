import { describe, it, expect } from 'vitest';
import {
  calculateDamage,
  calculateGrenadeDamage,
  isInBlastRadius,
} from './damage.js';
import { WEAPONS, GRENADE } from '../config/game.js';

const RIFLE = WEAPONS.rifle;

describe('calculateDamage', () => {
  it('defaults to the rifle profile at zero distance', () => {
    expect(calculateDamage(0)).toBeCloseTo(RIFLE.damageMax, 5);
  });

  it('returns max damage at min falloff range', () => {
    expect(calculateDamage(RIFLE.falloffRangeMin)).toBeCloseTo(RIFLE.damageMax, 5);
  });

  it('returns min damage at max falloff range', () => {
    expect(calculateDamage(RIFLE.falloffRangeMax)).toBeCloseTo(RIFLE.damageMin, 5);
  });

  it('returns min damage beyond max falloff range', () => {
    expect(calculateDamage(RIFLE.falloffRangeMax + 100)).toBeCloseTo(
      RIFLE.damageMin,
      5,
    );
  });

  it('linearly interpolates between min and max range', () => {
    const midRange =
      (RIFLE.falloffRangeMin + RIFLE.falloffRangeMax) / 2;
    const expectedDamage = (RIFLE.damageMax + RIFLE.damageMin) / 2;
    expect(calculateDamage(midRange)).toBeCloseTo(expectedDamage, 5);
  });

  it('returns damage between min and max for intermediate distance', () => {
    const dist = RIFLE.falloffRangeMin + 10;
    const dmg = calculateDamage(dist);
    expect(dmg).toBeLessThanOrEqual(RIFLE.damageMax);
    expect(dmg).toBeGreaterThanOrEqual(RIFLE.damageMin);
  });

  it('applies the shotgun profile per pellet when passed explicitly', () => {
    const SG = WEAPONS.shotgun;
    expect(calculateDamage(0, SG)).toBeCloseTo(SG.damageMax, 5);
    expect(calculateDamage(SG.falloffRangeMin, SG)).toBeCloseTo(SG.damageMax, 5);
    expect(calculateDamage(SG.falloffRangeMax, SG)).toBeCloseTo(SG.damageMin, 5);
    expect(calculateDamage(SG.falloffRangeMax + 500, SG)).toBeCloseTo(SG.damageMin, 5);
    const mid = (SG.falloffRangeMin + SG.falloffRangeMax) / 2;
    expect(calculateDamage(mid, SG)).toBeCloseTo((SG.damageMax + SG.damageMin) / 2, 5);
  });
});

describe('calculateGrenadeDamage', () => {
  it('returns full damage at center (distance 0)', () => {
    expect(calculateGrenadeDamage(0)).toBeCloseTo(GRENADE.DAMAGE, 5);
  });

  it('returns MIN_DAMAGE_FACTOR damage at blast radius', () => {
    expect(calculateGrenadeDamage(GRENADE.BLAST_RADIUS)).toBeCloseTo(
      GRENADE.DAMAGE * GRENADE.MIN_DAMAGE_FACTOR,
      5,
    );
  });

  it('returns zero damage beyond blast radius', () => {
    expect(calculateGrenadeDamage(GRENADE.BLAST_RADIUS + 50)).toBeCloseTo(0, 5);
  });

  it('returns the midpoint of full and edge damage at half blast radius', () => {
    const halfRadius = GRENADE.BLAST_RADIUS / 2;
    const expected = GRENADE.DAMAGE * (1 + GRENADE.MIN_DAMAGE_FACTOR) / 2;
    expect(calculateGrenadeDamage(halfRadius)).toBeCloseTo(expected, 5);
  });

  it('linearly falls off with distance', () => {
    const quarter = GRENADE.BLAST_RADIUS / 4;
    const expected = GRENADE.DAMAGE * (1 - 0.25 * (1 - GRENADE.MIN_DAMAGE_FACTOR));
    expect(calculateGrenadeDamage(quarter)).toBeCloseTo(expected, 5);
  });
});

describe('isInBlastRadius', () => {
  it('returns true for point inside blast radius', () => {
    expect(isInBlastRadius({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(true);
  });

  it('returns false for point outside blast radius', () => {
    const farAway = GRENADE.BLAST_RADIUS + 10;
    expect(isInBlastRadius({ x: 0, y: 0 }, { x: farAway, y: 0 })).toBe(false);
  });

  it('returns true for point exactly at blast radius', () => {
    expect(
      isInBlastRadius({ x: 0, y: 0 }, { x: GRENADE.BLAST_RADIUS, y: 0 }),
    ).toBe(true);
  });

  it('returns true for same position', () => {
    expect(isInBlastRadius({ x: 50, y: 50 }, { x: 50, y: 50 })).toBe(true);
  });

  it('handles diagonal distance correctly', () => {
    // Diagonal distance = sqrt(x^2 + y^2)
    const d = GRENADE.BLAST_RADIUS / Math.sqrt(2);
    expect(isInBlastRadius({ x: 0, y: 0 }, { x: d, y: d })).toBe(true);
  });
});
