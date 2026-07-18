import { TileType } from '@shared/types/map.js';

/**
 * Map visual themes + the pure auto-tiling logic behind them. No Phaser
 * imports here — everything is plain data/functions so it can be unit
 * tested. MapRenderer resolves a MapData's optional `theme` id through
 * getTheme() and renders with the returned texture keys + frame pickers.
 *
 * Tile source sheets (loaded in boot-scene.ts, all 16×16 frames):
 *  - tiles_bleak / tiles_green / tiles_dark_green: 24×17 = 408 frames.
 *    Identical layouts (palette swaps of the same art), so variant frame
 *    indices are shared across all three.
 *  - tiles_brick:      6×3 = 18 frames — outer (perimeter) walls.
 *  - tiles_iron_fence: 3×4 = 12 frames — directional inner walls.
 *  - tiles_roof:       16×5 = 80 frames — corrugated roof/container walls.
 *    Columns 0-2 are the dark set, columns 8-10 the red set (+8 offset).
 *  - tiles_garbage:    8×4 = 32 frames — garbage-pile cover accents.
 *  - cover_*:          16×14 single-frame barricades — readable low cover.
 */

// ────────────────────────── variant picking ──────────────────────────

/**
 * Deterministic per-cell variant picker. Same (row, col) → same index
 * across renders so the map is stable. Multiplicative hash with two
 * large primes XOR'd gives well-distributed indices for the small N
 * variant counts we use here. `>>> 0` coerces the signed XOR result
 * to uint32 before modulo so the index is always non-negative.
 */
export function pickVariant(variants: readonly number[], row: number, col: number): number {
  if (variants.length === 1) return variants[0];
  const h = (col * 73856093) ^ (row * 19349663);
  return variants[(h >>> 0) % variants.length];
}

export type TileGrid = readonly (readonly number[])[];

/**
 * Orient a barricade along the strongest neighboring COVER_LOW axis.
 * Corners, blocks, and isolated cells use the stable cell hash so repeated
 * renders agree without making every ambiguous prop face the same way.
 */
export function coverBarricadeAngle(
  tiles: TileGrid,
  h: number,
  w: number,
  row: number,
  col: number,
): 0 | 90 {
  const isCover = (r: number, c: number): boolean =>
    r >= 0 && r < h && c >= 0 && c < w && tiles[r][c] === TileType.COVER_LOW;
  const horizontal = Number(isCover(row, col - 1)) + Number(isCover(row, col + 1));
  const vertical = Number(isCover(row - 1, col)) + Number(isCover(row + 1, col));
  if (horizontal > vertical) return 0;
  if (vertical > horizontal) return 90;
  return pickVariant([0, 90], row, col) as 0 | 90;
}

// ────────────────────────── wall auto-tiling ──────────────────────────

// 4-neighbor wall mask bits.
const N = 1,
  E = 2,
  S = 4,
  W = 8;

export function isWall(tiles: TileGrid, h: number, w: number, r: number, c: number): boolean {
  return r >= 0 && r < h && c >= 0 && c < w && tiles[r][c] === TileType.WALL;
}

export function neighborMask(
  tiles: TileGrid,
  h: number,
  w: number,
  row: number,
  col: number,
): number {
  return (
    (isWall(tiles, h, w, row - 1, col) ? N : 0) |
    (isWall(tiles, h, w, row, col + 1) ? E : 0) |
    (isWall(tiles, h, w, row + 1, col) ? S : 0) |
    (isWall(tiles, h, w, row, col - 1) ? W : 0)
  );
}

export function isOuterWall(row: number, col: number, h: number, w: number): boolean {
  return row === 0 || row === h - 1 || col === 0 || col === w - 1;
}

/**
 * Brick wall frames (tiles_brick, 6×3) — used for OUTER walls (map
 * perimeter only). Auto-tiled by 4-neighbor pattern; OOB neighbors count
 * as non-walls so the perimeter resolves to corners + edges.
 */
const BRICK_TL = 0; // top-left corner: walls below (S) + right (E)
const BRICK_TR = 5; // top-right corner: walls below (S) + left (W)
const BRICK_BL = 15; // bottom-left corner: walls above (N) + right (E)
const BRICK_BR = 17; // bottom-right corner: walls above (N) + left (W)
const BRICK_VERT = 6; // vertical run: walls above + below
const BRICK_HORZ = 16; // horizontal run: walls left + right

