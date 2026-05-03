import Phaser from 'phaser';

import type { CollisionGrid } from '@shared/types/map.js';

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
): void {
  if (scene.textures.exists(key)) return;
  const widthPx = grid.width * grid.tileSize;
  const heightPx = grid.height * grid.tileSize;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      if (grid.solid[row][col] === wantSolid) {
        g.fillRect(
          col * grid.tileSize,
          row * grid.tileSize,
          grid.tileSize,
          grid.tileSize,
        );
      }
    }
  }
  g.generateTexture(key, widthPx, heightPx);
  g.destroy();
}
