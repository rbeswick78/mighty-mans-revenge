import { Vec2 } from '../types/common.js';
import { WEAPONS, GRENADE } from '../config/game.js';
import type { WeaponDef } from '../types/weapon.js';
import { clamp } from './math.js';
import { vecDistance } from './math.js';

/**
 * Calculate per-bullet/pellet damage with linear falloff based on distance.
 * Full damage (damageMax) within falloffRangeMin, minimum damage
 * (damageMin) beyond falloffRangeMax, linear interpolation in between.
 * Defaults to the rifle so pre-weapon-system call sites keep their
 * behavior.
 */
export function calculateDamage(
  distance: number,
  weapon: WeaponDef = WEAPONS.rifle,
): number {
  if (distance <= weapon.falloffRangeMin) {
    return weapon.damageMax;
  }
  if (distance >= weapon.falloffRangeMax) {
    return weapon.damageMin;
  }
  const t =
    (distance - weapon.falloffRangeMin) /
    (weapon.falloffRangeMax - weapon.falloffRangeMin);
  return weapon.damageMax - (weapon.damageMax - weapon.damageMin) * t;
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
