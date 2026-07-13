import { describe, expect, it } from 'vitest';
import { scrapstormPresentation } from './scrapstorm-renderer.js';

const warning = {
  targetPosition: { x: 240, y: 144 },
  targetPlayerId: 'local',
  secondsUntilImpact: 1.5,
  radius: 96,
};

describe('Scrapstorm presentation', () => {
  it('hides throughout the quiet interval and without mutator state', () => {
    expect(scrapstormPresentation(null, 'local', 0).visible).toBe(false);
    expect(scrapstormPresentation({
      ...warning,
      targetPosition: null,
      targetPlayerId: null,
      secondsUntilImpact: null,
    }, 'local', 0).visible).toBe(false);
  });

  it('identifies only the captured local fighter for screen warning copy', () => {
    expect(scrapstormPresentation(warning, 'local', 0).targeted).toBe(true);
    expect(scrapstormPresentation(warning, 'rival', 0).targeted).toBe(false);
  });

  it('closes the progress arc toward impact while keeping a precise clock', () => {
    expect(scrapstormPresentation(warning, 'local', 0)).toMatchObject({
      progress: 0,
      countdown: '1.5S',
    });
    expect(scrapstormPresentation({
      ...warning,
      secondsUntilImpact: 0.25,
    }, 'local', 90).progress).toBeGreaterThan(0.8);
  });
});
