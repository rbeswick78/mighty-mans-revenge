import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

const WIDTH = 56;
const HEIGHT = 34;
const output = resolve('shared/maps/shatterlands.battle-royale-56x34.json');
const tiles = Array.from({ length: HEIGHT }, (_, y) =>
  Array.from({ length: WIDTH }, (_, x) =>
    x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1 ? 1 : 0,
  ),
);

function rect(x, y, w, h, tile) {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) tiles[row][col] = tile;
  }
}

// Four readable landmark masses and paired cover lanes leave the seam-cross
// routes open. The quadrants are intentionally comparable, not tile-identical.
for (const block of [
  [8, 5, 4, 2],
  [17, 10, 4, 2],
  [44, 5, 4, 2],
  [35, 10, 4, 2],
  [8, 27, 4, 2],
  [17, 22, 4, 2],
  [44, 27, 4, 2],
  [35, 22, 4, 2],
]) {
  rect(...block, 1);
}

for (const [x, y, w, h] of [
  [4, 9, 4, 1],
  [14, 6, 1, 4],
  [20, 13, 4, 1],
  [48, 9, 4, 1],
  [41, 6, 1, 4],
  [32, 13, 4, 1],
  [4, 24, 4, 1],
  [14, 24, 1, 4],
  [20, 20, 4, 1],
  [48, 24, 4, 1],
  [41, 24, 1, 4],
  [32, 20, 4, 1],
]) {
  rect(x, y, w, h, 2);
}

const spawnPoints = [
  ['spawn-west-north-a', 4, 5],
  ['spawn-west-north-b', 5, 4],
  ['spawn-north-west-a', 18, 3],
  ['spawn-north-west-b', 20, 4],
  ['spawn-north-east-a', 35, 3],
  ['spawn-north-east-b', 37, 4],
  ['spawn-east-north-a', 51, 5],
  ['spawn-east-north-b', 50, 4],
  ['spawn-east-south-a', 51, 28],
  ['spawn-east-south-b', 50, 29],
  ['spawn-south-east-a', 37, 30],
  ['spawn-south-east-b', 35, 29],
  ['spawn-south-west-a', 20, 30],
  ['spawn-south-west-b', 18, 29],
  ['spawn-west-south-a', 4, 28],
  ['spawn-west-south-b', 5, 29],
].map(([id, x, y]) => ({ id, x, y }));

const pickupSpawns = [
  ['sustain-dust-bandage', 6, 6, 'bandage'],
  ['sustain-dust-armor', 15, 14, 'armor'],
  ['sustain-dust-grenade', 22, 5, 'grenade'],
  ['sustain-dust-charge', 24, 12, 'overcharge'],
  ['sustain-green-bandage', 49, 6, 'bandage'],
  ['sustain-green-armor', 40, 14, 'armor'],
  ['sustain-green-grenade', 33, 5, 'grenade'],
  ['sustain-green-charge', 31, 12, 'overcharge'],
  ['sustain-iron-bandage', 6, 27, 'bandage'],
  ['sustain-iron-armor', 15, 19, 'armor'],
  ['sustain-iron-grenade', 22, 28, 'grenade'],
  ['sustain-iron-charge', 24, 21, 'overcharge'],
  ['sustain-glass-bandage', 49, 27, 'bandage'],
  ['sustain-glass-armor', 40, 19, 'armor'],
  ['sustain-glass-grenade', 33, 28, 'grenade'],
  ['sustain-glass-charge', 31, 21, 'overcharge'],
].map(([id, x, y, type]) => ({ id, x, y, type }));

for (const spawn of spawnPoints) {
  if (tiles[spawn.y][spawn.x] !== 0) throw new Error(`Blocked spawn ${spawn.id}`);
  tiles[spawn.y][spawn.x] = 3;
}
for (const pickup of pickupSpawns) {
  if (tiles[pickup.y][pickup.x] !== 0) throw new Error(`Blocked pickup ${pickup.id}`);
  tiles[pickup.y][pickup.x] = 4;
}

