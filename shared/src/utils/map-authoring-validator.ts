import { KOTH } from '../config/game.js';
import {
  TileType,
  type MapData,
  type MapDecoration,
  type MapTilePoint,
  type MapTileRect,
  type StandardArenaAuthoring,
  type StandardArenaSymmetryKind,
} from '../types/map.js';
import { validateMap } from './map-validator.js';

export type MapValidationProfile = 'compatible' | 'standard-40x24';

export interface MapValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface MapDocumentValidationResult {
  valid: boolean;
  errors: string[];
  issues: MapValidationIssue[];
  mapData?: MapData;
}

const STANDARD_WIDTH = 40;
const STANDARD_HEIGHT = 24;
const STANDARD_TILE_SIZE = 48;
const STANDARD_PLAYER_CAPACITY = 4;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WALKABLE_TILES = new Set<TileType>([
  TileType.FLOOR,
  TileType.SPAWN_POINT,
  TileType.PICKUP_SPAWN,
]);
const TILE_TYPES = new Set<number>(
  Object.values(TileType).filter((value) => typeof value === 'number'),
);
const PICKUP_TYPES = new Set([
  'gun_ammo',
  'grenade',
  'weapon_shotgun',
  'weapon_pistol',
  'weapon_bat',
  'bandage',
  'armor',
  'overcharge',
]);

/**
 * Validate a parsed JSON value through the shared client/server-compatible
 * loading boundary. The compatible profile accepts the six legacy maps;
 * successor 40x24 arenas use the strict standard profile.
 */
export function validateMapDocument(
  value: unknown,
  profile: MapValidationProfile = 'compatible',
): MapDocumentValidationResult {
  const issues: MapValidationIssue[] = [];
  if (!isRecord(value)) {
    addIssue(issues, 'MAP_DOCUMENT_TYPE', '$', 'map document must be an object');
    return result(issues);
  }

  validateDocumentShape(value, issues);
  if (issues.length > 0) return result(issues);

  const mapData = value as unknown as MapData;
  for (const error of validateMap(mapData).errors) {
    addIssue(issues, 'MAP_BASE', '$', error);
  }
  validateRuntimeValues(mapData, issues);

  if (profile === 'standard-40x24' || mapData.authoring !== undefined) {
    if (
      mapData.width !== STANDARD_WIDTH ||
      mapData.height !== STANDARD_HEIGHT ||
      mapData.tileSize !== STANDARD_TILE_SIZE
    ) {
      addIssue(
        issues,
        'ARENA_DIMENSIONS',
        '$',
        `standard arena must be ${STANDARD_WIDTH}x${STANDARD_HEIGHT} at tileSize ${STANDARD_TILE_SIZE}; found ${mapData.width}x${mapData.height} at ${mapData.tileSize}`,
      );
    }
    if (profile === 'standard-40x24' && mapData.authoring === undefined) {
      addIssue(
        issues,
        'AUTHORING_REQUIRED',
        '$.authoring',
        'standard-40x24 profile requires a versioned authoring block',
      );
    }
  }

  if (mapData.authoring !== undefined) {
    if (!hasAuthoringShape(mapData.authoring)) {
      addIssue(
        issues,
        'AUTHORING_SCHEMA',
        '$.authoring',
        'authoring block is missing required arrays or nested objects',
      );
    } else {
      try {
        validateStandardAuthoring(mapData, mapData.authoring, issues);
      } catch {
        addIssue(
          issues,
          'AUTHORING_SCHEMA',
          '$.authoring',
          'authoring block contains an invalid nested value',
        );
      }
    }
  }

  return result(issues, mapData);
}

function validateStandardAuthoring(
  mapData: MapData,
  authoring: StandardArenaAuthoring,
  issues: MapValidationIssue[],
): void {
  if (authoring.schemaVersion !== 1 || authoring.profile !== 'standard-40x24') {
    addIssue(
      issues,
      'AUTHORING_SCHEMA',
      '$.authoring',
      'schemaVersion must be 1 and profile must be "standard-40x24"',
    );
  }

  const regionByCell = validateRegions(mapData, authoring, issues);
  validateLandmarks(mapData, authoring, regionByCell, issues);
  validateMinimap(mapData, authoring, issues);
  const reachable = validateConnectivity(mapData, authoring, regionByCell, issues);
  validateObjectives(mapData, authoring, regionByCell, reachable, issues);
  validateSpawns(mapData, authoring, reachable, issues);
  validatePickups(mapData, authoring, reachable, issues);
  validateGatesAndHazards(mapData, authoring, regionByCell, issues);
  validateSymmetry(mapData, authoring, issues);
}

