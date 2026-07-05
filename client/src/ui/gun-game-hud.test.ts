import { describe, expect, it } from 'vitest';
import { gunGameRungForScore, gunGameTotalKills } from '@shared/utils/gun-game.js';
import { gunGameLadderLabel, rifleAmmoRowVisible } from './gun-game-hud.js';

describe('gunGameLadderLabel', () => {
  it('formats the first rung at zero kills', () => {
    expect(gunGameLadderLabel(gunGameRungForScore(0))).toBe('RIFLE 0/2 - LVL 1/5');
  });

  it('formats mid-ladder rungs with per-rung progress', () => {
    expect(gunGameLadderLabel(gunGameRungForScore(3))).toBe('SHOTGUN 1/2 - LVL 2/5');
    expect(gunGameLadderLabel(gunGameRungForScore(4))).toBe('PISTOL 0/2 - LVL 3/5');
  });

  it('names the grenade rung (it has no WeaponDef entry)', () => {
    expect(gunGameLadderLabel(gunGameRungForScore(6))).toBe('GRENADES 0/2 - LVL 4/5');
  });

  it('formats the punch finisher and clamps past the win score', () => {
    expect(gunGameLadderLabel(gunGameRungForScore(8))).toBe('FISTS 0/1 - LVL 5/5');
    expect(gunGameLadderLabel(gunGameRungForScore(gunGameTotalKills()))).toBe(
      'FISTS 1/1 - LVL 5/5',
    );
  });
});

describe('rifleAmmoRowVisible', () => {
  it('shows for every gun outside Gun Game', () => {
    expect(rifleAmmoRowVisible('rifle', null)).toBe(true);
    expect(rifleAmmoRowVisible('shotgun', null)).toBe(true);
    expect(rifleAmmoRowVisible('pistol', null)).toBe(true);
  });

  it('hides while fists are equipped, in and out of Gun Game', () => {
    expect(rifleAmmoRowVisible('punch', null)).toBe(false);
    expect(rifleAmmoRowVisible('punch', gunGameRungForScore(8))).toBe(false);
  });

  it('hides on the Gun Game grenade rung even though weaponId stays rifle', () => {
    expect(rifleAmmoRowVisible('rifle', gunGameRungForScore(6))).toBe(false);
  });

  it('shows on the Gun Game gun rungs', () => {
    expect(rifleAmmoRowVisible('rifle', gunGameRungForScore(0))).toBe(true);
    expect(rifleAmmoRowVisible('shotgun', gunGameRungForScore(2))).toBe(true);
    expect(rifleAmmoRowVisible('pistol', gunGameRungForScore(5))).toBe(true);
  });
});
