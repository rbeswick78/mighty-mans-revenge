import {
  GRENADE,
  TileType,
  raycastAgainstGrid,
  type CollisionGrid,
  type MapData,
  type Vec2,
} from '@shared/game';

export interface DestroyedTile {
  col: number;
  row: number;
}

/**
 * Resolve low cover and decoration-backed interior solids exposed to one
 * grenade blast. Ordinary walls are never candidates and still shield props.
 *
 * Visibility is sampled against the untouched live grid: the candidate must
 * be the first solid tile on its centre ray. We collect every direct hit
 * before expanding multi-cell decorations, so breaking one prop cannot reveal
 * a second prop to the same explosion.
 */
export function findBlastableCoverTiles(
  mapData: MapData,
  grid: CollisionGrid,
  blast: Vec2,
  radius: number = GRENADE.BLAST_RADIUS,
): DestroyedTile[] {
  const direct = new Set<number>();
  const decorated = decoratedTileKeys(mapData);

  for (let row = 0; row < mapData.height; row++) {
    for (let col = 0; col < mapData.width; col++) {
      const key = tileKey(col, row, mapData.width);
      const type = mapData.tiles[row][col];
      const isLowCover = type === TileType.COVER_LOW;
      const isDecoratedWall = type === TileType.WALL && decorated.has(key);
      if (!isLowCover && !isDecoratedWall) continue;
      // A decoration can never punch a hole in the arena boundary.
      if (
        type === TileType.WALL &&
        (row === 0 ||
          row === mapData.height - 1 ||
          col === 0 ||
          col === mapData.width - 1)
      ) {
        continue;
      }
      if (!grid.solid[row]?.[col]) continue;

      const x = col * mapData.tileSize + mapData.tileSize / 2;
      const y = row * mapData.tileSize + mapData.tileSize / 2;
      const dx = x - blast.x;
      const dy = y - blast.y;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;

      if (distance === 0) {
        direct.add(key);
        continue;
      }

      const ray = raycastAgainstGrid(
        grid,
        blast.x,
        blast.y,
        Math.atan2(dy, dx),
        distance,
      );
      if (ray.hitTileX === col && ray.hitTileY === row) {
        direct.add(key);
      }
    }
  }

  const expanded = new Set(direct);
  for (const decoration of mapData.decorations ?? []) {
    let propWasHit = false;
    for (
      let row = decoration.y;
      row < decoration.y + decoration.h && !propWasHit;
      row++
    ) {
      for (let col = decoration.x; col < decoration.x + decoration.w; col++) {
        if (direct.has(tileKey(col, row, mapData.width))) {
          propWasHit = true;
          break;
        }
      }
    }
    if (!propWasHit) continue;

    for (let row = decoration.y; row < decoration.y + decoration.h; row++) {
      for (let col = decoration.x; col < decoration.x + decoration.w; col++) {
        const type = mapData.tiles[row]?.[col];
        const isInteriorWall =
          type === TileType.WALL &&
          row > 0 &&
          row < mapData.height - 1 &&
          col > 0 &&
          col < mapData.width - 1;
        if (
          (type === TileType.COVER_LOW || isInteriorWall) &&
          grid.solid[row]?.[col]
        ) {
          expanded.add(tileKey(col, row, mapData.width));
        }
      }
    }
  }

  return [...expanded]
    .map((key) => ({
      col: key % mapData.width,
      row: Math.floor(key / mapData.width),
    }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
}

function tileKey(col: number, row: number, width: number): number {
  return row * width + col;
}

function decoratedTileKeys(mapData: MapData): Set<number> {
  const keys = new Set<number>();
  for (const decoration of mapData.decorations ?? []) {
    for (let row = decoration.y; row < decoration.y + decoration.h; row++) {
      for (let col = decoration.x; col < decoration.x + decoration.w; col++) {
        if (row >= 0 && row < mapData.height && col >= 0 && col < mapData.width) {
          keys.add(tileKey(col, row, mapData.width));
        }
      }
    }
  }
  return keys;
}
