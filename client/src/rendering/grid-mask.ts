import Phaser from 'phaser';

import type { CollisionGrid } from '@shared/types/map.js';

interface GridMaskRegion {
  readonly firstCol: number;
  readonly firstRow: number;
  readonly columnCount: number;
  readonly rowCount: number;
}

/**
 * Bake a binary alpha mask texture from a collision grid. White rects are
 * drawn on every tile whose `solid` flag matches `wantSolid`; everything
 * else stays transparent. Intended as a `BitmapMask` source for decal
 * RenderTextures.
 *
 * Pass `wantSolid = true` for a wall mask (visible decals stay on walls),
 * `wantSolid = false` for a floor mask (visible decals stay on the floor).
 *
 * The texture is sized from the grid (`width × tileSize`, `height × tileSize`),
 * which by construction matches the playfield. Idempotent — re-baking with
 * the same key is a no-op.
 */
export function bakeGridMaskTexture(
  scene: Phaser.Scene,
  key: string,
  grid: CollisionGrid,
  wantSolid: boolean,
  region?: GridMaskRegion,
): void {
  if (scene.textures.exists(key)) return;
  const firstCol = region?.firstCol ?? 0;
  const firstRow = region?.firstRow ?? 0;
  const columnCount = region?.columnCount ?? grid.width;
  const rowCount = region?.rowCount ?? grid.height;
  const widthPx = columnCount * grid.tileSize;
  const heightPx = rowCount * grid.tileSize;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  for (let row = firstRow; row < firstRow + rowCount; row++) {
    for (let col = firstCol; col < firstCol + columnCount; col++) {
      if (grid.solid[row][col] === wantSolid) {
        g.fillRect(
          (col - firstCol) * grid.tileSize,
          (row - firstRow) * grid.tileSize,
          grid.tileSize,
          grid.tileSize,
        );
      }
    }
  }
  g.generateTexture(key, widthPx, heightPx);
  g.destroy();
}
