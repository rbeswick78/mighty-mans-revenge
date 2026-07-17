import { describe, expect, it } from 'vitest';

import { TileType, type MapData, type StandardArenaAuthoring } from '../types/map.js';
import { MAP_REGISTRY } from '../maps/registry.js';
import { validateMapDocument } from './map-authoring-validator.js';

function createStandardArenaFixture(): MapData {
  const width = 40;
  const height = 24;
  const tiles: TileType[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 1 : 0,
    ),
  );
  tiles[8][8] = 2;
  tiles[15][31] = 2;
  tiles[10][19] = 1;
  tiles[13][20] = 1;

  const authoring: StandardArenaAuthoring = {
    schemaVersion: 1,
    profile: 'standard-40x24',
    regions: [
      { id: 'west-yard', areas: [{ x: 0, y: 0, w: 20, h: 24 }] },
      { id: 'east-yard', areas: [{ x: 20, y: 0, w: 20, h: 24 }] },
    ],
    landmarks: [
      {
        id: 'west-works',
        regionId: 'west-yard',
        footprint: { x: 6, y: 6, w: 4, h: 4 },
        minimap: 'major',
      },
      {
        id: 'central-junction',
        regionId: 'west-yard',
        footprint: { x: 18, y: 10, w: 4, h: 4 },
        minimap: 'minor',
      },
      {
        id: 'east-works',
        regionId: 'east-yard',
        footprint: { x: 30, y: 14, w: 4, h: 4 },
        minimap: 'major',
      },
    ],
    minimap: {
      projection: 'orthographic-top-left',
      bounds: { x: 0, y: 0, w: 40, h: 24 },
      landmarkIds: ['west-works', 'central-junction', 'east-works'],
    },
    connectivity: {
      requireSingleWalkableComponent: true,
      links: [
        { id: 'open-crossing', fromRegionId: 'west-yard', toRegionId: 'east-yard' },
        {
          id: 'west-gate-crossing',
          fromRegionId: 'west-yard',
          toRegionId: 'east-yard',
          gateId: 'gate-west',
        },
        {
          id: 'east-gate-crossing',
          fromRegionId: 'west-yard',
          toRegionId: 'east-yard',
          gateId: 'gate-east',
        },
      ],
    },
    objectives: [
      {
        id: 'koth-west',
        kind: 'koth',
        regionId: 'west-yard',
        footprint: { x: 5, y: 5, w: 2, h: 2 },
      },
      {
        id: 'koth-center',
        kind: 'koth',
        regionId: 'west-yard',
        footprint: { x: 19, y: 11, w: 2, h: 2 },
      },
      {
        id: 'koth-east',
        kind: 'koth',
        regionId: 'east-yard',
        footprint: { x: 33, y: 17, w: 2, h: 2 },
      },
      {
        id: 'core-run-center',
        kind: 'core-run',
        regionId: 'east-yard',
        footprint: { x: 19, y: 11, w: 2, h: 2 },
      },
    ],
    spawnSafety: {
      spawnIds: ['spawn-north-west', 'spawn-south-east', 'spawn-south-west', 'spawn-north-east'],
      minimumPathDistanceTiles: 16,
      minimumEgressDirections: 3,
    },
    pickupPlacement: {
      pickupIds: [
        'ammo-west',
        'ammo-east',
        'bandage-west',
        'bandage-east',
        'shotgun-west',
        'shotgun-east',
      ],
    },
    gates: [
      { decorationId: 'gate-west', connectsRegionIds: ['west-yard', 'east-yard'] },
      { decorationId: 'gate-east', connectsRegionIds: ['west-yard', 'east-yard'] },
    ],
    hazards: [
      { decorationId: 'barrel-west', kind: 'explosive_barrel', regionId: 'west-yard' },
      { decorationId: 'barrel-east', kind: 'explosive_barrel', regionId: 'east-yard' },
    ],
    symmetryReview: {
      kind: 'rotational',
      rationale: 'Rotational pairs preserve equivalent authored routes.',
      exceptions: [],
      checkedTransforms: ['rotational'],
    },
  };

  return {
    name: 'Standard Arena Fixture',
    width,
    height,
    tileSize: 48,
    tiles,
    spawnPoints: [
      { id: 'spawn-north-west', x: 3, y: 3 },
      { id: 'spawn-south-east', x: 36, y: 20 },
      { id: 'spawn-south-west', x: 3, y: 20 },
      { id: 'spawn-north-east', x: 36, y: 3 },
    ],
    pickupSpawns: [
      { id: 'ammo-west', x: 8, y: 6, type: 'gun_ammo' },
      { id: 'ammo-east', x: 31, y: 17, type: 'gun_ammo' },
      { id: 'bandage-west', x: 10, y: 16, type: 'bandage' },
      { id: 'bandage-east', x: 29, y: 7, type: 'bandage' },
      { id: 'shotgun-west', x: 15, y: 5, type: 'weapon_shotgun' },
      { id: 'shotgun-east', x: 24, y: 18, type: 'weapon_shotgun' },
    ],
    decorations: [
      {
        id: 'barrel-west',
        x: 8,
        y: 8,
        w: 1,
        h: 1,
        texture: 'deco_barrel_red',
        hazard: 'explosive_barrel',
      },
      {
        id: 'barrel-east',
        x: 31,
        y: 15,
        w: 1,
        h: 1,
        texture: 'deco_barrel_red',
        hazard: 'explosive_barrel',
      },
      {
        id: 'gate-west',
        x: 19,
        y: 10,
        w: 1,
        h: 1,
        texture: 'tiles_wire_fence_closing',
        interaction: 'shootable_gate',
      },
      {
        id: 'gate-east',
        x: 20,
        y: 13,
        w: 1,
        h: 1,
        texture: 'tiles_wire_fence_closing',
        interaction: 'shootable_gate',
      },
    ],
    kothHills: [
      { x: 5, y: 5 },
      { x: 19, y: 11 },
      { x: 33, y: 17 },
    ],
    authoring,
  };
}

