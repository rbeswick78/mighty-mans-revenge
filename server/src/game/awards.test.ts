import { describe, it, expect } from 'vitest';
import { AWARDS, createEmptyKillsByWeapon, MAP } from '@shared/game';
import type { PlayerId, PlayerStats } from '@shared/game';
import { computeAwards } from './awards.js';

function makeStats(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    kills: 0,
    deaths: 0,
    shotsFired: 0,
    shotsHit: 0,
    damageDealt: 0,
    damageTaken: 0,
    grenadesThrown: 0,
    killsByWeapon: createEmptyKillsByWeapon(),
    longestKillStreak: 0,
    distanceTraveled: 0,
    hillSeconds: 0,
    ...overrides,
  };
}

function kills(
  overrides: Partial<Record<'gun' | 'grenade' | 'fire' | 'shotgun' | 'pistol' | 'punch', number>>,
) {
  return { ...createEmptyKillsByWeapon(), ...overrides };
}

const nickname = (id: PlayerId): string => id.toUpperCase();

function compute(entries: Record<string, PlayerStats>) {
  return computeAwards(new Map(Object.entries(entries)), nickname);
}

describe('computeAwards', () => {
  it('returns no awards when nobody did anything', () => {
    expect(compute({ p1: makeStats(), p2: makeStats() })).toEqual([]);
  });

  it('is deterministic: same stats produce the same awards', () => {
    const build = () => ({
      p1: makeStats({ shotsFired: 20, shotsHit: 15, damageTaken: 100 }),
      p2: makeStats({ shotsFired: 30, shotsHit: 4, damageTaken: 250 }),
    });
    expect(compute(build())).toEqual(compute(build()));
  });

  describe('sharpshooter', () => {
    it('goes to the best accuracy with at least the minimum shots', () => {
      const awards = compute({
        p1: makeStats({ shotsFired: 10, shotsHit: 9 }),
        p2: makeStats({ shotsFired: 20, shotsHit: 10 }),
      });
      expect(awards[0]).toEqual({
        id: 'sharpshooter',
        playerId: 'p1',
        nickname: 'P1',
        detail: '90% ACCURACY',
      });
    });

    it('ignores players below the shot minimum even at 100% accuracy', () => {
      const awards = compute({
        p1: makeStats({ shotsFired: AWARDS.SHARPSHOOTER_MIN_SHOTS - 1, shotsHit: 9 }),
        p2: makeStats({ shotsFired: 20, shotsHit: 10 }),
      });
      expect(awards[0].playerId).toBe('p2');
    });

    it('requires at least one hit', () => {
      const awards = compute({
        p1: makeStats({ shotsFired: 15, shotsHit: 0 }),
      });
      expect(awards.find((a) => a.id === 'sharpshooter')).toBeUndefined();
    });

    it('is not handed out on an exact accuracy tie', () => {
      const awards = compute({
        p1: makeStats({ shotsFired: 10, shotsHit: 5 }),
        p2: makeStats({ shotsFired: 20, shotsHit: 10 }),
      });
      expect(awards.find((a) => a.id === 'sharpshooter')).toBeUndefined();
    });
  });

  describe('hill hog', () => {
    it('goes to the most hill seconds at or above the threshold, rounded in the detail', () => {
      const awards = compute({
        p1: makeStats({ hillSeconds: 42.4 }),
        p2: makeStats({ hillSeconds: AWARDS.HILL_HOG_MIN_SECONDS }),
      });
      const hog = awards.find((a) => a.id === 'hill_hog');
      expect(hog).toEqual({
        id: 'hill_hog',
        playerId: 'p1',
        nickname: 'P1',
        detail: '42S ON THE HILL',
      });
    });

    it('exactly the threshold qualifies; just below does not', () => {
      const at = compute({
        p1: makeStats({ hillSeconds: AWARDS.HILL_HOG_MIN_SECONDS }),
      });
      expect(at.find((a) => a.id === 'hill_hog')?.playerId).toBe('p1');

      const below = compute({
        p1: makeStats({ hillSeconds: AWARDS.HILL_HOG_MIN_SECONDS - 0.01 }),
      });
      expect(below.find((a) => a.id === 'hill_hog')).toBeUndefined();
    });

    it('is not handed out on an exact tie', () => {
      const awards = compute({
        p1: makeStats({ hillSeconds: 30 }),
        p2: makeStats({ hillSeconds: 30 }),
      });
      expect(awards.find((a) => a.id === 'hill_hog')).toBeUndefined();
    });

    it('never appears for a DM-like stats map where nobody accrued hill time', () => {
      const awards = compute({
        p1: makeStats({ kills: 5, shotsFired: 40, shotsHit: 20, damageTaken: 80 }),
        p2: makeStats({ kills: 3, shotsFired: 30, shotsHit: 10, damageTaken: 120 }),
      });
      expect(awards.find((a) => a.id === 'hill_hog')).toBeUndefined();
    });
  });

  describe('spray & pray', () => {
    it('goes to the most shots fired under the accuracy ceiling', () => {
      const awards = compute({
        p1: makeStats({ shotsFired: 40, shotsHit: 5 }),
        p2: makeStats({ shotsFired: 60, shotsHit: 30 }),
      });
      const spray = awards.find((a) => a.id === 'spray_and_pray');
      expect(spray?.playerId).toBe('p1');
      expect(spray?.detail).toBe('40 SHOTS, 13% ACCURACY');
    });

    it('excludes players at or above the accuracy ceiling', () => {
      const awards = compute({
        // Exactly 25% — the ceiling is strict.
        p1: makeStats({ shotsFired: 40, shotsHit: 10 }),
      });
      expect(awards.find((a) => a.id === 'spray_and_pray')).toBeUndefined();
    });
  });

  describe('kill-count awards', () => {
    it('demolition man needs at least one grenade kill', () => {
      const awards = compute({
        p1: makeStats({ kills: 2, killsByWeapon: kills({ grenade: 2 }) }),
        p2: makeStats(),
      });
      const demo = awards.find((a) => a.id === 'demolition_man');
      expect(demo?.playerId).toBe('p1');
      expect(demo?.detail).toBe('2 GRENADE KILLS');
    });

    it('singular kill counts read as singular', () => {
      const awards = compute({
        p1: makeStats({ kills: 1, killsByWeapon: kills({ shotgun: 1 }) }),
      });
      const buckshot = awards.find((a) => a.id === 'buckshot_barber');
      expect(buckshot?.detail).toBe('1 SHOTGUN KILL');
    });

    it('buckshot barber goes to the most shotgun kills', () => {
      const awards = compute({
        p1: makeStats({ kills: 1, killsByWeapon: kills({ shotgun: 1 }) }),
        p2: makeStats({ kills: 3, killsByWeapon: kills({ shotgun: 3 }) }),
      });
      expect(awards.find((a) => a.id === 'buckshot_barber')?.playerId).toBe('p2');
    });

    it('bare knuckles needs at least one punch kill', () => {
      const awards = compute({
        p1: makeStats({ kills: 3, killsByWeapon: kills({ punch: 3 }) }),
        p2: makeStats(),
      });
      const bare = awards.find((a) => a.id === 'bare_knuckles');
      expect(bare?.playerId).toBe('p1');
      expect(bare?.detail).toBe('3 PUNCH KILLS');
    });

    it('a single punch kill reads as singular', () => {
      const awards = compute({
        p1: makeStats({ kills: 1, killsByWeapon: kills({ punch: 1 }) }),
      });
      expect(awards.find((a) => a.id === 'bare_knuckles')?.detail).toBe('1 PUNCH KILL');
    });

    it('bare knuckles goes to the most punch kills; a tie earns nobody', () => {
      const most = compute({
        p1: makeStats({ kills: 1, killsByWeapon: kills({ punch: 1 }) }),
        p2: makeStats({ kills: 2, killsByWeapon: kills({ punch: 2 }) }),
      });
      expect(most.find((a) => a.id === 'bare_knuckles')?.playerId).toBe('p2');

      const tied = compute({
        p1: makeStats({ kills: 2, killsByWeapon: kills({ punch: 2 }) }),
        p2: makeStats({ kills: 2, killsByWeapon: kills({ punch: 2 }) }),
      });
      expect(tied.find((a) => a.id === 'bare_knuckles')).toBeUndefined();
    });
  });

  describe('untouchable', () => {
    it('requires the minimum streak', () => {
      const awards = compute({
        p1: makeStats({ longestKillStreak: AWARDS.UNTOUCHABLE_MIN_STREAK - 1 }),
      });
      expect(awards.find((a) => a.id === 'untouchable')).toBeUndefined();
    });

    it('goes to the longest streak', () => {
      const awards = compute({
        p1: makeStats({ longestKillStreak: 3 }),
        p2: makeStats({ longestKillStreak: 5 }),
      });
      const untouchable = awards.find((a) => a.id === 'untouchable');
      expect(untouchable?.playerId).toBe('p2');
      expect(untouchable?.detail).toBe('5 KILL STREAK');
    });
  });

  describe('pincushion', () => {
    it('goes to the most damage taken, rounded in the detail line', () => {
      const awards = compute({
        p1: makeStats({ damageTaken: 123.4 }),
        p2: makeStats({ damageTaken: 50 }),
      });
      const pincushion = awards.find((a) => a.id === 'pincushion');
      expect(pincushion?.playerId).toBe('p1');
      expect(pincushion?.detail).toBe('123 DAMAGE TAKEN');
    });

    it('is skipped when nobody took damage', () => {
      const awards = compute({ p1: makeStats(), p2: makeStats() });
      expect(awards.find((a) => a.id === 'pincushion')).toBeUndefined();
    });
  });

  describe('pin puller, no payoff', () => {
    it('requires enough throws and zero grenade kills', () => {
      const awards = compute({
        p1: makeStats({ grenadesThrown: 3 }),
        p2: makeStats({
          grenadesThrown: 5,
          kills: 1,
          killsByWeapon: kills({ grenade: 1 }),
        }),
      });
      const pinPuller = awards.find((a) => a.id === 'pin_puller_no_payoff');
      expect(pinPuller?.playerId).toBe('p1');
      expect(pinPuller?.detail).toBe('3 THROWN, 0 KILLS');
    });
  });

  describe('tourist', () => {
    it('goes to the most distance traveled, reported in tiles', () => {
      const awards = compute({
        p1: makeStats({ distanceTraveled: 10 * MAP.TILE_SIZE }),
        p2: makeStats({ distanceTraveled: 25.3 * MAP.TILE_SIZE }),
      });
      const tourist = awards.find((a) => a.id === 'tourist');
      expect(tourist?.playerId).toBe('p2');
      expect(tourist?.detail).toBe('25 TILES WANDERED');
    });
  });

  describe('priority and display cap', () => {
    it('caps at DISPLAY_COUNT awards in priority order', () => {
      // p1 qualifies for sharpshooter + untouchable; p2 for spray & pray,
      // demolition man, and pincushion — five awards compete for three slots.
      const awards = compute({
        p1: makeStats({
          shotsFired: 20,
          shotsHit: 15,
          longestKillStreak: 4,
          kills: 4,
          killsByWeapon: kills({ gun: 4 }),
        }),
        p2: makeStats({
          shotsFired: 50,
          shotsHit: 5,
          kills: 2,
          killsByWeapon: kills({ grenade: 2 }),
          damageTaken: 300,
        }),
      });

      expect(awards).toHaveLength(AWARDS.DISPLAY_COUNT);
      expect(awards.map((a) => a.id)).toEqual([
        'sharpshooter',
        'spray_and_pray',
        'demolition_man',
      ]);
    });

    it('skips tied awards but still fills remaining slots', () => {
      const awards = compute({
        // Both take identical damage — pincushion ties and is dropped;
        // tourist still lands.
        p1: makeStats({ damageTaken: 100, distanceTraveled: 500 }),
        p2: makeStats({ damageTaken: 100, distanceTraveled: 200 }),
      });
      expect(awards.map((a) => a.id)).toEqual(['tourist']);
    });
  });
});
