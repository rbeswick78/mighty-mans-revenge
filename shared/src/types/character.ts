/**
 * 4-direction sprite facing. Sprite sheets ship one variant per cardinal
 * facing; continuous aim angle is bucketed into one of these by
 * `bucketAimAngle` (client-side, in rendering).
 */
export type Direction4 = 'up' | 'down' | 'side' | 'side-left';

/** Death sheets in the asset pack only ship horizontal facings. */
export type DeathDirection = Extract<Direction4, 'side' | 'side-left'>;

export const DIRECTIONS: readonly Direction4[] = [
  'down',
  'up',
  'side',
  'side-left',
];

export const DEATH_DIRECTIONS: readonly DeathDirection[] = [
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
  /**
   * Melee attack sheets (the Gun Game punch rung). Body-level animation
   * states — unlike gun overlays these replace the body sprite for the
   * swing. Frame counts vary wildly across pack characters (4/4/8/7), so
   * the client normalizes playback to a fixed swing duration rather than
   * a fixed FPS.
   */
  readonly attackFrames: FramesByDirection;
  /** Horizontal first-death sheets, held on their final frame until respawn. */
  readonly deathFrames: Record<DeathDirection, FrameDim>;
  /** Horizontal frames per idle sheet (pack `-SheetN` suffix). */
  readonly idleFrameCount: number;
  /** Horizontal frames per run/walk sheet (pack `-SheetN` suffix). */
  readonly runFrameCount: number;
  /** Horizontal frames per attack sheet (pack `-SheetN` suffix). */
  readonly attackFrameCount: number;
  /** Horizontal frames per death sheet. */
  readonly deathFrameCount: number;
  /**
   * Whether to render the held-gun overlay and matching muzzle flash for
   * this character. Gameplay (bullets, damage) is identical regardless —
   * this is purely visual. Mighty Man uses `_no-hands` sprites that need
   * the overlay to fill in the weapon; Bruce's zombie sprite already shows
   * his hands, so an extra gun would look glued-on.
   */
  readonly hasGun: boolean;
  /**
   * Optional alternate body sheet set (same idle/run/attack states and the
   * SAME frame counts as the base sheets, but its own frame dimensions —
   * pack variants are cropped differently). Loaded by BootScene alongside
   * the base set; the renderer swaps `spritePrefix` at runtime. Purely
   * cosmetic — the server ignores this entirely. v1 use: Jack's no-axe
   * body while his thrown axe is in flight / on cooldown.
   */
  readonly altBody?: {
    readonly spritePrefix: string;
    readonly assetBaseName: string;
    readonly idleFrames: FramesByDirection;
    readonly runFrames: FramesByDirection;
    readonly attackFrames: FramesByDirection;
    readonly deathFrames: Record<DeathDirection, FrameDim>;
    readonly deathFrameCount: number;
  };
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
