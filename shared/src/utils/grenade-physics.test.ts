import { describe, it, expect } from 'vitest';
import { stepGrenade } from './grenade-physics.js';
import { CollisionGrid } from '../types/map.js';

const TILE = 48;

function makeOpenGrid(): CollisionGrid {
  const solid: boolean[][] = [];
  for (let r = 0; r < 5; r++) {
    solid[r] = [];
    for (let c = 0; c < 5; c++) {
      solid[r][c] = r === 0 || r === 4 || c === 0 || c === 4;
    }
  }
  return { width: 5, height: 5, tileSize: TILE, solid };
}

describe('stepGrenade', () => {
  it('integrates linear motion without obstacles', () => {
    const grid = makeOpenGrid();
    const g = {
      position: { x: TILE * 2, y: TILE * 2 },
      velocity: { x: 100, y: 0 },
    };
    stepGrenade(g, 0.1, grid);
    expect(g.position.x).toBeCloseTo(TILE * 2 + 10, 5);
    expect(g.position.y).toBeCloseTo(TILE * 2, 5);
    // Velocity unchanged (no bounce).
    expect(g.velocity.x).toBe(100);
  });

  it('reverses x velocity when crossing into a solid tile', () => {
    const grid = makeOpenGrid();
    // Position just inside the right-edge open tile (column 3 ends at x=192;
    // wall column 4 starts there). Move right with enough velocity to cross.
    const g = {
      position: { x: TILE * 3 + TILE - 5, y: TILE * 2 },
      velocity: { x: 200, y: 0 },
    };
    const before = g.velocity.x;
    stepGrenade(g, 0.5, grid);
    expect(g.velocity.x).toBe(-before);
  });

  it('reverses y velocity when crossing into a solid tile', () => {
    const grid = makeOpenGrid();
    const g = {
      position: { x: TILE * 2, y: TILE * 3 + TILE - 5 },
      velocity: { x: 0, y: 200 },
    };
    const before = g.velocity.y;
    stepGrenade(g, 0.5, grid);
    expect(g.velocity.y).toBe(-before);
  });

  it('returns the same reference', () => {
    const grid = makeOpenGrid();
    const g = {
      position: { x: TILE * 2, y: TILE * 2 },
      velocity: { x: 50, y: 50 },
    };
    const out = stepGrenade(g, 0.05, grid);
    expect(out).toBe(g);
  });
});
