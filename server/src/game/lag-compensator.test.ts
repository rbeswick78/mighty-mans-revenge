import { describe, it, expect } from 'vitest';
import { LagCompensator } from './lag-compensator.js';
import { CombatManager } from './combat-manager.js';
import {
  type PlayerState,
  type CollisionGrid,
  type PlayerId,
  PLAYER,
  WEAPONS,
  GRENADE,
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
      solid[row][col] = row === 0 || row === height - 1 || col === 0 || col === width - 1;
    }
  }
  return { width, height, tileSize, solid };
}

describe('LagCompensator — per-character hitbox through the rewind', () => {
  /**
   * The scenario the roadmap demands a test for: the shot must validate
   * against the victim's REWOUND position using their per-character
   * hit-validation dims. Setup: the victim has since moved far away, but
   * a snapshot from ~rtt/2 ago has them on a line the shot grazes 14px
   * off-center — inside Bubba's 30px box (half 15), outside a 24px one
   * (half 12). If the rewind or the per-character dims were dropped, the
   * hit flips.
   */
  function fireGrazeThroughRewind(victimCharacter: 'bubba' | 'jack'): boolean {
    const combat = new CombatManager();
    const lagComp = new LagCompensator(combat);
    const grid = createOpenGrid();

    const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
    const victim = createPlayer({
      id: 'victim',
      characterId: victimCharacter,
      // Rewound position: on the graze line.
      position: { x: 250, y: 114 },
    });
    const players = new Map<PlayerId, PlayerState>([
      ['shooter', shooter],
      ['victim', victim],
    ]);

    // Snapshot the graze-line position ~100ms in the past.
    lagComp.saveCurrentState(1, Date.now() - 100, players);

    // The victim has since moved far off the firing line — a hit can only
    // come from the rewound snapshot.
    victim.position = { x: 250, y: 400 };

    // RTT 200ms → render time = now - 100ms → the snapshot above.
    const result = lagComp.processShootWithRewind(
      'shooter',
      0,
      players,
      grid,
      200,
    );
    return result.hit;
  }

  it("a rewound graze hits Bubba's 30px box", () => {
    expect(fireGrazeThroughRewind('bubba')).toBe(true);
  });

  it('the same rewound graze misses a 24px character', () => {
    expect(fireGrazeThroughRewind('jack')).toBe(false);
  });

  it('control: without rewind data the shot misses (victim moved away)', () => {
    const combat = new CombatManager();
    const lagComp = new LagCompensator(combat);
    const shooter = createPlayer({ id: 'shooter', position: { x: 100, y: 100 } });
    const victim = createPlayer({
      id: 'victim',
      characterId: 'bubba',
      position: { x: 250, y: 400 },
    });
    const players = new Map<PlayerId, PlayerState>([
      ['shooter', shooter],
      ['victim', victim],
    ]);

    const result = lagComp.processShootWithRewind(
      'shooter',
      0,
      players,
      createOpenGrid(),
      200,
    );
    expect(result.hit).toBe(false);
  });
});
