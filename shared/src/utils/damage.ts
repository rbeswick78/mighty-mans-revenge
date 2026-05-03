import { Vec2 } from '../types/common.js';
import { GUN, GRENADE } from '../config/game.js';
import { clamp } from './math.js';
import { vecDistance } from './math.js';

/**
 * Calculate gun damage with linear falloff based on distance.
 * Full damage (DAMAGE_MAX) within FALLOFF_RANGE_MIN,
 * minimum damage (DAMAGE_MIN) beyond FALLOFF_RANGE_MAX,
 * linear interpolation in between.
 */
export function calculateDamage(distance: number): number {
  if (distance <= GUN.FALLOFF_RANGE_MIN) {
    return GUN.DAMAGE_MAX;
  }
  if (distance >= GUN.FALLOFF_RANGE_MAX) {
    return GUN.DAMAGE_MIN;
  }
  const t =
    (distance - GUN.FALLOFF_RANGE_MIN) /
    (GUN.FALLOFF_RANGE_MAX - GUN.FALLOFF_RANGE_MIN);
  return GUN.DAMAGE_MAX - (GUN.DAMAGE_MAX - GUN.DAMAGE_MIN) * t;
}

/**
 * Calculate grenade damage based on distance from explosion center.
 * Full damage at the center, linear falloff to MIN_DAMAGE_FACTOR * DAMAGE at
 * BLAST_RADIUS, and 0 strictly outside the blast radius (a step at the edge).
 */
export function calculateGrenadeDamage(distance: number): number {
  if (distance > GRENADE.BLAST_RADIUS) {
    return 0;
  }
  const t = clamp(distance / GRENADE.BLAST_RADIUS, 0, 1);
  const factor = 1 - (1 - GRENADE.MIN_DAMAGE_FACTOR) * t;
  return GRENADE.DAMAGE * factor;
}

/**
 * Check if a target position is within grenade blast radius.
 */
export function isInBlastRadius(explosionPos: Vec2, targetPos: Vec2): boolean {
  return vecDistance(explosionPos, targetPos) <= GRENADE.BLAST_RADIUS;
}
