import { describe, it, expect } from 'vitest';
import {
  gunGameRungForScore,
  gunGameTotalKills,
  rungWeaponToKillWeapon,
} from './gun-game.js';
import { GUN_GAME, KILL_WEAPONS, WEAPONS } from '../config/game.js';

describe('GUN_GAME config invariants', () => {
  it('RUNG_KILLS matches the ladder length', () => {
    expect(GUN_GAME.RUNG_KILLS).toHaveLength(GUN_GAME.LADDER.length);
  });

  it('every rung requires at least one kill', () => {
    for (const kills of GUN_GAME.RUNG_KILLS) {
      expect(kills).toBeGreaterThanOrEqual(1);
    }
  });

  it('ladder is the specced rifle → shotgun → pistol → grenade → punch', () => {
    expect(GUN_GAME.LADDER).toEqual([
      'rifle',
      'shotgun',
      'pistol',
      'grenade',
      'punch',
    ]);
  });

  it('every non-grenade rung weapon is a real WEAPONS entry', () => {
    for (const weapon of GUN_GAME.LADDER) {
      if (weapon !== 'grenade') {
        expect(WEAPONS[weapon]).toBeDefined();
      }
    }
  });

  it('every rung maps to a registered KillWeapon', () => {
    for (const weapon of GUN_GAME.LADDER) {
      expect(KILL_WEAPONS).toContain(rungWeaponToKillWeapon(weapon));
    }
  });
});

describe('gunGameTotalKills', () => {
  it('sums the per-rung kill requirements (9 with the specced values)', () => {
    expect(gunGameTotalKills()).toBe(
      GUN_GAME.RUNG_KILLS.reduce((sum, k) => sum + k, 0),
    );
    expect(gunGameTotalKills()).toBe(9);
  });
});

describe('gunGameRungForScore', () => {
  it('starts on the first rung with zero progress', () => {
    expect(gunGameRungForScore(0)).toEqual({
      rungIndex: 0,
      killsIntoRung: 0,
      killsForRung: GUN_GAME.RUNG_KILLS[0],
      weapon: 'rifle',
    });
  });

  it('tracks progress within a rung', () => {
    const rung = gunGameRungForScore(1);
    expect(rung.rungIndex).toBe(0);
    expect(rung.killsIntoRung).toBe(1);
  });

  it('advances to the next rung exactly at the requirement boundary', () => {
    const rung = gunGameRungForScore(2);
    expect(rung.rungIndex).toBe(1);
    expect(rung.weapon).toBe('shotgun');
    expect(rung.killsIntoRung).toBe(0);
  });

  it('walks the whole specced ladder', () => {
    expect(gunGameRungForScore(3).weapon).toBe('shotgun');
    expect(gunGameRungForScore(4).weapon).toBe('pistol');
    expect(gunGameRungForScore(6).weapon).toBe('grenade');
    expect(gunGameRungForScore(8).weapon).toBe('punch');
  });

  it('clamps winning and past-winning scores to a completed final rung', () => {
    for (const score of [gunGameTotalKills(), gunGameTotalKills() + 3]) {
      const rung = gunGameRungForScore(score);
      expect(rung.rungIndex).toBe(GUN_GAME.LADDER.length - 1);
      expect(rung.weapon).toBe('punch');
      expect(rung.killsIntoRung).toBe(rung.killsForRung);
    }
  });

  it('treats negative and fractional scores defensively', () => {
    expect(gunGameRungForScore(-5)).toEqual(gunGameRungForScore(0));
    expect(gunGameRungForScore(1.9).killsIntoRung).toBe(1);
  });
});

describe('rungWeaponToKillWeapon', () => {
  it("maps the rifle to its legacy 'gun' wire name", () => {
    expect(rungWeaponToKillWeapon('rifle')).toBe('gun');
  });

  it('maps every other rung to itself', () => {
    expect(rungWeaponToKillWeapon('shotgun')).toBe('shotgun');
    expect(rungWeaponToKillWeapon('pistol')).toBe('pistol');
    expect(rungWeaponToKillWeapon('grenade')).toBe('grenade');
    expect(rungWeaponToKillWeapon('punch')).toBe('punch');
  });
});
