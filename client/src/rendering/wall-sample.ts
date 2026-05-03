import type { CollisionGrid } from '@shared/types/map.js';

/**
 * Distance (px) past the impact point we sample to classify wall vs air.
 * The raycaster reports hits at the wall's surface; nudging slightly into
 * the tile reliably samples the solid cell instead of the floor in front.
 */
const WALL_SAMPLE_NUDGE_PX = 2;

/**
 * True if the bullet's impact landed on a wall. Out-of-bounds counts as
 * wall (the raycaster won't normally produce those, but treating them as
 * solid is safer than as open air).
 */
export function sampleIsWall(
  grid: CollisionGrid | null,
  x: number,
  y: number,
  bulletAngle: number,
): boolean {
  if (!grid) return false;
  const sampleX = x + Math.cos(bulletAngle) * WALL_SAMPLE_NUDGE_PX;
  const sampleY = y + Math.sin(bulletAngle) * WALL_SAMPLE_NUDGE_PX;
  const col = Math.floor(sampleX / grid.tileSize);
  const row = Math.floor(sampleY / grid.tileSize);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return true;
  return grid.solid[row][col] === true;
}
