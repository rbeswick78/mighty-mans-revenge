import {
  CHARACTER_IDS,
  GAME_MODE_ROTATION,
  KOTH,
  MAP,
  MATCH,
  MATCH_COMPOSITIONS_BY_FORMAT,
  MATCH_FORMATS,
  MATCH_MODES_BY_FORMAT,
  PLAYER,
  MatchPhase,
  TileType,
  createCollisionGrid,
  getMap,
  listMapNames,
} from '@shared/game';
import type {
  GameModeType,
  MapData,
  MapTilePoint,
  MatchComposition,
  MatchFormat,
  PlayerId,
  TeamId,
} from '@shared/game';
import { BotController } from './bot-controller.js';
import { Match } from './match.js';
import { getGameMode } from './modes/index.js';
import { PickupManager } from './pickup-manager.js';

export interface StandardMatchBalanceProduct {
  mapName: string;
  format: MatchFormat;
  composition: MatchComposition;
  mode: GameModeType;
  participantCount: number;
}

export interface ArenaBalanceMetrics {
  mapName: string;
  walkableTiles: number;
  pickupCount: number;
  pickupDensityPerHundredWalkableTiles: number;
  minimumSpawnPathTiles: number;
  maximumArenaPathTiles: number;
  maximumArenaTravelSeconds: number;
  maximumKothTravelSeconds: number;
  maximumKothContestSpreadSeconds: number;
  maximumCoreTravelSeconds: number;
  coreContestSpreadSeconds: number;
  maximumNearestPickupTravelSeconds: number;
  maximumGateTravelSeconds: number;
  maximumHazardTravelSeconds: number;
  destructibleCoverTiles: number;
  shootableGates: number;
  explosiveBarrels: number;
}

export interface ModeBalanceMetrics {
  mode: GameModeType;
  compatibleFormats: MatchFormat[];
  productCount: number;
  enabledPickupCount: number;
}

export interface ReforgedBalanceEvidence {
  productCount: number;
  products: StandardMatchBalanceProduct[];
  arenas: ArenaBalanceMetrics[];
  modes: ModeBalanceMetrics[];
}

export interface ReforgedRegulationEvidence {
  mapName: string;
  mode: GameModeType;
  format: 'rumble' | 'crew';
  phase: MatchPhase;
  simulatedSeconds: number;
  wentToOvertime: boolean;
  winnerId: PlayerId | null;
  scores: Record<string, number>;
  shotsFired: number;
  botRecoveries: number;
}

interface GridPoint {
  x: number;
  y: number;
}

const DIRECTIONS: readonly GridPoint[] = Object.freeze([
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: 0, y: -1 }),
]);

function key(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

function isWalkable(grid: ReturnType<typeof createCollisionGrid>, point: GridPoint): boolean {
  return (
    point.x >= 0 &&
    point.x < grid.width &&
    point.y >= 0 &&
    point.y < grid.height &&
    !grid.solid[point.y][point.x]
  );
}

function distanceField(map: MapData, start: GridPoint): ReadonlyMap<string, number> {
  const grid = createCollisionGrid(map);
  if (
    start.x < 0 ||
    start.x >= grid.width ||
    start.y < 0 ||
    start.y >= grid.height ||
    grid.solid[start.y][start.x]
  ) {
    return new Map();
  }
  const distances = new Map<string, number>([[key(start), 0]]);
  const queue: GridPoint[] = [start];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    const distance = distances.get(key(current))!;
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = key(next);
      if (
        next.x < 0 ||
        next.x >= grid.width ||
        next.y < 0 ||
        next.y >= grid.height ||
        grid.solid[next.y][next.x] ||
        distances.has(nextKey)
      ) {
        continue;
      }
      distances.set(nextKey, distance + 1);
      queue.push(next);
    }
  }
  return distances;
}

function footprintPoints(topLeft: MapTilePoint, width: number, height = width): GridPoint[] {
  const points: GridPoint[] = [];
  for (let y = topLeft.y; y < topLeft.y + height; y++) {
    for (let x = topLeft.x; x < topLeft.x + width; x++) points.push({ x, y });
  }
  return points;
}

function adjacentWalkablePoints(
  grid: ReturnType<typeof createCollisionGrid>,
  point: GridPoint,
): GridPoint[] {
  return DIRECTIONS.map((direction) => ({
    x: point.x + direction.x,
    y: point.y + direction.y,
  })).filter((candidate) => isWalkable(grid, candidate));
}

function minimumDistanceTo(
  distances: ReadonlyMap<string, number>,
  targets: readonly GridPoint[],
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const target of targets) minimum = Math.min(minimum, distances.get(key(target)) ?? minimum);
  return minimum;
}

