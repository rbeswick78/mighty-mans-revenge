/** The source sprite points from its bottom-right handle toward top-left. */
export const BAT_ASSET_AIM_OFFSET = (3 * Math.PI) / 4;

/** Phaser rotation that points the bat's striking end along the aim angle. */
export function batHeldRotation(aimAngle: number): number {
  return aimAngle + BAT_ASSET_AIM_OFFSET;
}

/** Compact pixel-font copy for the special-weapon HUD row. */
export function batDurabilityLabel(swings: number): string {
  return `X${Math.max(0, Math.floor(swings))}`;
}

/** Deterministic heavy sweep around the authoritative swing direction. */
export function batSwingRotations(aimAngle: number): {
  from: number;
  to: number;
  rest: number;
} {
  const rest = batHeldRotation(aimAngle);
  return {
    from: rest - 0.62,
    to: rest + 0.62,
    rest,
  };
}
