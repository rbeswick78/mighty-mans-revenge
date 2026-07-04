import { describe, it, expect } from 'vitest';
import { computePelletAngles } from './pellet-spread.js';
import { WEAPONS } from '../config/game.js';

describe('computePelletAngles', () => {
  const { pelletCount, spreadAngle } = WEAPONS.shotgun;

  it('is deterministic: identical inputs produce identical angles', () => {
    const a = computePelletAngles(1.25, pelletCount, spreadAngle, 42);
    const b = computePelletAngles(1.25, pelletCount, spreadAngle, 42);
    expect(a).toEqual(b);
  });

  it('different seeds produce different jitter', () => {
    const a = computePelletAngles(1.25, pelletCount, spreadAngle, 42);
    const b = computePelletAngles(1.25, pelletCount, spreadAngle, 43);
    expect(a).not.toEqual(b);
  });

  it('returns exactly pelletCount angles', () => {
    expect(computePelletAngles(0, pelletCount, spreadAngle, 1)).toHaveLength(
      pelletCount,
    );
  });

  it('keeps every pellet inside the declared spread arc', () => {
    for (const seed of [0, 1, 7, 1234, 999999]) {
      const angles = computePelletAngles(0.5, pelletCount, spreadAngle, seed);
      for (const angle of angles) {
        expect(angle).toBeGreaterThanOrEqual(0.5 - spreadAngle / 2 - 1e-9);
        expect(angle).toBeLessThanOrEqual(0.5 + spreadAngle / 2 + 1e-9);
      }
    }
  });

  it('pellets stay ordered (jitter never crosses neighbours)', () => {
    for (const seed of [0, 5, 77, 31337]) {
      const angles = computePelletAngles(0, pelletCount, spreadAngle, seed);
      for (let i = 1; i < angles.length; i++) {
        expect(angles[i]).toBeGreaterThan(angles[i - 1]);
      }
    }
  });

  it('collapses to the aim angle for single-pellet weapons', () => {
    expect(computePelletAngles(0.7, 1, 0, 9)).toEqual([0.7]);
    expect(
      computePelletAngles(0.7, WEAPONS.rifle.pelletCount, WEAPONS.rifle.spreadAngle, 9),
    ).toEqual([0.7]);
  });

  it('centres the fan on the aim angle', () => {
    const angles = computePelletAngles(2.0, pelletCount, spreadAngle, 3);
    const mid = (angles[0] + angles[angles.length - 1]) / 2;
    // First and last pellet jitter independently, so the midpoint is close
    // to (not exactly) the aim angle.
    expect(Math.abs(mid - 2.0)).toBeLessThan(spreadAngle / 4);
  });
});
