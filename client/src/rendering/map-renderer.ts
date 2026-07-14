import Phaser from 'phaser';

import type { MapData, CollisionGrid } from '@shared/types/map.js';
import { TileType } from '@shared/types/map.js';
import { createCollisionGrid } from '@shared/utils/collision.js';
import { Wasteland } from '@shared/config/palette.js';
import {
  coverBarricadeAngle,
  getTheme,
  isOuterWall,
  pickVariant,
  WALL_STYLES,
  type MapTheme,
} from './map-themes.js';
import {
  WIRE_GATE_CLOSED_FRAME,
  WIRE_GATE_OPEN_ANIMATION_KEY,
  wireGateScale,
} from './wire-gate.js';

/**
 * Renders a MapData grid using the map's visual theme (map-themes.ts):
 * per-cell floor/cover variant pools, auto-tiled walls (brick perimeter +
 * theme inner-wall style), and free-placed decoration sprites (wrecked
 * cars, containers) centered on tile rects whose underlying tiles carry
 * the collision. All texture keys are loaded in boot-scene.ts.
 */

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

export class MapRenderer {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private collisionGrid: CollisionGrid | null = null;
  private theme: MapTheme = getTheme(undefined);

  // Per-cell sprite refs + tile-type grid + scorched-cell set, all kept
  // alongside the container so scorchTileAt() can mutate frames after the
  // initial render. Cleared in destroy(). All [row][col]-indexed.
  private tileSprites: (Phaser.GameObjects.Sprite | null)[][] = [];
  private tileTypes: number[][] = [];
  private scorchedCells: Set<number> = new Set(); // row * mapWidth + col
  private mapWidth = 0;
  private mapHeight = 0;
  private mapTileSize = 0;
  /** Cells visually owned by a decoration rather than only a tile overlay. */
  private decoratedCells = new Set<number>();
  /** Every cell in an atomic prop rect points at the same decoration sprite. */
  private decorationSpritesByCell = new Map<number, Phaser.GameObjects.Sprite>();
  /** Closed gate cells keep their sprite so destruction can animate it open. */
  private gateSpritesByCell = new Map<number, Phaser.GameObjects.Sprite>();
  /** Scavenger cache cells keep their sprite for the loot-burst animation. */
  private cacheSpritesByCell = new Map<number, Phaser.GameObjects.Sprite>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  renderMap(mapData: MapData): Phaser.GameObjects.Container {
    // Clean up previous render if any
    this.destroy();

    const tileSize = mapData.tileSize;
    const scale = tileSize / SOURCE_TILE_SIZE;
    const theme = getTheme(mapData.theme);
    this.theme = theme;
    this.container = this.scene.add.container(0, 0);

    this.mapWidth = mapData.width;
    this.mapHeight = mapData.height;
    this.mapTileSize = tileSize;
    this.tileSprites = Array.from({ length: mapData.height }, () =>
      new Array<Phaser.GameObjects.Sprite | null>(mapData.width).fill(null),
    );
    this.tileTypes = Array.from({ length: mapData.height }, (_, r) => mapData.tiles[r].slice());

    // Cells hidden by a decoration sprite render as plain floor — a
    // rubble/garbage tile peeking out from under a car reads as noise.
    const decoCovered = this.decoratedCells;
    for (const deco of mapData.decorations ?? []) {
      for (let r = deco.y; r < deco.y + deco.h; r++) {
        for (let c = deco.x; c < deco.x + deco.w; c++) {
          decoCovered.add(r * mapData.width + c);
        }
      }
    }

    // Render tiles. Inner walls (transparent gaps in the iron fence) and
    // cover tiles (garbage piles have soft transparent edges) are meant
    // to read as standing on top of the floor — so we paint a floor
    // variant underneath first, then the tile sprite on top. Underlays
    // aren't tracked in tileSprites because those cells never scorch.
    for (let row = 0; row < mapData.height; row++) {
      for (let col = 0; col < mapData.width; col++) {
        const tileType = mapData.tiles[row][col];
        const x = col * tileSize + tileSize / 2;
        const y = row * tileSize + tileSize / 2;

        const isInnerWall =
          tileType === TileType.WALL && !isOuterWall(row, col, mapData.height, mapData.width);
        const isCover = tileType === TileType.COVER_LOW;

        if (isInnerWall || isCover) {
          const floorSprite = this.scene.add.sprite(
            x,
            y,
            theme.floorTexture,
            pickVariant(theme.floorVariants, row, col),
          );
          floorSprite.setScale(scale);
          this.container.add(floorSprite);
        }

        const { texture, frame } = this.pickTile(
          theme,
          mapData.tiles,
          mapData.height,
          mapData.width,
          row,
          col,
          decoCovered,
        );
        const sprite = this.scene.add.sprite(x, y, texture, frame);
        sprite.setScale(scale);
        if (
          isCover &&
          !decoCovered.has(row * mapData.width + col) &&
          theme.coverStyle === 'barricade'
        ) {
          sprite.setAngle(
            coverBarricadeAngle(mapData.tiles, mapData.height, mapData.width, row, col),
          );
        }
        this.container.add(sprite);
        this.tileSprites[row][col] = sprite;
      }
    }

    // Decoration sprites (cosmetic only — collision comes from the tiles
    // underneath). Centered on their tile rect; the art rarely matches
    // the rect exactly, so a slight overflow past the collision box is
    // expected and reads as organic clutter.
    for (const deco of mapData.decorations ?? []) {
      if (!this.scene.textures.exists(deco.texture)) {
        // Unknown key (e.g. newer map JSON than client) — skip quietly
        // rather than render Phaser's missing-texture placeholder.
        continue;
      }
      const cx = (deco.x + deco.w / 2) * tileSize;
      const cy = (deco.y + deco.h / 2) * tileSize;
      const isGate = deco.interaction === 'shootable_gate';
      const isCache = deco.interaction === 'scavenger_cache';
      const sprite = this.scene.add.sprite(
        cx,
        cy,
        deco.texture,
        isGate ? WIRE_GATE_CLOSED_FRAME : undefined,
      );
      sprite.setScale(isGate ? wireGateScale(tileSize) : scale);
      sprite.setFlipX(deco.flipX ?? false);
      this.container.add(sprite);
      for (let row = deco.y; row < deco.y + deco.h; row++) {
        for (let col = deco.x; col < deco.x + deco.w; col++) {
          const key = row * mapData.width + col;
          this.decorationSpritesByCell.set(key, sprite);
          if (isGate) this.gateSpritesByCell.set(key, sprite);
          if (isCache) this.cacheSpritesByCell.set(key, sprite);
        }
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

  /** Resolve the texture + frame for one cell from the active theme. */
  private pickTile(
    theme: MapTheme,
    tiles: readonly (readonly number[])[],
    h: number,
    w: number,
    row: number,
    col: number,
    decoCovered: ReadonlySet<number>,
  ): { texture: string; frame: number } {
    const tileType = tiles[row][col];

    if (tileType === TileType.WALL) {
      const style = WALL_STYLES[isOuterWall(row, col, h, w) ? theme.outerWall : theme.innerWall];
      return { texture: style.texture, frame: style.pick(tiles, h, w, row, col) };
    }

    if (tileType === TileType.COVER_LOW && !decoCovered.has(row * w + col)) {
      return {
        texture: theme.coverTexture,
        frame: pickVariant(theme.coverVariants, row, col),
      };
    }

    // FLOOR, SPAWN_POINT, PICKUP_SPAWN, and deco-covered cover cells all
    // render as floor (markers/pickups/decorations are drawn on top).
    return {
      texture: theme.floorTexture,
      frame: pickVariant(theme.floorVariants, row, col),
    };
  }

  /**
   * Swap the single floor cell containing the given world point to the
   * theme's scorch frame. Walls and cover are skipped (no swap if the
   * point lands on one). Scorched cells are tracked so a second grenade
   * in the same spot doesn't redundantly reset the frame.
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
      // different sheet (floor and scorch share the theme's floor sheet
      // today, but the call keeps scorch decoupled from floor texture).
      sprite.setTexture(this.theme.floorTexture, this.theme.scorchFrame);
      this.scorchedCells.add(key);
    }
  }

  getCollisionGrid(): CollisionGrid | null {
    return this.collisionGrid;
  }

  /**
   * Mirror a server `server:tilesDestroyed` event: remove a wall/cover
   * overlay (or its atomic decoration prop), reveal its existing floor
   * underlay, flip the tile to FLOOR, and clear prediction collision.
   *
   * No-op if the tile is out of range or already a non-solid type.
   */
  destroyTileAt(col: number, row: number): void {
    if (row < 0 || row >= this.mapHeight || col < 0 || col >= this.mapWidth) {
      return;
    }
    const tileType = this.tileTypes[row][col];
    if (tileType !== TileType.WALL && tileType !== TileType.COVER_LOW) return;

    const key = row * this.mapWidth + col;
    if (this.decoratedCells.has(key)) {
      const prop = this.decorationSpritesByCell.get(key);
      const gate = this.gateSpritesByCell.get(key);
      const cache = this.cacheSpritesByCell.get(key);
      if (gate) {
        gate.play(WIRE_GATE_OPEN_ANIMATION_KEY);
        this.decorationSpritesByCell.delete(key);
        this.gateSpritesByCell.delete(key);
      } else if (cache && prop) {
        this.decorationSpritesByCell.delete(key);
        this.cacheSpritesByCell.delete(key);
        this.animateScavengerCacheOpen(prop);
      } else if (prop) {
        prop.destroy();
        for (const [cell, sprite] of this.decorationSpritesByCell) {
          if (sprite === prop) this.decorationSpritesByCell.delete(cell);
        }
      }
      if (tileType === TileType.WALL) {
        // Decoration-backed WALL still rendered its auto-tiled wall beneath
        // the prop; remove that layer to reveal the inner-wall floor underlay.
        const wall = this.tileSprites[row][col];
        if (wall) {
          wall.destroy();
          this.tileSprites[row][col] = null;
        }
      }
      // Decorated COVER_LOW rendered a floor sprite in this cell from the
      // start; keep that floor visible when the prop/collision disappear.
    } else {
      const sprite = this.tileSprites[row][col];
      if (sprite) {
        sprite.destroy();
        this.tileSprites[row][col] = null;
      }
    }
    this.tileTypes[row][col] = TileType.FLOOR;
    if (this.collisionGrid) {
      this.collisionGrid.solid[row][col] = false;
    }
  }

  /** Gold pop + crushed-crate flicker driven by authoritative destruction. */
  private animateScavengerCacheOpen(sprite: Phaser.GameObjects.Sprite): void {
    const burst = this.scene.add.circle(sprite.x, sprite.y, 8, 0xffc857, 0.25);
    burst.setStrokeStyle(2, 0xffe29a, 0.9);
    this.container?.add(burst);

    sprite.setTint(0xffd166);
    this.scene.tweens.add({
      targets: sprite,
      scaleX: sprite.scaleX * 1.3,
      scaleY: sprite.scaleY * 0.7,
      angle: 8,
      alpha: 0,
      duration: 170,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.destroy(),
    });
    this.scene.tweens.add({
      targets: burst,
      scaleX: 3,
      scaleY: 3,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => burst.destroy(),
    });
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
    this.decoratedCells.clear();
    this.decorationSpritesByCell.clear();
    this.gateSpritesByCell.clear();
    this.cacheSpritesByCell.clear();
    this.mapWidth = 0;
    this.mapHeight = 0;
    this.mapTileSize = 0;
  }
}
