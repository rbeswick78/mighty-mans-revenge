import { describe, expect, it } from 'vitest';
import {
  BAT_ASSET_AIM_OFFSET,
  batDurabilityLabel,
  batHeldRotation,
  batSwingRotations,
} from './bat-presentation.js';

describe('bat presentation', () => {
  it('rotates the bottom-right handle art so its head follows aim', () => {
    expect(batHeldRotation(0)).toBeCloseTo(BAT_ASSET_AIM_OFFSET, 10);
    expect(batHeldRotation(Math.PI / 2)).toBeCloseTo(
      Math.PI / 2 + BAT_ASSET_AIM_OFFSET,
      10,
    );
  });

  it('builds a centered, deterministic heavy sweep', () => {
    const swing = batSwingRotations(-0.4);
    expect(swing.rest).toBeCloseTo(batHeldRotation(-0.4), 10);
    expect(swing.rest - swing.from).toBeCloseTo(swing.to - swing.rest, 10);
    expect(batSwingRotations(-0.4)).toEqual(swing);
  });

  it('formats remaining swings for the compact HUD row', () => {
    expect(batDurabilityLabel(4)).toBe('X4');
    expect(batDurabilityLabel(1.9)).toBe('X1');
    expect(batDurabilityLabel(-2)).toBe('X0');
  });
});
