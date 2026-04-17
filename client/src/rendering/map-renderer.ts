import Phaser from 'phaser';

import type { MapData, CollisionGrid } from '@shared/types/map.js';
import { TileType } from '@shared/types/map.js';
import { createCollisionGrid } from '@shared/utils/collision.js';

export class MapRenderer {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private collisionGrid: CollisionGrid | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  renderMap(mapData: MapData): Phaser.GameObjects.Container {
    // Clean up previous render if any
    this.destroy();

    const tileSize = mapData.tileSize;
    this.container = this.scene.add.container(0, 0);

    // Render tiles
    for (let row = 0; row < mapData.height; row++) {
      for (let col = 0; col < mapData.width; col++) {
        const tileType = mapData.tiles[row][col];
        const x = col * tileSize;
        const y = row * tileSize;

        const textureKey = this.getTileTexture(tileType);
        const sprite = this.scene.add.sprite(
          x + tileSize / 2,
          y + tileSize / 2,
          textureKey,
        );
        this.container.add(sprite);
      }
    }

    // Add spawn point indicators
    for (const spawn of mapData.spawnPoints) {
      const x = spawn.x * tileSize + tileSize / 2;
      const y = spawn.y * tileSize + tileSize / 2;

      const marker = this.scene.add.graphics();
      marker.lineStyle(1, 0x00ff66, 0.4);
      marker.strokeCircle(x, y, 8);
      // Small cross in center
      marker.lineStyle(1, 0x00ff66, 0.3);
      marker.lineBetween(x - 4, y, x + 4, y);
      marker.lineBetween(x, y - 4, x, y + 4);
      this.container.add(marker);
    }

    // Pickup spawn locations are not drawn here — PickupRenderer owns
    // their visuals based on authoritative server state (visible when
    // available, invisible while respawning).

    // Build collision grid for client-side prediction
    this.collisionGrid = createCollisionGrid(mapData);

    return this.container;
  }

  getCollisionGrid(): CollisionGrid | null {
    return this.collisionGrid;
  }

  destroy(): void {
    if (this.container) {
      this.container.destroy(true);
      this.container = null;
    }

    this.collisionGrid = null;
  }

  private getTileTexture(tileType: TileType): string {
    switch (tileType) {
      case TileType.FLOOR:
        return 'tile-floor';
      case TileType.WALL:
        return 'tile-wall';
      case TileType.COVER_LOW:
        return 'tile-cover';
      case TileType.SPAWN_POINT:
        return 'tile-floor';
      case TileType.PICKUP_SPAWN:
        return 'tile-floor';
      default:
        return 'tile-floor';
    }
  }
}