const BRICK_FRAMES_BY_MASK: Record<number, number> = {
  // 2-neighbor outer-wall patterns:
  [S | E]: BRICK_TL, // 6
  [S | W]: BRICK_TR, // 12
  [N | E]: BRICK_BL, // 3
  [N | W]: BRICK_BR, // 9
  [N | S]: BRICK_VERT, // 5
  [E | W]: BRICK_HORZ, // 10
  // T-junctions — pick the axis running through the cell:
  [N | E | S]: BRICK_VERT, // 7
  [N | E | W]: BRICK_HORZ, // 11
  [N | S | W]: BRICK_VERT, // 13
  [E | S | W]: BRICK_HORZ, // 14
  // Cross / interior:
  [N | E | S | W]: BRICK_HORZ, // 15
  // End-caps:
  [N]: BRICK_VERT, // 1
  [E]: BRICK_HORZ, // 2
  [S]: BRICK_VERT, // 4
  [W]: BRICK_HORZ, // 8
  // Isolated:
  0: BRICK_HORZ,
};

export function pickBrickFrame(
  tiles: TileGrid,
  h: number,
  w: number,
  row: number,
  col: number,
): number {
  const mask = neighborMask(tiles, h, w, row, col);
  return BRICK_FRAMES_BY_MASK[mask] ?? BRICK_HORZ;
}

/**
 * Iron-fence frames (tiles_iron_fence, 3×4) — directional inner walls.
 * The iron sheet has DIRECTIONAL left/right and top/bottom edges, so an
 * inner wall tile needs to know which side of an enclosure it sits on.
 * That's decided by either an adjacent corner (propagation) or by tracing
 * the contiguous wall run for a corner at either end.
 */
const IRON_TL = 0; // top-left corner (S+E walls)
const IRON_TOP = 1; // top edge
const IRON_TR = 2; // top-right corner (S+W)
const IRON_LEFT = 3; // left edge
const IRON_RIGHT = 5; // right edge
const IRON_BL = 9; // bottom-left corner (N+E)
const IRON_BOTTOM = 10; // bottom edge
const IRON_BR = 11; // bottom-right corner (N+W)

// 2-neighbor masks that name a corner (used by both brick + iron tilers,
// and by the iron-trace logic to identify where a wall run terminates).
const MASK_TL = S | E; // 6
const MASK_TR = S | W; // 12
const MASK_BL = N | E; // 3
const MASK_BR = N | W; // 9
const TOP_CORNER_MASKS: ReadonlySet<number> = new Set([MASK_TL, MASK_TR]);
const BOTTOM_CORNER_MASKS: ReadonlySet<number> = new Set([MASK_BL, MASK_BR]);

/**
 * Walk through wall cells in direction (dr, dc) starting from (row, col)
 * (exclusive of the start). Return the FIRST wall whose neighbor pattern
 * matches one of the four corner shapes. Returns null if a non-wall or
 * the map edge is hit before finding a corner.
 *
 * Used by pickIronFrame() to look "up the wall" or "down the wall" for
 * a corner that names which side of an enclosure the run belongs to.
 */
function traceForCorner(
  tiles: TileGrid,
  h: number,
  w: number,
  row: number,
  col: number,
  dr: number,
  dc: number,
): number | null {
  let r = row + dr;
  let c = col + dc;
  while (r >= 0 && r < h && c >= 0 && c < w && tiles[r][c] === TileType.WALL) {
    const mask = neighborMask(tiles, h, w, r, c);
    if (mask === MASK_TL || mask === MASK_TR || mask === MASK_BL || mask === MASK_BR) {
      return mask;
    }
    r += dr;
    c += dc;
  }
  return null;
}

/**
 * Iron-fence picker — applies the user's directional rules:
 *  1. Direct corner if the 4-neighbor mask matches a 2-neighbor corner.
 *  2. Horizontal-leaning cell (no vertical wall neighbors): "top wall"
 *     if a horizontal trace hits a top corner, "bottom wall" if it hits
 *     a bottom corner, else use the row-vs-mid map fallback.
 *  3. Vertical-leaning cell: "left wall" if tracing up hits a top-left
 *     corner OR tracing down hits a bottom-left corner; "right wall"
 *     if tracing up hits top-right OR down hits bottom-right; else use
 *     the col-vs-mid fallback.
 */
