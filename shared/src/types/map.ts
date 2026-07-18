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

export interface MapTilePoint {
  x: number;
  y: number;
}

export interface MapTileRect extends MapTilePoint {
  w: number;
  h: number;
}

export interface MapSpawnPoint extends MapTilePoint {
  /** Required by the 40x24 authoring profile; optional for legacy maps. */
  id?: string;
}

export interface MapPickupSpawn extends MapTilePoint {
  type: PickupSpawnType;
  /** Required by the 40x24 authoring profile; optional for legacy maps. */
  id?: string;
}

/**
 * A client sprite drawn centered on a tile rect (e.g. a wrecked car spanning
 * 1×2 solid tiles). Collision comes
 * exclusively from the tile types underneath. A decoration spanning multiple
 * solid cells groups them as one atomic prop for grenade destruction; its
 * texture and flip remain client-only presentation.
 */
export interface MapDecoration {
  /** Required for authored landmarks, gates, and hazards; optional for legacy maps. */
  id?: string;
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

export type StandardArenaSymmetryKind = 'rotational' | 'horizontal' | 'vertical' | 'asymmetric';

export interface StandardArenaRegion {
  /** Stable lower-kebab identity used by authoring metadata only. */
  id: string;
  /** Rectangles form a complete, non-overlapping partition of the tile grid. */
  areas: MapTileRect[];
}

export interface StandardArenaLandmark {
  id: string;
  regionId: string;
  footprint: MapTileRect;
  minimap: 'major' | 'minor' | 'hidden';
}

export interface StandardArenaConnectivityLink {
  id: string;
  fromRegionId: string;
  toRegionId: string;
  /** Optional shootable-gate decoration whose opposite sides join the regions. */
  gateId?: string;
}

export interface StandardArenaObjectiveAnchor {
  id: string;
  kind: 'koth' | 'core-run';
  regionId: string;
  footprint: MapTileRect;
}

export interface StandardArenaGateMetadata {
  decorationId: string;
  connectsRegionIds: readonly [string, string];
}

export interface StandardArenaHazardMetadata {
  decorationId: string;
  kind: 'explosive_barrel';
  regionId: string;
}

/**
 * Declarative review and loading contract for successor standard arenas.
 * Runtime simulation continues to consume the established MapData fields;
 * this block supplies deterministic authoring proof without client inference.
 */
export interface StandardArenaAuthoring {
  schemaVersion: 1;
  profile: 'standard-40x24';
  regions: StandardArenaRegion[];
  landmarks: StandardArenaLandmark[];
  minimap: {
    projection: 'orthographic-top-left';
    bounds: MapTileRect;
    landmarkIds: string[];
  };
  connectivity: {
    requireSingleWalkableComponent: true;
    links: StandardArenaConnectivityLink[];
  };
  objectives: StandardArenaObjectiveAnchor[];
  spawnSafety: {
    spawnIds: string[];
    minimumPathDistanceTiles: number;
    minimumEgressDirections: number;
  };
  pickupPlacement: {
    pickupIds: string[];
  };
  gates: StandardArenaGateMetadata[];
  hazards: StandardArenaHazardMetadata[];
  symmetryReview: {
    kind: StandardArenaSymmetryKind;
    rationale: string;
    /** Tile rectangles allowed to differ for a declared symmetric review. */
    exceptions: MapTileRect[];
    /** Asymmetric reviews must explicitly inspect all three available transforms. */
    checkedTransforms: Exclude<StandardArenaSymmetryKind, 'asymmetric'>[];
  };
}

export type BattleRoyaleBiome = 'wasteland' | 'overgrown' | 'industrial' | 'irradiated';

export interface BattleRoyaleArenaRegion {
  id: string;
  displayName: string;
  biome: BattleRoyaleBiome;
  areas: MapTileRect[];
  /** Tile used for the compact non-interactive minimap label. */
  label: MapTilePoint;
}

export interface BattleRoyaleArenaTransition {
  id: string;
  fromRegionId: string;
  toRegionId: string;
  orientation: 'horizontal' | 'vertical' | 'corner';
  footprint: MapTileRect;
}

export interface BattleRoyaleArenaLandmark {
  id: string;
  displayName: string;
  regionId: string;
  footprint: MapTileRect;
  minimap: 'major' | 'minor' | 'hidden';
}

export interface BattleRoyaleSpawnGroup {
  id: string;
  regionId: string;
  spawnIds: readonly [string, string];
}

export interface BattleRoyaleContainerSpawn extends MapTilePoint {
  id: string;
  regionId: string;
}

export interface BattleRoyaleArenaRoute {
  id: string;
  fromRegionId: string;
  toRegionId: string;
  waypoints: MapTilePoint[];
}

/** Declarative and runtime-consumed authoring truth for the private BR arena. */
export interface BattleRoyaleArenaAuthoring {
  schemaVersion: 1;
  profile: 'battle-royale-56x34';
  regions: BattleRoyaleArenaRegion[];
  transitions: BattleRoyaleArenaTransition[];
  landmarks: BattleRoyaleArenaLandmark[];
  minimap: {
    projection: 'orthographic-top-left';
    bounds: MapTileRect;
    regionIds: string[];
    landmarkIds: string[];
  };
  connectivity: {
    requireSingleWalkableComponent: true;
    routes: BattleRoyaleArenaRoute[];
  };
  spawnSafety: {
    groups: BattleRoyaleSpawnGroup[];
    minimumPathDistanceTiles: number;
    minimumEgressDirections: number;
  };
  containerSpawns: BattleRoyaleContainerSpawn[];
  sustainSpawnIds: string[];
}

export interface MapData {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  tiles: TileType[][];
  spawnPoints: MapSpawnPoint[];
  pickupSpawns: MapPickupSpawn[];
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
  /** Versioned authoring proof. Absent on the six legacy 20x12 maps. */
  authoring?: StandardArenaAuthoring;
  /** Private Battle Royale arena metadata; absent from every standard map. */
  battleRoyale?: BattleRoyaleArenaAuthoring;
}

/** Persisted real-match wins keyed by canonical arena name. */
export type ArenaWins = Record<string, number>;

export interface CollisionGrid {
  width: number;
  height: number;
  tileSize: number;
  solid: boolean[][];
}
