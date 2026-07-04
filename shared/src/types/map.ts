export enum TileType {
  FLOOR = 0,
  WALL = 1,
  COVER_LOW = 2,
  SPAWN_POINT = 3,
  PICKUP_SPAWN = 4,
}

/** Pickup spawn kinds a map may declare. Mirrors PickupType values. */
export type PickupSpawnType = 'gun_ammo' | 'grenade' | 'weapon_shotgun' | 'bandage';

export interface MapTile {
  type: TileType;
  pickupType?: PickupSpawnType;
}

export interface MapData {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  tiles: TileType[][];
  spawnPoints: { x: number; y: number }[];
  pickupSpawns: { x: number; y: number; type: PickupSpawnType }[];
}

export interface CollisionGrid {
  width: number;
  height: number;
  tileSize: number;
  solid: boolean[][];
}
