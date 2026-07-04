import { describe, it, expect } from 'vitest';
import {
  CHARACTERS,
  CHARACTER_IDS,
  WEAPONS,
  WEAPON_IDS,
  PICKUP,
  PLAYER,
  ABILITY,
  KILL_WEAPONS,
  GAME_MODES,
  GAME_MODE_ROTATION,
  getNextGameMode,
  gameModeDisplayName,
  characterMaxHealth,
  characterSpeedMultiplier,
  characterHitbox,
  KOTH,
  OVERTIME,
  MATCH,
  type CharacterId,
  type WeaponId,
} from './game.js';
import { GameModeType } from '../types/game.js';
import { DIRECTIONS } from '../types/character.js';
import type { WeaponDef } from '../types/weapon.js';

describe('game mode rotation', () => {
  it('rotation covers every GameModeType exactly once', () => {
    const allModes = Object.values(GameModeType).sort();
    expect([...GAME_MODE_ROTATION].sort()).toEqual(allModes);
  });

  it('getNextGameMode cycles DM → KOTH → GUN GAME → DM', () => {
    expect(getNextGameMode(GameModeType.DEATHMATCH)).toBe(GameModeType.KOTH);
    expect(getNextGameMode(GameModeType.KOTH)).toBe(GameModeType.GUN_GAME);
    expect(getNextGameMode(GameModeType.GUN_GAME)).toBe(GameModeType.DEATHMATCH);
  });

  it('restarts the cycle for unknown values instead of throwing', () => {
    expect(getNextGameMode('bogus' as GameModeType)).toBe(GAME_MODE_ROTATION[0]);
  });

  it('every mode has display copy', () => {
    for (const mode of GAME_MODE_ROTATION) {
      expect(GAME_MODES[mode].displayName.length).toBeGreaterThan(0);
      expect(gameModeDisplayName(mode)).toBe(GAME_MODES[mode].displayName);
    }
    expect(gameModeDisplayName(GameModeType.KOTH)).toBe('KING OF THE HILL');
  });
});

describe('KOTH and overtime tuning', () => {
  it('hill cadence fits the match: several relocations per match, warning inside the interval', () => {
    expect(KOTH.HILL_MOVE_WARNING).toBeLessThan(KOTH.HILL_MOVE_INTERVAL);
    expect(MATCH.TIME_LIMIT / KOTH.HILL_MOVE_INTERVAL).toBeGreaterThanOrEqual(3);
  });

  it('the score target is reachable within the match clock', () => {
    // 1 point/second of sole occupancy — the target must fit inside the
    // total match time or nobody could ever win by score.
    expect(KOTH.SCORE_TARGET).toBeLessThan(MATCH.TIME_LIMIT);
  });

  it('overtime is short and positive', () => {
    expect(OVERTIME.DURATION).toBeGreaterThan(0);
    expect(OVERTIME.DURATION).toBeLessThan(MATCH.TIME_LIMIT);
  });
});

