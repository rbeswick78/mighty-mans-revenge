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
 * idleFrames / runFrames hold per-direction sprite-sheet frame dimensions;
 * idleFrameCount / runFrameCount hold the number of horizontal frames per
 * sheet (total sheet width = w * frameCount). Frame counts vary by pack
 * character: the original roster ships 6-frame idles AND runs, while the
 * Zombie_Big / Zombie_Axe walk sheets are 8-frame.
 */
export interface CharacterDef {
  readonly id: string;
  readonly displayName: string;
  readonly spritePrefix: string;
  readonly assetFolder: string;
  readonly assetBaseName: string;
  readonly idleFrames: FramesByDirection;
  readonly runFrames: FramesByDirection;
  /** Horizontal frames per idle sheet (pack `-SheetN` suffix). */
  readonly idleFrameCount: number;
  /** Horizontal frames per run/walk sheet (pack `-SheetN` suffix). */
  readonly runFrameCount: number;
  /**
   * Whether to render the held-gun overlay and matching muzzle flash for
   * this character. Gameplay (bullets, damage) is identical regardless —
   * this is purely visual. Mighty Man uses `_no-hands` sprites that need
   * the overlay to fill in the weapon; Bruce's zombie sprite already shows
   * his hands, so an extra gun would look glued-on.
   */
  readonly hasGun: boolean;
  /**
   * Stat identity — what makes picking this character a real decision.
   * maxHealth is committed onto PlayerState when the character is locked;
   * speedMultiplier flows through the shared MovementModifiers (so client
   * prediction and server authority stay identical); hitbox is the
   * HIT-VALIDATION AABB only (bullets, pellets, fire breath, thrown axes).
   * Movement collision intentionally keeps PLAYER.HITBOX_* for everyone —
   * same rule as the big_heads mutator ("movement untouched") — so map
   * geometry plays identically for the whole roster.
   */
  readonly maxHealth: number;
  readonly speedMultiplier: number;
  readonly hitbox: { readonly width: number; readonly height: number };
}
