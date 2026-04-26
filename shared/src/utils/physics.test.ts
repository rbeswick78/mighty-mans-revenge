import { describe, it, expect } from 'vitest';
import { calculateMovement } from './physics.js';
import { PLAYER } from '../config/game.js';
import { PlayerInput } from '../types/player.js';
import { CollisionGrid } from '../types/map.js';

// Open 5x5 grid — walls on borders, floor inside
function makeOpenGrid(tileSize: number = 48): CollisionGrid {
  const solid: boolean[][] = [];
  for (let r = 0; r < 5; r++) {
    solid[r] = [];
    for (let c = 0; c < 5; c++) {
      solid[r][c] = r === 0 || r === 4 || c === 0 || c === 4;
    }
  }
  return { width: 5, height: 5, tileSize, solid };
}

function makeInput(overrides: Partial<PlayerInput> = {}): PlayerInput {
  return {
    sequenceNumber: 1,
    moveX: 0,
    moveY: 0,
    aimAngle: 0,
    aimingGun: false,
    firePressed: false,
    aimingGrenade: false,
    throwPressed: false,
    detonatePressed: false,
    sprint: false,
    reload: false,
    tick: 0,
    ...overrides,
  };
}

const dt = 1 / 20; // 50ms tick
const grid = makeOpenGrid();
const center = { x: 120, y: 120 }; // center of 5x5 grid at tile (2,2)

