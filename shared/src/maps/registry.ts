import type { MapData } from '../types/map.js';
import { validateMap } from '../utils/map-validator.js';
import wastelandOutpost from '../../maps/wasteland-outpost.json' with { type: 'json' };
import overgrownSuburb from '../../maps/overgrown-suburb.json' with { type: 'json' };
import scrapyard from '../../maps/scrapyard.json' with { type: 'json' };
import collapsedOverpass from '../../maps/collapsed-overpass.json' with { type: 'json' };

/** Registry order doubles as the rotation order (see getNextMapName). */
const ALL: readonly MapData[] = [
  wastelandOutpost as MapData,
  overgrownSuburb as MapData,
  scrapyard as MapData,
  collapsedOverpass as MapData,
];

for (const m of ALL) {
  const r = validateMap(m);
  if (!r.valid) {
    throw new Error(`Invalid map "${m.name}": ${r.errors.join('; ')}`);
  }
  // Presence check lives here, not in validateMap: fixtures without hills
  // are valid maps, but every SHIPPED map must support King of the Hill
  // because mode rotation can put KOTH on any of them.
  if (!m.kothHills || m.kothHills.length === 0) {
    throw new Error(`Map "${m.name}" declares no kothHills — required for mode rotation`);
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

/**
 * Round-robin rotation: the map that follows `currentName` in registry
 * order, wrapping at the end. Unknown names restart the cycle at the
 * first map rather than throwing — rotation should never kill a match.
 */
export function getNextMapName(currentName: string): string {
  const names = listMapNames();
  const idx = names.indexOf(currentName);
  return names[(idx + 1) % names.length];
}

/** First map new/fresh matches see before the rotation advances. */
export const DEFAULT_MAP_NAME: string = (wastelandOutpost as MapData).name;
