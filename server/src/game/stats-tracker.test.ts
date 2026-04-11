import { describe, it, expect, beforeEach } from 'vitest';
import { StatsTracker } from './stats-tracker.js';

describe('StatsTracker', () => {
  let tracker: StatsTracker;

  beforeEach(() => {
    tracker = new StatsTracker();
    tracker.initPlayer('p1');
    tracker.initPlayer('p2');
  });

  describe('record shots and hits', () => {
    it('records shots fired', () => {
      tracker.recordShot('p1');
      tracker.recordShot('p1');
      tracker.recordShot('p1');

      expect(tracker.getStats('p1').shotsFired).toBe(3);
    });

    it('records hits', () => {
      tracker.recordHit('p1');
      tracker.recordHit('p1');

      expect(tracker.getStats('p1').shotsHit).toBe(2);
    });

    it('tracks shots and hits independently per player', () => {
      tracker.recordShot('p1');
      tracker.recordShot('p1');
      tracker.recordShot('p2');
      tracker.recordHit('p1');

      expect(tracker.getStats('p1').shotsFired).toBe(2);
      expect(tracker.getStats('p1').shotsHit).toBe(1);
      expect(tracker.getStats('p2').shotsFired).toBe(1);
      expect(tracker.getStats('p2').shotsHit).toBe(0);
    });
  });

  describe('record kills and deaths', () => {
    it('records a kill for the killer', () => {
      tracker.recordKill('p1', 'p2', 'gun');

      expect(tracker.getStats('p1').kills).toBe(1);
    });

    it('records a death for the victim', () => {
      tracker.recordDeath('p2');

      expect(tracker.getStats('p2').deaths).toBe(1);
    });

    it('tracks multiple kills and deaths', () => {
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordDeath('p2');
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordDeath('p2');
      tracker.recordKill('p2', 'p1', 'gun');
      tracker.recordDeath('p1');

      expect(tracker.getStats('p1').kills).toBe(2);
      expect(tracker.getStats('p1').deaths).toBe(1);
      expect(tracker.getStats('p2').kills).toBe(1);
      expect(tracker.getStats('p2').deaths).toBe(2);
    });
  });

  describe('kill streak tracking', () => {
    it('tracks current kill streak', () => {
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordKill('p1', 'p2', 'gun');

      expect(tracker.getStats('p1').longestKillStreak).toBe(3);
    });

    it('resets kill streak on death', () => {
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordDeath('p1');
      tracker.recordKill('p1', 'p2', 'gun');

      // Current streak is 1 after the death, but longest is still 2
      expect(tracker.getStats('p1').longestKillStreak).toBe(2);
    });

    it('preserves longest kill streak after death', () => {
      // Build a 4-streak
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordDeath('p1');

      // Build a 2-streak
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordDeath('p1');

      // Longest should still be 4
      expect(tracker.getStats('p1').longestKillStreak).toBe(4);
    });

    it('updates longest streak when new streak exceeds previous', () => {
      // Build a 2-streak
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordDeath('p1');

      // Build a 5-streak
      for (let i = 0; i < 5; i++) {
        tracker.recordKill('p1', 'p2', 'gun');
      }

      expect(tracker.getStats('p1').longestKillStreak).toBe(5);
    });
  });

  describe('record grenade throws and kills', () => {
    it('records grenade thrown', () => {
      tracker.recordGrenade('p1');
      tracker.recordGrenade('p1');

      expect(tracker.getStats('p1').grenadesThrown).toBe(2);
    });

    it('records grenade kills', () => {
      tracker.recordKill('p1', 'p2', 'grenade');

      expect(tracker.getStats('p1').grenadeKills).toBe(1);
      expect(tracker.getStats('p1').kills).toBe(1);
    });

    it('does not count gun kills as grenade kills', () => {
      tracker.recordKill('p1', 'p2', 'gun');

      expect(tracker.getStats('p1').grenadeKills).toBe(0);
      expect(tracker.getStats('p1').kills).toBe(1);
    });
  });

  describe('record damage dealt', () => {
    it('records damage dealt by a player', () => {
      tracker.recordDamage('p1', 25);
      tracker.recordDamage('p1', 30);

      expect(tracker.getStats('p1').damageDealt).toBe(55);
    });

    it('records damage taken by a player', () => {
      tracker.recordDamageTaken('p2', 40);

      expect(tracker.getStats('p2').damageTaken).toBe(40);
    });

    it('tracks damage independently per player', () => {
      tracker.recordDamage('p1', 25);
      tracker.recordDamage('p2', 10);

      expect(tracker.getStats('p1').damageDealt).toBe(25);
      expect(tracker.getStats('p2').damageDealt).toBe(10);
    });
  });

  describe('get stats for individual player', () => {
    it('returns stats for an initialized player', () => {
      const stats = tracker.getStats('p1');

      expect(stats.kills).toBe(0);
      expect(stats.deaths).toBe(0);
      expect(stats.shotsFired).toBe(0);
      expect(stats.shotsHit).toBe(0);
      expect(stats.damageDealt).toBe(0);
      expect(stats.damageTaken).toBe(0);
      expect(stats.grenadesThrown).toBe(0);
      expect(stats.grenadeKills).toBe(0);
      expect(stats.longestKillStreak).toBe(0);
    });

    it('throws for non-initialized player', () => {
      expect(() => tracker.getStats('unknown')).toThrow(
        'No stats initialized for player unknown',
      );
    });
  });

  describe('get all stats', () => {
    it('returns a map of all player stats', () => {
      tracker.recordKill('p1', 'p2', 'gun');
      tracker.recordDeath('p2');

      const allStats = tracker.getAllStats();

      expect(allStats.size).toBe(2);
      expect(allStats.get('p1')!.kills).toBe(1);
      expect(allStats.get('p2')!.deaths).toBe(1);
    });

    it('returns a copy, not a reference', () => {
      const allStats = tracker.getAllStats();
      allStats.delete('p1');

      // Original should still have p1
      expect(tracker.getStats('p1')).toBeDefined();
    });
  });
});