describe('calculateMovement', () => {
  describe('cardinal direction movement', () => {
    it('moves right', () => {
      const input = makeInput({ moveX: 1, moveY: 0 });
      const result = calculateMovement(input, center, PLAYER.SPRINT_DURATION, dt, grid);
      expect(result.newPos.x).toBeGreaterThan(center.x);
      expect(result.newPos.y).toBeCloseTo(center.y, 5);
    });

    it('moves left', () => {
      const input = makeInput({ moveX: -1, moveY: 0 });
      const result = calculateMovement(input, center, PLAYER.SPRINT_DURATION, dt, grid);
      expect(result.newPos.x).toBeLessThan(center.x);
      expect(result.newPos.y).toBeCloseTo(center.y, 5);
    });

    it('moves down', () => {
      const input = makeInput({ moveX: 0, moveY: 1 });
      const result = calculateMovement(input, center, PLAYER.SPRINT_DURATION, dt, grid);
      expect(result.newPos.y).toBeGreaterThan(center.y);
      expect(result.newPos.x).toBeCloseTo(center.x, 5);
    });

    it('moves up', () => {
      const input = makeInput({ moveX: 0, moveY: -1 });
      const result = calculateMovement(input, center, PLAYER.SPRINT_DURATION, dt, grid);
      expect(result.newPos.y).toBeLessThan(center.y);
      expect(result.newPos.x).toBeCloseTo(center.x, 5);
    });
  });

  describe('diagonal movement normalization', () => {
    it('normalizes diagonal input so speed matches cardinal movement', () => {
      const cardinalInput = makeInput({ moveX: 1, moveY: 0 });
      const diagonalInput = makeInput({ moveX: 1, moveY: 1 });

      const cardinalResult = calculateMovement(
        cardinalInput,
        center,
        PLAYER.SPRINT_DURATION,
        dt,
        grid,
      );
      const diagonalResult = calculateMovement(
        diagonalInput,
        center,
        PLAYER.SPRINT_DURATION,
        dt,
        grid,
      );

      const cardinalDist = Math.sqrt(
        (cardinalResult.newPos.x - center.x) ** 2 +
          (cardinalResult.newPos.y - center.y) ** 2,
      );
      const diagonalDist = Math.sqrt(
        (diagonalResult.newPos.x - center.x) ** 2 +
          (diagonalResult.newPos.y - center.y) ** 2,
      );

      // Diagonal distance should be similar to cardinal (normalized)
      expect(diagonalDist).toBeCloseTo(cardinalDist, 1);
    });
  });

  describe('sprint speed vs normal speed', () => {
    it('moves faster when sprinting', () => {
      const walkInput = makeInput({ moveX: 1, moveY: 0, sprint: false });
      const sprintInput = makeInput({ moveX: 1, moveY: 0, sprint: true });

      const walkResult = calculateMovement(
        walkInput,
        center,
        PLAYER.SPRINT_DURATION,
        dt,
        grid,
      );
      const sprintResult = calculateMovement(
        sprintInput,
        center,
        PLAYER.SPRINT_DURATION,
        dt,
        grid,
      );

      const walkDist = sprintResult.newPos.x - center.x;
      const normalDist = walkResult.newPos.x - center.x;
      expect(walkDist).toBeGreaterThan(normalDist);
    });

    it('uses base speed at normal walk', () => {
      const input = makeInput({ moveX: 1, moveY: 0 });
      const result = calculateMovement(input, center, PLAYER.SPRINT_DURATION, dt, grid);
      const expectedX = center.x + PLAYER.BASE_SPEED * dt;
      expect(result.newPos.x).toBeCloseTo(expectedX, 3);
    });

    it('uses sprint speed when sprinting with stamina', () => {
      const input = makeInput({ moveX: 1, moveY: 0, sprint: true });
      const result = calculateMovement(input, center, PLAYER.SPRINT_DURATION, dt, grid);
      const expectedX = center.x + PLAYER.SPRINT_SPEED * dt;
      expect(result.newPos.x).toBeCloseTo(expectedX, 3);
    });
  });

  describe('stamina mechanics', () => {
    it('drains stamina while sprinting', () => {
      const input = makeInput({ moveX: 1, moveY: 0, sprint: true });
      const result = calculateMovement(input, center, PLAYER.SPRINT_DURATION, dt, grid);
      expect(result.newStamina).toBeLessThan(PLAYER.SPRINT_DURATION);
      expect(result.newStamina).toBeCloseTo(PLAYER.SPRINT_DURATION - dt, 10);
    });

    it('recharges stamina while not sprinting', () => {
      const input = makeInput({ moveX: 1, moveY: 0, sprint: false });
      const lowStamina = 1.0;
      const result = calculateMovement(input, center, lowStamina, dt, grid);
      expect(result.newStamina).toBeGreaterThan(lowStamina);
    });

    it('does not sprint with zero stamina', () => {
      const input = makeInput({ moveX: 1, moveY: 0, sprint: true });
      const result = calculateMovement(input, center, 0, dt, grid);
      // Should move at base speed, not sprint speed
      const expectedX = center.x + PLAYER.BASE_SPEED * dt;
      expect(result.newPos.x).toBeCloseTo(expectedX, 3);
    });

    it('caps stamina at max', () => {
      const input = makeInput({ moveX: 0, moveY: 0 });
      const result = calculateMovement(
        input,
        center,
        PLAYER.SPRINT_DURATION,
        dt,
        grid,
      );
      expect(result.newStamina).toBeLessThanOrEqual(PLAYER.SPRINT_DURATION);
    });

    it('does not drain stamina when sprint is true but no movement', () => {
      const input = makeInput({ moveX: 0, moveY: 0, sprint: true });
      const result = calculateMovement(input, center, PLAYER.SPRINT_DURATION, dt, grid);
      // wantsSprint is false because no movement, so stamina recharges
      expect(result.newStamina).toBeGreaterThanOrEqual(PLAYER.SPRINT_DURATION);
    });
  });

  describe('wall collision', () => {
    it('stops movement into a wall on X axis', () => {
      // Make a grid where column 3 is a wall (starts at pixel 144)
      const solid: boolean[][] = [];
      for (let r = 0; r < 5; r++) {
        solid[r] = [];
        for (let c = 0; c < 5; c++) {
          solid[r][c] = r === 0 || r === 4 || c === 0 || c === 4 || c === 3;
        }
      }
      const wallGrid: CollisionGrid = { width: 5, height: 5, tileSize: 48, solid };

      // halfW = 12, BASE_SPEED * dt = 200 * 0.05 = 10
      // Wall column 3 starts at pixel 144. AABB right edge = x + 12.
      // Current: 130 + 12 = 142 < 144 (no overlap). After move: 140 + 12 = 152 >= 144 (overlap).
      const pos = { x: 130, y: 120 };
      const input = makeInput({ moveX: 1, moveY: 0 });
      const result = calculateMovement(input, pos, PLAYER.SPRINT_DURATION, dt, wallGrid);
      // X should revert to original since moving right would collide
      expect(result.newPos.x).toBeCloseTo(pos.x, 3);
    });

    it('allows sliding along walls', () => {
      // Wall on the right (column 3), try diagonal right+down
      const solid: boolean[][] = [];
      for (let r = 0; r < 5; r++) {
        solid[r] = [];
        for (let c = 0; c < 5; c++) {
          solid[r][c] = r === 0 || r === 4 || c === 0 || c === 4 || c === 3;
        }
      }
      const wallGrid: CollisionGrid = { width: 5, height: 5, tileSize: 48, solid };

      // Place player so X movement collides but after reverting X, Y check is clear
      // x=130: AABB right = 142 < 144 (current ok), after X move: 142+10=overlap => X reverts
      // Y check uses original x=130: AABB right = 142 < 144 => no X-axis wall collision for Y step
      const pos = { x: 130, y: 120 };
      const input = makeInput({ moveX: 1, moveY: 1 });
      const result = calculateMovement(input, pos, PLAYER.SPRINT_DURATION, dt, wallGrid);
      // X blocked (reverted), but Y should still advance
      expect(result.newPos.x).toBeCloseTo(pos.x, 3);
      expect(result.newPos.y).toBeGreaterThan(pos.y);
    });
  });

  describe('map boundary clamping', () => {
    it('clamps position to map bounds', () => {
      // Try to move past the grid boundary with a huge dt
      const input = makeInput({ moveX: -1, moveY: -1 });
      // Open grid with no internal walls
      const openSolid: boolean[][] = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => false),
      );
      const openGrid: CollisionGrid = {
        width: 5,
        height: 5,
        tileSize: 48,
        solid: openSolid,
      };

      const pos = { x: 20, y: 20 };
      const result = calculateMovement(input, pos, PLAYER.SPRINT_DURATION, 10, openGrid);
      const halfW = PLAYER.HITBOX_WIDTH / 2;
      const halfH = PLAYER.HITBOX_HEIGHT / 2;
      expect(result.newPos.x).toBeGreaterThanOrEqual(halfW);
      expect(result.newPos.y).toBeGreaterThanOrEqual(halfH);
    });
  });

  describe('zero movement input', () => {
    it('does not change position', () => {
      const input = makeInput({ moveX: 0, moveY: 0 });
      const result = calculateMovement(input, center, PLAYER.SPRINT_DURATION, dt, grid);
      expect(result.newPos.x).toBeCloseTo(center.x, 10);
      expect(result.newPos.y).toBeCloseTo(center.y, 10);
    });

    it('velocity is zero', () => {
      const input = makeInput({ moveX: 0, moveY: 0 });
      const result = calculateMovement(input, center, PLAYER.SPRINT_DURATION, dt, grid);
      expect(result.velocity.x).toBeCloseTo(0, 10);
      expect(result.velocity.y).toBeCloseTo(0, 10);
    });
  });
});