const containerSpawns = [
  ['container-dust-a', 7, 12, 'dust-basin'],
  ['container-dust-b', 13, 4, 'dust-basin'],
  ['container-dust-c', 21, 7, 'dust-basin'],
  ['container-dust-d', 23, 14, 'dust-basin'],
  ['container-green-a', 48, 12, 'greenward'],
  ['container-green-b', 42, 4, 'greenward'],
  ['container-green-c', 34, 7, 'greenward'],
  ['container-green-d', 32, 14, 'greenward'],
  ['container-iron-a', 7, 21, 'ironworks'],
  ['container-iron-b', 13, 29, 'ironworks'],
  ['container-iron-c', 21, 26, 'ironworks'],
  ['container-iron-d', 23, 19, 'ironworks'],
  ['container-glass-a', 48, 21, 'glass-wastes'],
  ['container-glass-b', 42, 29, 'glass-wastes'],
  ['container-glass-c', 34, 26, 'glass-wastes'],
  ['container-glass-d', 32, 19, 'glass-wastes'],
].map(([id, x, y, regionId]) => ({ id, x, y, regionId }));
for (const container of containerSpawns) {
  if (tiles[container.y][container.x] !== 0) throw new Error(`Blocked container ${container.id}`);
  tiles[container.y][container.x] = 2;
}

const decorations = [
  {
    id: 'sunken-relay',
    x: 10,
    y: 8,
    w: 2,
    h: 1,
    texture: 'deco_container_gray',
  },
  {
    id: 'vinebound-homes',
    x: 44,
    y: 8,
    w: 2,
    h: 1,
    texture: 'deco_car_overgrown_blue',
  },
  {
    id: 'redline-foundry',
    x: 10,
    y: 24,
    w: 2,
    h: 1,
    texture: 'deco_container_red',
  },
  {
    id: 'glassfall-crater',
    x: 44,
    y: 24,
    w: 2,
    h: 1,
    texture: 'deco_container_gray',
  },
];
for (const decoration of decorations)
  rect(decoration.x, decoration.y, decoration.w, decoration.h, 2);

const regions = [
  {
    id: 'dust-basin',
    displayName: 'DUST BASIN',
    biome: 'wasteland',
    areas: [{ x: 0, y: 0, w: 28, h: 17 }],
    label: { x: 10, y: 3 },
  },
  {
    id: 'greenward',
    displayName: 'GREENWARD',
    biome: 'overgrown',
    areas: [{ x: 28, y: 0, w: 28, h: 17 }],
    label: { x: 45, y: 3 },
  },
  {
    id: 'ironworks',
    displayName: 'IRONWORKS',
    biome: 'industrial',
    areas: [{ x: 0, y: 17, w: 28, h: 17 }],
    label: { x: 10, y: 30 },
  },
  {
    id: 'glass-wastes',
    displayName: 'GLASS WASTES',
    biome: 'irradiated',
    areas: [{ x: 28, y: 17, w: 28, h: 17 }],
    label: { x: 44, y: 30 },
  },
];

const landmarks = [
  ['sunken-relay', 'SUNKEN RELAY', 'dust-basin', 10, 8],
  ['vinebound-homes', 'VINEBOUND HOMES', 'greenward', 44, 8],
  ['redline-foundry', 'REDLINE FOUNDRY', 'ironworks', 10, 24],
  ['glassfall-crater', 'GLASSFALL CRATER', 'glass-wastes', 44, 24],
].map(([id, displayName, regionId, x, y]) => ({
  id,
  displayName,
  regionId,
  footprint: { x, y, w: 2, h: 1 },
  minimap: 'major',
}));

