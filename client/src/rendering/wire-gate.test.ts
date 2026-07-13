import { describe, expect, it } from 'vitest';
import {
  WIRE_GATE_CLOSED_FRAME,
  WIRE_GATE_OPEN_FRAME,
  WIRE_GATE_OPENING_FRAMES,
  wireGateScale,
} from './wire-gate.js';

describe('wire gate presentation', () => {
  it('opens by playing every source frame from closed to open', () => {
    expect(WIRE_GATE_OPENING_FRAMES).toEqual([6, 5, 4, 3, 2, 1, 0]);
    expect(WIRE_GATE_OPENING_FRAMES[0]).toBe(WIRE_GATE_CLOSED_FRAME);
    expect(WIRE_GATE_OPENING_FRAMES.at(-1)).toBe(WIRE_GATE_OPEN_FRAME);
  });

  it('fits the 22px-tall art exactly inside one map tile', () => {
    expect(wireGateScale(48) * 22).toBe(48);
    expect(wireGateScale(48) * 21).toBeLessThan(48);
  });
});