function travelSeconds(pathTiles: number, tileSize: number): number {
  return (pathTiles * tileSize) / PLAYER.BASE_SPEED;
}

function finiteMaximum(values: readonly number[]): number {
  if (values.some((value) => !Number.isFinite(value))) return Number.POSITIVE_INFINITY;
  return Math.max(...values);
}

function arenaMetrics(map: MapData): ArenaBalanceMetrics {
  const grid = createCollisionGrid(map);
  const walkable: GridPoint[] = [];
  let destructibleCoverTiles = 0;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!grid.solid[y][x]) walkable.push({ x, y });
      if (map.tiles[y][x] === TileType.COVER_LOW) destructibleCoverTiles++;
    }
  }

  const spawnFields = map.spawnPoints.map((spawn) => distanceField(map, spawn));
  const spawnPairDistances: number[] = [];
  for (let left = 0; left < map.spawnPoints.length; left++) {
    for (let right = left + 1; right < map.spawnPoints.length; right++) {
      spawnPairDistances.push(
        spawnFields[left].get(key(map.spawnPoints[right])) ?? Number.POSITIVE_INFINITY,
      );
    }
  }

  const allPathMaximums = walkable.map((start) =>
    finiteMaximum([...distanceField(map, start).values()]),
  );
  const kothTravelByAnchor = (map.kothHills ?? []).map((hill) => {
    const target = footprintPoints(hill, KOTH.HILL_SIZE_TILES);
    return spawnFields.map((field) => minimumDistanceTo(field, target));
  });
  const coreAnchor = map.authoring?.objectives.find((objective) => objective.kind === 'core-run');
  const coreTarget = coreAnchor
    ? footprintPoints(coreAnchor.footprint, coreAnchor.footprint.w, coreAnchor.footprint.h)
    : footprintPoints({ x: map.width / 2 - 1, y: map.height / 2 - 1 }, 2);
  const coreTravel = spawnFields.map((field) => minimumDistanceTo(field, coreTarget));
  const nearestPickupTravel = spawnFields.map((field) =>
    Math.min(
      ...map.pickupSpawns.map((pickup) => field.get(key(pickup)) ?? Number.POSITIVE_INFINITY),
    ),
  );
  const gateTravel = (map.decorations ?? [])
    .filter((decoration) => decoration.interaction === 'shootable_gate')
    .flatMap((gate) => {
      const targets = adjacentWalkablePoints(grid, gate);
      return spawnFields.map((field) => minimumDistanceTo(field, targets));
    });
  const hazardTravel = (map.decorations ?? [])
    .filter((decoration) => decoration.hazard === 'explosive_barrel')
    .flatMap((hazard) => {
      const targets = adjacentWalkablePoints(grid, hazard);
      return spawnFields.map((field) => minimumDistanceTo(field, targets));
    });
  const kothTravel = kothTravelByAnchor.flat();
  const kothSpreads = kothTravelByAnchor.map(
    (distances) => Math.max(...distances) - Math.min(...distances),
  );
  const maximumArenaPathTiles = finiteMaximum(allPathMaximums);

  return {
    mapName: map.name,
    walkableTiles: walkable.length,
    pickupCount: map.pickupSpawns.length,
    pickupDensityPerHundredWalkableTiles: (map.pickupSpawns.length / walkable.length) * 100,
    minimumSpawnPathTiles: Math.min(...spawnPairDistances),
    maximumArenaPathTiles,
    maximumArenaTravelSeconds: travelSeconds(maximumArenaPathTiles, map.tileSize),
    maximumKothTravelSeconds: travelSeconds(finiteMaximum(kothTravel), map.tileSize),
    maximumKothContestSpreadSeconds: travelSeconds(finiteMaximum(kothSpreads), map.tileSize),
    maximumCoreTravelSeconds: travelSeconds(finiteMaximum(coreTravel), map.tileSize),
    coreContestSpreadSeconds: travelSeconds(
      Math.max(...coreTravel) - Math.min(...coreTravel),
      map.tileSize,
    ),
    maximumNearestPickupTravelSeconds: travelSeconds(
      finiteMaximum(nearestPickupTravel),
      map.tileSize,
    ),
    maximumGateTravelSeconds: travelSeconds(finiteMaximum(gateTravel), map.tileSize),
    maximumHazardTravelSeconds: travelSeconds(finiteMaximum(hazardTravel), map.tileSize),
    destructibleCoverTiles,
    shootableGates: (map.decorations ?? []).filter(
      (decoration) => decoration.interaction === 'shootable_gate',
    ).length,
    explosiveBarrels: (map.decorations ?? []).filter(
      (decoration) => decoration.hazard === 'explosive_barrel',
    ).length,
  };
}

