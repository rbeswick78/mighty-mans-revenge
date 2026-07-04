import { describe, it, expect } from 'vitest';
import { computePelletAngles, evenFanAngles } from './pellet-spread.js';
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

describe('evenFanAngles', () => {
  const { pelletCount, spreadAngle } = WEAPONS.punch;

  it('returns exactly count angles spanning the full arc', () => {
    const angles = evenFanAngles(1.0, pelletCount, spreadAngle);
    expect(angles).toHaveLength(pelletCount);
    expect(angles[0]).toBeCloseTo(1.0 - spreadAngle / 2, 12);
    expect(angles[angles.length - 1]).toBeCloseTo(1.0 + spreadAngle / 2, 12);
  });

  it('spaces rays uniformly (no jitter, no gaps wider than spacing)', () => {
    const angles = evenFanAngles(0, pelletCount, spreadAngle);
    const spacing = spreadAngle / (pelletCount - 1);
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(spacing, 12);
    }
  });

  it('is exactly centred on the aim angle', () => {
    const angles = evenFanAngles(2.0, pelletCount, spreadAngle);
    const mid = (angles[0] + angles[angles.length - 1]) / 2;
    expect(mid).toBeCloseTo(2.0, 12);
  });

  it("the punch fan can't gap past a 24px hitbox at max range", () => {
    // Arc-length between adjacent rays at the punch's reach must stay
    // under the smallest character hitbox width, or a point-blank swing
    // could whiff straight through a target standing dead ahead.
    const { maxRange } = WEAPONS.punch;
    const spacing = spreadAngle / (pelletCount - 1);
    expect(spacing * (maxRange ?? 0)).toBeLessThan(24);
  });

  it('collapses to the aim angle for degenerate fans', () => {
    expect(evenFanAngles(0.7, 1, 2)).toEqual([0.7]);
    expect(evenFanAngles(0.7, 5, 0)).toEqual([0.7]);
  });
});