function codes(
  map: MapData,
  profile: 'compatible' | 'standard-40x24' = 'standard-40x24',
): string[] {
  return validateMapDocument(map, profile).issues.map((issue) => issue.code);
}

describe('validateMapDocument', () => {
  it('accepts a complete deterministic 40x24 authoring fixture', () => {
    const fixture = createStandardArenaFixture();
    const first = validateMapDocument(fixture, 'standard-40x24');
    const second = validateMapDocument(structuredClone(fixture), 'standard-40x24');
    expect(first, first.errors.join('\n')).toMatchObject({ valid: true, errors: [] });
    expect(second.errors).toEqual(first.errors);
  });

  it('keeps all six current maps compatible without adding authoring metadata', () => {
    for (const map of MAP_REGISTRY.values()) {
      expect(validateMapDocument(map, 'compatible'), map.name).toMatchObject({
        valid: true,
        errors: [],
      });
      expect(validateMapDocument(map, 'standard-40x24').issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(['ARENA_DIMENSIONS', 'AUTHORING_REQUIRED']),
      );
      expect(map.authoring).toBeUndefined();
    }
  });

  it('returns stable actionable document, dimension, row, and tile failures', () => {
    expect(validateMapDocument(null).errors).toEqual([
      '[MAP_DOCUMENT_TYPE] $: map document must be an object',
    ]);

    const fixture = createStandardArenaFixture();
    fixture.width = 39;
    fixture.tiles[4].pop();
    fixture.tiles[5][5] = 99 as TileType;
    const result = validateMapDocument(fixture, 'standard-40x24');
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['MAP_BASE', 'TILE_VALUE', 'ARENA_DIMENSIONS']),
    );
    expect(result.errors).toContain('[TILE_VALUE] $.tiles[5][5]: unknown tile type 99');
    expect(result.mapData).toBeUndefined();

    const compatibleWithAuthoredWrongDimensions = createStandardArenaFixture();
    compatibleWithAuthoredWrongDimensions.width = 39;
    compatibleWithAuthoredWrongDimensions.tiles.forEach((row) => row.pop());
    expect(codes(compatibleWithAuthoredWrongDimensions, 'compatible')).toContain(
      'ARENA_DIMENSIONS',
    );
  });

  it('rejects region gaps, overlaps, unknown landmark regions, and bad footprints', () => {
    const fixture = createStandardArenaFixture();
    fixture.authoring!.regions[1].areas[0].x = 18;
    fixture.authoring!.regions[1].areas[0].w = 22;
    fixture.authoring!.landmarks[0].regionId = 'missing-region';
    fixture.authoring!.landmarks[1].footprint.x = 39;
    expect(codes(fixture)).toEqual(
      expect.arrayContaining(['REGION_OVERLAP', 'LANDMARK_REGION', 'LANDMARK_BOUNDS']),
    );

    const gap = createStandardArenaFixture();
    gap.authoring!.regions[0].areas[0].w = 19;
    gap.authoring!.regions[1].areas[0].x = 20;
    expect(codes(gap)).toContain('REGION_COVERAGE');

    const sameRegionOverlap = createStandardArenaFixture();
    sameRegionOverlap.authoring!.regions[0].areas.push({ x: 0, y: 0, w: 1, h: 1 });
    expect(codes(sameRegionOverlap)).toContain('REGION_OVERLAP');
  });

  it('rejects incomplete minimap projection and disconnected region links', () => {
    const fixture = createStandardArenaFixture();
    fixture.authoring!.minimap.bounds.w = 39;
    fixture.authoring!.minimap.landmarkIds.pop();
    fixture.authoring!.connectivity.links[0].toRegionId = 'unknown-region';
    expect(codes(fixture)).toEqual(
      expect.arrayContaining(['MINIMAP_BOUNDS', 'MINIMAP_LANDMARK', 'CONNECTIVITY_LINK']),
    );

    const missingRegionLink = createStandardArenaFixture();
    missingRegionLink.authoring!.connectivity.links = [];
    expect(codes(missingRegionLink)).toContain('CONNECTIVITY_REGIONS');
  });

  it('rejects unreachable objectives and mismatched KOTH/Core Run anchors', () => {
    const fixture = createStandardArenaFixture();
    fixture.authoring!.objectives[0].footprint = { x: 0, y: 0, w: 2, h: 2 };
    fixture.authoring!.objectives[3].footprint = { x: 18, y: 11, w: 2, h: 2 };
    expect(codes(fixture)).toEqual(
      expect.arrayContaining(['OBJECTIVE_REACHABILITY', 'OBJECTIVE_KOTH', 'OBJECTIVE_CORE_RUN']),
    );
  });

  it('rejects unsafe spawn declarations and unreachable or duplicate pickups', () => {
    const fixture = createStandardArenaFixture();
    fixture.authoring!.spawnSafety.minimumPathDistanceTiles = 60;
    fixture.authoring!.spawnSafety.minimumEgressDirections = 5;
    fixture.pickupSpawns[1].x = fixture.pickupSpawns[0].x;
    fixture.pickupSpawns[1].y = fixture.pickupSpawns[0].y;
    fixture.tiles[fixture.pickupSpawns[0].y][fixture.pickupSpawns[0].x] = 1;
    expect(codes(fixture)).toEqual(
      expect.arrayContaining([
        'SPAWN_SEPARATION',
        'SPAWN_EGRESS',
        'PICKUP_REACHABILITY',
        'PICKUP_PLACEMENT',
      ]),
    );
  });

  it('rejects gate and hazard inventory or region drift', () => {
    const fixture = createStandardArenaFixture();
    fixture.authoring!.gates[0].decorationId = 'missing-gate';
    fixture.authoring!.hazards[0].regionId = 'east-yard';
    expect(codes(fixture)).toEqual(expect.arrayContaining(['GATE_METADATA', 'HAZARD_METADATA']));
  });

  it('checks declared symmetry and requires explicit asymmetric review', () => {
    const symmetric = createStandardArenaFixture();
    symmetric.tiles[6][6] = 2;
    expect(codes(symmetric)).toContain('SYMMETRY_MISMATCH');

    const asymmetric = createStandardArenaFixture();
    asymmetric.authoring!.symmetryReview.kind = 'asymmetric';
    asymmetric.authoring!.symmetryReview.checkedTransforms = ['horizontal'];
    expect(codes(asymmetric)).toEqual(expect.arrayContaining(['SYMMETRY_REVIEW']));
  });
});