export function buildReforgedBalanceEvidence(): ReforgedBalanceEvidence {
  const maps = listMapNames().map((name) => getMap(name, { largeWorlds: true }));
  const products: StandardMatchBalanceProduct[] = [];
  for (const map of maps) {
    for (const format of MATCH_FORMATS) {
      for (const composition of MATCH_COMPOSITIONS_BY_FORMAT[format]) {
        for (const mode of MATCH_MODES_BY_FORMAT[format]) {
          products.push({
            mapName: map.name,
            format,
            composition,
            mode,
            participantCount: composition.humanCount + composition.botCount,
          });
        }
      }
    }
  }

  const modes = GAME_MODE_ROTATION.map((mode) => {
    const compatibleFormats = MATCH_FORMATS.filter((format) =>
      MATCH_MODES_BY_FORMAT[format].includes(mode),
    );
    const modeRules = getGameMode(mode);
    const representativeMap = maps[0];
    const pickupManager = new PickupManager();
    pickupManager.initFromMap(representativeMap, modeRules.isPickupTypeEnabled?.bind(modeRules));
    return {
      mode,
      compatibleFormats,
      productCount: products.filter((product) => product.mode === mode).length,
      enabledPickupCount: pickupManager.getPickups().length,
    };
  });

  return {
    productCount: products.length,
    products,
    arenas: maps.map(arenaMetrics),
    modes,
  };
}

function teamsFor(ids: readonly PlayerId[]): ReadonlyMap<PlayerId, TeamId> {
  return new Map(ids.map((id, index) => [id, index < 2 ? 'blue' : 'red']));
}

/**
 * Runs the maximum four-participant shape through authoritative 20 Hz time for
 * every arena and mode. Crew-compatible modes use 1 human + 3 bots split 2v2;
 * the remaining modes use the equivalent Rumble composition.
 */
export function buildReforgedRegulationEvidence(): ReforgedRegulationEvidence[] {
  return listMapNames().flatMap((mapName) =>
    GAME_MODE_ROTATION.map((mode) => {
      const crewCompatible = MATCH_MODES_BY_FORMAT.crew.includes(mode);
      const entries = [
        { id: 'human-0', nickname: 'Human 0' },
        { id: 'bot:0', nickname: 'Bot 0' },
        { id: 'bot:1', nickname: 'Bot 1' },
        { id: 'bot:2', nickname: 'Bot 2' },
      ];
      const match = new Match(
        `balance-regulation-${mapName}-${mode}`,
        getMap(mapName, { largeWorlds: true }),
        entries,
        mode,
        () => 0.5,
        [],
        undefined,
        undefined,
        undefined,
        `balance-regulation-${mapName}-${mode}`,
        new Map(),
        crewCompatible ? teamsFor(entries.map(({ id }) => id)) : new Map(),
      );
      entries.forEach(({ id }, index) => match.setLock(id, CHARACTER_IDS[index]));
      match.update(0);
      match.update(MATCH.COUNTDOWN_DURATION);
      const controllers = entries.slice(1).map(({ id }) => new BotController(id));
      const maximumTicks = Math.ceil((MATCH.TIME_LIMIT + 35) / 0.05);
      let ticks = 0;
      while (match.phase === MatchPhase.ACTIVE && ticks < maximumTicks) {
        ticks++;
        for (const controller of controllers) controller.update(0.05, match, ticks);
        match.update(0.05);
      }
      const result = match.phase === MatchPhase.ENDED ? match.getResult() : null;
      return {
        mapName,
        mode,
        format: crewCompatible ? 'crew' : 'rumble',
        phase: match.phase,
        simulatedSeconds: ticks * 0.05,
        wentToOvertime: result?.wentToOvertime ?? match.isOvertime,
        winnerId: result?.winnerId ?? null,
        scores: Object.fromEntries([...match.players].map(([id, player]) => [id, player.score])),
        shotsFired: [...match.players.keys()].reduce(
          (total, id) => total + match.stats.getStats(id).shotsFired,
          0,
        ),
        botRecoveries: controllers.reduce(
          (total, controller) => total + controller.getRecoveryCount(),
          0,
        ),
      };
    }),
  );
}

export const REFORGED_BALANCE_CONTEXT = Object.freeze({
  tileSize: MAP.TILE_SIZE,
  baseSpeed: PLAYER.BASE_SPEED,
  regulationSeconds: MATCH.TIME_LIMIT,
  hillMoveSeconds: KOTH.HILL_MOVE_INTERVAL,
});