export function pickIronFrame(
  tiles: TileGrid,
  h: number,
  w: number,
  row: number,
  col: number,
): number {
  const mask = neighborMask(tiles, h, w, row, col);

  // 1. Direct corner match.
  if (mask === MASK_TL) return IRON_TL;
  if (mask === MASK_TR) return IRON_TR;
  if (mask === MASK_BL) return IRON_BL;
  if (mask === MASK_BR) return IRON_BR;

  const hasN = (mask & N) !== 0;
  const hasS = (mask & S) !== 0;
  const hasE = (mask & E) !== 0;
  const hasW = (mask & W) !== 0;
  const hasVertical = hasN || hasS;
  const hasHorizontal = hasE || hasW;

  // 2. Horizontal-leaning: only E/W neighbors (or none). Trace east/west
  //    for a corner; the corner type names the row's "side" (top/bottom).
  if (hasHorizontal && !hasVertical) {
    const eastCorner = traceForCorner(tiles, h, w, row, col, 0, 1);
    const westCorner = traceForCorner(tiles, h, w, row, col, 0, -1);
    const hitsTop =
      (eastCorner !== null && TOP_CORNER_MASKS.has(eastCorner)) ||
      (westCorner !== null && TOP_CORNER_MASKS.has(westCorner));
    const hitsBottom =
      (eastCorner !== null && BOTTOM_CORNER_MASKS.has(eastCorner)) ||
      (westCorner !== null && BOTTOM_CORNER_MASKS.has(westCorner));
    if (hitsTop) return IRON_TOP;
    if (hitsBottom) return IRON_BOTTOM;
    // Straight L-R wall, no terminating corners: most-of-board fallback.
    // "If most of the game board is above → bottom wall (10)."
    // "If most of the game board is below → top wall (1)."
    return row >= h / 2 ? IRON_BOTTOM : IRON_TOP;
  }

  // 3. Vertical-leaning: trace up/down for corners.
  if (hasVertical) {
    const upCorner = traceForCorner(tiles, h, w, row, col, -1, 0);
    const downCorner = traceForCorner(tiles, h, w, row, col, 1, 0);
    const isLeft = upCorner === MASK_TL || downCorner === MASK_BL;
    const isRight = upCorner === MASK_TR || downCorner === MASK_BR;
    if (isLeft) return IRON_LEFT;
    if (isRight) return IRON_RIGHT;
    // Straight U-D wall, no terminating corners: most-of-board fallback.
    // "Most of board to the right → left wall (3)."
    // "Most of board to the left → right wall (5)."
    return col < w / 2 ? IRON_LEFT : IRON_RIGHT;
  }

  // Fully isolated inner wall (no neighbors at all): map-center fallback
  // along the horizontal axis just to pick something deterministic.
  return row >= h / 2 ? IRON_BOTTOM : IRON_TOP;
}

/**
 * Corrugated roof/container walls (tiles_roof, 16×5). The sheet reads
 * top-down as sheet-metal building footprints: row 0 has a parapet cap,
 * row 4 a base shadow, rows 1/3 are plain fill. Three-frame variant
 * bands per row; the red set sits 8 columns right of the dark set.
 *
 * Rules: a wall cell with open ground above it wears the top cap, one
 * with open ground below (and a wall above) wears the bottom cap,
 * everything else is fill. 1-thick horizontal runs get the top cap
 * (reads as a capped metal fence).
 */
const ROOF_RED_OFFSET = 8;
const ROOF_TOP_VARIANTS: readonly number[] = [0, 1, 2];
const ROOF_FILL_VARIANTS: readonly number[] = [16, 17, 18, 48, 49, 50];
const ROOF_BOTTOM_VARIANTS: readonly number[] = [64, 65, 66];

export function pickRoofFrame(
  tiles: TileGrid,
  h: number,
  w: number,
  row: number,
  col: number,
  colorOffset: number,
): number {
  const mask = neighborMask(tiles, h, w, row, col);
  const variants =
    (mask & N) === 0
      ? ROOF_TOP_VARIANTS
      : (mask & S) === 0
        ? ROOF_BOTTOM_VARIANTS
        : ROOF_FILL_VARIANTS;
  return pickVariant(variants, row, col) + colorOffset;
}

// ────────────────────────── wall styles + themes ──────────────────────────

export type WallStyleId = 'brick' | 'iron' | 'roofDark' | 'roofRed';

export interface WallStyle {
  texture: string;
  pick: (tiles: TileGrid, h: number, w: number, row: number, col: number) => number;
}

