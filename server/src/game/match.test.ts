import { describe, it, expect, beforeEach } from 'vitest';
import { Match } from './match.js';
import {
  MatchPhase,
  MATCH,
  RESPAWN,
  PLAYER,
  GUN,
  SERVER,
  EVENT,
  GRENADE,
  CHARACTER_IDS,
} from '@shared/game';
import type { MapData, PlayerInput, FinalMinuteEvent } from '@shared/game';

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
    abilityPressed: false,
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
    it('should start in CHARACTER_SELECT phase', () => {
      expect(match.phase).toBe(MatchPhase.CHARACTER_SELECT);
    });

    it('should transition from CHARACTER_SELECT to COUNTDOWN', () => {
      match.startCountdown();
      expect(match.phase).toBe(MatchPhase.COUNTDOWN);
      expect(match.countdownTimer).toBe(MATCH.COUNTDOWN_DURATION);
    });

    it('should not start countdown if not in CHARACTER_SELECT', () => {
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

  describe('character select', () => {
    it('getSelectStateMessage seeds one entry per player with deterministic default hovers', () => {
      const m = createMatch();
      const msg = m.getSelectStateMessage();

      expect(msg.type).toBe('server:characterSelectState');
      expect(msg.selections).toHaveLength(2);

      const p0 = msg.selections.find((s) => s.playerId === 'player-0')!;
      const p1 = msg.selections.find((s) => s.playerId === 'player-1')!;

      expect(p0).toBeDefined();
      expect(p1).toBeDefined();

      // First player gets CHARACTER_IDS[0] (mighty_man), second gets [1] (bruce).
      expect(p0.hoveredCharacterId).toBe(CHARACTER_IDS[0]);
      expect(p1.hoveredCharacterId).toBe(CHARACTER_IDS[1]);
      expect(p0.lockedCharacterId).toBeNull();
      expect(p1.lockedCharacterId).toBeNull();
      expect(msg.timeRemainingMs).toBeGreaterThan(0);
    });

    it('setHover updates the hover and is reflected in the next broadcast', () => {
      const m = createMatch();
      m.setHover('player-0', 'bruce');

      const msg = m.getSelectStateMessage();
      const p0 = msg.selections.find((s) => s.playerId === 'player-0')!;
      expect(p0.hoveredCharacterId).toBe('bruce');
    });

    it('setHover is a no-op when the requested character is locked by another player', () => {
      const m = createMatch();
      m.setLock('player-0', 'mighty_man');

      // P2 default hover is bruce; trying to hover mighty_man (P1's lock)
      // should be silently rejected, leaving the hover unchanged.
      const before = m.getSelectStateMessage().selections.find(
        (s) => s.playerId === 'player-1',
      )!;
      m.setHover('player-1', 'mighty_man');
      const after = m.getSelectStateMessage().selections.find(
        (s) => s.playerId === 'player-1',
      )!;

      expect(after.hoveredCharacterId).toBe(before.hoveredCharacterId);
      expect(after.hoveredCharacterId).not.toBe('mighty_man');
    });

    it('setLock is a no-op when the character is already locked by another player', () => {
      const m = createMatch();
      m.setLock('player-0', 'mighty_man');
      m.setLock('player-1', 'mighty_man');

      const p1 = m.getSelectStateMessage().selections.find(
        (s) => s.playerId === 'player-1',
      )!;
      expect(p1.lockedCharacterId).toBeNull();
    });

    it('auto-snaps a colliding hover when the other player locks that character', () => {
      const m = createMatch();
      // Force both players onto mighty_man.
      m.setHover('player-0', 'mighty_man');
      m.setHover('player-1', 'mighty_man');

      m.setLock('player-0', 'mighty_man');

      const msg = m.getSelectStateMessage();
      const p1 = msg.selections.find((s) => s.playerId === 'player-1')!;
      expect(p1.hoveredCharacterId).not.toBe('mighty_man');
      // With a 2-character roster, the only available fallback is bruce.
      expect(p1.hoveredCharacterId).toBe('bruce');
    });

    it('transitions to COUNTDOWN once both players are locked, committing characterId on each player', () => {
      const m = createMatch();
      m.setLock('player-0', 'mighty_man');
      m.setLock('player-1', 'bruce');

      // Pre-tick: phase is still CHARACTER_SELECT. The transition happens
      // inside update() (updateCharacterSelect drains the locks).
      expect(m.phase).toBe(MatchPhase.CHARACTER_SELECT);

      m.update(0.1);

      expect(m.phase).toBe(MatchPhase.COUNTDOWN);
      expect(m.players.get('player-0')!.characterId).toBe('mighty_man');
      expect(m.players.get('player-1')!.characterId).toBe('bruce');
    });

    it('on timeout, auto-locks every unlocked player onto their current hover and starts countdown', () => {
      const m = createMatch();
      // Don't lock anything. P0's default hover is mighty_man, P1's is bruce.

      // One big tick well past the timeout. updateCharacterSelect doesn't
      // clamp dt internally — it just decrements selectTimer and checks if
      // it's hit zero.
      m.update(MATCH.CHARACTER_SELECT_TIMEOUT_SEC + 1);

      expect(m.phase).toBe(MatchPhase.COUNTDOWN);
      expect(m.players.get('player-0')!.characterId).not.toBeNull();
      expect(m.players.get('player-1')!.characterId).not.toBeNull();
      // Default hovers were preserved as the auto-lock targets.
      expect(m.players.get('player-0')!.characterId).toBe('mighty_man');
      expect(m.players.get('player-1')!.characterId).toBe('bruce');
    });

    it('after both players lock, no two players hold the same locked character', () => {
      // With auto-snap on lock, even colliding hovers must resolve to a
      // distinct lock per player.
      const m = createMatch();
      m.setHover('player-0', 'mighty_man');
      m.setHover('player-1', 'mighty_man');

      m.setLock('player-0', 'mighty_man');
      // P1's hover was auto-snapped to bruce; lock that.
      const p1Selection = m.getSelectStateMessage().selections.find(
        (s) => s.playerId === 'player-1',
      )!;
      m.setLock('player-1', p1Selection.hoveredCharacterId!);

      m.update(0.1);

      const p0Char = m.players.get('player-0')!.characterId;
      const p1Char = m.players.get('player-1')!.characterId;
      expect(p0Char).not.toBeNull();
      expect(p1Char).not.toBeNull();
      expect(p0Char).not.toBe(p1Char);
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

    it('should send co-dying players to different spawn points', () => {
      // Regression: a shared-grenade death used to send both players to the
      // same "farthest from death" spawn because the respawn picker had no
      // awareness of other respawning players.
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);

      const p0 = match.players.get('player-0')!;
      const p1 = match.players.get('player-1')!;
      // Stand them on the same tile so their death positions match.
      p0.position = { x: 200, y: 200 };
      p1.position = { x: 200, y: 200 };

      // Mutual death this tick (mimics a grenade that catches both players).
      match.onKill('player-1', 'player-0', 'grenade');
      match.onKill('player-0', 'player-1', 'grenade');
      expect(p0.isDead).toBe(true);
      expect(p1.isDead).toBe(true);

      // Tick past the respawn delay; both should respawn this update.
      match.update(RESPAWN.DELAY + 0.1);

      expect(p0.isDead).toBe(false);
      expect(p1.isDead).toBe(false);
      expect(p0.position).not.toEqual(p1.position);
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

  describe('movement input queue', () => {
    function startActiveMatch(): Match {
      const m = createMatch();
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    it('does not acknowledge input before it is simulated', () => {
      const m = startActiveMatch();
      const player = m.players.get('player-0')!;

      m.queueInput('player-0', makeInput(1, { moveX: 1 }));

      expect(player.lastProcessedInput).toBe(0);

      m.update(0.05);

      expect(player.lastProcessedInput).toBe(1);
    });

    it('acknowledges but ignores movement before the match is active', () => {
      const m = createMatch();
      m.startCountdown();
      const player = m.players.get('player-0')!;
      const startX = player.position.x;

      m.queueInput('player-0', makeInput(1, { moveX: 1 }));

      expect(player.lastProcessedInput).toBe(1);

      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      m.update(1 / SERVER.TICK_RATE);

      expect(player.position.x).toBeCloseTo(startX, 5);
      expect(player.lastProcessedInput).toBe(1);
    });

    it('replays multiple queued movement inputs with fixed tick dt', () => {
      const m = startActiveMatch();
      const player = m.players.get('player-0')!;
      const startX = player.position.x;

      m.queueInput('player-0', makeInput(1, { moveX: 1 }));
      m.queueInput('player-0', makeInput(2, { moveX: 1 }));

      m.update(1 / SERVER.TICK_RATE);

      expect(player.position.x).toBeCloseTo(
        startX + PLAYER.BASE_SPEED * (1 / SERVER.TICK_RATE) * 2,
        5,
      );
      expect(player.lastProcessedInput).toBe(2);
    });

    it('caps catch-up inputs without acknowledging unprocessed inputs', () => {
      const m = startActiveMatch();
      const player = m.players.get('player-0')!;

      for (let seq = 1; seq <= SERVER.MAX_INPUTS_PER_PLAYER_PER_TICK + 2; seq++) {
        m.queueInput('player-0', makeInput(seq, { moveX: 1 }));
      }

      m.update(1 / SERVER.TICK_RATE);

      expect(player.lastProcessedInput).toBe(SERVER.MAX_INPUTS_PER_PLAYER_PER_TICK);

      m.update(1 / SERVER.TICK_RATE);

      expect(player.lastProcessedInput).toBe(SERVER.MAX_INPUTS_PER_PLAYER_PER_TICK + 2);
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

  describe('pickup collection at max inventory', () => {
    function makeGrenadePickupMap(): MapData {
      return {
        name: 'test-map-grenade-pickup',
        width: 10,
        height: 10,
        tileSize: 48,
        tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
        spawnPoints: [
          { x: 1, y: 1 },
          { x: 8, y: 8 },
        ],
        pickupSpawns: [{ x: 1, y: 1, type: 'grenade' as const }],
      };
    }

    // Map tile (1,1) → world (1*48 + 24, 1*48 + 24) = (72, 72).
    const PICKUP_WORLD_POS = { x: 72, y: 72 } as const;

    function startActiveMatchWithGrenadePickup(): Match {
      const m = new Match('match-pickup', makeGrenadePickupMap(), [
        { id: 'player-0', nickname: 'P0' },
        { id: 'player-1', nickname: 'P1' },
      ]);
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      // Spawns are randomly shuffled — pin player-0 onto the pickup tile so
      // collision is deterministic.
      m.players.get('player-0')!.position = { ...PICKUP_WORLD_POS };
      return m;
    }

    it('does not consume a grenade pickup when the player is at max grenades', () => {
      const m = startActiveMatchWithGrenadePickup();
      const player = m.players.get('player-0')!;
      player.grenades = GRENADE.MAX_COUNT;

      m.update(0.05);

      // Inventory unchanged — and the pickup is still on the board, ready to be
      // grabbed once the player throws a grenade.
      expect(player.grenades).toBe(GRENADE.MAX_COUNT);
      const pickups = m.pickupManager.getPickups();
      expect(pickups).toHaveLength(1);
      expect(pickups[0].isActive).toBe(true);
      expect(m.getTickPickupCollections()).toHaveLength(0);
    });

    it('consumes the grenade pickup when the player has room', () => {
      const m = startActiveMatchWithGrenadePickup();
      const player = m.players.get('player-0')!;
      player.grenades = GRENADE.MAX_COUNT - 1;

      m.update(0.05);

      expect(player.grenades).toBe(GRENADE.MAX_COUNT);
      expect(m.pickupManager.getPickups()[0].isActive).toBe(false);
      expect(m.getTickPickupCollections()).toHaveLength(1);
    });
  });

  describe('final-minute event', () => {
    /**
     * Build a match with a deterministic RNG so the picker always lands on
     * the chosen event. The picker indexes into EVENT.POOL, so the rng
     * value is the index normalized to [0, 1).
     */
    function createMatchWithEvent(event: FinalMinuteEvent): Match {
      const idx = (EVENT.POOL as readonly FinalMinuteEvent[]).indexOf(event);
      if (idx === -1) throw new Error(`unknown event: ${event}`);
      // Math.floor(rng() * POOL.length) === idx → rng = idx/POOL.length + tiny epsilon.
      const rng = () => idx / EVENT.POOL.length + 0.0001;
      return new Match(
        'match-1',
        makeMapData(),
        Array.from({ length: 2 }, (_, i) => ({
          id: `player-${i}`,
          nickname: `Player ${i}`,
        })),
        undefined,
        rng,
      );
    }

    function startActiveMatchAt(remaining: number, event: FinalMinuteEvent): Match {
      const m = createMatchWithEvent(event);
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      // Fast-forward by mutating matchTimer directly, then run a single
      // update tick — that's the boundary the production code checks.
      (m as unknown as { matchTimer: number }).matchTimer = remaining;
      return m;
    }

    it('broadcasts an eventWarning the tick the timer crosses the warning threshold', () => {
      const m = startActiveMatchAt(EVENT.WARNING_AT_REMAINING + 0.01, 'super_speed');

      // First tick: should NOT have crossed yet (0.05s before cross).
      // Actually 65.01 - 0.05 = 64.96 which IS <= 65 — so the crossing fires.
      m.update(0.05);
      const warning = m.consumeTickEventWarning();
      expect(warning).not.toBeNull();
      expect(warning!.event).toBe('super_speed');
      expect(warning!.activatesInMs).toBeGreaterThan(0);
      // Activation is still pending — activeEvent should still be null.
      expect(m.activeEvent).toBeNull();

      // Subsequent tick: warning is single-shot.
      m.update(0.05);
      expect(m.consumeTickEventWarning()).toBeNull();
    });

    it('broadcasts an eventStart the tick the timer crosses the activation threshold', () => {
      const m = startActiveMatchAt(EVENT.ACTIVATION_AT_REMAINING + 0.01, 'grenades_only');
      m.update(0.05);

      const started = m.consumeTickEventStart();
      expect(started).toBe('grenades_only');
      expect(m.activeEvent).toBe('grenades_only');
    });

    it('grenades_only refills grenades to MAX on activation and gates gun fire', () => {
      const m = startActiveMatchAt(EVENT.ACTIVATION_AT_REMAINING + 0.01, 'grenades_only');
      const player = m.players.get('player-0')!;
      player.grenades = 0;
      const startingAmmo = player.ammo;

      m.update(0.05); // activation tick

      expect(player.grenades).toBe(GRENADE.MAX_COUNT);

      // Pressing fire after activation: gun is gated off, ammo unchanged.
      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(player.ammo).toBe(startingAmmo);
    });

    it('infinite_ammo keeps the magazine full when firing', () => {
      const m = startActiveMatchAt(EVENT.ACTIVATION_AT_REMAINING + 0.01, 'infinite_ammo');
      const player = m.players.get('player-0')!;
      m.update(0.05); // activation tick

      expect(player.ammo).toBe(GUN.MAGAZINE_SIZE);

      // Fire a burst: magazine should not deplete.
      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      // Run several ticks so the burst fires fully (BURST_INTERVAL spaced).
      for (let i = 0; i < 10; i++) {
        m.update(0.05);
      }
      expect(player.ammo).toBe(GUN.MAGAZINE_SIZE);
      expect(player.isReloading).toBe(false);
    });

    it('low_health snaps maxHealth and current HP to 1 on activation', () => {
      const m = startActiveMatchAt(EVENT.ACTIVATION_AT_REMAINING + 0.01, 'low_health');
      const p0 = m.players.get('player-0')!;
      const p1 = m.players.get('player-1')!;
      p0.health = 100;
      p1.health = 50;

      m.update(0.05); // activation tick

      expect(p0.maxHealth).toBe(EVENT.LOW_HEALTH_HP);
      expect(p1.maxHealth).toBe(EVENT.LOW_HEALTH_HP);
      expect(p0.health).toBe(EVENT.LOW_HEALTH_HP);
      expect(p1.health).toBe(EVENT.LOW_HEALTH_HP);
    });

    it('super_speed has no on-trigger state mutation but is reported on the snapshot', () => {
      const m = startActiveMatchAt(EVENT.ACTIVATION_AT_REMAINING + 0.01, 'super_speed');
      const p0 = m.players.get('player-0')!;
      const startingHealth = p0.health;
      const startingMag = p0.ammo;

      m.update(0.05);

      expect(p0.health).toBe(startingHealth);
      expect(p0.ammo).toBe(startingMag);
      expect(m.activeEvent).toBe('super_speed');
    });
  });

  describe('lag compensation wiring', () => {
    function startActive(): Match {
      const m = createMatch();
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      // Place opponents at known positions in line of sight.
      const p0 = m.players.get('player-0')!;
      const p1 = m.players.get('player-1')!;
      p0.position = { x: 100, y: 100 };
      p1.position = { x: 300, y: 100 };
      return m;
    }

    it('asks the RTT resolver for the shooter on each fired shot', () => {
      const m = startActive();
      const seen: string[] = [];
      m.setRttResolver((pid) => {
        seen.push(pid);
        return 0;
      });

      // One press, one burst — three shots at GUN.BURST_INTERVAL apart.
      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(SERVER.TICK_INTERVAL / 1000);
      // Drain the rest of the burst.
      for (let i = 0; i < GUN.BURST_SIZE; i++) {
        m.update(GUN.BURST_INTERVAL + 0.01);
      }

      expect(seen.length).toBeGreaterThanOrEqual(GUN.BURST_SIZE);
      for (const id of seen) {
        expect(id).toBe('player-0');
      }
    });

    it('with default zero-RTT resolver, shots still hit a stationary opponent (no regression)', () => {
      const m = startActive();
      // No setRttResolver call → default returns 0 → lag-comp collapses
      // to current positions.
      const p1 = m.players.get('player-1')!;
      const startingHp = p1.health;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(SERVER.TICK_INTERVAL / 1000);

      expect(p1.health).toBeLessThan(startingHp);
    });
  });

  describe('character abilities (spacebar)', () => {
    function startActiveWithCharacters(p0Char: 'mighty_man' | 'bruce', p1Char: 'mighty_man' | 'bruce'): Match {
      const m = createMatch();
      m.setLock('player-0', p0Char);
      m.setLock('player-1', p1Char);
      m.update(0.05); // commits the locks → COUNTDOWN
      m.update(MATCH.COUNTDOWN_DURATION + 0.05); // → ACTIVE
      return m;
    }

    describe('Bruce fire-breath', () => {
      it('activates on abilityPressed and starts the active window + cooldown', () => {
        const m = startActiveWithCharacters('bruce', 'mighty_man');
        const bruce = m.players.get('player-0')!;
        expect(bruce.abilityActiveSeconds).toBe(0);
        expect(bruce.abilityCooldownSeconds).toBe(0);

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.001); // tiny dt so the timers don't visibly decay

        expect(bruce.abilityActiveSeconds).toBeGreaterThan(0);
        expect(bruce.abilityCooldownSeconds).toBeGreaterThan(0);
      });

      it('one-shots an opponent within close range (<= 2 tiles)', () => {
        const m = startActiveWithCharacters('bruce', 'mighty_man');
        const bruce = m.players.get('player-0')!;
        const victim = m.players.get('player-1')!;
        // 1.5 tiles to the right at full HP.
        bruce.position = { x: 100, y: 100 };
        victim.position = { x: 100 + 1.5 * 48, y: 100 };
        victim.health = PLAYER.MAX_HEALTH;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(victim.isDead).toBe(true);
      });

      it('chips for 70 (not lethal from full HP) when opponent is in the far band', () => {
        const m = startActiveWithCharacters('bruce', 'mighty_man');
        const bruce = m.players.get('player-0')!;
        const victim = m.players.get('player-1')!;
        // 3 tiles to the right (> 2, < 4).
        bruce.position = { x: 100, y: 100 };
        victim.position = { x: 100 + 3 * 48, y: 100 };
        victim.health = PLAYER.MAX_HEALTH;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(victim.isDead).toBe(false);
        expect(victim.health).toBe(PLAYER.MAX_HEALTH - 70);
      });

      it('does nothing to opponents beyond the 4-tile range', () => {
        const m = startActiveWithCharacters('bruce', 'mighty_man');
        const bruce = m.players.get('player-0')!;
        const victim = m.players.get('player-1')!;
        // 5 tiles away — outside the breath cone.
        bruce.position = { x: 100, y: 100 };
        victim.position = { x: 100 + 5 * 48, y: 100 };
        victim.health = PLAYER.MAX_HEALTH;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(victim.health).toBe(PLAYER.MAX_HEALTH);
      });

      it('hits each victim once per cast even though the breath sustains for 1.2s', () => {
        // Far-band sustained victim: if per-tick damage stacked, 70 × ~24 ticks
        // would kill them many times over. The hit-set must guard against that.
        const m = startActiveWithCharacters('bruce', 'mighty_man');
        const bruce = m.players.get('player-0')!;
        const victim = m.players.get('player-1')!;
        bruce.position = { x: 100, y: 100 };
        victim.position = { x: 100 + 3 * 48, y: 100 };
        victim.health = PLAYER.MAX_HEALTH;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        // Sustain for the full 1.2s active window.
        for (let i = 0; i < 30; i++) m.update(0.05);

        expect(victim.isDead).toBe(false);
        expect(victim.health).toBe(PLAYER.MAX_HEALTH - 70);
      });

      it('locks movement while breathing but lets aim sweep with input', () => {
        const m = startActiveWithCharacters('bruce', 'mighty_man');
        const bruce = m.players.get('player-0')!;
        bruce.position = { x: 200, y: 200 };
        const startPos = { ...bruce.position };

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        // Subsequent inputs try to move + aim elsewhere. Movement should
        // stay pinned; aim should follow the latest input so the cone can
        // sweep with the cursor mid-cast.
        m.queueInput('player-0', makeInput(2, { moveX: 1, aimAngle: Math.PI / 2 }));
        m.queueInput('player-0', makeInput(3, { moveX: 1, aimAngle: Math.PI / 2 }));
        m.update(0.05);

        expect(bruce.position).toEqual(startPos);
        expect(bruce.aimAngle).toBe(Math.PI / 2);
      });

      it('cooldown blocks re-activation while it is still running', () => {
        const m = startActiveWithCharacters('bruce', 'mighty_man');
        const bruce = m.players.get('player-0')!;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true }));
        m.update(0.05);
        const firstCooldown = bruce.abilityCooldownSeconds;
        expect(firstCooldown).toBeGreaterThan(40); // ~45 minus tiny tick

        // Wait out the active window (1.2s) but stay deep in cooldown.
        for (let i = 0; i < 30; i++) m.update(0.05);
        expect(bruce.abilityActiveSeconds).toBe(0);
        expect(bruce.abilityCooldownSeconds).toBeGreaterThan(40);

        // Press again — should be a no-op.
        m.queueInput('player-0', makeInput(100, { abilityPressed: true }));
        m.update(0.05);
        expect(bruce.abilityActiveSeconds).toBe(0);
      });

      it('death mid-cast cancels the active window; cooldown keeps ticking', () => {
        const m = startActiveWithCharacters('bruce', 'mighty_man');
        const bruce = m.players.get('player-0')!;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true }));
        m.update(0.05);
        expect(bruce.abilityActiveSeconds).toBeGreaterThan(0);
        const cooldownBeforeDeath = bruce.abilityCooldownSeconds;

        // Kill Bruce.
        m.onKill('player-1', 'player-0', 'gun');
        expect(bruce.abilityActiveSeconds).toBe(0);
        // Bruce's cooldown started at activation and continues running — not
        // reset on death.
        expect(bruce.abilityCooldownSeconds).toBeCloseTo(cooldownBeforeDeath, 5);
      });
    });

    describe('Mighty Man x-ray', () => {
      it('activates with active=DURATION and cooldown=DURATION+COOLDOWN', () => {
        const m = startActiveWithCharacters('mighty_man', 'bruce');
        const mm = m.players.get('player-0')!;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true }));
        m.update(0.001);

        // 7s active and 37s total cycle.
        expect(mm.abilityActiveSeconds).toBeGreaterThan(6.9);
        expect(mm.abilityCooldownSeconds).toBeGreaterThan(36.9);
      });

      it('does NOT lock movement or aim — x-ray is mechanics-only', () => {
        const m = startActiveWithCharacters('mighty_man', 'bruce');
        const mm = m.players.get('player-0')!;
        const startX = mm.position.x;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.queueInput('player-0', makeInput(2, { moveX: 1, aimAngle: 1.0 }));
        m.update(0.05);

        expect(mm.position.x).toBeGreaterThan(startX);
        expect(mm.aimAngle).toBeCloseTo(1.0, 5);
      });

      it('death mid-active cancels the active window and resets cooldown to 30s', () => {
        const m = startActiveWithCharacters('mighty_man', 'bruce');
        const mm = m.players.get('player-0')!;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true }));
        m.update(0.05);
        expect(mm.abilityActiveSeconds).toBeGreaterThan(0);

        m.onKill('player-1', 'player-0', 'gun');
        expect(mm.abilityActiveSeconds).toBe(0);
        // Reset to ABILITY.MIGHTY_MAN_XRAY.COOLDOWN (30s).
        expect(mm.abilityCooldownSeconds).toBeCloseTo(30, 5);
      });
    });

    describe('Mighty Man piercing projectiles', () => {
      function makeMapWithVerticalWall(): MapData {
        // 12-wide, 6-tall map. Column 5 is solid. Players on either side
        // can't see each other but a piercing shot or grenade can.
        const tiles = Array.from({ length: 6 }, (_, r) =>
          Array.from({ length: 12 }, (_, c) => {
            if (r === 0 || r === 5 || c === 0 || c === 11) return 1; // walls
            if (c === 5) return 1; // vertical wall
            return 0;
          }),
        );
        return {
          name: 'wall-test',
          width: 12,
          height: 6,
          tileSize: 48,
          tiles,
          spawnPoints: [
            { x: 2, y: 2 },
            { x: 8, y: 2 },
          ],
          pickupSpawns: [],
        };
      }

      function startActiveWithWall(p0Char: 'mighty_man', p1Char: 'bruce'): Match {
        const m = new Match('match-wall', makeMapWithVerticalWall(), [
          { id: 'player-0', nickname: 'P0' },
          { id: 'player-1', nickname: 'P1' },
        ]);
        m.setLock('player-0', p0Char);
        m.setLock('player-1', p1Char);
        m.update(0.05);
        m.update(MATCH.COUNTDOWN_DURATION + 0.05);
        return m;
      }

      it('a normal bullet is blocked by the wall', () => {
        const m = startActiveWithWall('mighty_man', 'bruce');
        const mm = m.players.get('player-0')!;
        const target = m.players.get('player-1')!;
        // Place both on row 2, column 2 vs 8 — wall is at column 5.
        mm.position = { x: 2.5 * 48, y: 2.5 * 48 };
        target.position = { x: 8.5 * 48, y: 2.5 * 48 };
        const startHp = target.health;

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);
        expect(target.health).toBe(startHp);
      });

      it('bullets fired during x-ray pass through walls', () => {
        const m = startActiveWithWall('mighty_man', 'bruce');
        const mm = m.players.get('player-0')!;
        const target = m.players.get('player-1')!;
        mm.position = { x: 2.5 * 48, y: 2.5 * 48 };
        target.position = { x: 8.5 * 48, y: 2.5 * 48 };
        const startHp = target.health;

        // Activate x-ray, then fire on the next input.
        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.queueInput('player-0', makeInput(2, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);
        expect(target.health).toBeLessThan(startHp);
      });

      it('grenades thrown during x-ray pierce walls and damage through them', () => {
        const m = startActiveWithWall('mighty_man', 'bruce');
        const mm = m.players.get('player-0')!;
        const target = m.players.get('player-1')!;
        mm.position = { x: 2.5 * 48, y: 2.5 * 48 };
        target.position = { x: 8.5 * 48, y: 2.5 * 48 };
        const startHp = target.health;

        // Activate, then throw aimed at the target through the wall.
        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.queueInput('player-0', makeInput(2, { throwPressed: true, aimAngle: 0 }));
        m.update(0.05);

        // Distance ~288px at THROW_SPEED 300 → ~0.96s of flight to reach the
        // target. Step the simulation until the grenade is alongside, then
        // manually detonate. (Piercing disables wall-bounce; with a 5s safety
        // fuse the grenade would otherwise fly straight off the map without
        // detonating anywhere near the target.)
        for (let i = 0; i < 19; i++) m.update(0.05);

        m.queueInput('player-0', makeInput(3, { detonatePressed: true }));
        m.update(0.05);

        expect(target.health).toBeLessThan(startHp);
      });
    });
  });
});
