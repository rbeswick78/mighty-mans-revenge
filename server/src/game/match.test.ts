import { describe, it, expect, beforeEach } from 'vitest';
import { Match } from './match.js';
import { MatchPhase, MATCH, RESPAWN, PLAYER, GUN, GRENADE } from '@shared/game';
import type { MapData } from '@shared/game';

function makeMapData(): MapData {
  return {
    name: 'test-map',
    width: 10,
    height: 10,
    tileSize: 48,
    tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
    spawnPoints: [
      { x: 1, y: 1 },
      { x: 8, y: 8 },
      { x: 1, y: 8 },
    ],
    pickupSpawns: [{ x: 5, y: 5, type: 'gun_ammo' as const }],
  };
}

function createMatch(
  playerCount = 2,
): Match {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `player-${i}`,
    nickname: `Player ${i}`,
  }));

  return new Match('match-1', makeMapData(), players);
}

describe('Match', () => {
  let match: Match;

  beforeEach(() => {
    match = createMatch();
  });

  describe('state transitions', () => {
    it('should start in WAITING phase', () => {
      expect(match.phase).toBe(MatchPhase.WAITING);
    });

    it('should transition from WAITING to COUNTDOWN', () => {
      match.startCountdown();
      expect(match.phase).toBe(MatchPhase.COUNTDOWN);
      expect(match.countdownTimer).toBe(MATCH.COUNTDOWN_DURATION);
    });

    it('should not start countdown if not in WAITING', () => {
      match.startCountdown();
      match.startCountdown(); // second call should be ignored
      expect(match.phase).toBe(MatchPhase.COUNTDOWN);
    });

    it('should transition from COUNTDOWN to ACTIVE when timer expires', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);
      expect(match.phase).toBe(MatchPhase.ACTIVE);
      expect(match.matchTimer).toBe(MATCH.TIME_LIMIT);
    });

    it('should countdown timer decrements correctly', () => {
      match.startCountdown();
      match.update(1);
      expect(match.countdownTimer).toBeCloseTo(MATCH.COUNTDOWN_DURATION - 1, 5);
    });
  });

  describe('match end conditions', () => {
    it('should end when kill target is reached', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);
      expect(match.phase).toBe(MatchPhase.ACTIVE);

      // Simulate kills until target
      for (let i = 0; i < MATCH.KILL_TARGET; i++) {
        match.onKill('player-0', 'player-1', 'gun');
        // Respawn victim so they can be killed again
        const victim = match.players.get('player-1')!;
        victim.isDead = false;
        victim.respawnTimer = 0;
      }

      // The next update should detect match end
      match.update(0.05);
      expect(match.phase).toBe(MatchPhase.ENDED);
    });

    it('should end when time runs out', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);
      expect(match.phase).toBe(MatchPhase.ACTIVE);

      // Run through the entire match time
      match.update(MATCH.TIME_LIMIT + 1);
      expect(match.phase).toBe(MatchPhase.ENDED);
    });

    it('should end when only one player remains connected', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);
      expect(match.phase).toBe(MatchPhase.ACTIVE);

      match.onPlayerDisconnect('player-1');
      match.checkMatchEnd();
      expect(match.phase).toBe(MatchPhase.ENDED);
    });
  });

  describe('respawning', () => {
    it('should set player as dead with respawn timer on kill', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);

      match.onKill('player-0', 'player-1', 'gun');

      const victim = match.players.get('player-1')!;
      expect(victim.isDead).toBe(true);
      expect(victim.respawnTimer).toBe(RESPAWN.DELAY);
    });

    it('should respawn player after respawn delay', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);

      match.onKill('player-0', 'player-1', 'gun');
      const victim = match.players.get('player-1')!;
      expect(victim.isDead).toBe(true);

      // Tick up to just before respawn
      match.update(RESPAWN.DELAY - 0.05);
      expect(victim.isDead).toBe(true);

      // Small tick to trigger respawn
      match.update(0.1);

      expect(victim.isDead).toBe(false);
      expect(victim.health).toBe(PLAYER.MAX_HEALTH);
      expect(victim.invulnerableTimer).toBeGreaterThan(0);
      expect(victim.invulnerableTimer).toBeLessThanOrEqual(RESPAWN.INVULNERABILITY_DURATION);
      expect(victim.ammo).toBe(GUN.MAGAZINE_SIZE);
      expect(victim.grenades).toBe(GRENADE.MAX_CARRY);
    });
  });

  describe('scoring', () => {
    it('should track kills and deaths', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);

      match.onKill('player-0', 'player-1', 'gun');

      const killerStats = match.stats.getStats('player-0');
      const victimStats = match.stats.getStats('player-1');

      expect(killerStats.kills).toBe(1);
      expect(victimStats.deaths).toBe(1);
    });

    it('should increment score on kill via game mode', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);

      match.onKill('player-0', 'player-1', 'gun');

      const killer = match.players.get('player-0')!;
      expect(killer.score).toBe(1);
    });

    it('should add to kill feed', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);

      match.onKill('player-0', 'player-1', 'gun');

      const killFeed = match.getKillFeed();
      expect(killFeed).toHaveLength(1);
      expect(killFeed[0].killerId).toBe('player-0');
      expect(killFeed[0].victimId).toBe('player-1');
      expect(killFeed[0].weapon).toBe('gun');
    });
  });

  describe('getResult', () => {
    it('should return correct winner', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);

      // Player 0 gets a kill
      match.onKill('player-0', 'player-1', 'gun');

      const result = match.getResult();
      expect(result.matchId).toBe('match-1');
      expect(result.winnerId).toBe('player-0');
      expect(result.playerStats.size).toBe(2);
    });
  });

  describe('player initialization', () => {
    it('should initialize all players with correct defaults', () => {
      const player = match.players.get('player-0')!;
      expect(player.health).toBe(PLAYER.MAX_HEALTH);
      expect(player.ammo).toBe(GUN.MAGAZINE_SIZE);
      expect(player.grenades).toBe(GRENADE.MAX_CARRY);
      expect(player.isDead).toBe(false);
      expect(player.score).toBe(0);
    });

    it('should support N players', () => {
      const bigMatch = createMatch(5);
      expect(bigMatch.players.size).toBe(5);
    });
  });
});
