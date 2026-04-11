import { describe, it, expect } from 'vitest';
import {
  calculateDamage,
  calculateGrenadeDamage,
  isInBlastRadius,
} from './damage.js';
import { GUN, GRENADE } from '../config/game.js';

describe('calculateDamage', () => {
  it('returns max damage at zero distance', () => {
    expect(calculateDamage(0)).toBeCloseTo(GUN.DAMAGE_MAX, 5);
  });

  it('returns max damage at min falloff range', () => {
    expect(calculateDamage(GUN.FALLOFF_RANGE_MIN)).toBeCloseTo(GUN.DAMAGE_MAX, 5);
  });

  it('returns min damage at max falloff range', () => {
    expect(calculateDamage(GUN.FALLOFF_RANGE_MAX)).toBeCloseTo(GUN.DAMAGE_MIN, 5);
  });

  it('returns min damage beyond max falloff range', () => {
    expect(calculateDamage(GUN.FALLOFF_RANGE_MAX + 100)).toBeCloseTo(
      GUN.DAMAGE_MIN,
      5,
    );
  });

  it('linearly interpolates between min and max range', () => {
    const midRange =
      (GUN.FALLOFF_RANGE_MIN + GUN.FALLOFF_RANGE_MAX) / 2;
    const expectedDamage = (GUN.DAMAGE_MAX + GUN.DAMAGE_MIN) / 2;
    expect(calculateDamage(midRange)).toBeCloseTo(expectedDamage, 5);
  });

  it('returns damage between min and max for intermediate distance', () => {
    const dist = GUN.FALLOFF_RANGE_MIN + 10;
    const dmg = calculateDamage(dist);
    expect(dmg).toBeLessThanOrEqual(GUN.DAMAGE_MAX);
    expect(dmg).toBeGreaterThanOrEqual(GUN.DAMAGE_MIN);
  });
});

describe('calculateGrenadeDamage', () => {
  it('returns full damage at center (distance 0)', () => {
    expect(calculateGrenadeDamage(0)).toBeCloseTo(GRENADE.DAMAGE, 5);
  });

  it('returns zero damage at blast radius', () => {
    expect(calculateGrenadeDamage(GRENADE.BLAST_RADIUS)).toBeCloseTo(0, 5);
  });

  it('returns zero damage beyond blast radius', () => {
    expect(calculateGrenadeDamage(GRENADE.BLAST_RADIUS + 50)).toBeCloseTo(0, 5);
  });

  it('returns half damage at half blast radius', () => {
    const halfRadius = GRENADE.BLAST_RADIUS / 2;
    expect(calculateGrenadeDamage(halfRadius)).toBeCloseTo(GRENADE.DAMAGE / 2, 5);
  });

  it('linearly falls off with distance', () => {
    const quarter = GRENADE.BLAST_RADIUS / 4;
    const expectedDamage = GRENADE.DAMAGE * 0.75;
    expect(calculateGrenadeDamage(quarter)).toBeCloseTo(expectedDamage, 5);
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
