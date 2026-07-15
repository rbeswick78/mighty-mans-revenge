import { describe, expect, it } from 'vitest';

import { healthStatusLabel, sprintPresentation } from './vitality-presentation.js';

describe('healthStatusLabel', () => {
  it('names current health, capacity, and an optional armor reserve', () => {
    expect(healthStatusLabel(76.2, 100, 0)).toBe('HP  77/100');
    expect(healthStatusLabel(41.1, 115, 12.2)).toBe('HP  42/115  ARM 13');
  });

  it('keeps malformed values inside a safe readable range', () => {
    expect(healthStatusLabel(Number.NaN, 0, Number.POSITIVE_INFINITY)).toBe('HP  0/1');
    expect(healthStatusLabel(200, 100, -4)).toBe('HP  100/100');
  });
});

describe('sprintPresentation', () => {
  it('spells out ready, draining, scarce, and empty sprint states', () => {
    expect(sprintPresentation(3, 3)).toEqual({
      label: 'SPRINT  READY',
      ratio: 1,
      tone: 'normal',
    });
    expect(sprintPresentation(1.5, 3)).toEqual({
      label: 'SPRINT  50%',
      ratio: 0.5,
      tone: 'normal',
    });
    const scarce = sprintPresentation(0.6, 3);
    expect(scarce).toMatchObject({
      label: 'SPRINT  20%',
      tone: 'warning',
    });
    expect(scarce.ratio).toBeCloseTo(0.2);
    expect(sprintPresentation(2.99, 3).label).toBe('SPRINT  99%');
    expect(sprintPresentation(0, 3)).toEqual({
      label: 'SPRINT  EMPTY',
      ratio: 0,
      tone: 'danger',
    });
  });
});
