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

export function calculateMovement(
  input: PlayerInput,
  currentPos: Vec2,
  stamina: number,
  dt: number,
  grid: CollisionGrid,
): MovementResult {
  // Determine speed and update stamina
  let newStamina = stamina;
  const wantsSprint = input.sprint && (input.moveX !== 0 || input.moveY !== 0);
  const canSprint = wantsSprint && newStamina > 0;
  const speed = canSprint ? PLAYER.SPRINT_SPEED : PLAYER.BASE_SPEED;

  if (canSprint) {
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
