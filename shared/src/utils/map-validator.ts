import { MapData, TileType } from '../types/map.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateMap(mapData: MapData): ValidationResult {
  const errors: string[] = [];

  // Check dimensions match tile grid
  if (mapData.tiles.length !== mapData.height) {
    errors.push(
      `Tile grid row count (${mapData.tiles.length}) does not match declared height (${mapData.height})`,
    );
  }

  for (let row = 0; row < mapData.tiles.length; row++) {
    if (mapData.tiles[row].length !== mapData.width) {
      errors.push(
        `Row ${row} has ${mapData.tiles[row].length} columns, expected ${mapData.width}`,
      );
    }
  }

  // Check minimum spawn points
  if (mapData.spawnPoints.length < 2) {
    errors.push(
      `Map must have at least 2 spawn points, found ${mapData.spawnPoints.length}`,
    );
  }

  // Check border tiles are all walls
  if (mapData.tiles.length === mapData.height) {
    for (let col = 0; col < mapData.width; col++) {
      if (mapData.tiles[0][col] !== TileType.WALL) {
        errors.push(`Top border tile at column ${col} is not a wall`);
      }
      if (mapData.tiles[mapData.height - 1][col] !== TileType.WALL) {
        errors.push(`Bottom border tile at column ${col} is not a wall`);
      }
    }
    for (let row = 0; row < mapData.height; row++) {
      if (mapData.tiles[row][0] !== TileType.WALL) {
        errors.push(`Left border tile at row ${row} is not a wall`);
      }
      if (mapData.tiles[row][mapData.width - 1] !== TileType.WALL) {
        errors.push(`Right border tile at row ${row} is not a wall`);
      }
    }
  }

  // Check spawn points are on FLOOR or SPAWN_POINT tiles
  for (const sp of mapData.spawnPoints) {
    if (sp.y < 0 || sp.y >= mapData.height || sp.x < 0 || sp.x >= mapData.width) {
      errors.push(`Spawn point (${sp.x}, ${sp.y}) is out of map bounds`);
      continue;
    }
    const tile = mapData.tiles[sp.y][sp.x];
    if (tile !== TileType.FLOOR && tile !== TileType.SPAWN_POINT) {
      errors.push(
        `Spawn point (${sp.x}, ${sp.y}) is on tile type ${tile}, must be FLOOR or SPAWN_POINT`,
      );
    }
  }

  // Check pickup spawns are on FLOOR or PICKUP_SPAWN tiles
  for (const ps of mapData.pickupSpawns) {
    if (ps.y < 0 || ps.y >= mapData.height || ps.x < 0 || ps.x >= mapData.width) {
      errors.push(`Pickup spawn (${ps.x}, ${ps.y}) is out of map bounds`);
      continue;
    }
    const tile = mapData.tiles[ps.y][ps.x];
    if (tile !== TileType.FLOOR && tile !== TileType.PICKUP_SPAWN) {
      errors.push(
        `Pickup spawn (${ps.x}, ${ps.y}) is on tile type ${tile}, must be FLOOR or PICKUP_SPAWN`,
      );
    }
  }

  // Check all spawn points are reachable from each other (BFS flood fill)
  if (mapData.spawnPoints.length >= 2 && errors.length === 0) {
    const reachabilityErrors = checkSpawnReachability(mapData);
    errors.push(...reachabilityErrors);
  }

  return { valid: errors.length === 0, errors };
}

function isWalkable(tileType: TileType): boolean {
  return (
    tileType === TileType.FLOOR ||
    tileType === TileType.SPAWN_POINT ||
    tileType === TileType.PICKUP_SPAWN
  );
}

function checkSpawnReachability(mapData: MapData): string[] {
  const errors: string[] = [];
  const { width, height, tiles } = mapData;

  // BFS from first spawn point
  const start = mapData.spawnPoints[0];
  const visited: boolean[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => false),
  );

  const queue: { x: number; y: number }[] = [{ x: start.x, y: start.y }];
  visited[start.y][start.x] = true;

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (visited[ny][nx]) continue;
      if (!isWalkable(tiles[ny][nx])) continue;

      visited[ny][nx] = true;
      queue.push({ x: nx, y: ny });
    }
  }

  // Check all other spawn points are reachable
  for (let i = 1; i < mapData.spawnPoints.length; i++) {
    const sp = mapData.spawnPoints[i];
    if (!visited[sp.y][sp.x]) {
      errors.push(
        `Spawn point (${sp.x}, ${sp.y}) is not reachable from spawn point (${start.x}, ${start.y})`,
      );
    }
  }

  return errors;
}