describe('CHARACTERS registry', () => {
  it('contains at least mighty_man and bruce', () => {
    expect(Object.keys(CHARACTERS).length).toBeGreaterThanOrEqual(2);
    expect(CHARACTERS).toHaveProperty('mighty_man');
    expect(CHARACTERS).toHaveProperty('bruce');
  });

  it('every entry has the required string fields', () => {
    for (const [key, def] of Object.entries(CHARACTERS)) {
      expect(typeof def.id).toBe('string');
      expect(typeof def.displayName).toBe('string');
      expect(typeof def.spritePrefix).toBe('string');
      expect(typeof def.assetFolder).toBe('string');
      expect(typeof def.assetBaseName).toBe('string');

      expect(def.id.length).toBeGreaterThan(0);
      expect(def.displayName.length).toBeGreaterThan(0);
      expect(def.spritePrefix.length).toBeGreaterThan(0);
      expect(def.assetFolder.length).toBeGreaterThan(0);
      expect(def.assetBaseName.length).toBeGreaterThan(0);

      // The entry's id must match its key in the registry.
      expect(def.id).toBe(key);
    }
  });

  it('every entry has idleFrames and runFrames for all four directions with positive dimensions', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(def.idleFrames).toBeDefined();
      expect(def.runFrames).toBeDefined();

      for (const dir of DIRECTIONS) {
        const idle = def.idleFrames[dir];
        const run = def.runFrames[dir];

        expect(idle, `${def.id} missing idle frame for ${dir}`).toBeDefined();
        expect(run, `${def.id} missing run frame for ${dir}`).toBeDefined();

        expect(idle.w).toBeGreaterThan(0);
        expect(idle.h).toBeGreaterThan(0);
        expect(run.w).toBeGreaterThan(0);
        expect(run.h).toBeGreaterThan(0);
      }
    }
  });

  it('CHARACTER_IDS contains exactly the keys of CHARACTERS', () => {
    const keys = Object.keys(CHARACTERS) as CharacterId[];
    expect([...CHARACTER_IDS].sort()).toEqual([...keys].sort());
    expect(CHARACTER_IDS.length).toBe(keys.length);
  });

  it('every entry declares a hasGun boolean', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(typeof def.hasGun).toBe('boolean');
    }
  });

  it('CHARACTERS is frozen', () => {
    expect(Object.isFrozen(CHARACTERS)).toBe(true);
  });

  it('ships the full session-6 roster of five', () => {
    expect(CHARACTER_IDS).toEqual([
      'mighty_man',
      'bruce',
      'frost_wizard',
      'bubba',
      'jack',
    ]);
  });

  it('every entry declares positive frame counts', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(def.idleFrameCount).toBeGreaterThan(0);
      expect(def.runFrameCount).toBeGreaterThan(0);
    }
    // The pack's Zombie_Big / Zombie_Axe walk sheets are 8-frame; their
    // idles (and the whole original roster) are 6-frame.
    expect(CHARACTERS.bubba.runFrameCount).toBe(8);
    expect(CHARACTERS.jack.runFrameCount).toBe(8);
    expect(CHARACTERS.bubba.idleFrameCount).toBe(6);
    expect(CHARACTERS.mighty_man.runFrameCount).toBe(6);
  });

  it('every entry has a coherent stat identity', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(def.maxHealth).toBeGreaterThan(0);
      expect(def.speedMultiplier).toBeGreaterThan(0);
      expect(def.hitbox.width).toBeGreaterThan(0);
      expect(def.hitbox.height).toBeGreaterThan(0);
    }
  });

  it('stat identities match the roadmap table', () => {
    expect(CHARACTERS.mighty_man.maxHealth).toBe(100);
    expect(CHARACTERS.mighty_man.speedMultiplier).toBe(1.0);
    expect(CHARACTERS.bruce.maxHealth).toBe(115);
    expect(CHARACTERS.bruce.speedMultiplier).toBe(0.95);
    expect(CHARACTERS.frost_wizard.maxHealth).toBe(85);
    expect(CHARACTERS.frost_wizard.speedMultiplier).toBe(1.08);
    expect(CHARACTERS.bubba.maxHealth).toBe(150);
    expect(CHARACTERS.bubba.speedMultiplier).toBe(0.85);
    expect(CHARACTERS.bubba.hitbox).toEqual({ width: 30, height: 30 });
    expect(CHARACTERS.jack.maxHealth).toBe(100);
    expect(CHARACTERS.jack.speedMultiplier).toBe(1.0);
    expect(CHARACTERS.jack.hitbox).toEqual({ width: 24, height: 24 });
  });
});

describe('character stat accessors', () => {
  it('return the registry values for known ids', () => {
    expect(characterMaxHealth('bubba')).toBe(150);
    expect(characterSpeedMultiplier('bubba')).toBe(0.85);
    expect(characterHitbox('bubba')).toEqual({ width: 30, height: 30 });
  });

  it('fall back to PLAYER baselines for null (pre-select)', () => {
    expect(characterMaxHealth(null)).toBe(PLAYER.MAX_HEALTH);
    expect(characterSpeedMultiplier(null)).toBe(1);
    expect(characterHitbox(null)).toEqual({
      width: PLAYER.HITBOX_WIDTH,
      height: PLAYER.HITBOX_HEIGHT,
    });
  });
});