function validateRegions(
  mapData: MapData,
  authoring: StandardArenaAuthoring,
  issues: MapValidationIssue[],
): (string | null)[] {
  const regionByCell = new Array<string | null>(mapData.width * mapData.height).fill(null);
  const regionIds = new Set<string>();
  if (authoring.regions.length < 2) {
    addIssue(issues, 'REGION_COUNT', '$.authoring.regions', 'at least two regions are required');
  }

  authoring.regions.forEach((region, regionIndex) => {
    const path = `$.authoring.regions[${regionIndex}]`;
    validateId(region.id, `${path}.id`, regionIds, issues, 'REGION_ID');
    if (!Array.isArray(region.areas) || region.areas.length === 0) {
      addIssue(issues, 'REGION_AREA', `${path}.areas`, 'region must declare at least one area');
      return;
    }
    region.areas.forEach((area, areaIndex) => {
      const areaPath = `${path}.areas[${areaIndex}]`;
      if (!validateRect(area, mapData, areaPath, issues, 'REGION_BOUNDS')) return;
      forEachCell(area, (x, y) => {
        const key = tileKey(x, y, mapData.width);
        const owner = regionByCell[key];
        if (owner !== null) {
          addIssue(
            issues,
            'REGION_OVERLAP',
            areaPath,
            `tile (${x}, ${y}) is assigned to both "${owner}" and "${region.id}"`,
          );
        } else {
          regionByCell[key] = region.id;
        }
      });
    });
  });

  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      if (regionByCell[tileKey(x, y, mapData.width)] === null) {
        addIssue(
          issues,
          'REGION_COVERAGE',
          '$.authoring.regions',
          `tile (${x}, ${y}) is not assigned to a region`,
        );
      }
    }
  }
  return regionByCell;
}

function validateLandmarks(
  mapData: MapData,
  authoring: StandardArenaAuthoring,
  regionByCell: readonly (string | null)[],
  issues: MapValidationIssue[],
): void {
  const ids = new Set<string>();
  const regionIds = new Set(authoring.regions.map((region) => region.id));
  authoring.landmarks.forEach((landmark, index) => {
    const path = `$.authoring.landmarks[${index}]`;
    validateId(landmark.id, `${path}.id`, ids, issues, 'LANDMARK_ID');
    if (!regionIds.has(landmark.regionId)) {
      addIssue(
        issues,
        'LANDMARK_REGION',
        `${path}.regionId`,
        `unknown region "${landmark.regionId}"`,
      );
    }
    if (
      !validateRect(landmark.footprint, mapData, `${path}.footprint`, issues, 'LANDMARK_BOUNDS')
    ) {
      return;
    }
    const touchesRegion = cellsOf(landmark.footprint).some(
      ({ x, y }) => regionByCell[tileKey(x, y, mapData.width)] === landmark.regionId,
    );
    if (!touchesRegion) {
      addIssue(
        issues,
        'LANDMARK_REGION',
        `${path}.footprint`,
        `footprint does not intersect declared region "${landmark.regionId}"`,
      );
    }
  });
}

function validateMinimap(
  mapData: MapData,
  authoring: StandardArenaAuthoring,
  issues: MapValidationIssue[],
): void {
  if (authoring.minimap.projection !== 'orthographic-top-left') {
    addIssue(
      issues,
      'MINIMAP_PROJECTION',
      '$.authoring.minimap.projection',
      'projection must be "orthographic-top-left"',
    );
  }
  const bounds = authoring.minimap.bounds;
  if (
    bounds.x !== 0 ||
    bounds.y !== 0 ||
    bounds.w !== mapData.width ||
    bounds.h !== mapData.height
  ) {
    addIssue(
      issues,
      'MINIMAP_BOUNDS',
      '$.authoring.minimap.bounds',
      `bounds must cover the full tile grid (0, 0, ${mapData.width}x${mapData.height})`,
    );
  }
  const expected = authoring.landmarks
    .filter((landmark) => landmark.minimap !== 'hidden')
    .map((landmark) => landmark.id);
  validateExactIdInventory(
    authoring.minimap.landmarkIds,
    expected,
    '$.authoring.minimap.landmarkIds',
    'MINIMAP_LANDMARK',
    issues,
  );
}

