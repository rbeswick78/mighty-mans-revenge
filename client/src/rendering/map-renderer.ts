import Phaser from 'phaser';

import type { MapData, CollisionGrid } from '@shared/types/map.js';
import { TileType } from '@shared/types/map.js';
import { createCollisionGrid } from '@shared/utils/collision.js';
import { Wasteland } from '@shared/config/palette.js';

/**
 * Tile asset spritesheet keys (loaded in boot-scene.ts).
 *  - tiles_bleak:      24×17 = 408 frames of 16×16 — floor / cover / scorch.
 *  - tiles_brick:      6×3 = 18 frames of 16×16 — outer (perimeter) walls.
 *  - tiles_iron_fence: 3×4 = 12 frames of 16×16 — inner walls (auto-tiled
 *                      with directional left/right/top/bottom edges).
 */
const FLOOR_TEXTURE = 'tiles_bleak';
const COVER_TEXTURE = 'tiles_bleak';
const SCORCH_TEXTURE = 'tiles_bleak';
const OUTER_WALL_TEXTURE = 'tiles_brick';
const INNER_WALL_TEXTURE = 'tiles_iron_fence';

/**
 * Random-variant pools for floor and cover. Each cell deterministically
 * picks one variant via hash of its (row, col), so a given map renders
 * identically every time but the world stops looking stamped.
 *
 * TUNABLE: indices into the bleak-yellow tileset (row * 24 + col). Add
 * or drop entries freely; pickVariant handles arrays of any length ≥ 1.
 */
const FLOOR_VARIANTS: readonly number[] = [50, 51, 52, 28];     // user-picked via tile-picker scene
const COVER_VARIANTS: readonly number[] = [100, 99, 101];       // row 4 cols 3-5 — rubble/debris

/**
 * Brick wall frames (tiles_brick, 6×3) — used for OUTER walls (map
 * perimeter only). Auto-tiled by 4-neighbor pattern; OOB neighbors count
 * as non-walls so the perimeter resolves to corners + edges.
 *
 * Inner walls use the iron-fence sheet with a different rule set.
 */
const BRICK_TL = 0;     // top-left corner: walls below (S) + right (E)
const BRICK_TR = 5;     // top-right corner: walls below (S) + left (W)
const BRICK_BL = 15;    // bottom-left corner: walls above (N) + right (E)
const BRICK_BR = 17;    // bottom-right corner: walls above (N) + left (W)
const BRICK_VERT = 6;   // vertical run: walls above + below
const BRICK_HORZ = 16;  // horizontal run: walls left + right

/**
 * Iron-fence frames (tiles_iron_fence, 3×4) — used for INNER walls. The
 * iron sheet has DIRECTIONAL left/right and top/bottom edges, so an inner
 * wall tile needs to know which side of an enclosure it sits on. That's
 * decided by either an adjacent corner (propagation) or by tracing the
 * contiguous wall run for a corner at either end.
 */
const IRON_TL = 0;      // top-left corner (S+E walls)
const IRON_TOP = 1;     // top edge
const IRON_TR = 2;      // top-right corner (S+W)
const IRON_LEFT = 3;    // left edge
const IRON_RIGHT = 5;   // right edge
const IRON_BL = 9;      // bottom-left corner (N+E)
const IRON_BOTTOM = 10; // bottom edge
const IRON_BR = 11;     // bottom-right corner (N+W)

// 4-neighbor wall mask bits.
const N = 1, E = 2, S = 4, W = 8;

const BRICK_FRAMES_BY_MASK: Record<number, number> = {
  // 2-neighbor outer-wall patterns:
  [S | E]: BRICK_TL,                     // 6
  [S | W]: BRICK_TR,                     // 12
  [N | E]: BRICK_BL,                     // 3
  [N | W]: BRICK_BR,                     // 9
  [N | S]: BRICK_VERT,                   // 5
  [E | W]: BRICK_HORZ,                   // 10
  // T-junctions — pick the axis running through the cell:
  [N | E | S]: BRICK_VERT,               // 7
  [N | E | W]: BRICK_HORZ,               // 11
  [N | S | W]: BRICK_VERT,               // 13
  [E | S | W]: BRICK_HORZ,               // 14
  // Cross / interior:
  [N | E | S | W]: BRICK_HORZ,           // 15
  // End-caps:
  [N]: BRICK_VERT,                       // 1
  [E]: BRICK_HORZ,                       // 2
  [S]: BRICK_VERT,                       // 4
  [W]: BRICK_HORZ,                       // 8
  // Isolated:
  0: BRICK_HORZ,
};

// 2-neighbor masks that name a corner (used by both brick + iron tilers,
// and by the iron-trace logic to identify where a wall run terminates).
const MASK_TL = S | E;  // 6
const MASK_TR = S | W;  // 12
const MASK_BL = N | E;  // 3
const MASK_BR = N | W;  // 9
const TOP_CORNER_MASKS: ReadonlySet<number> = new Set([MASK_TL, MASK_TR]);
const BOTTOM_CORNER_MASKS: ReadonlySet<number> = new Set([MASK_BL, MASK_BR]);

