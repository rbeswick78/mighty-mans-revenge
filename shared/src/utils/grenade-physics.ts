import { CollisionGrid } from '../types/map.js';
import { Vec2 } from '../types/common.js';

export interface GrenadeKinematics {
  position: Vec2;
  velocity: Vec2;
  /**
   * When true, the grenade ignores interior walls and cover but is still
   * contained by the map's outer perimeter so it eventually detonates inside
   * the playable area. Set on grenades thrown during Mighty Man's x-ray
   * vision; left undefined / false everywhere else.
   */
  piercing?: boolean;
}

/**
 * True when a tile should bounce a grenade. Out-of-bounds always bounces.
 * For non-piercing grenades, every solid tile bounces. For piercing
 * grenades, only perimeter tiles bounce — interior walls and cover are
 * passed through.
 */
function blocksGrenade(
  grid: CollisionGrid,
  tx: number,
  ty: number,
  piercing: boolean,
): boolean {
  if (tx < 0 || tx >= grid.width || ty < 0 || ty >= grid.height) return true;
  const solid = grid.solid[ty]?.[tx] ?? true;
  if (!solid) return false;
  if (!piercing) return true;
  return tx === 0 || tx === grid.width - 1 || ty === 0 || ty === grid.height - 1;
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
  const piercing = !!grenade.piercing;
  const newX = grenade.position.x + grenade.velocity.x * dt;
  const newY = grenade.position.y + grenade.velocity.y * dt;

  const tileX = Math.floor(newX / grid.tileSize);
  const tileY = Math.floor(newY / grid.tileSize);
  const oldTileX = Math.floor(grenade.position.x / grid.tileSize);
  const oldTileY = Math.floor(grenade.position.y / grid.tileSize);

  const hitWallX = tileX !== oldTileX && blocksGrenade(grid, tileX, oldTileY, piercing);
  const hitWallY = tileY !== oldTileY && blocksGrenade(grid, oldTileX, tileY, piercing);

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