function validateConnectivity(
  mapData: MapData,
  authoring: StandardArenaAuthoring,
  regionByCell: readonly (string | null)[],
  issues: MapValidationIssue[],
): boolean[][] {
  if (authoring.connectivity.requireSingleWalkableComponent !== true) {
    addIssue(
      issues,
      'CONNECTIVITY_POLICY',
      '$.authoring.connectivity.requireSingleWalkableComponent',
      'must be literal true',
    );
  }
  const start = mapData.spawnPoints[0] ?? firstWalkable(mapData);
  const reachable = start ? floodWalkable(mapData, start) : emptyVisited(mapData);
  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      if (isWalkableAt(mapData, x, y) && !reachable[y][x]) {
        addIssue(
          issues,
          'CONNECTIVITY_COMPONENT',
          '$.authoring.connectivity',
          `walkable tile (${x}, ${y}) is outside the primary component`,
        );
      }
    }
  }

  const regionIds = new Set(authoring.regions.map((region) => region.id));
  const regionGraph = new Map([...regionIds].map((id) => [id, new Set<string>()]));
  const linkIds = new Set<string>();
  authoring.connectivity.links.forEach((link, index) => {
    const path = `$.authoring.connectivity.links[${index}]`;
    validateId(link.id, `${path}.id`, linkIds, issues, 'CONNECTIVITY_LINK');
    if (!regionIds.has(link.fromRegionId) || !regionIds.has(link.toRegionId)) {
      addIssue(
        issues,
        'CONNECTIVITY_LINK',
        path,
        `link references unknown region pair "${link.fromRegionId}"/"${link.toRegionId}"`,
      );
      return;
    }
    if (link.fromRegionId === link.toRegionId) {
      addIssue(issues, 'CONNECTIVITY_LINK', path, 'link regions must be distinct');
      return;
    }
    regionGraph.get(link.fromRegionId)?.add(link.toRegionId);
    regionGraph.get(link.toRegionId)?.add(link.fromRegionId);
    if (link.gateId) {
      const gate = findDecoration(mapData, link.gateId, 'shootable_gate');
      if (!gate || !gateBridgesRegions(mapData, gate, link, regionByCell)) {
        addIssue(
          issues,
          'CONNECTIVITY_LINK',
          path,
          `gate "${link.gateId}" does not bridge the declared region pair`,
        );
      }
    } else if (
      !regionsShareWalkableEdge(mapData, link.fromRegionId, link.toRegionId, regionByCell)
    ) {
      addIssue(issues, 'CONNECTIVITY_LINK', path, 'declared regions do not share a walkable edge');
    }
  });
  const firstRegion = regionIds.values().next().value as string | undefined;
  if (firstRegion) {
    const visited = new Set<string>([firstRegion]);
    const pending = [firstRegion];
    while (pending.length > 0) {
      const current = pending.shift();
      if (!current) continue;
      for (const neighbor of regionGraph.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
    const missing = [...regionIds].filter((id) => !visited.has(id)).sort();
    if (missing.length > 0) {
      addIssue(
        issues,
        'CONNECTIVITY_REGIONS',
        '$.authoring.connectivity.links',
        `declared region-link graph does not reach: ${missing.join(', ')}`,
      );
    }
  }
  return reachable;
}

function validateObjectives(
  mapData: MapData,
  authoring: StandardArenaAuthoring,
  regionByCell: readonly (string | null)[],
  reachable: readonly (readonly boolean[])[],
  issues: MapValidationIssue[],
): void {
  const ids = new Set<string>();
  const regionIds = new Set(authoring.regions.map((region) => region.id));
  const kothFootprints = new Set<string>();
  let coreRunCount = 0;
  authoring.objectives.forEach((objective, index) => {
    const path = `$.authoring.objectives[${index}]`;
    validateId(objective.id, `${path}.id`, ids, issues, 'OBJECTIVE_ID');
    if (!regionIds.has(objective.regionId)) {
      addIssue(
        issues,
        'OBJECTIVE_REGION',
        `${path}.regionId`,
        `unknown region "${objective.regionId}"`,
      );
    }
    if (
      !validateRect(objective.footprint, mapData, `${path}.footprint`, issues, 'OBJECTIVE_BOUNDS')
    ) {
      return;
    }
    forEachCell(objective.footprint, (x, y) => {
      if (!isWalkableAt(mapData, x, y) || !reachable[y]?.[x]) {
        addIssue(
          issues,
          'OBJECTIVE_REACHABILITY',
          `${path}.footprint`,
          `objective covers unreachable or non-walkable tile (${x}, ${y})`,
        );
      }
    });
    if (
      !cellsOf(objective.footprint).some(
        ({ x, y }) => regionByCell[tileKey(x, y, mapData.width)] === objective.regionId,
      )
    ) {
      addIssue(
        issues,
        'OBJECTIVE_REGION',
        `${path}.footprint`,
        `objective does not intersect region "${objective.regionId}"`,
      );
    }
    if (objective.kind === 'koth') {
      if (
        objective.footprint.w !== KOTH.HILL_SIZE_TILES ||
        objective.footprint.h !== KOTH.HILL_SIZE_TILES
      ) {
        addIssue(
          issues,
          'OBJECTIVE_KOTH',
          `${path}.footprint`,
          `KOTH footprint must be ${KOTH.HILL_SIZE_TILES}x${KOTH.HILL_SIZE_TILES}`,
        );
      }
      kothFootprints.add(pointKey(objective.footprint));
    } else {
      coreRunCount += 1;
      const expected = {
        x: Math.floor((mapData.width - KOTH.HILL_SIZE_TILES) / 2),
        y: Math.floor((mapData.height - KOTH.HILL_SIZE_TILES) / 2),
        w: KOTH.HILL_SIZE_TILES,
        h: KOTH.HILL_SIZE_TILES,
      };
      if (pointKey(objective.footprint) !== pointKey(expected)) {
        addIssue(
          issues,
          'OBJECTIVE_CORE_RUN',
          `${path}.footprint`,
          `Core Run footprint must contain the existing geometric center at (${expected.x}, ${expected.y}, ${expected.w}x${expected.h})`,
        );
      }
    }
  });

  const expectedKoth = (mapData.kothHills ?? []).map((hill) =>
    pointKey({ ...hill, w: KOTH.HILL_SIZE_TILES, h: KOTH.HILL_SIZE_TILES }),
  );
  validateExactIdInventory(
    [...kothFootprints],
    expectedKoth,
    '$.authoring.objectives',
    'OBJECTIVE_KOTH',
    issues,
  );
  if (coreRunCount !== 1) {
    addIssue(
      issues,
      'OBJECTIVE_CORE_RUN',
      '$.authoring.objectives',
      `exactly one Core Run anchor is required; found ${coreRunCount}`,
    );
  }
}

function validateSpawns(
  mapData: MapData,
  authoring: StandardArenaAuthoring,
  reachable: readonly (readonly boolean[])[],
  issues: MapValidationIssue[],
): void {
  if (mapData.spawnPoints.length < STANDARD_PLAYER_CAPACITY) {
    addIssue(
      issues,
      'SPAWN_CAPACITY',
      '$.spawnPoints',
      `standard arena requires at least ${STANDARD_PLAYER_CAPACITY} spawn points`,
    );
  }
  const ids = mapData.spawnPoints.map((spawn, index) => {
    if (!spawn.id || !ID_PATTERN.test(spawn.id)) {
      addIssue(
        issues,
        'SPAWN_ID',
        `$.spawnPoints[${index}].id`,
        'authored spawn requires a unique lower-kebab id',
      );
    }
    return spawn.id ?? '';
  });
  validateUnique(ids, '$.spawnPoints', 'SPAWN_ID', issues);
  validateExactIdInventory(
    authoring.spawnSafety.spawnIds,
    ids,
    '$.authoring.spawnSafety.spawnIds',
    'SPAWN_ID',
    issues,
  );

  const minimumDistance = authoring.spawnSafety.minimumPathDistanceTiles;
  if (!isPositiveInteger(minimumDistance)) {
    addIssue(
      issues,
      'SPAWN_SEPARATION',
      '$.authoring.spawnSafety.minimumPathDistanceTiles',
      'must be a positive integer',
    );
  } else {
    for (let left = 0; left < mapData.spawnPoints.length; left += 1) {
      const distances = walkableDistances(mapData, mapData.spawnPoints[left]);
      for (let right = left + 1; right < mapData.spawnPoints.length; right += 1) {
        const target = mapData.spawnPoints[right];
        const distance = distances[target.y]?.[target.x] ?? -1;
        if (distance < minimumDistance) {
          addIssue(
            issues,
            'SPAWN_SEPARATION',
            '$.authoring.spawnSafety.minimumPathDistanceTiles',
            `spawns "${ids[left]}" and "${ids[right]}" have path distance ${distance}, below declared ${minimumDistance}`,
          );
        }
      }
    }
  }

  const minimumEgress = authoring.spawnSafety.minimumEgressDirections;
  if (!isPositiveInteger(minimumEgress) || minimumEgress > 4) {
    addIssue(
      issues,
      'SPAWN_EGRESS',
      '$.authoring.spawnSafety.minimumEgressDirections',
      'must be an integer from 1 through 4',
    );
  } else {
    mapData.spawnPoints.forEach((spawn, index) => {
      const exits = neighbors(spawn.x, spawn.y).filter(
        ({ x, y }) => isWalkableAt(mapData, x, y) && reachable[y]?.[x],
      ).length;
      if (exits < minimumEgress) {
        addIssue(
          issues,
          'SPAWN_EGRESS',
          `$.spawnPoints[${index}]`,
          `spawn "${spawn.id ?? index}" has ${exits} safe egress directions, below declared ${minimumEgress}`,
        );
      }
    });
  }
}

function validatePickups(
  mapData: MapData,
  authoring: StandardArenaAuthoring,
  reachable: readonly (readonly boolean[])[],
  issues: MapValidationIssue[],
): void {
  const ids = mapData.pickupSpawns.map((pickup, index) => {
    if (!pickup.id || !ID_PATTERN.test(pickup.id)) {
      addIssue(
        issues,
        'PICKUP_ID',
        `$.pickupSpawns[${index}].id`,
        'authored pickup requires a unique lower-kebab id',
      );
    }
    if (!reachable[pickup.y]?.[pickup.x]) {
      addIssue(
        issues,
        'PICKUP_REACHABILITY',
        `$.pickupSpawns[${index}]`,
        `pickup at (${pickup.x}, ${pickup.y}) is not reachable from the primary component`,
      );
    }
    return pickup.id ?? '';
  });
  validateUnique(ids, '$.pickupSpawns', 'PICKUP_ID', issues);
  validateExactIdInventory(
    authoring.pickupPlacement.pickupIds,
    ids,
    '$.authoring.pickupPlacement.pickupIds',
    'PICKUP_ID',
    issues,
  );
  validateUnique(
    mapData.pickupSpawns.map(({ x, y }) => `${x},${y}`),
    '$.pickupSpawns',
    'PICKUP_PLACEMENT',
    issues,
  );
  const spawnPositions = new Set(mapData.spawnPoints.map(({ x, y }) => `${x},${y}`));
  mapData.pickupSpawns.forEach((pickup, index) => {
    if (spawnPositions.has(`${pickup.x},${pickup.y}`)) {
      addIssue(
        issues,
        'PICKUP_PLACEMENT',
        `$.pickupSpawns[${index}]`,
        'pickup may not occupy an authored spawn point',
      );
    }
  });
}

function validateGatesAndHazards(
  mapData: MapData,
  authoring: StandardArenaAuthoring,
  regionByCell: readonly (string | null)[],
  issues: MapValidationIssue[],
): void {
  const gateDecorations = (mapData.decorations ?? []).filter(
    (decoration) => decoration.interaction === 'shootable_gate',
  );
  const gateIds = gateDecorations.map((decoration, index) => {
    if (!decoration.id || !ID_PATTERN.test(decoration.id)) {
      addIssue(
        issues,
        'GATE_METADATA',
        `$.decorations[${index}].id`,
        'authored shootable gate requires a lower-kebab id',
      );
    }
    return decoration.id ?? '';
  });
  validateExactIdInventory(
    authoring.gates.map((gate) => gate.decorationId),
    gateIds,
    '$.authoring.gates',
    'GATE_METADATA',
    issues,
  );
  authoring.gates.forEach((gate, index) => {
    const decoration = findDecoration(mapData, gate.decorationId, 'shootable_gate');
    const link = authoring.connectivity.links.find(
      (candidate) => candidate.gateId === gate.decorationId,
    );
    if (!decoration || !link) {
      addIssue(
        issues,
        'GATE_METADATA',
        `$.authoring.gates[${index}]`,
        `gate "${gate.decorationId}" must reference a decoration and connectivity link`,
      );
      return;
    }
    const declared = new Set(gate.connectsRegionIds);
    if (
      declared.size !== 2 ||
      !declared.has(link.fromRegionId) ||
      !declared.has(link.toRegionId) ||
      !gateBridgesRegions(mapData, decoration, link, regionByCell)
    ) {
      addIssue(
        issues,
        'GATE_METADATA',
        `$.authoring.gates[${index}]`,
        `gate "${gate.decorationId}" does not bridge its declared region pair`,
      );
    }
  });

  const hazardDecorations = (mapData.decorations ?? []).filter(
    (decoration) => decoration.hazard === 'explosive_barrel',
  );
  const hazardIds = hazardDecorations.map((decoration, index) => {
    if (!decoration.id || !ID_PATTERN.test(decoration.id)) {
      addIssue(
        issues,
        'HAZARD_METADATA',
        `$.decorations[${index}].id`,
        'authored hazard requires a lower-kebab id',
      );
    }
    return decoration.id ?? '';
  });
  validateExactIdInventory(
    authoring.hazards.map((hazard) => hazard.decorationId),
    hazardIds,
    '$.authoring.hazards',
    'HAZARD_METADATA',
    issues,
  );
  authoring.hazards.forEach((hazard, index) => {
    const decoration = findDecoration(mapData, hazard.decorationId, undefined, 'explosive_barrel');
    const region = decoration
      ? regionByCell[tileKey(decoration.x, decoration.y, mapData.width)]
      : null;
    if (!decoration || hazard.kind !== 'explosive_barrel' || region !== hazard.regionId) {
      addIssue(
        issues,
        'HAZARD_METADATA',
        `$.authoring.hazards[${index}]`,
        `hazard "${hazard.decorationId}" does not match its decoration kind and region`,
      );
    }
  });
}

function validateSymmetry(
  mapData: MapData,
  authoring: StandardArenaAuthoring,
  issues: MapValidationIssue[],
): void {
  const review = authoring.symmetryReview;
  if (review.rationale.trim().length < 12) {
    addIssue(
      issues,
      'SYMMETRY_REVIEW',
      '$.authoring.symmetryReview.rationale',
      'review rationale must contain at least 12 non-whitespace characters',
    );
  }
  const available: Exclude<StandardArenaSymmetryKind, 'asymmetric'>[] = [
    'horizontal',
    'vertical',
    'rotational',
  ];
  if (review.kind === 'asymmetric') {
    const checked = new Set(review.checkedTransforms);
    for (const transform of available) {
      if (!checked.has(transform)) {
        addIssue(
          issues,
          'SYMMETRY_REVIEW',
          '$.authoring.symmetryReview.checkedTransforms',
          `asymmetric review must explicitly check ${transform} symmetry`,
        );
      }
    }
    return;
  }
  if (!review.checkedTransforms.includes(review.kind)) {
    addIssue(
      issues,
      'SYMMETRY_REVIEW',
      '$.authoring.symmetryReview.checkedTransforms',
      `declared ${review.kind} symmetry must appear in checkedTransforms`,
    );
  }
  review.exceptions.forEach((exception, index) => {
    validateRect(
      exception,
      mapData,
      `$.authoring.symmetryReview.exceptions[${index}]`,
      issues,
      'SYMMETRY_EXCEPTION',
    );
  });
  const exceptionCells = new Set<number>();
  for (const exception of review.exceptions) {
    if (!rectInBounds(exception, mapData)) continue;
    forEachCell(exception, (x, y) => exceptionCells.add(tileKey(x, y, mapData.width)));
  }
  checkSymmetricTiles(mapData, review.kind, exceptionCells, issues);
  checkSymmetricPoints(mapData, review.kind, issues);
}

function checkSymmetricTiles(
  mapData: MapData,
  kind: Exclude<StandardArenaSymmetryKind, 'asymmetric'>,
  exceptionCells: ReadonlySet<number>,
  issues: MapValidationIssue[],
): void {
  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      const mirrored = transformPoint({ x, y }, mapData, kind);
      const key = tileKey(x, y, mapData.width);
      const mirroredKey = tileKey(mirrored.x, mirrored.y, mapData.width);
      if (exceptionCells.has(key) || exceptionCells.has(mirroredKey)) continue;
      if (mapData.tiles[y][x] !== mapData.tiles[mirrored.y][mirrored.x]) {
        addIssue(
          issues,
          'SYMMETRY_MISMATCH',
          '$.tiles',
          `tile (${x}, ${y}) differs from ${kind} partner (${mirrored.x}, ${mirrored.y})`,
        );
      }
    }
  }
}

