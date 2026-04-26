import { CollisionGrid } from '../types/map.js';
import { Vec2 } from '../types/common.js';

export interface GrenadeKinematics {
  position: Vec2;
  velocity: Vec2;
}

/**
 * Advance a grenade by one timestep. Mutates the input. Returns the same
 * reference for convenience.
 *
 * The integration is intentionally simple: linear motion with axis-aligned
 * tile bounces. Both server (authoritative simulation) and client (aim
 * preview) call this so the previewed path matches what actually happens.
 */
export function stepGrenade<T extends GrenadeKinematics>(
  grenade: T,
  dt: number,
  grid: CollisionGrid,
): T {
  const newX = grenade.position.x + grenade.velocity.x * dt;
  const newY = grenade.position.y + grenade.velocity.y * dt;

  const tileX = Math.floor(newX / grid.tileSize);
  const tileY = Math.floor(newY / grid.tileSize);
  const oldTileX = Math.floor(grenade.position.x / grid.tileSize);
  const oldTileY = Math.floor(grenade.position.y / grid.tileSize);

  let hitWallX = false;
  let hitWallY = false;

  if (tileX !== oldTileX) {
    const checkX =
      tileX < 0 || tileX >= grid.width || tileY < 0 || tileY >= grid.height
        ? true
        : (grid.solid[Math.floor(grenade.position.y / grid.tileSize)]?.[tileX] ?? true);
    if (checkX) hitWallX = true;
  }

  if (tileY !== oldTileY) {
    const checkY =
      tileX < 0 || tileX >= grid.width || tileY < 0 || tileY >= grid.height
        ? true
        : (grid.solid[tileY]?.[Math.floor(grenade.position.x / grid.tileSize)] ?? true);
    if (checkY) hitWallY = true;
  }

  if (hitWallX) {
    grenade.velocity.x = -grenade.velocity.x;
  } else {
    grenade.position.x = newX;
  }

  if (hitWallY) {
    grenade.velocity.y = -grenade.velocity.y;
  } else {
    grenade.position.y = newY;
  }

  return grenade;
}
