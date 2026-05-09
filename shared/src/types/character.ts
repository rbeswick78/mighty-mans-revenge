/**
 * 4-direction sprite facing. Sprite sheets ship one variant per cardinal
 * facing; continuous aim angle is bucketed into one of these by
 * `bucketAimAngle` (client-side, in rendering).
 */
export type Direction4 = 'up' | 'down' | 'side' | 'side-left';

export const DIRECTIONS: readonly Direction4[] = [
  'down',
  'up',
  'side',
  'side-left',
];

export interface FrameDim {
  w: number;
  h: number;
}

export type FramesByDirection = Record<Direction4, FrameDim>;

/**
 * Per-character metadata. Sprite assets live under
 * `client/public/assets/{assetFolder}/{assetBaseName}_{direction}_{state}.png`.
 * Animation keys derived as `${spritePrefix}_${direction}_${state}`.
 *
 * idleFrames / runFrames hold per-direction sprite-sheet frame dimensions
 * (each sheet is 6 frames laid horizontally; total sheet width = w * 6).
 */
export interface CharacterDef {
  readonly id: string;
  readonly displayName: string;
  readonly spritePrefix: string;
  readonly assetFolder: string;
  readonly assetBaseName: string;
  readonly idleFrames: FramesByDirection;
  readonly runFrames: FramesByDirection;
}
