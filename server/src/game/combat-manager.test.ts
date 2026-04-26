import { describe, it, expect, beforeEach } from 'vitest';
import { CombatManager } from './combat-manager.js';
import {
  type PlayerState,
  type CollisionGrid,
  type PlayerId,
  PLAYER,
  GUN,
  GRENADE,
  RESPAWN,
} from '@shared/game';

function createPlayer(overrides: Partial<PlayerState> & { id: PlayerId }): PlayerState {
  return {
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: PLAYER.MAX_HEALTH,
    maxHealth: PLAYER.MAX_HEALTH,
    ammo: GUN.MAGAZINE_SIZE,
    isReloading: false,
    reloadTimer: 0,
    isSprinting: false,
    stamina: PLAYER.SPRINT_DURATION,
    isDead: false,
    respawnTimer: 0,
    invulnerableTimer: 0,
    lastProcessedInput: 0,
    score: 0,
    deaths: 0,
    nickname: 'test',
    ...overrides,
  };
}

function createOpenGrid(width = 20, height = 20, tileSize = 48): CollisionGrid {
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

function createGridWithWall(
  wallTileX: number,
  wallTileY: number,
  width = 20,
  height = 20,
  tileSize = 48,
): CollisionGrid {
  const grid = createOpenGrid(width, height, tileSize);
  grid.solid[wallTileY][wallTileX] = true;
  return grid;
}

describe('CombatManager', () => {
  let combat: CombatManager;

  beforeEach(() => {
    combat = new CombatManager();
  });

  describe('processShot — hitscan', () => {
    it('hits a player in direct line of sight', () => {
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
      const target = createPlayer({ id: 'target', position: { x: 200, y: 100 } });
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['target', target],
      ]);
      const grid = createOpenGrid();

      // Aim right (angle 0)
      const result = combat.processShot('shooter', 0, players, grid);

      expect(result.hit).toBe(true);
      expect(result.victimId).toBe('target');
      expect(result.damage).toBeGreaterThan(0);
      expect(result.trail.startPos.x).toBe(100);
      expect(result.trail.startPos.y).toBe(100);
    });

    it('misses when no player is in the line of fire', () => {
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
      const target = createPlayer({ id: 'target', position: { x: 100, y: 300 } });
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['target', target],
      ]);
      const grid = createOpenGrid();

      // Aim right — target is below, not right
      const result = combat.processShot('shooter', 0, players, grid);

      expect(result.hit).toBe(false);
      expect(result.victimId).toBeUndefined();
    });

    it('stops at walls — cannot hit through walls', () => {
      // Wall at tile (4, 2), which covers pixels 192-240 in x at row 2 (96-144 in y)
      // Shooter at (100, 120), target at (300, 120)
      // Wall tile at x=4 covers 192-240
      const grid = createGridWithWall(4, 2);
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 120 } });
      const target = createPlayer({ id: 'target', position: { x: 300, y: 120 } });
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['target', target],
      ]);

      const result = combat.processShot('shooter', 0, players, grid);

      expect(result.hit).toBe(false);
    });

    it('does not hit dead players', () => {
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
      const target = createPlayer({ id: 'target', position: { x: 200, y: 100 }, isDead: true });
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['target', target],
      ]);
      const grid = createOpenGrid();

      const result = combat.processShot('shooter', 0, players, grid);

      expect(result.hit).toBe(false);
    });

    it('does not hit invulnerable players', () => {
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
      const target = createPlayer({
        id: 'target',
        position: { x: 200, y: 100 },
        invulnerableTimer: 1.5,
      });
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['target', target],
      ]);
      const grid = createOpenGrid();

      const result = combat.processShot('shooter', 0, players, grid);

      expect(result.hit).toBe(false);
    });

    it('hits the closest player when multiple are in ray path', () => {
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
      const near = createPlayer({ id: 'near', position: { x: 200, y: 100 } });
      const far = createPlayer({ id: 'far', position: { x: 400, y: 100 } });
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['near', near],
        ['far', far],
      ]);
      const grid = createOpenGrid();

      const result = combat.processShot('shooter', 0, players, grid);

      expect(result.hit).toBe(true);
      expect(result.victimId).toBe('near');
    });

    it('calculates correct damage at close range', () => {
      // Place target very close (within FALLOFF_RANGE_MIN)
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
      const target = createPlayer({ id: 'target', position: { x: 140, y: 100 } });
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['target', target],
      ]);
      const grid = createOpenGrid();

      const result = combat.processShot('shooter', 0, players, grid);

      expect(result.hit).toBe(true);
      expect(result.damage).toBe(GUN.DAMAGE_MAX);
    });

    it('calculates reduced damage at long range', () => {
      // Place target far away (beyond FALLOFF_RANGE_MAX)
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
      const target = createPlayer({ id: 'target', position: { x: 600, y: 100 } });
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['target', target],
      ]);
      const grid = createOpenGrid();

      const result = combat.processShot('shooter', 0, players, grid);

      expect(result.hit).toBe(true);
      expect(result.damage).toBe(GUN.DAMAGE_MIN);
    });

    it('does not hit the shooter themselves', () => {
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
      const players = new Map<PlayerId, PlayerState>([['shooter', shooter]]);
      const grid = createOpenGrid();

      const result = combat.processShot('shooter', 0, players, grid);

      expect(result.hit).toBe(false);
    });
  });

  describe('grenade system', () => {
    it('spawns a grenade with correct velocity and safety fuse', () => {
      const grenade = combat.spawnGrenade('player1', { x: 100, y: 100 }, 0);

      expect(grenade.throwerId).toBe('player1');
      expect(grenade.safetyFuseTimer).toBe(GRENADE.SAFETY_FUSE);
      expect(grenade.velocity.x).toBeCloseTo(GRENADE.THROW_SPEED);
      expect(grenade.velocity.y).toBeCloseTo(0);
      expect(grenade.position).toEqual({ x: 100, y: 100 });
    });

    it('spawns a grenade at 45 degrees with correct velocity components', () => {
      const angle = Math.PI / 4;
      const grenade = combat.spawnGrenade('player1', { x: 100, y: 100 }, angle);

      const expected = GRENADE.THROW_SPEED * Math.cos(angle);
      expect(grenade.velocity.x).toBeCloseTo(expected);
      expect(grenade.velocity.y).toBeCloseTo(expected);
    });

    it('explodes after fuse time and damages players in radius', () => {
      const grid = createOpenGrid();
      // Spawn a stationary grenade at (200, 200)
      combat.spawnGrenade('attacker', { x: 200, y: 200 }, 0);
      const grenades = combat.getGrenades();
      grenades[0].velocity = { x: 0, y: 0 }; // keep it stationary

      // Place a player near the grenade (within blast radius)
      const victim = createPlayer({ id: 'victim', position: { x: 210, y: 200 } });
      const players = new Map<PlayerId, PlayerState>([['victim', victim]]);

      // Set fuse to nearly expired
      grenades[0].safetyFuseTimer = 0.01;

      const result = combat.updateGrenades(0.02, players, grid);

      expect(result.explosions.length).toBe(1);
      expect(result.explosions[0].damages.length).toBe(1);
      expect(result.explosions[0].damages[0].playerId).toBe('victim');
      expect(result.explosions[0].damages[0].damage).toBeGreaterThan(0);
    });

    it('does not damage players behind walls', () => {
      // Create a wall between grenade and player
      const grid = createGridWithWall(5, 4);
      // Grenade at (200, 200), wall at tile (5,4) = pixels 240-288 in x, 192-240 in y
      // Player on other side of wall at (300, 200)

      // Spawn grenade that won't move much (aim up, will explode near origin)
      combat.spawnGrenade('attacker', { x: 200, y: 200 }, Math.PI / 2);
      // Override position for controlled test
      const grenades = combat.getGrenades();
      grenades[0].velocity = { x: 0, y: 0 }; // don't move
      grenades[0].position = { x: 200, y: 200 };

      const victim = createPlayer({ id: 'victim', position: { x: 320, y: 200 } });
      const players = new Map<PlayerId, PlayerState>([['victim', victim]]);

      // Set fuse to about to expire
      grenades[0].safetyFuseTimer = 0.01;

      const result = combat.updateGrenades(0.02, players, grid);

      expect(result.explosions.length).toBe(1);
      // Victim should not be damaged because wall blocks line of sight
      expect(result.explosions[0].damages.length).toBe(0);
    });

    it('does not damage dead players', () => {
      const grid = createOpenGrid();
      combat.spawnGrenade('attacker', { x: 200, y: 200 }, 0);
      const grenades = combat.getGrenades();
      grenades[0].velocity = { x: 0, y: 0 };
      grenades[0].safetyFuseTimer = 0.01;

      const victim = createPlayer({ id: 'victim', position: { x: 210, y: 200 }, isDead: true });
      const players = new Map<PlayerId, PlayerState>([['victim', victim]]);

      const result = combat.updateGrenades(0.02, players, grid);

      expect(result.explosions.length).toBe(1);
      expect(result.explosions[0].damages.length).toBe(0);
    });

    it('returns the active grenade for a thrower', () => {
      expect(combat.getActiveGrenadeFor('p1')).toBeUndefined();
      const g = combat.spawnGrenade('p1', { x: 100, y: 100 }, 0);
      expect(combat.getActiveGrenadeFor('p1')?.id).toBe(g.id);
      expect(combat.getActiveGrenadeFor('p2')).toBeUndefined();
    });

    it('detonateGrenade explodes the named grenade and removes it', () => {
      const grid = createOpenGrid();
      const g = combat.spawnGrenade('attacker', { x: 200, y: 200 }, 0);
      const grenades = combat.getGrenades();
      grenades[0].velocity = { x: 0, y: 0 };

      const victim = createPlayer({ id: 'victim', position: { x: 210, y: 200 } });
      const players = new Map<PlayerId, PlayerState>([['victim', victim]]);

      const explosion = combat.detonateGrenade(g.id, players, grid);

      expect(explosion).not.toBeNull();
      expect(explosion!.damages.length).toBe(1);
      expect(explosion!.damages[0].playerId).toBe('victim');
      expect(combat.getActiveGrenadeFor('attacker')).toBeUndefined();
      expect(combat.getGrenades().length).toBe(0);
    });

    it('detonateGrenade returns null for an unknown id', () => {
      const grid = createOpenGrid();
      const result = combat.detonateGrenade('nonexistent', new Map(), grid);
      expect(result).toBeNull();
    });

    it('bounces off walls', () => {
      // Create a wall at tile (5, 2) — covers x: 240-288
      const grid = createGridWithWall(5, 2);

      // Place grenade just to the left of the wall, moving right
      // Grenade at x=230 (tile 4), wall at tile 5 starts at x=240
      // With THROW_SPEED=300 and dt=0.05, it moves 15px to x=245, entering tile 5
      combat.spawnGrenade('player1', { x: 230, y: 120 }, 0);
      const grenades = combat.getGrenades();

      // Verify initial velocity is rightward
      expect(grenades[0].velocity.x).toBeGreaterThan(0);

      // Small time step so grenade enters the wall tile but doesn't skip it
      combat.updateGrenades(0.05, new Map(), grid);

      // After bouncing, x velocity should be reversed
      expect(grenades[0].velocity.x).toBeLessThan(0);
    });
  });

  describe('applyDamage', () => {
    it('reduces health by damage amount', () => {
      const victim = createPlayer({ id: 'victim', health: 100 });
      combat.applyDamage(victim, 30, 'attacker');

      expect(victim.health).toBe(70);
    });

    it('clamps health to 0', () => {
      const victim = createPlayer({ id: 'victim', health: 20 });
      combat.applyDamage(victim, 50, 'attacker');

      expect(victim.health).toBe(0);
    });

    it('marks player as dead when health reaches 0', () => {
      const victim = createPlayer({ id: 'victim', health: 20 });
      const result = combat.applyDamage(victim, 20, 'attacker');

      expect(victim.isDead).toBe(true);
      expect(victim.respawnTimer).toBe(RESPAWN.DELAY);
      expect(result.killed).toBe(true);
    });

    it('increments death count on kill', () => {
      const victim = createPlayer({ id: 'victim', health: 10, deaths: 2 });
      combat.applyDamage(victim, 10, 'attacker');

      expect(victim.deaths).toBe(3);
    });

    it('returns kill feed entry on kill', () => {
      const victim = createPlayer({ id: 'victim', health: 10 });
      const result = combat.applyDamage(victim, 10, 'attacker');

      expect(result.entry).toBeDefined();
      expect(result.entry!.killerId).toBe('attacker');
      expect(result.entry!.victimId).toBe('victim');
    });

    it('does not kill when damage does not deplete health', () => {
      const victim = createPlayer({ id: 'victim', health: 100 });
      const result = combat.applyDamage(victim, 30, 'attacker');

      expect(result.killed).toBe(false);
      expect(result.entry).toBeUndefined();
      expect(victim.isDead).toBe(false);
    });
  });
});
