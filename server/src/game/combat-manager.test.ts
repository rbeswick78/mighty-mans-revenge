import { describe, it, expect, beforeEach } from 'vitest';
import { CombatManager } from './combat-manager.js';
import {
  type PlayerState,
  type CollisionGrid,
  type PlayerId,
  ABILITY,
  PLAYER,
  WEAPONS,
  GRENADE,
  RESPAWN,
} from '@shared/game';

function createPlayer(overrides: Partial<PlayerState> & { id: PlayerId }): PlayerState {
  return {
    characterId: 'mighty_man',
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: PLAYER.MAX_HEALTH,
    maxHealth: PLAYER.MAX_HEALTH,
    ammo: WEAPONS.rifle.magazineSize,
    isReloading: false,
    reloadTimer: 0,
    weaponId: 'rifle',
    specialAmmo: 0,
    specialReserve: 0,
    grenades: GRENADE.STARTING_COUNT,
    grenadeRegenSeconds: 0,
    isSprinting: false,
    stamina: PLAYER.SPRINT_DURATION,
    isDead: false,
    respawnTimer: 0,
    invulnerableTimer: 0,
    lastProcessedInput: 0,
    score: 0,
    deaths: 0,
    nickname: 'test',
    abilityActiveSeconds: 0,
    abilityCooldownSeconds: 0,
    abilityLockedAim: 0,
    frozenTimer: 0,
    secondWindTimer: 0,
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
      // Geometric hit detection alone is not a client confirmation. Match
      // stamps these only after damage survives lifecycle/mitigation checks.
      expect(result.trail.hitPlayerId).toBeNull();
      expect(result.trail.damageApplied).toBe(0);
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
      expect(result.trail.hitPlayerId).toBeNull();
      expect(result.trail.damageApplied).toBe(0);
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
      expect(result.hitTile).toEqual({ col: 4, row: 2 });
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
      expect(result.damage).toBe(WEAPONS.rifle.damageMax);
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
      expect(result.damage).toBe(WEAPONS.rifle.damageMin);
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

    it('leaves the death counter to Match.onKill (no double count)', () => {
      const victim = createPlayer({ id: 'victim', health: 10, deaths: 2 });
      combat.applyDamage(victim, 10, 'attacker');

      expect(victim.deaths).toBe(2);
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

  describe('applyDamage — Iron Hide (Bubba)', () => {
    it('halves damage while the active window runs and reports damageApplied', () => {
      const bubba = createPlayer({
        id: 'bubba',
        characterId: 'bubba',
        health: 150,
        maxHealth: 150,
        abilityActiveSeconds: ABILITY.BUBBA_IRON_HIDE.DURATION,
      });
      const result = combat.applyDamage(bubba, 40, 'attacker');

      expect(result.damageApplied).toBeCloseTo(20, 10);
      expect(bubba.health).toBeCloseTo(130, 10);
    });

    it('takes full damage once the window has expired', () => {
      const bubba = createPlayer({
        id: 'bubba',
        characterId: 'bubba',
        health: 150,
        maxHealth: 150,
        abilityActiveSeconds: 0,
      });
      const result = combat.applyDamage(bubba, 40, 'attacker');

      expect(result.damageApplied).toBe(40);
      expect(bubba.health).toBe(110);
    });

    it('does nothing for other characters with an active ability window', () => {
      const bruce = createPlayer({
        id: 'bruce',
        characterId: 'bruce',
        health: 115,
        maxHealth: 115,
        abilityActiveSeconds: 1, // mid fire-breath
      });
      const result = combat.applyDamage(bruce, 40, 'attacker');

      expect(result.damageApplied).toBe(40);
      expect(bruce.health).toBe(75);
    });
  });

  describe('processShot — per-character hitbox', () => {
    it("a graze that misses a 24px character hits Bubba's 30px box", () => {
      // Ray along y=100; victim center offset 14px below: outside half 12,
      // inside Bubba's half 15.
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
      const bubba = createPlayer({
        id: 'bubba',
        characterId: 'bubba',
        position: { x: 250, y: 114 },
      });
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['bubba', bubba],
      ]);
      const hit = combat.processShot('shooter', 0, players, createOpenGrid());
      expect(hit.hit).toBe(true);
      expect(hit.victimId).toBe('bubba');

      const jack = createPlayer({
        id: 'jack',
        characterId: 'jack',
        position: { x: 250, y: 114 },
      });
      const controlPlayers = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['jack', jack],
      ]);
      const miss = combat.processShot('shooter', 0, controlPlayers, createOpenGrid());
      expect(miss.hit).toBe(false);
    });

    it('big_heads scale composes on top of the character hitbox', () => {
      // Offset 21px: outside Bubba's unscaled half 15, inside 15 × 1.5.
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
      const bubba = createPlayer({
        id: 'bubba',
        characterId: 'bubba',
        position: { x: 250, y: 121 },
      });
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['bubba', bubba],
      ]);
      const grid = createOpenGrid();

      const unscaled = combat.processShot('shooter', 0, players, grid);
      expect(unscaled.hit).toBe(false);

      const scaled = combat.processShot(
        'shooter',
        0,
        players,
        grid,
        undefined,
        false,
        'rifle',
        1.5,
      );
      expect(scaled.hit).toBe(true);
    });
  });

  describe('processShot — maxRange (punch melee reach)', () => {
    /**
     * A 24px-hitbox victim whose near face sits `edgeDistance` px from the
     * shooter along the +x ray (victim center = edgeDistance + half 12).
     */
    function punchAt(edgeDistance: number): boolean {
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
      const victim = createPlayer({
        id: 'victim',
        position: { x: 100 + edgeDistance + 12, y: 100 },
      });
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['victim', victim],
      ]);
      return combat.processShot(
        'shooter',
        0,
        players,
        createOpenGrid(),
        undefined,
        false,
        'punch',
      ).hit;
    }

    it('a punch ray connects at or inside maxRange (56px)', () => {
      expect(punchAt(WEAPONS.punch.maxRange - 2)).toBe(true);
    });

    it('a punch ray cannot connect past maxRange', () => {
      // One px past melee reach. Without the maxRange cap, the ray would
      // extend to falloffRangeMax * 2 = 112px and this would hit.
      expect(punchAt(WEAPONS.punch.maxRange + 1)).toBe(false);
    });

    it('control: the rifle (no maxRange) still reaches past 56px', () => {
      const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
      const victim = createPlayer({ id: 'victim', position: { x: 100 + 57 + 12, y: 100 } });
      const players = new Map<PlayerId, PlayerState>([
        ['shooter', shooter],
        ['victim', victim],
      ]);
      const result = combat.processShot('shooter', 0, players, createOpenGrid());
      expect(result.hit).toBe(true);
    });
  });

  describe('thrown axes (Jack)', () => {
    const AXE_SPEED = ABILITY.JACK_AXE_THROW.SPEED;
    const AXE_RANGE = ABILITY.JACK_AXE_THROW.RANGE_TILES * 48;

    it('spawnAxe launches along the aim angle at the configured speed', () => {
      const axe = combat.spawnAxe('jack', { x: 100, y: 100 }, 0);
      expect(axe.velocity.x).toBeCloseTo(AXE_SPEED, 5);
      expect(axe.velocity.y).toBeCloseTo(0, 5);
      expect(axe.distanceTraveled).toBe(0);
      expect(combat.getAxes()).toHaveLength(1);
    });

    it('advances in flight and retires at max range without a hit', () => {
      combat.spawnAxe('jack', { x: 100, y: 100 }, 0);
      const players = new Map<PlayerId, PlayerState>([
        ['jack', createPlayer({ id: 'jack', position: { x: 100, y: 100 } })],
      ]);
      const grid = createOpenGrid();

      // Armed tick: the spawn tick holds position so the axe reaches at
      // least one broadcast before it can resolve.
      combat.updateAxes(0.05, players, grid);
      expect(combat.getAxes()).toHaveLength(1);
      expect(combat.getAxes()[0].position.x).toBeCloseTo(100, 5);

      combat.updateAxes(0.05, players, grid);
      expect(combat.getAxes()[0].position.x).toBeCloseTo(100 + AXE_SPEED * 0.05, 5);

      // Fly well past max range.
      const ticks = Math.ceil(AXE_RANGE / (AXE_SPEED * 0.05)) + 2;
      for (let i = 0; i < ticks; i++) {
        combat.updateAxes(0.05, players, grid);
      }
      expect(combat.getAxes()).toHaveLength(0);
    });

    it('an axe thrown point-blank at a wall still survives its spawn tick', () => {
      // Wall tile (4, 2) starts at x=192; the axe spawns 10px away flying
      // straight at it. Without the armed tick this axe would spawn and
      // retire inside one update — never reaching a broadcast, so the
      // thrower would see NOTHING (the smoke that caught this had Jack
      // fenced into a spawn nook).
      const grid = createGridWithWall(4, 2);
      combat.spawnAxe('jack', { x: 182, y: 120 }, 0);
      const players = new Map<PlayerId, PlayerState>();

      combat.updateAxes(0.05, players, grid);
      expect(combat.getAxes()).toHaveLength(1); // armed tick — broadcastable

      combat.updateAxes(0.05, players, grid);
      expect(combat.getAxes()).toHaveLength(0); // wall eats it next tick
    });

    it('damages the first player on the flight path and retires', () => {
      combat.spawnAxe('jack', { x: 100, y: 100 }, 0);
      const near = createPlayer({ id: 'near', position: { x: 200, y: 100 } });
      const far = createPlayer({ id: 'far', position: { x: 300, y: 100 } });
      const players = new Map<PlayerId, PlayerState>([
        ['jack', createPlayer({ id: 'jack', position: { x: 100, y: 100 } })],
        ['near', near],
        ['far', far],
      ]);

      let allHits: ReturnType<CombatManager['updateAxes']>['hits'] = [];
      for (let i = 0; i < 10; i++) {
        allHits = allHits.concat(
          combat.updateAxes(0.05, players, createOpenGrid()).hits,
        );
      }

      expect(allHits).toHaveLength(1);
      expect(allHits[0].victimId).toBe('near');
      expect(allHits[0].damage).toBe(ABILITY.JACK_AXE_THROW.DAMAGE);
      expect(near.health).toBe(PLAYER.MAX_HEALTH - ABILITY.JACK_AXE_THROW.DAMAGE);
      expect(far.health).toBe(PLAYER.MAX_HEALTH);
      expect(combat.getAxes()).toHaveLength(0);
    });

    it('never hits its own thrower, even point-blank', () => {
      combat.spawnAxe('jack', { x: 100, y: 100 }, 0);
      const jack = createPlayer({ id: 'jack', position: { x: 110, y: 100 } });
      const players = new Map<PlayerId, PlayerState>([['jack', jack]]);

      const { hits } = combat.updateAxes(0.05, players, createOpenGrid());
      expect(hits).toHaveLength(0);
      expect(jack.health).toBe(PLAYER.MAX_HEALTH);
    });

    it('skips dead and invulnerable players', () => {
      combat.spawnAxe('jack', { x: 100, y: 100 }, 0);
      const ghost = createPlayer({ id: 'ghost', position: { x: 200, y: 100 }, isDead: true });
      const shielded = createPlayer({
        id: 'shielded',
        position: { x: 260, y: 100 },
        invulnerableTimer: 1,
      });
      const players = new Map<PlayerId, PlayerState>([
        ['ghost', ghost],
        ['shielded', shielded],
      ]);

      let hits: ReturnType<CombatManager['updateAxes']>['hits'] = [];
      for (let i = 0; i < 15; i++) {
        hits = hits.concat(combat.updateAxes(0.05, players, createOpenGrid()).hits);
      }
      expect(hits).toHaveLength(0);
      expect(shielded.health).toBe(PLAYER.MAX_HEALTH);
    });

    it('is blocked by walls — retires against the wall, nobody behind is hit', () => {
      // Wall tile (4, 2) covers x 192-240 at y 96-144; axe flies along y=120.
      const grid = createGridWithWall(4, 2);
      combat.spawnAxe('jack', { x: 100, y: 120 }, 0);
      const behind = createPlayer({ id: 'behind', position: { x: 300, y: 120 } });
      const players = new Map<PlayerId, PlayerState>([['behind', behind]]);

      let hits: ReturnType<CombatManager['updateAxes']>['hits'] = [];
      for (let i = 0; i < 15; i++) {
        hits = hits.concat(combat.updateAxes(0.05, players, grid).hits);
      }
      expect(hits).toHaveLength(0);
      expect(behind.health).toBe(PLAYER.MAX_HEALTH);
      expect(combat.getAxes()).toHaveLength(0);
    });

    it("honors the victim's per-character hitbox and the big_heads scale", () => {
      // Graze at 14px offset: hits Bubba (half 15), misses a 24px character.
      combat.spawnAxe('jack', { x: 100, y: 100 }, 0);
      const bubba = createPlayer({
        id: 'bubba',
        characterId: 'bubba',
        position: { x: 250, y: 114 },
      });
      let players = new Map<PlayerId, PlayerState>([['bubba', bubba]]);
      let hits: ReturnType<CombatManager['updateAxes']>['hits'] = [];
      for (let i = 0; i < 10; i++) {
        hits = hits.concat(combat.updateAxes(0.05, players, createOpenGrid()).hits);
      }
      expect(hits).toHaveLength(1);

      // Same graze against a 24px character: clean miss...
      const fresh = new CombatManager();
      fresh.spawnAxe('jack', { x: 100, y: 100 }, 0);
      const normie = createPlayer({ id: 'normie', position: { x: 250, y: 114 } });
      players = new Map<PlayerId, PlayerState>([['normie', normie]]);
      hits = [];
      for (let i = 0; i < 10; i++) {
        hits = hits.concat(fresh.updateAxes(0.05, players, createOpenGrid()).hits);
      }
      expect(hits).toHaveLength(0);

      // ...until big_heads scales the box (12 × 1.5 = 18 > 14).
      const scaledCombat = new CombatManager();
      scaledCombat.spawnAxe('jack', { x: 100, y: 100 }, 0);
      normie.health = PLAYER.MAX_HEALTH;
      hits = [];
      for (let i = 0; i < 10; i++) {
        hits = hits.concat(
          scaledCombat.updateAxes(0.05, players, createOpenGrid(), 1.5).hits,
        );
      }
      expect(hits).toHaveLength(1);
    });

    it('clearAxes drops everything in flight (overtime contract)', () => {
      combat.spawnAxe('a', { x: 100, y: 100 }, 0);
      combat.spawnAxe('b', { x: 200, y: 200 }, Math.PI);
      expect(combat.getAxes()).toHaveLength(2);
      combat.clearAxes();
      expect(combat.getAxes()).toHaveLength(0);
    });
  });
});
