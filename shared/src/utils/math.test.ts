import { describe, it, expect } from 'vitest';
import {
  vecAdd,
  vecSub,
  vecScale,
  vecNormalize,
  vecLength,
  vecDistance,
  vecLerp,
  vecAngle,
  vecFromAngle,
  clamp,
  lerpNumber,
} from './math.js';

describe('vecAdd', () => {
  it('adds two positive vectors', () => {
    const result = vecAdd({ x: 1, y: 2 }, { x: 3, y: 4 });
    expect(result).toEqual({ x: 4, y: 6 });
  });

  it('adds negative vectors', () => {
    const result = vecAdd({ x: -1, y: -2 }, { x: -3, y: -4 });
    expect(result).toEqual({ x: -4, y: -6 });
  });

  it('adds zero vectors', () => {
    const result = vecAdd({ x: 0, y: 0 }, { x: 0, y: 0 });
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('adds mixed sign vectors', () => {
    const result = vecAdd({ x: 5, y: -3 }, { x: -2, y: 7 });
    expect(result).toEqual({ x: 3, y: 4 });
  });
});

describe('vecSub', () => {
  it('subtracts two vectors', () => {
    const result = vecSub({ x: 5, y: 7 }, { x: 3, y: 2 });
    expect(result).toEqual({ x: 2, y: 5 });
  });

  it('subtracting same vector yields zero', () => {
    const result = vecSub({ x: 3, y: 4 }, { x: 3, y: 4 });
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('subtracts negative vectors', () => {
    const result = vecSub({ x: 1, y: 2 }, { x: -3, y: -4 });
    expect(result).toEqual({ x: 4, y: 6 });
  });
});

describe('vecScale', () => {
  it('scales by a positive scalar', () => {
    const result = vecScale({ x: 2, y: 3 }, 4);
    expect(result).toEqual({ x: 8, y: 12 });
  });

  it('scales by a negative scalar', () => {
    const result = vecScale({ x: 2, y: 3 }, -1);
    expect(result).toEqual({ x: -2, y: -3 });
  });

  it('scales by zero', () => {
    const result = vecScale({ x: 100, y: 200 }, 0);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('scales by fractional scalar', () => {
    const result = vecScale({ x: 10, y: 20 }, 0.5);
    expect(result).toEqual({ x: 5, y: 10 });
  });
});

describe('vecNormalize', () => {
  it('normalizes a unit vector along x', () => {
    const result = vecNormalize({ x: 5, y: 0 });
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('normalizes a unit vector along y', () => {
    const result = vecNormalize({ x: 0, y: -3 });
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(-1, 10);
  });

  it('returns zero vector for zero input', () => {
    const result = vecNormalize({ x: 0, y: 0 });
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('normalizes a non-unit vector to length 1', () => {
    const result = vecNormalize({ x: 3, y: 4 });
    expect(result.x).toBeCloseTo(0.6, 10);
    expect(result.y).toBeCloseTo(0.8, 10);
    const len = Math.sqrt(result.x * result.x + result.y * result.y);
    expect(len).toBeCloseTo(1, 10);
  });

  it('normalizes a diagonal vector', () => {
    const result = vecNormalize({ x: 1, y: 1 });
    const expected = 1 / Math.sqrt(2);
    expect(result.x).toBeCloseTo(expected, 10);
    expect(result.y).toBeCloseTo(expected, 10);
  });
});

describe('vecLength', () => {
  it('returns 0 for zero vector', () => {
    expect(vecLength({ x: 0, y: 0 })).toBe(0);
  });

  it('returns correct length for 3-4-5 triangle', () => {
    expect(vecLength({ x: 3, y: 4 })).toBeCloseTo(5, 10);
  });

  it('returns correct length for unit axes', () => {
    expect(vecLength({ x: 1, y: 0 })).toBeCloseTo(1, 10);
    expect(vecLength({ x: 0, y: 1 })).toBeCloseTo(1, 10);
  });

  it('handles negative components', () => {
    expect(vecLength({ x: -3, y: -4 })).toBeCloseTo(5, 10);
  });
});

describe('vecDistance', () => {
  it('returns 0 for same point', () => {
    expect(vecDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('returns correct distance for known points', () => {
    expect(vecDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 10);
  });

  it('is symmetric', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 4, y: 6 };
    expect(vecDistance(a, b)).toBeCloseTo(vecDistance(b, a), 10);
  });

  it('works with negative coordinates', () => {
    expect(vecDistance({ x: -1, y: -1 }, { x: 2, y: 3 })).toBeCloseTo(5, 10);
  });
});

describe('vecLerp', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 20 };

  it('returns a at t=0', () => {
    const result = vecLerp(a, b, 0);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('returns b at t=1', () => {
    const result = vecLerp(a, b, 1);
    expect(result.x).toBeCloseTo(10, 10);
    expect(result.y).toBeCloseTo(20, 10);
  });

  it('returns midpoint at t=0.5', () => {
    const result = vecLerp(a, b, 0.5);
    expect(result.x).toBeCloseTo(5, 10);
    expect(result.y).toBeCloseTo(10, 10);
  });

  it('clamps t below 0 to 0', () => {
    const result = vecLerp(a, b, -5);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('clamps t above 1 to 1', () => {
    const result = vecLerp(a, b, 2);
    expect(result.x).toBeCloseTo(10, 10);
    expect(result.y).toBeCloseTo(20, 10);
  });
});

describe('vecAngle', () => {
  it('returns 0 for rightward vector', () => {
    expect(vecAngle({ x: 1, y: 0 })).toBeCloseTo(0, 10);
  });

  it('returns PI/2 for downward vector', () => {
    expect(vecAngle({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 10);
  });

  it('returns PI for leftward vector', () => {
    expect(vecAngle({ x: -1, y: 0 })).toBeCloseTo(Math.PI, 10);
  });

  it('returns -PI/2 for upward vector', () => {
    expect(vecAngle({ x: 0, y: -1 })).toBeCloseTo(-Math.PI / 2, 10);
  });
});

describe('vecFromAngle', () => {
  it('returns rightward vector for angle 0', () => {
    const result = vecFromAngle(0);
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('returns downward vector for angle PI/2', () => {
    const result = vecFromAngle(Math.PI / 2);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(1, 10);
  });

  it('returns leftward vector for angle PI', () => {
    const result = vecFromAngle(Math.PI);
    expect(result.x).toBeCloseTo(-1, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('is inverse of vecAngle', () => {
    const angle = Math.PI / 4;
    const v = vecFromAngle(angle);
    expect(vecAngle(v)).toBeCloseTo(angle, 10);
  });
});

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('returns min when below range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('returns max when above range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe('lerpNumber', () => {
  it('returns a at t=0', () => {
    expect(lerpNumber(10, 20, 0)).toBeCloseTo(10, 10);
  });

  it('returns b at t=1', () => {
    expect(lerpNumber(10, 20, 1)).toBeCloseTo(20, 10);
  });

  it('returns midpoint at t=0.5', () => {
    expect(lerpNumber(10, 20, 0.5)).toBeCloseTo(15, 10);
  });

  it('clamps t below 0', () => {
    expect(lerpNumber(10, 20, -1)).toBeCloseTo(10, 10);
  });

  it('clamps t above 1', () => {
    expect(lerpNumber(10, 20, 5)).toBeCloseTo(20, 10);
  });

  it('works with negative numbers', () => {
    expect(lerpNumber(-10, 10, 0.5)).toBeCloseTo(0, 10);
  });
});