/**
 * Single frame swapped into a floor cell after a grenade detonates inside
 * it — the "lighter spot" tile picked by the user.
 */
const SCORCH_FRAME = 4;

/** Tile types that scorchTileAt() will mutate. Walls and cover are skipped. */
const SCORCHABLE_TILE_TYPES: ReadonlySet<number> = new Set([
  TileType.FLOOR,
  TileType.SPAWN_POINT,
  TileType.PICKUP_SPAWN,
]);

/**
 * Tile pixel size in the source spritesheets. Game-world tile size lives
 * in MAP.TILE_SIZE (currently 48); the scale factor is the ratio.
 */
const SOURCE_TILE_SIZE = 16;

/**
 * Deterministic per-cell variant picker. Same (row, col) → same index
 * across renders so the map is stable. Multiplicative hash with two
 * large primes XOR'd gives well-distributed indices for the small N
 * variant counts we use here. `>>> 0` coerces the signed XOR result
 * to uint32 before modulo so the index is always non-negative.
 */
function pickVariant(variants: readonly number[], row: number, col: number): number {
  if (variants.length === 1) return variants[0];
  const h = (col * 73856093) ^ (row * 19349663);
  return variants[(h >>> 0) % variants.length];
}

type TileGrid = readonly (readonly number[])[];

function isWall(tiles: TileGrid, h: number, w: number, r: number, c: number): boolean {
  return r >= 0 && r < h && c >= 0 && c < w && tiles[r][c] === TileType.WALL;
}

function neighborMask(tiles: TileGrid, h: number, w: number, row: number, col: number): number {
  return (
    (isWall(tiles, h, w, row - 1, col) ? N : 0) |
    (isWall(tiles, h, w, row, col + 1) ? E : 0) |
    (isWall(tiles, h, w, row + 1, col) ? S : 0) |
    (isWall(tiles, h, w, row, col - 1) ? W : 0)
  );
}

function isOuterWall(row: number, col: number, h: number, w: number): boolean {
  return row === 0 || row === h - 1 || col === 0 || col === w - 1;
}