function checkSymmetricPoints(
  mapData: MapData,
  kind: Exclude<StandardArenaSymmetryKind, 'asymmetric'>,
  issues: MapValidationIssue[],
): void {
  const spawnKeys = new Set(mapData.spawnPoints.map(({ x, y }) => `${x},${y}`));
  for (const spawn of mapData.spawnPoints) {
    const partner = transformPoint(spawn, mapData, kind);
    if (!spawnKeys.has(`${partner.x},${partner.y}`)) {
      addIssue(
        issues,
        'SYMMETRY_MISMATCH',
        '$.spawnPoints',
        `spawn (${spawn.x}, ${spawn.y}) lacks ${kind} partner (${partner.x}, ${partner.y})`,
      );
    }
  }
  const pickupKeys = new Set(mapData.pickupSpawns.map(({ x, y, type }) => `${x},${y}:${type}`));
  for (const pickup of mapData.pickupSpawns) {
    const partner = transformPoint(pickup, mapData, kind);
    if (!pickupKeys.has(`${partner.x},${partner.y}:${pickup.type}`)) {
      addIssue(
        issues,
        'SYMMETRY_MISMATCH',
        '$.pickupSpawns',
        `pickup ${pickup.type} at (${pickup.x}, ${pickup.y}) lacks ${kind} partner`,
      );
    }
  }
  const decorationKeys = new Set((mapData.decorations ?? []).map(decorationIdentity));
  for (const decoration of mapData.decorations ?? []) {
    const partner = transformRect(decoration, mapData, kind);
    if (!decorationKeys.has(decorationIdentity({ ...decoration, ...partner }))) {
      addIssue(
        issues,
        'SYMMETRY_MISMATCH',
        '$.decorations',
        `decoration at (${decoration.x}, ${decoration.y}) lacks ${kind} partner`,
      );
    }
  }
}

