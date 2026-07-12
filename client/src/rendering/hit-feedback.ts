import type { PlayerId } from '@shared/types/common.js';
import type { BulletTrail } from '@shared/types/projectile.js';

type HitFields = Partial<Pick<BulletTrail, 'hitPlayerId' | 'damageApplied'>>;

/** Pellet trails within this window belong to one authoritative blast. */
export const SHOTGUN_TRAIL_GROUP_MS = 100;

/**
 * Runtime-safe confirmation guard. Partial input intentionally supports a
 * briefly mismatched deployment where an older server omits the new fields.
 */
export function hasConfirmedPlayerHit(
  trail: HitFields,
): trail is HitFields & { hitPlayerId: PlayerId; damageApplied: number } {
  return (
    typeof trail.hitPlayerId === 'string' &&
    typeof trail.damageApplied === 'number' &&
    Number.isFinite(trail.damageApplied) &&
    trail.damageApplied > 0
  );
}

export function isSameShotgunBlast(
  previousTimestamp: number | undefined,
  currentTimestamp: number,
): boolean {
  if (previousTimestamp === undefined) return false;
  const elapsed = currentTimestamp - previousTimestamp;
  return elapsed >= 0 && elapsed < SHOTGUN_TRAIL_GROUP_MS;
}
