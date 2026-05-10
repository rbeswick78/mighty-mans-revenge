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
   * Mark a tile as passable in the live collision grid. Used when Bruce's
   * fire-breath burns through an interior wall. Returns true if the tile
   * was solid before this call (i.e. a destruction actually happened) so
   * the caller can decide whether to broadcast.
   *
   * Only mutates the collision grid, never the underlying MapData — the
   * map JSON is shared with the registry across matches, and mutating it
   * would leak destruction state into the next match.
   */
  destroyTile(col: number, row: number): boolean {
    if (!this.collisionGrid) return false;
    if (
      row < 0 ||
      row >= this.collisionGrid.height ||
      col < 0 ||
      col >= this.collisionGrid.width
    ) {
      return false;
    }
    if (!this.collisionGrid.solid[row][col]) return false;
    this.collisionGrid.solid[row][col] = false;
    return true;
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
   * Pick a respawn point uniformly at random from spawn points not currently
   * occupied. A spawn is "occupied" if any position in `otherPositions` is
   * within one tile of it — keeps simultaneous respawns from colliding and
   * avoids spawning on top of a corpse or a live opponent who happens to be
   * standing on a spawn tile. Falls back to the spawn farthest from the
   * nearest occupier if every spawn is blocked.
   */
  pickRespawnPoint(otherPositions: Vec2[], rng: () => number = Math.random): Vec2 {
    const mapData = this.getMapData();
    const allSpawns = mapData.spawnPoints.map((sp) => this.spawnToPixel(sp));
    const minSeparation = mapData.tileSize;

    const available = allSpawns.filter((sp) =>
      otherPositions.every((op) => vecDistance(sp, op) >= minSeparation),
    );

    if (available.length > 0) {
      return available[Math.floor(rng() * available.length)];
    }

    // Degenerate fallback: pick the spawn whose nearest occupier is farthest.
    let bestSpawn = allSpawns[0];
    let bestNearest = -1;
    for (const sp of allSpawns) {
      let nearest = Infinity;
      for (const op of otherPositions) {
        const d = vecDistance(sp, op);
        if (d < nearest) nearest = d;
      }
      if (nearest > bestNearest) {
        bestNearest = nearest;
        bestSpawn = sp;
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
