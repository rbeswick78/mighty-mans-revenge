import { describe, it, expect } from 'vitest';
import { predictBulletRay, predictGrenadePath } from './trajectory-prediction.js';
import { stepGrenade } from './grenade-physics.js';
import { GRENADE, GUN, PLAYER, TRAJECTORY } from '../config/game.js';
import { CollisionGrid } from '../types/map.js';
import { PlayerState } from '../types/player.js';
import { vecFromAngle, vecScale } from './math.js';

const TILE = 48;

/** 7x7 grid surrounded by walls, open inside. */
function makeOpenGrid(): CollisionGrid {
  const solid: boolean[][] = [];
  for (let r = 0; r < 7; r++) {
    solid[r] = [];
    for (let c = 0; c < 7; c++) {
      solid[r][c] = r === 0 || r === 6 || c === 0 || c === 6;
    }
  }
  return { width: 7, height: 7, tileSize: TILE, solid };
}

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p1',
    nickname: 'p1',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: 100,
    maxHealth: 100,
    ammo: 30,
    isReloading: false,
    reloadTimer: 0,
    isSprinting: false,
    stamina: 3,
    isDead: false,
    respawnTimer: 0,
    invulnerableTimer: 0,
    lastProcessedInput: 0,
    score: 0,
    deaths: 0,
    ...overrides,
  };
}

describe('predictBulletRay', () => {
  it('ends at the wall when no players are in the line of fire', () => {
    const grid = makeOpenGrid();
    const shooter = makePlayer({ id: 'me', position: { x: TILE * 3, y: TILE * 3 } });
    const players = new Map<string, PlayerState>([[shooter.id, shooter]]);

    // Aiming straight right (angle 0). Walls at column 6 → x = 288.
    const aim = predictBulletRay('me', shooter.position, 0, players, grid);

    expect(aim.hitPlayerId).toBeNull();
    // Wall at x = 6 * 48 = 288
    expect(aim.endPos.x).toBeCloseTo(288, 0);
    expect(aim.endPos.y).toBeCloseTo(shooter.position.y, 5);
  });

  it('ends at the player AABB when a target is in the way', () => {
    const grid = makeOpenGrid();
    const shooter = makePlayer({ id: 'me', position: { x: TILE * 2, y: TILE * 3 } });
    const target = makePlayer({ id: 'enemy', position: { x: TILE * 4, y: TILE * 3 } });
    const players = new Map<string, PlayerState>([
      [shooter.id, shooter],
      [target.id, target],
    ]);

    const aim = predictBulletRay('me', shooter.position, 0, players, grid);

    expect(aim.hitPlayerId).toBe('enemy');
    // Should hit the near side of the target's hitbox.
    const expectedHitX = target.position.x - PLAYER.HITBOX_WIDTH / 2;
    expect(aim.endPos.x).toBeCloseTo(expectedHitX, 5);
  });

  it('ignores dead players', () => {
    const grid = makeOpenGrid();
    const shooter = makePlayer({ id: 'me', position: { x: TILE * 2, y: TILE * 3 } });
    const target = makePlayer({
      id: 'corpse',
      position: { x: TILE * 4, y: TILE * 3 },
      isDead: true,
    });
    const players = new Map<string, PlayerState>([
      [shooter.id, shooter],
      [target.id, target],
    ]);

    const aim = predictBulletRay('me', shooter.position, 0, players, grid);
    expect(aim.hitPlayerId).toBeNull();
  });

  it('ignores invulnerable players', () => {
    const grid = makeOpenGrid();
    const shooter = makePlayer({ id: 'me', position: { x: TILE * 2, y: TILE * 3 } });
    const target = makePlayer({
      id: 'shielded',
      position: { x: TILE * 4, y: TILE * 3 },
      invulnerableTimer: 1.0,
    });
    const players = new Map<string, PlayerState>([
      [shooter.id, shooter],
      [target.id, target],
    ]);

    const aim = predictBulletRay('me', shooter.position, 0, players, grid);
    expect(aim.hitPlayerId).toBeNull();
  });
});

describe('predictGrenadePath', () => {
  it('starts at the origin and produces a polyline', () => {
    const grid = makeOpenGrid();
    const origin = { x: TILE * 3, y: TILE * 3 };

    const path = predictGrenadePath(origin, 0, grid);

    expect(path.length).toBeGreaterThan(1);
    expect(path[0].x).toBeCloseTo(origin.x, 5);
    expect(path[0].y).toBeCloseTo(origin.y, 5);
  });

  it('matches the actual grenade simulation step-for-step', () => {
    const grid = makeOpenGrid();
    const origin = { x: TILE * 3, y: TILE * 3 };
    const angle = Math.PI / 4; // 45 degrees

    const previewed = predictGrenadePath(origin, angle, grid, 0.5, 1 / 60);

    // Run an independent simulation using the same primitive.
    const sim = {
      position: { x: origin.x, y: origin.y },
      velocity: vecScale(vecFromAngle(angle), GRENADE.THROW_SPEED),
    };
    const expected: { x: number; y: number }[] = [
      { x: sim.position.x, y: sim.position.y },
    ];
    const totalSteps = Math.ceil(0.5 / (1 / 60));
    for (let i = 0; i < totalSteps; i++) {
      stepGrenade(sim, 1 / 60, grid);
      expected.push({ x: sim.position.x, y: sim.position.y });
    }

    expect(previewed.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(previewed[i].x).toBeCloseTo(expected[i].x, 6);
      expect(previewed[i].y).toBeCloseTo(expected[i].y, 6);
    }
  });

  it('reverses x velocity when bouncing off a vertical wall', () => {
    const grid = makeOpenGrid();
    // Start one tile from the right wall (column 6 starts at x = 288).
    const origin = { x: TILE * 5 + TILE / 2, y: TILE * 3 };
    // Aim straight right.
    const path = predictGrenadePath(origin, 0, grid, 1.0, 1 / 60);

    // Path should reach close to the wall, then come back.
    let maxX = -Infinity;
    let maxXIndex = 0;
    for (let i = 0; i < path.length; i++) {
      if (path[i].x > maxX) {
        maxX = path[i].x;
        maxXIndex = i;
      }
    }
    // After hitting the wall, x should decrease (bounce).
    expect(maxXIndex).toBeLessThan(path.length - 1);
    expect(path[path.length - 1].x).toBeLessThan(maxX);
  });
});

// Sanity: GUN constant is used in predictBulletRay's max-distance fallback.
describe('module wiring', () => {
  it('exports a sane GUN.FALLOFF_RANGE_MAX', () => {
    expect(GUN.FALLOFF_RANGE_MAX).toBeGreaterThan(0);
  });
  it('exports a sane TRAJECTORY.PREVIEW_SECONDS', () => {
    expect(TRAJECTORY.PREVIEW_SECONDS).toBeGreaterThan(0);
  });
});