function validateDocumentShape(value: Record<string, unknown>, issues: MapValidationIssue[]): void {
  if (typeof value.name !== 'string' || value.name.trim() === '') {
    addIssue(issues, 'MAP_FIELD_TYPE', '$.name', 'name must be a non-empty string');
  }
  for (const field of ['width', 'height', 'tileSize'] as const) {
    if (!isPositiveInteger(value[field])) {
      addIssue(issues, 'MAP_FIELD_TYPE', `$.${field}`, `${field} must be a positive integer`);
    }
  }
  if (!Array.isArray(value.tiles) || !value.tiles.every((row) => Array.isArray(row))) {
    addIssue(issues, 'MAP_FIELD_TYPE', '$.tiles', 'tiles must be an array of row arrays');
  } else if (!value.tiles.every((row) => row.every((tile) => typeof tile === 'number'))) {
    addIssue(issues, 'MAP_FIELD_TYPE', '$.tiles', 'every tile must be numeric');
  }
  if (!Array.isArray(value.spawnPoints) || !value.spawnPoints.every(isTilePointRecord)) {
    addIssue(
      issues,
      'MAP_FIELD_TYPE',
      '$.spawnPoints',
      'spawnPoints must contain integer tile points',
    );
  }
  if (
    !Array.isArray(value.pickupSpawns) ||
    !value.pickupSpawns.every(
      (pickup) => isTilePointRecord(pickup) && typeof pickup.type === 'string',
    )
  ) {
    addIssue(
      issues,
      'MAP_FIELD_TYPE',
      '$.pickupSpawns',
      'pickupSpawns must contain integer tile points with string types',
    );
  }
  if (
    value.decorations !== undefined &&
    (!Array.isArray(value.decorations) ||
      !value.decorations.every(
        (decoration) =>
          isRecord(decoration) &&
          Number.isInteger(decoration.x) &&
          Number.isInteger(decoration.y) &&
          Number.isInteger(decoration.w) &&
          Number.isInteger(decoration.h) &&
          typeof decoration.texture === 'string',
      ))
  ) {
    addIssue(
      issues,
      'MAP_FIELD_TYPE',
      '$.decorations',
      'decorations must contain integer tile rects and texture strings',
    );
  }
  if (
    value.kothHills !== undefined &&
    (!Array.isArray(value.kothHills) || !value.kothHills.every(isTilePointRecord))
  ) {
    addIssue(issues, 'MAP_FIELD_TYPE', '$.kothHills', 'kothHills must contain integer tile points');
  }
  if (value.authoring !== undefined && !isRecord(value.authoring)) {
    addIssue(issues, 'MAP_FIELD_TYPE', '$.authoring', 'authoring must be an object when present');
  }
}

