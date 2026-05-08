import type { MapData } from '../types/map.js';
import { validateMap } from '../utils/map-validator.js';
import wastelandOutpost from '../../maps/wasteland-outpost.json' with { type: 'json' };

const ALL: readonly MapData[] = [wastelandOutpost as MapData];

for (const m of ALL) {
  const r = validateMap(m);
  if (!r.valid) {
    throw new Error(`Invalid map "${m.name}": ${r.errors.join('; ')}`);
  }
}

export const MAP_REGISTRY: ReadonlyMap<string, MapData> = new Map(
  ALL.map((m) => [m.name, m] as const),
);

export function getMap(name: string): MapData {
  const m = MAP_REGISTRY.get(name);
  if (!m) {
    throw new Error(`Unknown map: ${name}`);
  }
  return m;
}

export function listMapNames(): readonly string[] {
  return [...MAP_REGISTRY.keys()];
}

/** Default starting map until rotation/selection lands. */
export const DEFAULT_MAP_NAME: string = (wastelandOutpost as MapData).name;
