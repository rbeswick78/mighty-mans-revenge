import { Vec2 } from '../types/common.js';
import { PlayerInput } from '../types/player.js';
import { CollisionGrid } from '../types/map.js';
import { PLAYER } from '../config/game.js';
import { clamp } from './math.js';
import { getCollidingTiles } from './collision.js';

export interface MovementResult {
  newPos: Vec2;
  newStamina: number;
  velocity: Vec2;
}

export interface MovementModifiers {
  /** Multiplier applied to the chosen speed (default 1). */
  speedMultiplier?: number;
  /** When false, sprint never engages (player runs at modified BASE_SPEED). Default true. */
  sprintEnabled?: boolean;
  /** When true, stamina is held constant (no drain, no recharge). Default false. */
  staminaFrozen?: boolean;
  /**
   * When true, the player is frozen in place (Frost Wizard's freeze).
   * Position holds, velocity returns zero, stamina is held constant.
   * Acts as the single shared gate so client prediction and server
   * simulation never disagree on frozen movement. Sprint and input
   * direction are ignored entirely.
   */
  frozen?: boolean;
}

/**
 * Trace an instant dash along `angle`, stopping at the last collision-free
 * point. Small fixed steps make the sweep independent of tile size and
 * prevent tunnelling through thin geometry. Players do not collide with one
 * another elsewhere in movement, so this deliberately tests map tiles only.
 */
export function calculateDashEndpoint(
  currentPos: Vec2,
  angle: number,
  distance: number,
  grid: CollisionGrid,
): Vec2 {
  if (distance <= 0) return { ...currentPos };

  const halfW = PLAYER.HITBOX_WIDTH / 2;
  const halfH = PLAYER.HITBOX_HEIGHT / 2;
  const maxX = grid.width * grid.tileSize - halfW;
  const maxY = grid.height * grid.tileSize - halfH;
  const stepLength = Math.min(4, distance);
  const stepCount = Math.ceil(distance / stepLength);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  let lastSafe = { x: currentPos.x, y: currentPos.y };

  for (let step = 1; step <= stepCount; step++) {
    const travelled = Math.min(distance, step * stepLength);
    const candidate = {
      x: clamp(currentPos.x + dirX * travelled, halfW, maxX),
      y: clamp(currentPos.y + dirY * travelled, halfH, maxY),
    };
    const colliding = getCollidingTiles(
      grid,
      candidate.x - halfW,
      candidate.y - halfH,
      PLAYER.HITBOX_WIDTH,
      PLAYER.HITBOX_HEIGHT,
    );
    if (colliding.length > 0) break;
    lastSafe = candidate;
    if (
      candidate.x === halfW ||
      candidate.x === maxX ||
      candidate.y === halfH ||
      candidate.y === maxY
    ) {
      break;
    }
  }

  return lastSafe;
}

export function calculateMovement(
  input: PlayerInput,
  currentPos: Vec2,
  stamina: number,
  dt: number,
  grid: CollisionGrid,
  modifiers?: MovementModifiers,
): MovementResult {
  const speedMultiplier = modifiers?.speedMultiplier ?? 1;
  const sprintEnabled = modifiers?.sprintEnabled ?? true;
  const staminaFrozen = modifiers?.staminaFrozen ?? false;
  const frozen = modifiers?.frozen ?? false;

  if (frozen) {
    return {
      newPos: { x: currentPos.x, y: currentPos.y },
      newStamina: stamina,
      velocity: { x: 0, y: 0 },
    };
  }

  // Determine speed and update stamina
  let newStamina = stamina;
  const wantsSprint =
    sprintEnabled && input.sprint && (input.moveX !== 0 || input.moveY !== 0);
  const canSprint = wantsSprint && newStamina > 0;
  const baseSpeed = canSprint ? PLAYER.SPRINT_SPEED : PLAYER.BASE_SPEED;
  const speed = baseSpeed * speedMultiplier;

  if (staminaFrozen) {
    // Hold stamina at its current value for the duration of the modifier.
  } else if (canSprint) {
    newStamina = Math.max(0, newStamina - dt);
  } else {
    newStamina = Math.min(
      PLAYER.SPRINT_DURATION,
      newStamina + dt / PLAYER.SPRINT_RECHARGE_RATE,
    );
  }

  // Normalize input direction
  let dirX = input.moveX;
  let dirY = input.moveY;
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
  if (dirLen > 1) {
    dirX /= dirLen;
    dirY /= dirLen;
  }

  const velocityX = dirX * speed;
  const velocityY = dirY * speed;

  // Attempt movement with collision resolution (resolve each axis independently)
  const halfW = PLAYER.HITBOX_WIDTH / 2;
  const halfH = PLAYER.HITBOX_HEIGHT / 2;

  // Try X axis
  let newX = currentPos.x + velocityX * dt;
  const aabbX = newX - halfW;
  const aabbY = currentPos.y - halfH;

  const collidingX = getCollidingTiles(
    grid,
    aabbX,
    aabbY,
    PLAYER.HITBOX_WIDTH,
    PLAYER.HITBOX_HEIGHT,
  );

  let finalVelX = velocityX;
  if (collidingX.length > 0) {
    // Slide: revert X movement
    newX = currentPos.x;
    finalVelX = 0;
  }

  // Try Y axis
  let newY = currentPos.y + velocityY * dt;
  const aabbX2 = newX - halfW;
  const aabbY2 = newY - halfH;

  const collidingY = getCollidingTiles(
    grid,
    aabbX2,
    aabbY2,
    PLAYER.HITBOX_WIDTH,
    PLAYER.HITBOX_HEIGHT,
  );

  let finalVelY = velocityY;
  if (collidingY.length > 0) {
    // Slide: revert Y movement
    newY = currentPos.y;
    finalVelY = 0;
  }

  // Clamp to grid bounds
  const minX = halfW;
  const minY = halfH;
  const maxX = grid.width * grid.tileSize - halfW;
  const maxY = grid.height * grid.tileSize - halfH;
  newX = clamp(newX, minX, maxX);
  newY = clamp(newY, minY, maxY);

  return {
    newPos: { x: newX, y: newY },
    newStamina,
    velocity: { x: finalVelX, y: finalVelY },
  };
}
