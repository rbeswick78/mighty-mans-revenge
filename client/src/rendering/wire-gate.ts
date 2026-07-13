/** Presentation contract for the seven-frame wire-gate asset. */
export const WIRE_GATE_TEXTURE_KEY = 'tiles_wire_fence_closing';
export const WIRE_GATE_OPEN_ANIMATION_KEY = 'wire_gate_open';
export const WIRE_GATE_OPEN_FRAME = 0;
export const WIRE_GATE_CLOSED_FRAME = 6;
export const WIRE_GATE_FRAME_WIDTH = 21;
export const WIRE_GATE_FRAME_HEIGHT = 22;
export const WIRE_GATE_OPEN_FPS = 18;

/** The source strip closes from frame 0 to 6; gameplay opens it in reverse. */
export const WIRE_GATE_OPENING_FRAMES = Object.freeze(
  Array.from(
    { length: WIRE_GATE_CLOSED_FRAME - WIRE_GATE_OPEN_FRAME + 1 },
    (_, index) => WIRE_GATE_CLOSED_FRAME - index,
  ),
);

/** Fit the slightly tall source frame inside one world tile. */
export function wireGateScale(tileSize: number): number {
  return tileSize / WIRE_GATE_FRAME_HEIGHT;
}