describe('session-6 ability tuning', () => {
  it('Iron Hide reduces damage by half for a short window inside its cooldown', () => {
    expect(ABILITY.BUBBA_IRON_HIDE.DAMAGE_REDUCTION).toBe(0.5);
    expect(ABILITY.BUBBA_IRON_HIDE.DURATION).toBeLessThan(
      ABILITY.BUBBA_IRON_HIDE.COOLDOWN,
    );
  });

  it('Axe Throw flight tuning is coherent', () => {
    expect(ABILITY.JACK_AXE_THROW.DAMAGE).toBe(60);
    expect(ABILITY.JACK_AXE_THROW.RANGE_TILES).toBe(6);
    expect(ABILITY.JACK_AXE_THROW.SPEED).toBeGreaterThan(0);
    expect(ABILITY.JACK_AXE_THROW.COOLDOWN).toBeGreaterThan(0);
  });

  it("KILL_WEAPONS includes the axe so Jack's kills attribute cleanly", () => {
    expect(KILL_WEAPONS).toContain('axe');
  });
});

describe('WEAPONS registry', () => {
  it('contains the rifle and the shotgun', () => {
    expect(WEAPONS).toHaveProperty('rifle');
    expect(WEAPONS).toHaveProperty('shotgun');
  });

  it('WEAPON_IDS contains exactly the keys of WEAPONS', () => {
    const keys = Object.keys(WEAPONS) as WeaponId[];
    expect([...WEAPON_IDS].sort()).toEqual([...keys].sort());
  });

  it('every entry has coherent tuning values', () => {
    for (const [key, def] of Object.entries(WEAPONS) as [string, WeaponDef][]) {
      // The punch is ammo-less flat-damage melee: mag/reload are 0 and
      // its falloff range collapses to a point (min == max == reach).
      const isMelee = def.maxRange !== undefined;
      expect(def.id).toBe(key);
      expect(def.displayName.length).toBeGreaterThan(0);
      expect(def.damageMin).toBeGreaterThan(0);
      expect(def.damageMax).toBeGreaterThanOrEqual(def.damageMin);
      expect(def.falloffRangeMin).toBeGreaterThan(0);
      if (isMelee) {
        expect(def.falloffRangeMax).toBeGreaterThanOrEqual(def.falloffRangeMin);
        expect(def.magazineSize).toBe(0);
        expect(def.reloadTime).toBe(0);
      } else {
        expect(def.falloffRangeMax).toBeGreaterThan(def.falloffRangeMin);
        expect(def.magazineSize).toBeGreaterThan(0);
        expect(def.reloadTime).toBeGreaterThan(0);
      }
      expect(def.burstSize).toBeGreaterThanOrEqual(1);
      expect(def.burstInterval).toBeGreaterThanOrEqual(0);
      expect(def.pelletCount).toBeGreaterThanOrEqual(1);
      expect(def.spreadAngle).toBeGreaterThanOrEqual(0);
      expect(def.fireCooldown).toBeGreaterThanOrEqual(0);
      expect(def.pickupAmmo).toBeGreaterThanOrEqual(0);
    }
  });

  it('melee reach never exceeds where its damage falloff ends', () => {
    for (const def of Object.values(WEAPONS) as WeaponDef[]) {
      if (def.maxRange !== undefined) {
        expect(def.maxRange).toBeLessThanOrEqual(def.falloffRangeMax);
        expect(def.maxRange).toBeGreaterThan(0);
      }
    }
  });

  it('rifle keeps the pre-weapon-system tuning (regression)', () => {
    const r = WEAPONS.rifle;
    expect(r.damageMin).toBe(8);
    expect(r.damageMax).toBe(25);
    expect(r.falloffRangeMin).toBe(64);
    expect(r.falloffRangeMax).toBe(400);
    expect(r.burstSize).toBe(3);
    expect(r.burstInterval).toBeCloseTo(0.15, 10);
    expect(r.magazineSize).toBe(30);
    expect(r.reloadTime).toBeCloseTo(2.0, 10);
    expect(r.pelletCount).toBe(1);
    expect(r.spreadAngle).toBe(0);
    expect(r.fireCooldown).toBe(0);
  });

  it('a shotgun weapon pickup fills the magazine plus a non-negative reserve', () => {
    const s = WEAPONS.shotgun;
    expect(s.pickupAmmo).toBeGreaterThanOrEqual(s.magazineSize);
  });

  it('weapon announce lead fits inside the weapon respawn cycle', () => {
    expect(PICKUP.WEAPON_ANNOUNCE_LEAD).toBeLessThan(PICKUP.WEAPON_RESPAWN_TIME);
  });

  it('WEAPONS and every entry are frozen', () => {
    expect(Object.isFrozen(WEAPONS)).toBe(true);
    for (const def of Object.values(WEAPONS)) {
      expect(Object.isFrozen(def)).toBe(true);
    }
  });
});