function validateRuntimeValues(mapData: MapData, issues: MapValidationIssue[]): void {
  mapData.tiles.forEach((row, y) =>
    row.forEach((tile, x) => {
      if (!TILE_TYPES.has(tile)) {
        addIssue(issues, 'TILE_VALUE', `$.tiles[${y}][${x}]`, `unknown tile type ${String(tile)}`);
      }
    }),
  );
  mapData.pickupSpawns.forEach((pickup, index) => {
    if (!PICKUP_TYPES.has(pickup.type)) {
      addIssue(
        issues,
        'PICKUP_TYPE',
        `$.pickupSpawns[${index}].type`,
        `unknown pickup type "${pickup.type}"`,
      );
    }
  });
  (mapData.decorations ?? []).forEach((decoration, index) => {
    if (decoration.hazard !== undefined && decoration.hazard !== 'explosive_barrel') {
      addIssue(
        issues,
        'DECORATION_METADATA',
        `$.decorations[${index}].hazard`,
        `unknown hazard "${decoration.hazard}"`,
      );
    }
    if (
      decoration.interaction !== undefined &&
      decoration.interaction !== 'shootable_gate' &&
      decoration.interaction !== 'scavenger_cache'
    ) {
      addIssue(
        issues,
        'DECORATION_METADATA',
        `$.decorations[${index}].interaction`,
        `unknown interaction "${decoration.interaction}"`,
      );
    }
  });
}

