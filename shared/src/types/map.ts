export enum TileType {
  FLOOR = 0,
  WALL = 1,
  COVER_LOW = 2,
  SPAWN_POINT = 3,
  PICKUP_SPAWN = 4,
}

/** Pickup spawn kinds a map may declare. Mirrors PickupType values. */
export type PickupSpawnType =
  | 'gun_ammo'
  | 'grenade'
  | 'weapon_shotgun'
  | 'weapon_pistol'
  | 'weapon_bat'
  | 'bandage'
  | 'armor'
  | 'overcharge';

export interface MapTile {
  type: TileType;
  pickupType?: PickupSpawnType;
}

/**
 * A client sprite drawn centered on a tile rect (e.g. a wrecked car spanning
 * 1×2 solid tiles). Collision comes
 * exclusively from the tile types underneath. A decoration spanning multiple
 * solid cells groups them as one atomic prop for grenade destruction; its
 * texture and flip remain client-only presentation.
 */
export interface MapDecoration {
  /** Tile rect the sprite is centered on (tile coords, w/h in tiles). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Client texture key (see client boot-scene). Unknown keys are skipped. */
  texture: string;
  /** Mirror the sprite horizontally for cheap variety. */
  flipX?: boolean;
  /** Optional server-authored gameplay carried by this decorated solid. */
  hazard?: 'explosive_barrel';
  /** Optional interaction carried by this decorated solid. */
  interaction?: 'shootable_gate' | 'scavenger_cache';
}

export interface MapData {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  tiles: TileType[][];
  spawnPoints: { x: number; y: number }[];
  pickupSpawns: { x: number; y: number; type: PickupSpawnType }[];
  /**
   * Visual theme id resolved by the client tile renderer (see
   * client/src/rendering/map-themes.ts). Absent/unknown ids fall back to
   * the default wasteland look. Purely cosmetic — no gameplay effect.
   */
  theme?: string;
  /** Overlay sprites, some with optional authored gameplay; see MapDecoration. */
  decorations?: MapDecoration[];
  /**
   * King of the Hill zone positions — top-left tile of each
   * KOTH.HILL_SIZE_TILES² zone, in round-robin rotation order (the match
   * starts on the first entry). Every registry map must declare ≥3 (the
   * validator checks bounds/walkability when present; the registry
   * enforces presence so mode rotation can put KOTH on any map).
   */
  kothHills?: { x: number; y: number }[];
}

export interface CollisionGrid {
  width: number;
  height: number;
  tileSize: number;
  solid: boolean[][];
}