export const WALL_STYLES: Record<WallStyleId, WallStyle> = {
  brick: { texture: 'tiles_brick', pick: pickBrickFrame },
  iron: { texture: 'tiles_iron_fence', pick: pickIronFrame },
  roofDark: {
    texture: 'tiles_roof',
    pick: (tiles, h, w, r, c) => pickRoofFrame(tiles, h, w, r, c, 0),
  },
  roofRed: {
    texture: 'tiles_roof',
    pick: (tiles, h, w, r, c) => pickRoofFrame(tiles, h, w, r, c, ROOF_RED_OFFSET),
  },
};

export interface MapTheme {
  floorTexture: string;
  /** TUNABLE frame pools — deterministic per cell via pickVariant. */
  floorVariants: readonly number[];
  coverTexture: string;
  coverVariants: readonly number[];
  /** Barricades preserve their 16×14 aspect and rotate along cover runs. */
  coverStyle: 'tile' | 'barricade';
  /** Frame in floorTexture swapped in where a grenade detonated. */
  scorchFrame: number;
  outerWall: WallStyleId;
  innerWall: WallStyleId;
}

/**
 * The background sheets share one layout, so floor variant indices picked
 * for the bleak sheet carry over to its green/dark-green palette swaps.
 */
const FLOOR_VARIANTS: readonly number[] = [50, 51, 52, 28];
const COVER_VARIANTS: readonly number[] = [100, 99, 101];
const SCORCH_FRAME = 4;

export const MAP_THEMES: Record<string, MapTheme> = {
  wasteland: {
    floorTexture: 'tiles_bleak',
    floorVariants: FLOOR_VARIANTS,
    coverTexture: 'tiles_bleak',
    coverVariants: COVER_VARIANTS,
    coverStyle: 'tile',
    scorchFrame: SCORCH_FRAME,
    outerWall: 'brick',
    innerWall: 'iron',
  },
  suburb: {
    floorTexture: 'tiles_green',
    floorVariants: FLOOR_VARIANTS,
    coverTexture: 'cover_wooden',
    coverVariants: [0],
    coverStyle: 'barricade',
    scorchFrame: SCORCH_FRAME,
    outerWall: 'brick',
    innerWall: 'roofDark',
  },
  scrapyard: {
    floorTexture: 'tiles_dark_green',
    floorVariants: FLOOR_VARIANTS,
    coverTexture: 'tiles_garbage',
    // Garbage-pile interior frames: plain, crate, tarp, tire, cart.
    coverVariants: [9, 10, 18, 19, 26],
    coverStyle: 'tile',
    scorchFrame: SCORCH_FRAME,
    outerWall: 'brick',
    innerWall: 'roofRed',
  },
  overpass: {
    floorTexture: 'tiles_bleak',
    floorVariants: FLOOR_VARIANTS,
    coverTexture: 'tiles_garbage',
    coverVariants: [9, 18, 19, 26],
    coverStyle: 'tile',
    scorchFrame: SCORCH_FRAME,
    outerWall: 'brick',
    innerWall: 'roofDark',
  },
  checkpoint: {
    floorTexture: 'tiles_dark_green',
    floorVariants: FLOOR_VARIANTS,
    coverTexture: 'cover_reinforced',
    coverVariants: [0],
    coverStyle: 'barricade',
    scorchFrame: SCORCH_FRAME,
    outerWall: 'brick',
    innerWall: 'iron',
  },
  refinery: {
    floorTexture: 'tiles_bleak',
    floorVariants: FLOOR_VARIANTS,
    coverTexture: 'cover_reinforced',
    coverVariants: [0],
    coverStyle: 'barricade',
    scorchFrame: SCORCH_FRAME,
    outerWall: 'brick',
    innerWall: 'roofRed',
  },
  irradiated: {
    floorTexture: 'tiles_dark_green',
    floorVariants: FLOOR_VARIANTS,
    coverTexture: 'cover_reinforced',
    coverVariants: [0],
    coverStyle: 'barricade',
    scorchFrame: SCORCH_FRAME,
    outerWall: 'brick',
    innerWall: 'iron',
  },
};

export const DEFAULT_THEME_ID = 'wasteland';

/** Resolve a map's theme id; absent/unknown ids fall back to wasteland. */
export function getTheme(themeId: string | undefined): MapTheme {
  return MAP_THEMES[themeId ?? DEFAULT_THEME_ID] ?? MAP_THEMES[DEFAULT_THEME_ID];
}