function hasAuthoringShape(value: StandardArenaAuthoring): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.regions) &&
    Array.isArray(value.landmarks) &&
    isRecord(value.minimap) &&
    Array.isArray(value.minimap.landmarkIds) &&
    isRecord(value.connectivity) &&
    Array.isArray(value.connectivity.links) &&
    Array.isArray(value.objectives) &&
    isRecord(value.spawnSafety) &&
    Array.isArray(value.spawnSafety.spawnIds) &&
    isRecord(value.pickupPlacement) &&
    Array.isArray(value.pickupPlacement.pickupIds) &&
    Array.isArray(value.gates) &&
    Array.isArray(value.hazards) &&
    isRecord(value.symmetryReview) &&
    Array.isArray(value.symmetryReview.exceptions) &&
    Array.isArray(value.symmetryReview.checkedTransforms)
  );
}

function result(issues: MapValidationIssue[], mapData?: MapData): MapDocumentValidationResult {
  return {
    valid: issues.length === 0,
    issues,
    errors: issues.map(formatIssue),
    ...(mapData && issues.length === 0 ? { mapData } : {}),
  };
}

export function formatMapValidationIssue(issue: MapValidationIssue): string {
  return formatIssue(issue);
}

function formatIssue(issue: MapValidationIssue): string {
  return `[${issue.code}] ${issue.path}: ${issue.message}`;
}

function addIssue(issues: MapValidationIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}

function validateId(
  id: string,
  path: string,
  seen: Set<string>,
  issues: MapValidationIssue[],
  code: string,
): void {
  if (!ID_PATTERN.test(id)) {
    addIssue(issues, code, path, `"${id}" must be lower-kebab case`);
  }
  if (seen.has(id)) {
    addIssue(issues, code, path, `duplicate id "${id}"`);
  }
  seen.add(id);
}

function validateUnique(
  values: readonly string[],
  path: string,
  code: string,
  issues: MapValidationIssue[],
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) addIssue(issues, code, `${path}[${index}]`, `duplicate value "${value}"`);
    seen.add(value);
  });
}

function validateExactIdInventory(
  actual: readonly string[],
  expected: readonly string[],
  path: string,
  code: string,
  issues: MapValidationIssue[],
): void {
  validateUnique(actual, path, code, issues);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  for (const id of [...expectedSet].sort()) {
    if (!actualSet.has(id)) addIssue(issues, code, path, `missing required id "${id}"`);
  }
  for (const id of [...actualSet].sort()) {
    if (!expectedSet.has(id)) addIssue(issues, code, path, `unknown id "${id}"`);
  }
}

function validateRect(
  rect: MapTileRect,
  mapData: MapData,
  path: string,
  issues: MapValidationIssue[],
  code: string,
): boolean {
  if (
    !Number.isInteger(rect.x) ||
    !Number.isInteger(rect.y) ||
    !isPositiveInteger(rect.w) ||
    !isPositiveInteger(rect.h)
  ) {
    addIssue(issues, code, path, 'tile rect must use integer x/y and positive integer w/h');
    return false;
  }
  if (!rectInBounds(rect, mapData)) {
    addIssue(
      issues,
      code,
      path,
      `rect (${rect.x}, ${rect.y}, ${rect.w}x${rect.h}) extends out of map bounds`,
    );
    return false;
  }
  return true;
}

function rectInBounds(rect: MapTileRect, mapData: MapData): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.w <= mapData.width &&
    rect.y + rect.h <= mapData.height
  );
}

function forEachCell(rect: MapTileRect, callback: (x: number, y: number) => void): void {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) callback(x, y);
  }
}

function cellsOf(rect: MapTileRect): MapTilePoint[] {
  const cells: MapTilePoint[] = [];
  forEachCell(rect, (x, y) => cells.push({ x, y }));
  return cells;
}

function isWalkableAt(mapData: MapData, x: number, y: number): boolean {
  const tile = mapData.tiles[y]?.[x];
  return tile !== undefined && WALKABLE_TILES.has(tile);
}

function firstWalkable(mapData: MapData): MapTilePoint | null {
  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      if (isWalkableAt(mapData, x, y)) return { x, y };
    }
  }
  return null;
}

function emptyVisited(mapData: MapData): boolean[][] {
  return Array.from({ length: mapData.height }, () =>
    Array.from({ length: mapData.width }, () => false),
  );
}

