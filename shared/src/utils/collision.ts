import { MapData, CollisionGrid, TileType } from '../types/map.js';
import { clamp } from './math.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RaycastResult {
  hitX: number;
  hitY: number;
  distance: number;
  hitTile: boolean;
}

export function pointInRect(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function rectOverlap(r1: Rect, r2: Rect): boolean {
  return (
    r1.x < r2.x + r2.width &&
    r1.x + r1.width > r2.x &&
    r1.y < r2.y + r2.height &&
    r1.y + r1.height > r2.y
  );
}

export function circleRectOverlap(
  cx: number,
  cy: number,
  cr: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= cr * cr;
}

export function createCollisionGrid(mapData: MapData): CollisionGrid {
  const solid: boolean[][] = [];
  for (let row = 0; row < mapData.height; row++) {
    solid[row] = [];
    for (let col = 0; col < mapData.width; col++) {
      const tile = mapData.tiles[row][col];
      solid[row][col] = tile === TileType.WALL || tile === TileType.COVER_LOW;
    }
  }
  return {
    width: mapData.width,
    height: mapData.height,
    tileSize: mapData.tileSize,
    solid,
  };
}

export function isTileSolid(
  grid: CollisionGrid,
  tileX: number,
  tileY: number,
): boolean {
  if (tileX < 0 || tileX >= grid.width || tileY < 0 || tileY >= grid.height) {
    return true;
  }
  return grid.solid[tileY][tileX];
}

export function raycastAgainstGrid(
  grid: CollisionGrid,
  startX: number,
  startY: number,
  angle: number,
  maxDistance: number,
): RaycastResult {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const ts = grid.tileSize;

  // Current tile position
  let tileX = Math.floor(startX / ts);
  let tileY = Math.floor(startY / ts);

  // Step direction
  const stepX = dirX >= 0 ? 1 : -1;
  const stepY = dirY >= 0 ? 1 : -1;

  // Distance along the ray to cross one full tile in each axis
  const tDeltaX = dirX !== 0 ? Math.abs(ts / dirX) : Infinity;
  const tDeltaY = dirY !== 0 ? Math.abs(ts / dirY) : Infinity;

  // Distance from start to the first tile boundary in each axis
  let tMaxX: number;
  if (dirX > 0) {
    tMaxX = ((tileX + 1) * ts - startX) / dirX;
  } else if (dirX < 0) {
    tMaxX = (tileX * ts - startX) / dirX;
  } else {
    tMaxX = Infinity;
  }

  let tMaxY: number;
  if (dirY > 0) {
    tMaxY = ((tileY + 1) * ts - startY) / dirY;
  } else if (dirY < 0) {
    tMaxY = (tileY * ts - startY) / dirY;
  } else {
    tMaxY = Infinity;
  }

  let distance = 0;

  while (distance < maxDistance) {
    if (tMaxX < tMaxY) {
      distance = tMaxX;
      tMaxX += tDeltaX;
      tileX += stepX;
    } else {
      distance = tMaxY;
      tMaxY += tDeltaY;
      tileY += stepY;
    }

    if (distance > maxDistance) break;

    if (isTileSolid(grid, tileX, tileY)) {
      return {
        hitX: startX + dirX * distance,
        hitY: startY + dirY * distance,
        distance,
        hitTile: true,
      };
    }
  }

  return {
    hitX: startX + dirX * maxDistance,
    hitY: startY + dirY * maxDistance,
    distance: maxDistance,
    hitTile: false,
  };
}

export function getCollidingTiles(
  grid: CollisionGrid,
  x: number,
  y: number,
  width: number,
  height: number,
): { tileX: number; tileY: number }[] {
  const ts = grid.tileSize;
  const minTileX = Math.floor(x / ts);
  const maxTileX = Math.floor((x + width - 0.001) / ts);
  const minTileY = Math.floor(y / ts);
  const maxTileY = Math.floor((y + height - 0.001) / ts);

  const result: { tileX: number; tileY: number }[] = [];

  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      if (isTileSolid(grid, tx, ty)) {
        result.push({ tileX: tx, tileY: ty });
      }
    }
  }

  return result;
}
