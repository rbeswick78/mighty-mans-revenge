export enum TileType {
  FLOOR = 0,
  WALL = 1,
  COVER_LOW = 2,
  SPAWN_POINT = 3,
  PICKUP_SPAWN = 4,
}

export interface MapTile {
  type: TileType;
  pickupType?: 'gun_ammo' | 'grenade';
}

export interface MapData {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  tiles: TileType[][];
  spawnPoints: { x: number; y: number }[];
  pickupSpawns: { x: number; y: number; type: 'gun_ammo' | 'grenade' }[];
}

export interface CollisionGrid {
  width: number;
  height: number;
  tileSize: number;
  solid: boolean[][];
}