const document = {
  name: 'Shatterlands',
  width: WIDTH,
  height: HEIGHT,
  tileSize: 48,
  tiles,
  spawnPoints,
  pickupSpawns,
  theme: 'wasteland',
  decorations,
  battleRoyale: {
    schemaVersion: 1,
    profile: 'battle-royale-56x34',
    regions,
    transitions: [
      {
        id: 'dust-green-transition',
        fromRegionId: 'dust-basin',
        toRegionId: 'greenward',
        orientation: 'horizontal',
        footprint: { x: 27, y: 2, w: 2, h: 13 },
      },
      {
        id: 'iron-glass-transition',
        fromRegionId: 'ironworks',
        toRegionId: 'glass-wastes',
        orientation: 'horizontal',
        footprint: { x: 27, y: 19, w: 2, h: 13 },
      },
      {
        id: 'dust-iron-transition',
        fromRegionId: 'dust-basin',
        toRegionId: 'ironworks',
        orientation: 'vertical',
        footprint: { x: 2, y: 16, w: 24, h: 2 },
      },
      {
        id: 'green-glass-transition',
        fromRegionId: 'greenward',
        toRegionId: 'glass-wastes',
        orientation: 'vertical',
        footprint: { x: 30, y: 16, w: 24, h: 2 },
      },
      {
        id: 'four-biome-crossing',
        fromRegionId: 'dust-basin',
        toRegionId: 'glass-wastes',
        orientation: 'corner',
        footprint: { x: 27, y: 16, w: 2, h: 2 },
      },
    ],
    landmarks,
    minimap: {
      projection: 'orthographic-top-left',
      bounds: { x: 0, y: 0, w: WIDTH, h: HEIGHT },
      regionIds: regions.map(({ id }) => id),
      landmarkIds: landmarks.map(({ id }) => id),
    },
    connectivity: {
      requireSingleWalkableComponent: true,
      routes: [
        {
          id: 'north-crossing',
          fromRegionId: 'dust-basin',
          toRegionId: 'greenward',
          waypoints: [
            { x: 27, y: 8 },
            { x: 28, y: 8 },
          ],
        },
        {
          id: 'south-crossing',
          fromRegionId: 'ironworks',
          toRegionId: 'glass-wastes',
          waypoints: [
            { x: 27, y: 25 },
            { x: 28, y: 25 },
          ],
        },
        {
          id: 'west-crossing',
          fromRegionId: 'dust-basin',
          toRegionId: 'ironworks',
          waypoints: [
            { x: 12, y: 16 },
            { x: 12, y: 17 },
          ],
        },
        {
          id: 'east-crossing',
          fromRegionId: 'greenward',
          toRegionId: 'glass-wastes',
          waypoints: [
            { x: 43, y: 16 },
            { x: 43, y: 17 },
          ],
        },
      ],
    },
    spawnSafety: {
      groups: [
        {
          id: 'west-north',
          regionId: 'dust-basin',
          spawnIds: ['spawn-west-north-a', 'spawn-west-north-b'],
        },
        {
          id: 'north-west',
          regionId: 'dust-basin',
          spawnIds: ['spawn-north-west-a', 'spawn-north-west-b'],
        },
        {
          id: 'north-east',
          regionId: 'greenward',
          spawnIds: ['spawn-north-east-a', 'spawn-north-east-b'],
        },
        {
          id: 'east-north',
          regionId: 'greenward',
          spawnIds: ['spawn-east-north-a', 'spawn-east-north-b'],
        },
        {
          id: 'east-south',
          regionId: 'glass-wastes',
          spawnIds: ['spawn-east-south-a', 'spawn-east-south-b'],
        },
        {
          id: 'south-east',
          regionId: 'glass-wastes',
          spawnIds: ['spawn-south-east-a', 'spawn-south-east-b'],
        },
        {
          id: 'south-west',
          regionId: 'ironworks',
          spawnIds: ['spawn-south-west-a', 'spawn-south-west-b'],
        },
        {
          id: 'west-south',
          regionId: 'ironworks',
          spawnIds: ['spawn-west-south-a', 'spawn-west-south-b'],
        },
      ],
      minimumPathDistanceTiles: 10,
      minimumEgressDirections: 3,
    },
    containerSpawns,
    sustainSpawnIds: pickupSpawns.map(({ id }) => id),
  },
};

const prettierConfig = (await resolveConfig(output)) ?? {};
const rendered = await format(JSON.stringify(document), { ...prettierConfig, parser: 'json' });
writeFileSync(output, rendered, 'utf8');
process.stdout.write(`Wrote ${output}\n`);
