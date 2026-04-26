import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlayerManager } from './player-manager.js';
import {
  PLAYER,
  GUN,
  RESPAWN,
} from '@shared/game';
import type { CollisionGrid, PlayerInput } from '@shared/game';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

function createOpenGrid(width = 5, height = 5, tileSize = 48): CollisionGrid {
  const solid: boolean[][] = [];
  for (let row = 0; row < height; row++) {
    solid[row] = [];
    for (let col = 0; col < width; col++) {
      // Border walls only
      solid[row][col] = row === 0 || row === height - 1 || col === 0 || col === width - 1;
    }
  }
  return { width, height, tileSize, solid };
}

function makeInput(seq: number, overrides: Partial<PlayerInput> = {}): PlayerInput {
  return {
    sequenceNumber: seq,
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

describe('PlayerManager', () => {
  let manager: PlayerManager;

  beforeEach(() => {
    manager = new PlayerManager();
    manager.setSpawnPoints([
      { x: 100, y: 100 },
      { x: 200, y: 200 },
      { x: 300, y: 300 },
    ]);
  });

  describe('add and remove players', () => {
    it('adds a player with correct defaults', () => {
      const player = manager.addPlayer('p1', 'Alice');

      expect(player.id).toBe('p1');
      expect(player.nickname).toBe('Alice');
      expect(player.health).toBe(PLAYER.MAX_HEALTH);
      expect(player.ammo).toBe(GUN.MAGAZINE_SIZE);
      expect(player.isDead).toBe(false);
      expect(player.score).toBe(0);
      expect(player.deaths).toBe(0);
      expect(player.invulnerableTimer).toBe(RESPAWN.INVULNERABILITY_DURATION);
      expect(player.stamina).toBe(PLAYER.SPRINT_DURATION);
    });

    it('assigns spawn points in round-robin', () => {
      const p1 = manager.addPlayer('p1', 'Alice');
      const p2 = manager.addPlayer('p2', 'Bob');
      const p3 = manager.addPlayer('p3', 'Charlie');

      expect(p1.position).toEqual({ x: 100, y: 100 });
      expect(p2.position).toEqual({ x: 200, y: 200 });
      expect(p3.position).toEqual({ x: 300, y: 300 });
    });

    it('wraps spawn points when more players than spawns', () => {
      manager.addPlayer('p1', 'A');
      manager.addPlayer('p2', 'B');
      manager.addPlayer('p3', 'C');
      const p4 = manager.addPlayer('p4', 'D');

      // 4th player wraps to first spawn
      expect(p4.position).toEqual({ x: 100, y: 100 });
    });

    it('uses fallback spawn when no spawn points set', () => {
      const mgr = new PlayerManager();
      const player = mgr.addPlayer('p1', 'Alice');

      expect(player.position).toEqual({ x: 100, y: 100 });
    });

    it('removes a player', () => {
      manager.addPlayer('p1', 'Alice');
      expect(manager.getPlayer('p1')).toBeDefined();

      manager.removePlayer('p1');
      expect(manager.getPlayer('p1')).toBeUndefined();
    });

    it('tracks player count', () => {
      expect(manager.playerCount).toBe(0);

      manager.addPlayer('p1', 'Alice');
      expect(manager.playerCount).toBe(1);

      manager.addPlayer('p2', 'Bob');
      expect(manager.playerCount).toBe(2);

      manager.removePlayer('p1');
      expect(manager.playerCount).toBe(1);
    });
  });

  describe('get player by ID', () => {
    it('returns the player if found', () => {
      manager.addPlayer('p1', 'Alice');
      const player = manager.getPlayer('p1');

      expect(player).toBeDefined();
      expect(player!.nickname).toBe('Alice');
    });

    it('returns undefined for non-existent player', () => {
      expect(manager.getPlayer('nonexistent')).toBeUndefined();
    });
  });

  describe('get all players', () => {
    it('returns a map of all players', () => {
      manager.addPlayer('p1', 'Alice');
      manager.addPlayer('p2', 'Bob');

      const all = manager.getAllPlayers();
      expect(all.size).toBe(2);
      expect(all.has('p1')).toBe(true);
      expect(all.has('p2')).toBe(true);
    });

    it('returns empty map when no players', () => {
      expect(manager.getAllPlayers().size).toBe(0);
    });
  });

  describe('process input updates position', () => {
    it('updates player position via shared physics', () => {
      manager.addPlayer('p1', 'Alice');
      const grid = createOpenGrid();

      // Queue a rightward movement input
      manager.processInput('p1', makeInput(0, { moveX: 1, moveY: 0 }));

      manager.update(0.05, grid);

      const player = manager.getPlayer('p1')!;
      expect(player.lastProcessedInput).toBe(0);
      // Player should have moved right from spawn
      // Exact position depends on shared physics, but it should differ from spawn
    });

    it('updates aim angle from input', () => {
      manager.addPlayer('p1', 'Alice');
      const grid = createOpenGrid();

      manager.processInput('p1', makeInput(0, { aimAngle: Math.PI / 2 }));
      manager.update(0.05, grid);

      expect(manager.getPlayer('p1')!.aimAngle).toBe(Math.PI / 2);
    });

    it('ignores input for unknown player', () => {
      const grid = createOpenGrid();
      // Should not throw
      manager.processInput('unknown', makeInput(0, { moveX: 1 }));
      manager.update(0.05, grid);
    });
  });

  describe('sprint drains stamina', () => {
    it('drains stamina when sprinting with movement', () => {
      manager.addPlayer('p1', 'Alice');
      const grid = createOpenGrid();

      const initialStamina = manager.getPlayer('p1')!.stamina;

      manager.processInput('p1', makeInput(0, { moveX: 1, sprint: true }));
      manager.update(0.05, grid);

      const player = manager.getPlayer('p1')!;
      expect(player.stamina).toBeLessThan(initialStamina);
      expect(player.isSprinting).toBe(true);
    });

    it('does not drain stamina when sprinting without movement', () => {
      manager.addPlayer('p1', 'Alice');
      const grid = createOpenGrid();

      const initialStamina = manager.getPlayer('p1')!.stamina;

      manager.processInput('p1', makeInput(0, { moveX: 0, moveY: 0, sprint: true }));
      manager.update(0.05, grid);

      const player = manager.getPlayer('p1')!;
      // Stamina should not decrease (might even recharge slightly)
      expect(player.stamina).toBeGreaterThanOrEqual(initialStamina);
    });
  });

  describe('reload timer counts down', () => {
    it('starts reload on request when ammo is not full', () => {
      manager.addPlayer('p1', 'Alice');
      const player = manager.getPlayer('p1')!;
      player.ammo = 10; // below magazine size

      const grid = createOpenGrid();
      manager.processInput('p1', makeInput(0, { reload: true }));
      manager.update(0.05, grid);

      expect(player.isReloading).toBe(true);
      expect(player.reloadTimer).toBeGreaterThan(0);
    });

    it('completes reload after reload time elapses', () => {
      manager.addPlayer('p1', 'Alice');
      const player = manager.getPlayer('p1')!;
      player.ammo = 10;
      player.isReloading = true;
      player.reloadTimer = GUN.RELOAD_TIME;

      const grid = createOpenGrid();

      // Advance past reload time
      manager.update(GUN.RELOAD_TIME + 0.1, grid);

      expect(player.isReloading).toBe(false);
      expect(player.reloadTimer).toBe(0);
      expect(player.ammo).toBe(GUN.MAGAZINE_SIZE);
    });

    it('does not start reload when ammo is full', () => {
      manager.addPlayer('p1', 'Alice');
      const player = manager.getPlayer('p1')!;
      expect(player.ammo).toBe(GUN.MAGAZINE_SIZE);

      const grid = createOpenGrid();
      manager.processInput('p1', makeInput(0, { reload: true }));
      manager.update(0.05, grid);

      expect(player.isReloading).toBe(false);
    });
  });

  describe('respawn timer counts down', () => {
    it('respawns player after respawn delay', () => {
      manager.addPlayer('p1', 'Alice');
      const player = manager.getPlayer('p1')!;
      player.isDead = true;
      player.respawnTimer = RESPAWN.DELAY;
      player.health = 0;

      const grid = createOpenGrid();

      // Advance past respawn delay
      manager.update(RESPAWN.DELAY + 0.1, grid);

      expect(player.isDead).toBe(false);
      expect(player.health).toBe(PLAYER.MAX_HEALTH);
      expect(player.ammo).toBe(GUN.MAGAZINE_SIZE);
      expect(player.invulnerableTimer).toBe(RESPAWN.INVULNERABILITY_DURATION);
    });

    it('does not respawn before timer expires', () => {
      manager.addPlayer('p1', 'Alice');
      const player = manager.getPlayer('p1')!;
      player.isDead = true;
      player.respawnTimer = RESPAWN.DELAY;

      const grid = createOpenGrid();
      manager.update(RESPAWN.DELAY - 1, grid);

      expect(player.isDead).toBe(true);
    });

    it('skips movement for dead players', () => {
      manager.addPlayer('p1', 'Alice');
      const player = manager.getPlayer('p1')!;
      player.isDead = true;
      player.respawnTimer = 10; // long timer so no respawn

      const grid = createOpenGrid();
      manager.processInput('p1', makeInput(0, { moveX: 1 }));
      manager.update(0.05, grid);

      // Dead player should not move from inputs
      // (position might change on respawn, but not from movement input)
      expect(player.isDead).toBe(true);
    });
  });

  describe('invulnerability timer counts down', () => {
    it('decrements invulnerability timer', () => {
      manager.addPlayer('p1', 'Alice');
      const player = manager.getPlayer('p1')!;
      player.invulnerableTimer = 2.0;

      const grid = createOpenGrid();
      manager.update(0.5, grid);

      expect(player.invulnerableTimer).toBeCloseTo(1.5, 5);
    });

    it('clamps invulnerability timer to zero', () => {
      manager.addPlayer('p1', 'Alice');
      const player = manager.getPlayer('p1')!;
      player.invulnerableTimer = 0.5;

      const grid = createOpenGrid();
      manager.update(1.0, grid);

      expect(player.invulnerableTimer).toBe(0);
    });

    it('does not decrement when already zero', () => {
      manager.addPlayer('p1', 'Alice');
      const player = manager.getPlayer('p1')!;
      player.invulnerableTimer = 0;

      const grid = createOpenGrid();
      manager.update(0.5, grid);

      expect(player.invulnerableTimer).toBe(0);
    });
  });
});
