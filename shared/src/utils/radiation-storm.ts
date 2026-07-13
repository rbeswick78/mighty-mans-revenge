import { KOTH, MUTATORS } from '../config/game.js';
import type { Vec2 } from '../types/common.js';
import type { RadiationStormState } from '../types/game.js';
import type { MapData } from '../types/map.js';

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Pick a walkable authored center without consuming any simulation RNG. */
export function radiationStormCenter(matchId: string, map: MapData): Vec2 {
  const anchors = map.kothHills?.length
    ? map.kothHills
    : map.spawnPoints.length
      ? map.spawnPoints
      : [{ x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) }];
  const anchor = anchors[stableHash(`${matchId}:radiation-storm`) % anchors.length];
  const zoneSize = map.kothHills?.length ? KOTH.HILL_SIZE_TILES : 1;
  return {
    x: (anchor.x + zoneSize / 2) * map.tileSize,
    y: (anchor.y + zoneSize / 2) * map.tileSize,
  };
}

/** Radius large enough to contain every arena corner at activation. */
export function radiationStormInitialRadius(map: MapData, center: Vec2): number {
  const width = map.width * map.tileSize;
  const height = map.height * map.tileSize;
  return Math.max(
    Math.hypot(center.x, center.y),
    Math.hypot(width - center.x, center.y),
    Math.hypot(center.x, height - center.y),
    Math.hypot(width - center.x, height - center.y),
  );
}

/** Linear authoritative close with a stable final hold. */
export function radiationStormRadius(initialRadius: number, elapsedSeconds: number): number {
  const t = Math.min(1, Math.max(0, elapsedSeconds / MUTATORS.RADIATION_STORM_SHRINK_SECONDS));
  return initialRadius + (MUTATORS.RADIATION_STORM_FINAL_RADIUS_PX - initialRadius) * t;
}

export function isOutsideRadiationStorm(position: Vec2, state: RadiationStormState): boolean {
  return Math.hypot(position.x - state.center.x, position.y - state.center.y) > state.radius;
}
