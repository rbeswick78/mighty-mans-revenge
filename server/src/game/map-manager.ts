import {
  MapData,
  CollisionGrid,
  Vec2,
  createCollisionGrid,
  vecDistance,
} from '@shared/game';

export class MapManager {
  private mapData: MapData | null = null;
  private collisionGrid: CollisionGrid | null = null;

  loadMap(mapData: MapData): void {
    this.mapData = mapData;
    this.collisionGrid = createCollisionGrid(mapData);
  }

  getCollisionGrid(): CollisionGrid {
    if (!this.collisionGrid) {
      throw new Error('No map loaded');
    }
    return this.collisionGrid;
  }

  getMapData(): MapData {
    if (!this.mapData) {
      throw new Error('No map loaded');
    }
    return this.mapData;
  }

  /**
   * Returns a random spawn point position in pixel coordinates.
   * Tile center = tile * tileSize + tileSize / 2
   */
  getRandomSpawnPoint(): Vec2 {
    const mapData = this.getMapData();
    const index = Math.floor(Math.random() * mapData.spawnPoints.length);
    return this.spawnToPixel(mapData.spawnPoints[index]);
  }

  /**
   * Returns `count` spawn positions in pixel coords with no duplicates
   * unless `count` exceeds the map's spawn-point count, in which case
   * only the overflow can repeat (each "round" reshuffles fresh).
   */
  pickInitialSpawns(count: number, rng: () => number = Math.random): Vec2[] {
    const mapData = this.getMapData();
    const result: Vec2[] = [];
    let pool: { x: number; y: number }[] = [];

    for (let i = 0; i < count; i++) {
      if (pool.length === 0) {
        pool = this.shuffle([...mapData.spawnPoints], rng);
      }
      result.push(this.spawnToPixel(pool.pop()!));
    }
    return result;
  }

  private shuffle<T>(arr: T[], rng: () => number): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Returns the spawn point farthest from the given position (in pixel coordinates).
   */
  getSpawnPointAwayFrom(pos: Vec2): Vec2 {
    const mapData = this.getMapData();
    let bestDist = -1;
    let bestSpawn: Vec2 = this.spawnToPixel(mapData.spawnPoints[0]);

    for (const sp of mapData.spawnPoints) {
      const pixelPos = this.spawnToPixel(sp);
      const dist = vecDistance(pixelPos, pos);
      if (dist > bestDist) {
        bestDist = dist;
        bestSpawn = pixelPos;
      }
    }

    return bestSpawn;
  }

  private spawnToPixel(spawn: { x: number; y: number }): Vec2 {
    const ts = this.getMapData().tileSize;
    return {
      x: spawn.x * ts + ts / 2,
      y: spawn.y * ts + ts / 2,
    };
  }
}
