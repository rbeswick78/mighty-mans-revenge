/**
 * 4-direction sprite picking for top-down characters.
 *
 * The asset pack ships separate sprite sheets per cardinal facing
 * (down/up/side/side-left). Aim angle is continuous, so we bucket it.
 *
 *   atan2 returns radians in (-π, π]:
 *     0     → +x (right)        → 'side'
 *     π/2   → +y (down)         → 'down'
 *     ±π    → -x (left)         → 'side-left'
 *     -π/2  → -y (up)           → 'up'
 */

export type { DeathDirection, Direction4 } from '@shared/types/character.js';
import type { DeathDirection, Direction4 } from '@shared/types/character.js';

const QUARTER_PI = Math.PI / 4;
const THREE_QUARTER_PI = 3 * Math.PI / 4;

export function bucketAimAngle(angle: number): Direction4 {
  if (angle > -QUARTER_PI && angle <= QUARTER_PI) return 'side';
  if (angle > QUARTER_PI && angle <= THREE_QUARTER_PI) return 'down';
  if (angle > -THREE_QUARTER_PI && angle <= -QUARTER_PI) return 'up';
  return 'side-left';
}

/**
 * Death art only ships side and side-left sheets. Preserve the horizontal
 * component of the authoritative aim so vertical-facing deaths fall in the
 * direction the fighter was leaning instead of always snapping right.
 */
export function deathDirectionForAim(angle: number): DeathDirection {
  return Math.cos(angle) >= 0 ? 'side' : 'side-left';
}