function floodWalkable(mapData: MapData, start: MapTilePoint): boolean[][] {
  const visited = emptyVisited(mapData);
  if (!isWalkableAt(mapData, start.x, start.y)) return visited;
  const queue: MapTilePoint[] = [start];
  visited[start.y][start.x] = true;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const next of neighbors(current.x, current.y)) {
      if (!isWalkableAt(mapData, next.x, next.y) || visited[next.y]?.[next.x]) continue;
      visited[next.y][next.x] = true;
      queue.push(next);
    }
  }
  return visited;
}

function walkableDistances(mapData: MapData, start: MapTilePoint): number[][] {
  const distances = Array.from({ length: mapData.height }, () =>
    Array.from({ length: mapData.width }, () => -1),
  );
  if (!isWalkableAt(mapData, start.x, start.y)) return distances;
  const queue: MapTilePoint[] = [start];
  distances[start.y][start.x] = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const next of neighbors(current.x, current.y)) {
      if (!isWalkableAt(mapData, next.x, next.y) || distances[next.y]?.[next.x] !== -1) continue;
      distances[next.y][next.x] = distances[current.y][current.x] + 1;
      queue.push(next);
    }
  }
  return distances;
}

function neighbors(x: number, y: number): MapTilePoint[] {
  return [
    { x, y: y - 1 },
    { x: x + 1, y },
    { x, y: y + 1 },
    { x: x - 1, y },
  ];
}

function regionsShareWalkableEdge(
  mapData: MapData,
  left: string,
  right: string,
  regionByCell: readonly (string | null)[],
): boolean {
  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      if (!isWalkableAt(mapData, x, y)) continue;
      const region = regionByCell[tileKey(x, y, mapData.width)];
      if (region !== left && region !== right) continue;
      for (const next of neighbors(x, y)) {
        if (!isWalkableAt(mapData, next.x, next.y)) continue;
        const other = regionByCell[tileKey(next.x, next.y, mapData.width)];
        if ((region === left && other === right) || (region === right && other === left))
          return true;
      }
    }
  }
  return false;
}

function gateBridgesRegions(
  mapData: MapData,
  gate: MapDecoration,
  link: Readonly<{ fromRegionId: string; toRegionId: string }>,
  regionByCell: readonly (string | null)[],
): boolean {
  const pairs = [
    [
      { x: gate.x - 1, y: gate.y },
      { x: gate.x + 1, y: gate.y },
    ],
    [
      { x: gate.x, y: gate.y - 1 },
      { x: gate.x, y: gate.y + 1 },
    ],
  ];
  const expected = new Set([link.fromRegionId, link.toRegionId]);
  return pairs.some(([first, second]) => {
    if (!isWalkableAt(mapData, first.x, first.y) || !isWalkableAt(mapData, second.x, second.y)) {
      return false;
    }
    const regions = new Set([
      regionByCell[tileKey(first.x, first.y, mapData.width)],
      regionByCell[tileKey(second.x, second.y, mapData.width)],
    ]);
    return regions.size === 2 && [...expected].every((region) => regions.has(region));
  });
}

function findDecoration(
  mapData: MapData,
  id: string,
  interaction?: MapDecoration['interaction'],
  hazard?: MapDecoration['hazard'],
): MapDecoration | undefined {
  return (mapData.decorations ?? []).find(
    (decoration) =>
      decoration.id === id &&
      (interaction === undefined || decoration.interaction === interaction) &&
      (hazard === undefined || decoration.hazard === hazard),
  );
}

function transformPoint(
  point: MapTilePoint,
  mapData: MapData,
  kind: Exclude<StandardArenaSymmetryKind, 'asymmetric'>,
): MapTilePoint {
  if (kind === 'rotational') {
    return { x: mapData.width - 1 - point.x, y: mapData.height - 1 - point.y };
  }
  if (kind === 'horizontal') return { x: point.x, y: mapData.height - 1 - point.y };
  return { x: mapData.width - 1 - point.x, y: point.y };
}

function transformRect(
  rect: MapTileRect,
  mapData: MapData,
  kind: Exclude<StandardArenaSymmetryKind, 'asymmetric'>,
): MapTileRect {
  if (kind === 'rotational') {
    return {
      x: mapData.width - rect.x - rect.w,
      y: mapData.height - rect.y - rect.h,
      w: rect.w,
      h: rect.h,
    };
  }
  if (kind === 'horizontal') {
    return { x: rect.x, y: mapData.height - rect.y - rect.h, w: rect.w, h: rect.h };
  }
  return { x: mapData.width - rect.x - rect.w, y: rect.y, w: rect.w, h: rect.h };
}

function decorationIdentity(decoration: MapDecoration): string {
  return [
    decoration.x,
    decoration.y,
    decoration.w,
    decoration.h,
    decoration.texture,
    decoration.hazard ?? '',
    decoration.interaction ?? '',
  ].join(':');
}

function pointKey(rect: MapTileRect): string {
  return `${rect.x},${rect.y},${rect.w},${rect.h}`;
}

function tileKey(x: number, y: number, width: number): number {
  return y * width + x;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTilePointRecord(value: unknown): value is Record<string, unknown> & MapTilePoint {
  return isRecord(value) && Number.isInteger(value.x) && Number.isInteger(value.y);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
