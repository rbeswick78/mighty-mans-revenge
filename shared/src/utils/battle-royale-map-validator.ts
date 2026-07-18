import {
  TileType,
  type BattleRoyaleArenaRegion,
  type BattleRoyaleBiome,
  type MapData,
  type MapTilePoint,
  type MapTileRect,
} from '../types/map.js';
import { validateMap } from './map-validator.js';

export interface BattleRoyaleMapValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly mapData?: MapData;
}

const BIOMES: readonly BattleRoyaleBiome[] = ['wasteland', 'overgrown', 'industrial', 'irradiated'];
const SUSTAIN_TYPES = new Set(['bandage', 'armor', 'grenade', 'overcharge']);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function issue(errors: string[], code: string, path: string, message: string): void {
  errors.push(`[${code}] ${path}: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasBaseMapShape(value: unknown): value is MapData {
  if (!isObject(value)) return false;
  return (
    typeof value.name === 'string' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    typeof value.tileSize === 'number' &&
    Array.isArray(value.tiles) &&
    Array.isArray(value.spawnPoints) &&
    Array.isArray(value.pickupSpawns)
  );
}

function tileKey(point: MapTilePoint): string {
  return `${point.x},${point.y}`;
}

function inBounds(map: MapData, point: MapTilePoint): boolean {
  return (
    Number.isInteger(point.x) &&
    Number.isInteger(point.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < map.width &&
    point.y < map.height
  );
}

function validRect(map: MapData, rect: MapTileRect): boolean {
  return (
    Number.isInteger(rect.x) &&
    Number.isInteger(rect.y) &&
    Number.isInteger(rect.w) &&
    Number.isInteger(rect.h) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.w > 0 &&
    rect.h > 0 &&
    rect.x + rect.w <= map.width &&
    rect.y + rect.h <= map.height
  );
}

function contains(rect: MapTileRect, point: MapTilePoint): boolean {
  return (
    point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.w && point.y < rect.y + rect.h
  );
}

function isWalkable(map: MapData, point: MapTilePoint): boolean {
  const tile = map.tiles[point.y]?.[point.x];
  return tile === TileType.FLOOR || tile === TileType.SPAWN_POINT || tile === TileType.PICKUP_SPAWN;
}

function exactInventory(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    [...actual].sort().every((id, index) => id === [...expected].sort()[index])
  );
}

function floodDistances(map: MapData, start: MapTilePoint): number[][] {
  const distances = Array.from({ length: map.height }, () =>
    Array.from({ length: map.width }, () => -1),
  );
  if (!isWalkable(map, start)) return distances;
  const queue: MapTilePoint[] = [start];
  distances[start.y][start.x] = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      if (!inBounds(map, next) || !isWalkable(map, next)) continue;
      if (distances[next.y][next.x] !== -1) continue;
      distances[next.y][next.x] = distances[current.y][current.x] + 1;
      queue.push(next);
    }
  }
  return distances;
}

function regionAt(regions: readonly BattleRoyaleArenaRegion[], point: MapTilePoint): string | null {
  return regions.find((region) => region.areas.some((area) => contains(area, point)))?.id ?? null;
}

function validateRegions(map: MapData, errors: string[]): void {
  const authoring = map.battleRoyale!;
  if (authoring.regions.length !== 4) {
    issue(errors, 'REGION_COUNT', '$.battleRoyale.regions', 'exactly four regions are required');
  }
  if (
    !exactInventory(
      authoring.regions.map(({ biome }) => biome),
      BIOMES,
    )
  ) {
    issue(
      errors,
      'REGION_BIOMES',
      '$.battleRoyale.regions',
      'wasteland, overgrown, industrial, and irradiated must each appear once',
    );
  }
  const ids = new Set<string>();
  const owner = new Array<string | null>(map.width * map.height).fill(null);
  authoring.regions.forEach((region, regionIndex) => {
    const path = `$.battleRoyale.regions[${regionIndex}]`;
    if (!ID_PATTERN.test(region.id) || ids.has(region.id)) {
      issue(errors, 'REGION_ID', `${path}.id`, 'must be a unique lower-kebab id');
    }
    ids.add(region.id);
    if (!region.displayName.trim()) issue(errors, 'REGION_NAME', `${path}.displayName`, 'required');
    if (!Array.isArray(region.areas) || region.areas.length === 0) {
      issue(errors, 'REGION_AREA', `${path}.areas`, 'at least one area is required');
    }
    region.areas.forEach((area, areaIndex) => {
      const areaPath = `${path}.areas[${areaIndex}]`;
      if (!validRect(map, area)) {
        issue(errors, 'REGION_BOUNDS', areaPath, 'must be an in-bounds positive tile rect');
        return;
      }
      for (let y = area.y; y < area.y + area.h; y += 1) {
        for (let x = area.x; x < area.x + area.w; x += 1) {
          const key = y * map.width + x;
          if (owner[key] !== null) {
            issue(errors, 'REGION_OVERLAP', areaPath, `tile (${x}, ${y}) is assigned twice`);
          } else owner[key] = region.id;
        }
      }
    });
    if (!inBounds(map, region.label) || regionAt(authoring.regions, region.label) !== region.id) {
      issue(errors, 'REGION_LABEL', `${path}.label`, 'must be an in-region tile');
    }
  });
  if (owner.some((id) => id === null)) {
    issue(errors, 'REGION_COVERAGE', '$.battleRoyale.regions', 'regions must partition the grid');
  }
}

function validateConnectivity(map: MapData, errors: string[]): void {
  const authoring = map.battleRoyale!;
  const first = map.spawnPoints[0];
  const distances = first ? floodDistances(map, first) : [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (isWalkable(map, { x, y }) && distances[y]?.[x] === -1) {
        issue(
          errors,
          'CONNECTIVITY_COMPONENT',
          '$.battleRoyale.connectivity',
          `walkable tile (${x}, ${y}) is disconnected`,
        );
        return;
      }
    }
  }
  const regionIds = new Set(authoring.regions.map(({ id }) => id));
  const graph = new Map([...regionIds].map((id) => [id, new Set<string>()]));
  const routeIds = new Set<string>();
  authoring.connectivity.routes.forEach((route, index) => {
    const path = `$.battleRoyale.connectivity.routes[${index}]`;
    if (!ID_PATTERN.test(route.id) || routeIds.has(route.id)) {
      issue(errors, 'ROUTE_ID', `${path}.id`, 'must be a unique lower-kebab id');
    }
    routeIds.add(route.id);
    if (!regionIds.has(route.fromRegionId) || !regionIds.has(route.toRegionId)) {
      issue(errors, 'ROUTE_REGION', path, 'route references an unknown region');
    } else {
      graph.get(route.fromRegionId)!.add(route.toRegionId);
      graph.get(route.toRegionId)!.add(route.fromRegionId);
    }
    if (
      !Array.isArray(route.waypoints) ||
      route.waypoints.some((point) => !isWalkable(map, point))
    ) {
      issue(errors, 'ROUTE_WAYPOINT', `${path}.waypoints`, 'all route waypoints must be walkable');
    }
  });
  const start = authoring.regions[0]?.id;
  const visited = new Set<string>();
  const queue = start ? [start] : [];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of graph.get(id) ?? []) queue.push(next);
  }
  if (visited.size !== regionIds.size) {
    issue(
      errors,
      'ROUTE_GRAPH',
      '$.battleRoyale.connectivity.routes',
      'region route graph must connect',
    );
  }
}

function validateSpawns(map: MapData, errors: string[]): void {
  const authoring = map.battleRoyale!;
  const groups = authoring.spawnSafety.groups;
  if (groups.length !== 8) {
    issue(
      errors,
      'SPAWN_GROUP_COUNT',
      '$.battleRoyale.spawnSafety.groups',
      'exactly eight groups are required',
    );
  }
  const spawnById = new Map(map.spawnPoints.map((spawn) => [spawn.id ?? '', spawn]));
  const groupIds = new Set<string>();
  const usedSpawnIds: string[] = [];
  const regionIds = new Set(authoring.regions.map(({ id }) => id));
  groups.forEach((group, index) => {
    const path = `$.battleRoyale.spawnSafety.groups[${index}]`;
    if (!ID_PATTERN.test(group.id) || groupIds.has(group.id)) {
      issue(errors, 'SPAWN_GROUP_ID', `${path}.id`, 'must be a unique lower-kebab id');
    }
    groupIds.add(group.id);
    if (!regionIds.has(group.regionId)) issue(errors, 'SPAWN_GROUP_REGION', path, 'unknown region');
    if (!Array.isArray(group.spawnIds) || group.spawnIds.length !== 2) {
      issue(errors, 'SPAWN_GROUP_SIZE', `${path}.spawnIds`, 'exactly two candidates are required');
      return;
    }
    for (const spawnId of group.spawnIds) {
      usedSpawnIds.push(spawnId);
      const spawn = spawnById.get(spawnId);
      if (!spawn || regionAt(authoring.regions, spawn) !== group.regionId) {
        issue(errors, 'SPAWN_GROUP_MEMBER', `${path}.spawnIds`, `invalid candidate "${spawnId}"`);
        continue;
      }
      const egress = [
        { x: spawn.x + 1, y: spawn.y },
        { x: spawn.x - 1, y: spawn.y },
        { x: spawn.x, y: spawn.y + 1 },
        { x: spawn.x, y: spawn.y - 1 },
      ].filter((point) => isWalkable(map, point)).length;
      if (egress < authoring.spawnSafety.minimumEgressDirections) {
        issue(
          errors,
          'SPAWN_EGRESS',
          `${path}.spawnIds`,
          `${spawnId} has only ${egress} safe exits`,
        );
      }
    }
  });
  const expectedSpawnIds = map.spawnPoints.map(({ id }) => id ?? '');
  if (!exactInventory(usedSpawnIds, expectedSpawnIds)) {
    issue(
      errors,
      'SPAWN_INVENTORY',
      '$.battleRoyale.spawnSafety.groups',
      'must own every spawn exactly once',
    );
  }
  for (let left = 0; left < groups.length; left += 1) {
    const leftPoints = groups[left].spawnIds.map((id) => spawnById.get(id)).filter(Boolean);
    const distanceFields = leftPoints.map((point) => floodDistances(map, point!));
    for (let right = left + 1; right < groups.length; right += 1) {
      const rightPoints = groups[right].spawnIds.map((id) => spawnById.get(id)).filter(Boolean);
      const distance = Math.min(
        ...distanceFields.flatMap((field) =>
          rightPoints
            .map((point) => field[point!.y]?.[point!.x] ?? -1)
            .filter((value) => value >= 0),
        ),
      );
      if (!Number.isFinite(distance) || distance < authoring.spawnSafety.minimumPathDistanceTiles) {
        issue(
          errors,
          'SPAWN_SEPARATION',
          '$.battleRoyale.spawnSafety.minimumPathDistanceTiles',
          `groups "${groups[left].id}" and "${groups[right].id}" have path distance ${distance}`,
        );
      }
    }
  }
}

function validateAuthoredObjects(map: MapData, errors: string[]): void {
  const authoring = map.battleRoyale!;
  const regionIds = new Set(authoring.regions.map(({ id }) => id));
  const decorationIds = new Set((map.decorations ?? []).map(({ id }) => id).filter(Boolean));
  const landmarkIds = new Set<string>();
  authoring.landmarks.forEach((landmark, index) => {
    const path = `$.battleRoyale.landmarks[${index}]`;
    if (!ID_PATTERN.test(landmark.id) || landmarkIds.has(landmark.id)) {
      issue(errors, 'LANDMARK_ID', `${path}.id`, 'must be a unique lower-kebab id');
    }
    landmarkIds.add(landmark.id);
    if (!decorationIds.has(landmark.id))
      issue(errors, 'LANDMARK_DECORATION', path, 'missing decoration');
    if (!regionIds.has(landmark.regionId) || !validRect(map, landmark.footprint)) {
      issue(errors, 'LANDMARK_REGION', path, 'must be an in-bounds landmark in a known region');
    }
  });

  const occupied = new Set([...map.spawnPoints.map(tileKey), ...map.pickupSpawns.map(tileKey)]);
  const containerIds = new Set<string>();
  authoring.containerSpawns.forEach((container, index) => {
    const path = `$.battleRoyale.containerSpawns[${index}]`;
    if (!ID_PATTERN.test(container.id) || containerIds.has(container.id)) {
      issue(errors, 'CONTAINER_ID', `${path}.id`, 'must be a unique lower-kebab id');
    }
    containerIds.add(container.id);
    if (
      !inBounds(map, container) ||
      map.tiles[container.y]?.[container.x] !== TileType.COVER_LOW ||
      !regionIds.has(container.regionId) ||
      regionAt(authoring.regions, container) !== container.regionId ||
      occupied.has(tileKey(container))
    ) {
      issue(
        errors,
        'CONTAINER_PLACEMENT',
        path,
        'must be unique in-region COVER_LOW off spawns/pickups',
      );
    }
    occupied.add(tileKey(container));
  });

  const pickupById = new Map(map.pickupSpawns.map((spawn) => [spawn.id ?? '', spawn]));
  if (new Set(authoring.sustainSpawnIds).size !== authoring.sustainSpawnIds.length) {
    issue(errors, 'SUSTAIN_ID', '$.battleRoyale.sustainSpawnIds', 'ids must be unique');
  }
  for (const id of authoring.sustainSpawnIds) {
    const spawn = pickupById.get(id);
    if (!spawn || !SUSTAIN_TYPES.has(spawn.type)) {
      issue(
        errors,
        'SUSTAIN_ID',
        '$.battleRoyale.sustainSpawnIds',
        `invalid sustain spawn "${id}"`,
      );
    }
  }
  if (!exactInventory(authoring.sustainSpawnIds, [...pickupById.keys()])) {
    issue(
      errors,
      'SUSTAIN_INVENTORY',
      '$.battleRoyale.sustainSpawnIds',
      'must own every pickup spawn',
    );
  }
}

function validateMinimapAndTransitions(map: MapData, errors: string[]): void {
  const authoring = map.battleRoyale!;
  const regionIds = authoring.regions.map(({ id }) => id);
  const landmarkIds = authoring.landmarks
    .filter(({ minimap }) => minimap !== 'hidden')
    .map(({ id }) => id);
  if (
    authoring.minimap.projection !== 'orthographic-top-left' ||
    authoring.minimap.bounds.x !== 0 ||
    authoring.minimap.bounds.y !== 0 ||
    authoring.minimap.bounds.w !== map.width ||
    authoring.minimap.bounds.h !== map.height
  ) {
    issue(errors, 'MINIMAP_BOUNDS', '$.battleRoyale.minimap', 'must project the complete grid');
  }
  if (!exactInventory(authoring.minimap.regionIds, regionIds)) {
    issue(
      errors,
      'MINIMAP_REGIONS',
      '$.battleRoyale.minimap.regionIds',
      'must list all regions once',
    );
  }
  if (!exactInventory(authoring.minimap.landmarkIds, landmarkIds)) {
    issue(
      errors,
      'MINIMAP_LANDMARKS',
      '$.battleRoyale.minimap.landmarkIds',
      'visible inventory mismatch',
    );
  }
  const transitionIds = new Set<string>();
  for (const [index, transition] of authoring.transitions.entries()) {
    const path = `$.battleRoyale.transitions[${index}]`;
    if (!ID_PATTERN.test(transition.id) || transitionIds.has(transition.id)) {
      issue(errors, 'TRANSITION_ID', `${path}.id`, 'must be a unique lower-kebab id');
    }
    transitionIds.add(transition.id);
    if (
      !regionIds.includes(transition.fromRegionId) ||
      !regionIds.includes(transition.toRegionId) ||
      transition.fromRegionId === transition.toRegionId ||
      !validRect(map, transition.footprint)
    ) {
      issue(errors, 'TRANSITION_PLACEMENT', path, 'must connect two known regions in bounds');
    }
  }
}

export function validateBattleRoyaleMapDocument(value: unknown): BattleRoyaleMapValidationResult {
  const errors: string[] = [];
  if (!hasBaseMapShape(value)) {
    return { valid: false, errors: ['[MAP_SHAPE] $: incomplete MapData document'] };
  }
  const map = value;
  if (map.width !== 56 || map.height !== 34 || map.tileSize !== 48) {
    issue(errors, 'DIMENSIONS', '$', 'Battle Royale arena must be exactly 56x34 at 48px');
  }
  const base = validateMap(map);
  for (const message of base.errors) issue(errors, 'BASE_MAP', '$', message);
  if (map.battleRoyale?.schemaVersion !== 1 || map.battleRoyale.profile !== 'battle-royale-56x34') {
    issue(
      errors,
      'AUTHORING_SCHEMA',
      '$.battleRoyale',
      'missing battle-royale-56x34 schema version 1',
    );
    return { valid: false, errors };
  }
  try {
    if (map.battleRoyale.connectivity.requireSingleWalkableComponent !== true) {
      issue(
        errors,
        'CONNECTIVITY_POLICY',
        '$.battleRoyale.connectivity',
        'must require one component',
      );
    }
    validateRegions(map, errors);
    validateConnectivity(map, errors);
    validateSpawns(map, errors);
    validateAuthoredObjects(map, errors);
    validateMinimapAndTransitions(map, errors);
  } catch {
    issue(
      errors,
      'AUTHORING_SHAPE',
      '$.battleRoyale',
      'must contain the complete version-1 arena structure',
    );
  }
  return errors.length === 0 ? { valid: true, errors, mapData: map } : { valid: false, errors };
}

export function battleRoyaleRegionAt(
  map: Pick<MapData, 'battleRoyale'>,
  col: number,
  row: number,
): BattleRoyaleArenaRegion | null {
  return (
    map.battleRoyale?.regions.find((region) =>
      region.areas.some((area) => contains(area, { x: col, y: row })),
    ) ?? null
  );
}

export function battleRoyaleBiomeAt(
  map: Pick<MapData, 'battleRoyale' | 'theme'>,
  col: number,
  row: number,
): BattleRoyaleBiome | null {
  return battleRoyaleRegionAt(map, col, row)?.biome ?? null;
}

export function battleRoyaleTransitionAt(
  map: Pick<MapData, 'battleRoyale'>,
  col: number,
  row: number,
): 'horizontal' | 'vertical' | 'corner' | null {
  return (
    map.battleRoyale?.transitions.find((transition) =>
      contains(transition.footprint, { x: col, y: row }),
    )?.orientation ?? null
  );
}