function pickBrickFrame(tiles: TileGrid, h: number, w: number, row: number, col: number): number {
  const mask = neighborMask(tiles, h, w, row, col);
  return BRICK_FRAMES_BY_MASK[mask] ?? BRICK_HORZ;
}

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
function pickIronFrame(tiles: TileGrid, h: number, w: number, row: number, col: number): number {
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
    const isLeft =
      upCorner === MASK_TL || downCorner === MASK_BL;
    const isRight =
      upCorner === MASK_TR || downCorner === MASK_BR;
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

interface TileResult {
  texture: string;
  frame: number;
}

interface TilePool {
  pick: (
    tiles: TileGrid,
    height: number,
    width: number,
    row: number,
    col: number,
  ) => TileResult;
}

const FLOOR_POOL: TilePool = {
  pick: (_t, _h, _w, r, c) => ({ texture: FLOOR_TEXTURE, frame: pickVariant(FLOOR_VARIANTS, r, c) }),
};

const COVER_POOL: TilePool = {
  pick: (_t, _h, _w, r, c) => ({ texture: COVER_TEXTURE, frame: pickVariant(COVER_VARIANTS, r, c) }),
};

// Walls dispatch by perimeter status: outer = brick auto-tile, inner =
// iron-fence directional auto-tile.
const WALL_POOL: TilePool = {
  pick: (tiles, h, w, r, c) =>
    isOuterWall(r, c, h, w)
      ? { texture: OUTER_WALL_TEXTURE, frame: pickBrickFrame(tiles, h, w, r, c) }
      : { texture: INNER_WALL_TEXTURE, frame: pickIronFrame(tiles, h, w, r, c) },
};

const TILE_POOLS: Record<number, TilePool> = {
  [TileType.FLOOR]: FLOOR_POOL,
  [TileType.WALL]: WALL_POOL,
  [TileType.COVER_LOW]: COVER_POOL,
  [TileType.SPAWN_POINT]: FLOOR_POOL,  // render as floor; spawn marker drawn on top
  [TileType.PICKUP_SPAWN]: FLOOR_POOL, // render as floor; pickup drawn on top
};

export class MapRenderer {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private collisionGrid: CollisionGrid | null = null;

  // Per-cell sprite refs + tile-type grid + scorched-cell set, all kept
  // alongside the container so scorchTileAt() can mutate frames after the
  // initial render. Cleared in destroy(). All [row][col]-indexed.
  private tileSprites: (Phaser.GameObjects.Sprite | null)[][] = [];
  private tileTypes: number[][] = [];
  private scorchedCells: Set<number> = new Set(); // row * mapWidth + col
  private mapWidth = 0;
  private mapHeight = 0;
  private mapTileSize = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  renderMap(mapData: MapData): Phaser.GameObjects.Container {
    // Clean up previous render if any
    this.destroy();

    const tileSize = mapData.tileSize;
    const scale = tileSize / SOURCE_TILE_SIZE;
    this.container = this.scene.add.container(0, 0);

    this.mapWidth = mapData.width;
    this.mapHeight = mapData.height;
    this.mapTileSize = tileSize;
    this.tileSprites = Array.from({ length: mapData.height }, () =>
      new Array<Phaser.GameObjects.Sprite | null>(mapData.width).fill(null),
    );
    this.tileTypes = Array.from({ length: mapData.height }, (_, r) =>
      mapData.tiles[r].slice(),
    );

    // Render tiles. Inner walls (iron-fence) have transparent gaps and
    // are meant to read as standing on top of the floor — so we paint a
    // floor variant underneath first, then the wall sprite on top. The
    // floor underlay isn't tracked in tileSprites because walls aren't
    // scorchable and never mutate.
    for (let row = 0; row < mapData.height; row++) {
      for (let col = 0; col < mapData.width; col++) {
        const tileType = mapData.tiles[row][col];
        const x = col * tileSize + tileSize / 2;
        const y = row * tileSize + tileSize / 2;

        const isInnerWall =
          tileType === TileType.WALL &&
          !isOuterWall(row, col, mapData.height, mapData.width);

        if (isInnerWall) {
          const floorRes = FLOOR_POOL.pick(mapData.tiles, mapData.height, mapData.width, row, col);
          const floorSprite = this.scene.add.sprite(x, y, floorRes.texture, floorRes.frame);
          floorSprite.setScale(scale);
          this.container.add(floorSprite);
        }

        const pool = TILE_POOLS[tileType] ?? FLOOR_POOL;
        const { texture, frame } = pool.pick(mapData.tiles, mapData.height, mapData.width, row, col);
        const sprite = this.scene.add.sprite(x, y, texture, frame);
        sprite.setScale(scale);
        this.container.add(sprite);
        this.tileSprites[row][col] = sprite;
      }
    }

    // Spawn point indicators
    for (const spawn of mapData.spawnPoints) {
      const x = spawn.x * tileSize + tileSize / 2;
      const y = spawn.y * tileSize + tileSize / 2;

      const marker = this.scene.add.graphics();
      marker.lineStyle(1, Wasteland.SPAWN_MARKER, 0.4);
      marker.strokeCircle(x, y, 8);
      marker.lineStyle(1, Wasteland.SPAWN_MARKER, 0.3);
      marker.lineBetween(x - 4, y, x + 4, y);
      marker.lineBetween(x, y - 4, x, y + 4);
      this.container.add(marker);
    }

    // Pickup spawn locations are not drawn here — PickupRenderer owns
    // their visuals based on authoritative server state (visible when
    // available, invisible while respawning).

    // Build collision grid for client-side prediction
    this.collisionGrid = createCollisionGrid(mapData);

    return this.container;
  }

  /**
   * Swap the single floor cell containing the given world point to the
   * scorch frame. Walls and cover are skipped (no swap if the point
   * lands on one). Scorched cells are tracked so a second grenade in
   * the same spot doesn't redundantly reset the frame.
   *
   * The cell whose body contains the point is also the closest cell
   * to the point, so no distance math is needed — flooring the world
   * coords to grid coords picks it directly.
   */
  scorchTileAt(worldX: number, worldY: number): void {
    if (this.tileSprites.length === 0 || this.mapTileSize === 0) return;

    const ts = this.mapTileSize;
    const col = Math.floor(worldX / ts);
    const row = Math.floor(worldY / ts);
    if (row < 0 || row >= this.mapHeight || col < 0 || col >= this.mapWidth) return;

    const key = row * this.mapWidth + col;
    if (this.scorchedCells.has(key)) return;
    if (!SCORCHABLE_TILE_TYPES.has(this.tileTypes[row][col])) return;

    const sprite = this.tileSprites[row][col];
    if (sprite) {
      // setTexture handles the case where the cell was rendered from a
      // different sheet (currently floor uses tiles_bleak so this is a
      // no-op, but the call keeps scorch decoupled from floor texture).
      sprite.setTexture(SCORCH_TEXTURE, SCORCH_FRAME);
      this.scorchedCells.add(key);
    }
  }

  getCollisionGrid(): CollisionGrid | null {
    return this.collisionGrid;
  }

  destroy(): void {
    if (this.container) {
      this.container.destroy(true);
      this.container = null;
    }

    this.collisionGrid = null;
    this.tileSprites = [];
    this.tileTypes = [];
    this.scorchedCells.clear();
    this.mapWidth = 0;
    this.mapHeight = 0;
    this.mapTileSize = 0;
  }
}
