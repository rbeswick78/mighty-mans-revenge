import { describe, it, expect, beforeEach } from 'vitest';
import { Match } from './match.js';
import { MatchPhase, MATCH, RESPAWN, PLAYER, GUN } from '@shared/game';
import type { MapData, PlayerInput } from '@shared/game';

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
    tick: seq,
    ...overrides,
  };
}

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
      expect(player.isDead).toBe(false);
      expect(player.score).toBe(0);
    });

    it('should support N players', () => {
      const bigMatch = createMatch(5);
      expect(bigMatch.players.size).toBe(5);
    });
  });

  describe('burst firing', () => {
    function startActiveMatch(): Match {
      const m = createMatch();
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    it('fires the first round on firePressed and queues the rest', () => {
      const m = startActiveMatch();
      const player = m.players.get('player-0')!;
      const startAmmo = player.ammo;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      // First shot already fired.
      expect(player.ammo).toBe(startAmmo - 1);
      expect(m.getTickBulletTrails().length).toBe(1);
    });

    it('fires exactly 3 shots over the burst interval, even if aim changes', () => {
      const m = startActiveMatch();
      const player = m.players.get('player-0')!;
      const startAmmo = player.ammo;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      // After tick 1: 1 shot fired.
      expect(startAmmo - player.ammo).toBe(1);

      // The player rotates to the side, but the burst is locked at 0 and
      // continues independently.
      m.queueInput('player-0', makeInput(2, { aimAngle: Math.PI / 2 }));
      // Advance ~150ms — should fire shot 2.
      m.update(0.15);
      expect(startAmmo - player.ammo).toBe(2);

      m.queueInput('player-0', makeInput(3, { aimAngle: Math.PI }));
      m.update(0.15);
      expect(startAmmo - player.ammo).toBe(3);

      // No more shots after the burst is exhausted.
      m.update(0.5);
      expect(startAmmo - player.ammo).toBe(3);
    });

    it('cancels the burst when the player dies mid-burst', () => {
      const m = startActiveMatch();
      const player = m.players.get('player-0')!;
      const startAmmo = player.ammo;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(startAmmo - player.ammo).toBe(1);

      // Kill the shooter.
      m.onKill('player-1', 'player-0', 'gun');

      // Advance enough to fire the rest of the burst.
      m.update(0.5);
      // No more shots fired.
      expect(startAmmo - player.ammo).toBe(1);
    });

    it('with only 2 rounds in the mag, fires 2 and starts an auto-reload', () => {
      const m = startActiveMatch();
      const player = m.players.get('player-0')!;
      player.ammo = 2;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(player.ammo).toBe(1);

      // Tick to fire shot 2 (~150ms).
      m.update(0.15);
      expect(player.ammo).toBe(0);

      // Tick to attempt shot 3 — out of ammo, should start a reload.
      m.update(0.15);
      expect(player.ammo).toBe(0);
      expect(player.isReloading).toBe(true);
    });
  });

  describe('manual grenade detonation', () => {
    function startActiveMatch(): Match {
      const m = createMatch();
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    it('throw on throwPressed spawns a grenade', () => {
      const m = startActiveMatch();
      expect(m.getActiveGrenades().length).toBe(0);

      m.queueInput('player-0', makeInput(1, { throwPressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(m.getActiveGrenades().length).toBe(1);
      expect(m.getActiveGrenades()[0].throwerId).toBe('player-0');
    });

    it('refuses to throw a second grenade while one is in flight', () => {
      const m = startActiveMatch();

      m.queueInput('player-0', makeInput(1, { throwPressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(m.getActiveGrenades().length).toBe(1);

      m.queueInput('player-0', makeInput(2, { throwPressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(m.getActiveGrenades().length).toBe(1);
    });

    it('detonatePressed explodes the player\'s grenade and removes it', () => {
      const m = startActiveMatch();

      m.queueInput('player-0', makeInput(1, { throwPressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(m.getActiveGrenades().length).toBe(1);

      m.queueInput('player-0', makeInput(2, { detonatePressed: true }));
      m.update(0.05);
      expect(m.getActiveGrenades().length).toBe(0);
    });

    it('safety fuse auto-detonates if no detonate input arrives', () => {
      const m = startActiveMatch();

      m.queueInput('player-0', makeInput(1, { throwPressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(m.getActiveGrenades().length).toBe(1);

      // Advance well past the safety fuse (5s).
      for (let i = 0; i < 120; i++) {
        m.update(0.05);
      }
      expect(m.getActiveGrenades().length).toBe(0);
    });

    it('keeps the grenade alive after the thrower dies — safety fuse still ticks', () => {
      const m = startActiveMatch();
      m.queueInput('player-0', makeInput(1, { throwPressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(m.getActiveGrenades().length).toBe(1);

      m.onKill('player-1', 'player-0', 'gun');

      // Grenade not removed by death; only by safety fuse / detonate.
      expect(m.getActiveGrenades().length).toBe(1);

      // Advance past safety fuse.
      for (let i = 0; i < 120; i++) {
        m.update(0.05);
      }
      expect(m.getActiveGrenades().length).toBe(0);
    });
  });
});
