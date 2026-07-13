import { describe, it, expect, beforeEach } from 'vitest';
import { Match } from './match.js';
import {
  MatchPhase,
  MATCH,
  RESPAWN,
  PLAYER,
  WEAPONS,
  PICKUP,
  SERVER,
  MUTATORS,
  GRENADE,
  CHARACTERS,
  CHARACTER_IDS,
  ABILITY,
  OVERTIME,
  KOTH,
  GUN_GAME,
  LAST_STAND,
  KILL_CONFIRMED,
  ONE_IN_THE_CHAMBER,
  GameModeType,
  TileType,
  PickupType,
} from '@shared/game';
import type {
  CharacterId,
  GrenadeState,
  MapData,
  PlayerInput,
  MutatorId,
  MatchContractId,
} from '@shared/game';

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

function createMatch(playerCount = 2): Match {
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
      const before = m.getSelectStateMessage().selections.find((s) => s.playerId === 'player-1')!;
      m.setHover('player-1', 'mighty_man');
      const after = m.getSelectStateMessage().selections.find((s) => s.playerId === 'player-1')!;

      expect(after.hoveredCharacterId).toBe(before.hoveredCharacterId);
      expect(after.hoveredCharacterId).not.toBe('mighty_man');
    });

    it('setLock is a no-op when the character is already locked by another player', () => {
      const m = createMatch();
      m.setLock('player-0', 'mighty_man');
      m.setLock('player-1', 'mighty_man');

      const p1 = m.getSelectStateMessage().selections.find((s) => s.playerId === 'player-1')!;
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
      const p1Selection = m
        .getSelectStateMessage()
        .selections.find((s) => s.playerId === 'player-1')!;
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

    it('should end when time runs out with a scoreboard leader', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);
      expect(match.phase).toBe(MatchPhase.ACTIVE);

      // Break the 0-0 tie first — a tied clock-out now enters overtime
      // instead of ending (see the overtime describe block).
      match.onKill('player-0', 'player-1', 'gun');

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

    it('awards a forfeit win to the player who stayed, even if behind on score', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);

      // player-1 is ahead on the scoreboard, then rage-quits.
      match.onKill('player-1', 'player-0', 'gun');
      match.onPlayerDisconnect('player-1');
      match.checkMatchEnd();

      expect(match.phase).toBe(MatchPhase.ENDED);
      expect(match.getResult().winnerId).toBe('player-0');
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
      expect(victim.ammo).toBe(WEAPONS.rifle.magazineSize);
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
      expect(killFeed[0].killerStreak).toBe(1);
      expect(killFeed[0].victimStreakEnded).toBe(0);
      expect(killFeed[0].isRevenge).toBe(false);
      expect(killFeed[0].isFirstBlood).toBe(true);
      expect(killFeed[0].rapidKillCount).toBe(1);
      expect(killFeed[0].isPosthumous).toBe(false);
    });

    it('ignores suicides for First Blood and rapid-kill chains', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);

      match.onKill('player-0', 'player-0', 'grenade');
      match.players.get('player-0')!.isDead = false;
      match.onKill('player-1', 'player-0', 'gun');

      const [suicide, opener] = match.getKillFeed();
      expect(suicide).toMatchObject({
        isFirstBlood: false,
        rapidKillCount: 0,
        isPosthumous: false,
      });
      expect(opener).toMatchObject({
        isFirstBlood: true,
        rapidKillCount: 1,
      });
    });

    it('builds rapid-kill chains inside the shared window and resets after it', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);

      match.onKill('player-0', 'player-1', 'gun');
      match.players.get('player-1')!.isDead = false;
      // The boundary is inclusive: exactly six simulated seconds still chains.
      match.matchTimer -= 6;
      match.onKill('player-0', 'player-1', 'shotgun');
      match.players.get('player-1')!.isDead = false;
      match.matchTimer -= 6.001;
      match.onKill('player-0', 'player-1', 'pistol');

      expect(match.getKillFeed().map((entry) => entry.rapidKillCount)).toEqual([1, 2, 1]);
    });

    it('marks a kill made after the killer is already dead as posthumous', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);
      match.players.get('player-0')!.isDead = true;

      match.onKill('player-0', 'player-1', 'grenade');

      expect(match.getKillFeed()[0]).toMatchObject({
        killerId: 'player-0',
        victimId: 'player-1',
        isPosthumous: true,
      });
    });

    it('ships streak shutdown and payback context with each kill', () => {
      match.startCountdown();
      match.update(MATCH.COUNTDOWN_DURATION + 0.1);

      match.onKill('player-0', 'player-1', 'gun');
      match.players.get('player-1')!.isDead = false;
      match.onKill('player-0', 'player-1', 'gun');
      match.players.get('player-1')!.isDead = false;
      match.onKill('player-0', 'player-1', 'gun');
      match.players.get('player-1')!.isDead = false;
      match.onKill('player-1', 'player-0', 'pistol');

      const feed = match.getKillFeed();
      expect(feed.map((entry) => entry.killerStreak)).toEqual([1, 2, 3, 1]);
      expect(feed.map((entry) => entry.rapidKillCount)).toEqual([1, 2, 3, 1]);
      expect(feed[3]).toMatchObject({
        killerId: 'player-1',
        victimId: 'player-0',
        victimStreakEnded: 3,
        isRevenge: true,
      });
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
      expect(player.ammo).toBe(WEAPONS.rifle.magazineSize);
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

    it('accumulates distance traveled in stats as inputs are simulated', () => {
      const m = startActiveMatch();

      m.queueInput('player-0', makeInput(1, { moveX: 1 }));
      m.queueInput('player-0', makeInput(2, { moveX: 1 }));
      m.update(1 / SERVER.TICK_RATE);

      expect(m.stats.getStats('player-0').distanceTraveled).toBeCloseTo(
        PLAYER.BASE_SPEED * (1 / SERVER.TICK_RATE) * 2,
        5,
      );
      // The stationary opponent walked nowhere.
      expect(m.stats.getStats('player-1').distanceTraveled).toBe(0);
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

    function startBlastableCoverMatch(decorated = false): Match {
      const map: MapData = {
        name: 'Blastable Cover Lab',
        width: 7,
        height: 5,
        tileSize: 48,
        tiles: [
          [1, 1, 1, 1, 1, 1, 1],
          [1, 0, 0, 0, 0, 0, 1],
          [1, 0, 0, decorated ? 1 : 2, decorated ? 1 : 0, 0, 1],
          [1, 3, 0, 0, 0, 3, 1],
          [1, 1, 1, 1, 1, 1, 1],
        ],
        spawnPoints: [
          { x: 1, y: 3 },
          { x: 5, y: 3 },
        ],
        pickupSpawns: [],
        decorations: decorated
          ? [{ x: 3, y: 2, w: 2, h: 1, texture: 'deco_container' }]
          : undefined,
      };
      const m = new Match('blastable-cover', map, [
        { id: 'player-0', nickname: 'P0' },
        { id: 'player-1', nickname: 'P1' },
      ]);
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    function startBarrelMatch(secondBarrelCol: number | null = null, shieldingWall = false): Match {
      const barrelCols = [3, ...(secondBarrelCol === null ? [] : [secondBarrelCol])];
      const middleRow = [1, 0, 0, 2, shieldingWall ? 1 : 0, 0, 0, 0, 1];
      if (secondBarrelCol !== null) middleRow[secondBarrelCol] = 2;
      const map: MapData = {
        name: 'Barrel Lab',
        width: 9,
        height: 5,
        tileSize: 48,
        tiles: [
          [1, 1, 1, 1, 1, 1, 1, 1, 1],
          [1, 0, 0, 0, 0, 0, 0, 0, 1],
          middleRow,
          [1, 3, 0, 0, 0, 0, 0, 3, 1],
          [1, 1, 1, 1, 1, 1, 1, 1, 1],
        ],
        spawnPoints: [
          { x: 1, y: 3 },
          { x: 7, y: 3 },
        ],
        pickupSpawns: [],
        decorations: barrelCols.map((x) => ({
          x,
          y: 2,
          w: 1,
          h: 1,
          texture: 'deco_barrel_red',
          hazard: 'explosive_barrel' as const,
        })),
      };
      const m = new Match(
        'barrel-lab',
        map,
        [
          { id: 'player-0', nickname: 'P0' },
          { id: 'player-1', nickname: 'P1' },
        ],
        GameModeType.DEATHMATCH,
        Math.random,
        [],
        'powder_keg',
      );
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      m.players.get('player-0')!.position = { x: 72, y: 120 };
      m.players.get('player-1')!.position = { x: 216, y: 120 };
      return m;
    }

    function startGateMatch(): Match {
      const map: MapData = {
        name: 'Shootable Gate Lab',
        width: 7,
        height: 5,
        tileSize: 48,
        tiles: [
          [1, 1, 1, 1, 1, 1, 1],
          [1, 0, 0, 0, 0, 0, 1],
          [1, 0, 0, 1, 0, 0, 1],
          [1, 3, 0, 0, 0, 3, 1],
          [1, 1, 1, 1, 1, 1, 1],
        ],
        spawnPoints: [
          { x: 1, y: 3 },
          { x: 5, y: 3 },
        ],
        pickupSpawns: [],
        decorations: [
          {
            x: 3,
            y: 2,
            w: 1,
            h: 1,
            texture: 'tiles_wire_fence_closing',
            interaction: 'shootable_gate',
          },
        ],
      };
      const m = new Match('gate-lab', map, [
        { id: 'player-0', nickname: 'P0' },
        { id: 'player-1', nickname: 'P1' },
      ]);
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      m.players.get('player-0')!.position = { x: 72, y: 120 };
      m.players.get('player-1')!.position = { x: 264, y: 120 };
      return m;
    }

    function startScavengerCacheMatch(
      mode: GameModeType = GameModeType.DEATHMATCH,
    ): Match {
      const map: MapData = {
        name: 'Scavenger Cache Lab',
        width: 9,
        height: 5,
        tileSize: 48,
        tiles: [
          [1, 1, 1, 1, 1, 1, 1, 1, 1],
          [1, 0, 0, 0, 0, 0, 0, 0, 1],
          [1, 0, 0, 2, 0, 2, 0, 0, 1],
          [1, 3, 0, 0, 0, 0, 0, 3, 1],
          [1, 1, 1, 1, 1, 1, 1, 1, 1],
        ],
        spawnPoints: [
          { x: 1, y: 3 },
          { x: 7, y: 3 },
        ],
        pickupSpawns: [],
        decorations: [3, 5].map((x) => ({
          x,
          y: 2,
          w: 1,
          h: 1,
          texture: 'deco_scavenger_cache',
          interaction: 'scavenger_cache' as const,
        })),
      };
      const m = new Match(
        'cache-lab',
        map,
        [
          { id: 'player-0', nickname: 'P0' },
          { id: 'player-1', nickname: 'P1' },
        ],
        mode,
      );
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      m.players.get('player-0')!.position = { x: 72, y: 120 };
      m.players.get('player-1')!.position = { x: 360, y: 120 };
      return m;
    }

    function plantGrenade(m: Match): GrenadeState {
      m.queueInput('player-0', makeInput(1, { throwPressed: true, aimAngle: 0 }));
      m.update(0.05);
      const grenade = m.getActiveGrenades()[0];
      grenade.position = { x: 120, y: 120 };
      grenade.velocity = { x: 0, y: 0 };
      return grenade;
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

    it("detonatePressed explodes the player's grenade and removes it", () => {
      const m = startActiveMatch();

      m.queueInput('player-0', makeInput(1, { throwPressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(m.getActiveGrenades().length).toBe(1);

      m.queueInput('player-0', makeInput(2, { detonatePressed: true }));
      m.update(0.05);
      expect(m.getActiveGrenades().length).toBe(0);
    });

    it('manual detonation breaks exposed cover after that cover shields the blast', () => {
      const m = startBlastableCoverMatch();
      const victim = m.players.get('player-1')!;
      victim.position = { x: 216, y: 120 }; // directly behind cover (3,2)
      const healthBefore = victim.health;
      plantGrenade(m);

      m.queueInput('player-0', makeInput(2, { detonatePressed: true }));
      m.update(0.05);

      expect(victim.health).toBe(healthBefore);
      expect(m.getTickDestroyedTiles()).toEqual([{ col: 3, row: 2 }]);
      expect(m.mapManager.getCollisionGrid().solid[2][3]).toBe(false);
      expect(m.getMapData().tiles[2][3]).toBe(TileType.COVER_LOW);

      m.update(0.05);
      expect(m.getTickDestroyedTiles()).toEqual([]);
    });

    it('safety-fuse detonation removes an entire decorated cover prop', () => {
      const m = startBlastableCoverMatch(true);
      const grenade = plantGrenade(m);
      grenade.safetyFuseTimer = 0.01;

      m.update(0.05);

      expect(m.getActiveGrenades()).toHaveLength(0);
      expect(m.getTickDestroyedTiles()).toEqual([
        { col: 3, row: 2 },
        { col: 4, row: 2 },
      ]);
      expect(m.mapManager.getCollisionGrid().solid[2][3]).toBe(false);
      expect(m.mapManager.getCollisionGrid().solid[2][4]).toBe(false);
    });

    it('a rifle impact detonates one barrel, removes collision, and credits barrel kills', () => {
      const m = startBarrelMatch();
      m.players.get('player-1')!.health = 50;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(m.getTickBarrelExplosions()).toEqual([{ x: 168, y: 120 }]);
      expect(m.getTickDestroyedTiles()).toEqual([{ col: 3, row: 2 }]);
      expect(m.mapManager.getCollisionGrid().solid[2][3]).toBe(false);
      expect(m.players.get('player-1')!.isDead).toBe(true);
      expect(m.getTickKillFeedEntries()[0]?.weapon).toBe('barrel');
      expect(m.stats.getStats('player-0').killsByWeapon.barrel).toBe(1);
    });

    it('a rifle impact permanently opens a gate and broadcasts the cell once', () => {
      const m = startGateMatch();

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(m.getTickDestroyedTiles()).toEqual([{ col: 3, row: 2 }]);
      expect(m.getTickBarrelExplosions()).toEqual([]);
      expect(m.mapManager.getCollisionGrid().solid[2][3]).toBe(false);

      m.update(0.05);
      expect(m.getTickDestroyedTiles()).toEqual([]);
    });

    it('a pistol impact opens a gate through the shared single-shot path', () => {
      const m = startGateMatch();
      const shooter = m.players.get('player-0')!;
      shooter.weaponId = 'pistol';
      shooter.specialAmmo = 1;
      shooter.specialReserve = 0;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(m.getTickDestroyedTiles()).toEqual([{ col: 3, row: 2 }]);
      expect(m.mapManager.getCollisionGrid().solid[2][3]).toBe(false);
    });

    it('a shotgun blast opens a gate once even when several pellets strike it', () => {
      const m = startGateMatch();
      const shooter = m.players.get('player-0')!;
      shooter.weaponId = 'shotgun';
      shooter.specialAmmo = 2;
      shooter.specialReserve = 0;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(m.getTickDestroyedTiles()).toEqual([{ col: 3, row: 2 }]);
      expect(m.mapManager.getCollisionGrid().solid[2][3]).toBe(false);
    });

    it('a grenade blast opens a gate through the same destruction event', () => {
      const m = startGateMatch();
      plantGrenade(m);

      m.queueInput('player-0', makeInput(2, { detonatePressed: true }));
      m.update(0.05);

      expect(m.getTickDestroyedTiles()).toEqual([{ col: 3, row: 2 }]);
      expect(m.mapManager.getCollisionGrid().solid[2][3]).toBe(false);
    });

    it("Bruce's fire breath opens gates in its wall-clearing cone", () => {
      const m = startGateMatch();
      m.players.get('player-0')!.characterId = 'bruce';

      m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(m.getTickDestroyedTiles()).toContainEqual({ col: 3, row: 2 });
      expect(m.mapManager.getCollisionGrid().solid[2][3]).toBe(false);
    });

    it('a rifle opens a scavenger cache and spills an active one-shot reward', () => {
      const m = startScavengerCacheMatch();

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(m.getTickDestroyedTiles()).toEqual([{ col: 3, row: 2 }]);
      expect(m.mapManager.getCollisionGrid().solid[2][3]).toBe(false);
      expect(m.pickupManager.getPickups()).toMatchObject([
        {
          position: { x: 168, y: 120 },
          isActive: true,
          respawnTimer: 0,
        },
      ]);
    });

    it('a shotgun opens one cache once even when several pellets strike it', () => {
      const m = startScavengerCacheMatch();
      const shooter = m.players.get('player-0')!;
      shooter.weaponId = 'shotgun';
      shooter.specialAmmo = 2;
      shooter.specialReserve = 0;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(m.getTickDestroyedTiles()).toEqual([{ col: 3, row: 2 }]);
      expect(m.pickupManager.getPickups()).toHaveLength(1);
    });

    it('rotational cache partners spill the same per-match reward', () => {
      const m = startScavengerCacheMatch();

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      m.queueInput(
        'player-1',
        makeInput(1, { firePressed: true, aimAngle: Math.PI }),
      );
      m.update(0.05);

      const rewards = m.pickupManager.getPickups();
      expect(rewards).toHaveLength(2);
      expect(rewards[0].type).toBe(rewards[1].type);
      expect(rewards.map((reward) => reward.position)).toEqual([
        { x: 168, y: 120 },
        { x: 264, y: 120 },
      ]);
    });

    it('a grenade blast opens an exposed cache through world destruction', () => {
      const m = startScavengerCacheMatch();
      plantGrenade(m);

      m.queueInput('player-0', makeInput(2, { detonatePressed: true }));
      m.update(0.05);

      expect(m.getTickDestroyedTiles()).toContainEqual({ col: 3, row: 2 });
      expect(m.pickupManager.getPickups()).toMatchObject([
        { position: { x: 168, y: 120 }, isActive: true },
      ]);
    });

    it('One in the Chamber caches respect its bandage-only economy', () => {
      const m = startScavengerCacheMatch(GameModeType.ONE_IN_THE_CHAMBER);

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(m.pickupManager.getPickups()).toMatchObject([
        { type: PickupType.BANDAGE, isActive: true },
      ]);
    });

    it('Gun Game cache substitutions cannot bypass its pickup economy', () => {
      const m = startScavengerCacheMatch(GameModeType.GUN_GAME);
      const internals = m as unknown as { _activeMutators: MutatorId[] };
      internals._activeMutators.push('low_health');

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(m.pickupManager.getPickups()).toMatchObject([
        { type: PickupType.BANDAGE, isActive: true },
      ]);
    });

    it('a grenade-triggered barrel recursively chains into another exposed barrel once', () => {
      const m = startBarrelMatch(5);
      plantGrenade(m);

      m.queueInput('player-0', makeInput(2, { detonatePressed: true }));
      m.update(0.05);

      expect(m.getTickBarrelExplosions()).toEqual([
        { x: 168, y: 120 },
        { x: 264, y: 120 },
      ]);
      expect(m.getTickDestroyedTiles()).toEqual([
        { col: 3, row: 2 },
        { col: 5, row: 2 },
      ]);
      expect(m.mapManager.getCollisionGrid().solid[2][3]).toBe(false);
      expect(m.mapManager.getCollisionGrid().solid[2][5]).toBe(false);
      expect(m.getContractHudState().players[0]).toMatchObject({
        playerId: 'player-0',
        progress: 2,
        completed: true,
      });

      m.update(0.05);
      expect(m.getTickBarrelExplosions()).toEqual([]);
      expect(m.getTickDestroyedTiles()).toEqual([]);
    });

    it('an ordinary wall shields a second barrel from the chain', () => {
      const m = startBarrelMatch(5, true);

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(m.getTickBarrelExplosions()).toEqual([{ x: 168, y: 120 }]);
      expect(m.mapManager.getCollisionGrid().solid[2][3]).toBe(false);
      expect(m.mapManager.getCollisionGrid().solid[2][4]).toBe(true);
      expect(m.mapManager.getCollisionGrid().solid[2][5]).toBe(true);
    });

    it('a fresh match rebuilds barrels consumed in the previous round', () => {
      const first = startBarrelMatch();
      first.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      first.update(0.05);
      expect(first.mapManager.getCollisionGrid().solid[2][3]).toBe(false);

      const rematch = startBarrelMatch();
      expect(rematch.mapManager.getCollisionGrid().solid[2][3]).toBe(true);
      rematch.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      rematch.update(0.05);
      expect(rematch.getTickBarrelExplosions()).toEqual([{ x: 168, y: 120 }]);
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

  describe('wasteland contracts', () => {
    function contractMatch(
      contract: MatchContractId,
      mode: GameModeType = GameModeType.DEATHMATCH,
    ): Match {
      return new Match(
        `contract-${contract}`,
        makeMapData(),
        [
          { id: 'player-0', nickname: 'P0' },
          { id: 'player-1', nickname: 'P1' },
        ],
        mode,
        Math.random,
        [],
        contract,
      );
    }

    it('tracks attack hits and clamps completed progress to the target', () => {
      const m = contractMatch('hot_shot');
      for (let i = 0; i < 10; i++) m.stats.recordHit('player-0');
      expect(m.getContractHudState().players[0]).toEqual({
        playerId: 'player-0',
        progress: 8,
        completed: true,
      });
      expect(m.getContractHudState().players[1].completed).toBe(false);
    });

    it('tracks damage, longest streak, and movement in their native stats', () => {
      const damage = contractMatch('heavy_hitter');
      damage.stats.recordDamage('player-0', 299.9);
      expect(damage.getContractHudState().players[0].completed).toBe(false);
      damage.stats.recordDamage('player-0', 0.1);
      expect(damage.getContractHudState().players[0].completed).toBe(true);

      const streak = contractMatch('on_a_roll');
      for (let i = 0; i < 3; i++) {
        streak.stats.recordKill('player-0', 'player-1', 'gun');
      }
      expect(streak.getContractHudState().players[0].progress).toBe(3);

      const travel = contractMatch('road_warrior');
      travel.stats.recordDistance('player-0', 25 * 48 - 1);
      expect(travel.getContractHudState().players[0].progress).toBe(24);
      travel.stats.recordDistance('player-0', 1);
      expect(travel.getContractHudState().players[0].completed).toBe(true);
    });

    it('uses KOTH hill time and Kill Confirmed score only in compatible modes', () => {
      const hill = contractMatch('hill_dweller', GameModeType.KOTH);
      hill.stats.recordHillSeconds('player-0', 20);
      expect(hill.getContractHudState().players[0].completed).toBe(true);

      const tags = contractMatch('tag_hunter', GameModeType.KILL_CONFIRMED);
      tags.players.get('player-0')!.score = 3;
      expect(tags.getContractHudState().players[0].completed).toBe(true);
    });

    it('attaches final progress to the match result for persistence and UI', () => {
      const m = contractMatch('hot_shot');
      for (let i = 0; i < 8; i++) m.stats.recordHit('player-0');
      expect(m.getResult().contract).toMatchObject({
        id: 'hot_shot',
        careerCompletions: {},
        players: [
          { playerId: 'player-0', progress: 8, completed: true },
          { playerId: 'player-1', progress: 0, completed: false },
        ],
      });
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

  describe('mutators', () => {
    /** Internal fields the mutator tests reach into (same style as matchTimer). */
    type MatchInternals = {
      matchTimer: number;
      midMatchSlot: { activateAtElapsed: number };
    };

    /**
     * Build a match with a deterministic constant RNG that makes the given
     * mutator the pick. The picker indexes into the candidate list (the
     * full mutator POOL when nothing else has been chosen), so the rng
     * value is the pool index normalized to [0, 1).
     */
    function createMatchWithPick(mutator: MutatorId): Match {
      const idx = (MUTATORS.POOL as readonly MutatorId[]).indexOf(mutator);
      if (idx === -1) throw new Error(`unknown mutator: ${mutator}`);
      const rng = () => idx / MUTATORS.POOL.length + 0.0001;
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

    /**
     * Fast-forward to the final-minute window with the mid-match slot
     * pushed out of reach, so these tests exercise the final-minute slot
     * alone. Mutates internals directly, then callers run a single update
     * tick — that's the boundary the production code checks.
     */
    function startActiveMatchAt(remaining: number, mutator: MutatorId): Match {
      const m = createMatchWithPick(mutator);
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      const internals = m as unknown as MatchInternals;
      internals.matchTimer = remaining;
      internals.midMatchSlot.activateAtElapsed = Number.POSITIVE_INFINITY;
      return m;
    }

    /**
     * Start a match and drive the MID-MATCH slot to activation with the
     * given mutator. The activation time is pinned to a fixed elapsed
     * value comfortably before the final-minute window, so only the
     * mid-match slot fires. Warning + start land on the same update tick.
     */
    function startActiveMatchWithMidMutator(mutator: MutatorId): Match {
      const m = createMatchWithPick(mutator);
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      const internals = m as unknown as MatchInternals;
      internals.midMatchSlot.activateAtElapsed = 80;
      internals.matchTimer = MATCH.TIME_LIMIT - 80.1;
      m.update(0.05);
      return m;
    }

    describe('final-minute slot', () => {
      it('broadcasts a warning the tick the timer crosses the warning threshold', () => {
        const m = startActiveMatchAt(MUTATORS.WARNING_AT_REMAINING + 0.01, 'super_speed');

        m.update(0.05);
        const warnings = m.consumeTickMutatorWarnings();
        expect(warnings).toHaveLength(1);
        expect(warnings[0].event).toBe('super_speed');
        expect(warnings[0].activatesInMs).toBeGreaterThan(0);
        expect(warnings[0].isFinalMinute).toBe(true);
        // Activation is still pending — nothing active yet.
        expect(m.activeMutators).toHaveLength(0);

        // Subsequent tick: warning is single-shot.
        m.update(0.05);
        expect(m.consumeTickMutatorWarnings()).toHaveLength(0);
      });

      it('broadcasts a start the tick the timer crosses the activation threshold', () => {
        const m = startActiveMatchAt(MUTATORS.ACTIVATION_AT_REMAINING + 0.01, 'grenades_only');
        m.update(0.05);

        const starts = m.consumeTickMutatorStarts();
        expect(starts).toHaveLength(1);
        expect(starts[0].event).toBe('grenades_only');
        expect(starts[0].isFinalMinute).toBe(true);
        expect(m.activeMutators).toContain('grenades_only');
      });

      it('grenades_only refills grenades to MAX on activation and gates gun fire', () => {
        const m = startActiveMatchAt(MUTATORS.ACTIVATION_AT_REMAINING + 0.01, 'grenades_only');
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

      it('fists_only equips everyone, retires grenades, and routes fire to punches', () => {
        const m = startActiveMatchAt(MUTATORS.ACTIVATION_AT_REMAINING + 0.01, 'fists_only');
        const p0 = m.players.get('player-0')!;
        const p1 = m.players.get('player-1')!;
        p0.weaponId = 'shotgun';
        p0.specialAmmo = 2;
        p0.specialReserve = 6;
        p0.grenades = 2;
        p0.position = { x: 100, y: 100 };
        p1.position = { x: 140, y: 100 };

        m.update(0.05); // activation tick

        expect(m.activeMutators).toContain('fists_only');
        for (const player of m.players.values()) {
          expect(player.weaponId).toBe('punch');
          expect(player.grenades).toBe(0);
          expect(player.specialAmmo).toBe(0);
          expect(player.specialReserve).toBe(0);
        }
        expect(m.getActiveGrenades()).toHaveLength(0);

        m.queueInput(p0.id, makeInput(1, { firePressed: true, throwPressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(m.getTickPunchEvents()).toHaveLength(1);
        expect(p1.health).toBeLessThan(p1.maxHealth);
        expect(m.getActiveGrenades()).toHaveLength(0);
      });

      it('fists_only reasserts the brawl after pickups and respawns', () => {
        const m = startActiveMatchAt(MUTATORS.ACTIVATION_AT_REMAINING + 0.01, 'fists_only');
        m.update(0.05);
        const p1 = m.players.get('player-1')!;

        p1.weaponId = 'pistol';
        p1.specialAmmo = WEAPONS.pistol.magazineSize;
        m.update(0.05);
        expect(p1.weaponId).toBe('punch');

        m.onKill('player-0', p1.id, 'punch');
        const respawnTicks = Math.ceil(RESPAWN.DELAY / 0.05) + 1;
        for (let i = 0; i < respawnTicks; i++) m.update(0.05);

        expect(p1.isDead).toBe(false);
        expect(p1.weaponId).toBe('punch');
        expect(p1.grenades).toBe(0);
      });

      it('weapon_roulette gives everyone the same stocked weapon and cycles fairly', () => {
        const m = startActiveMatchAt(MUTATORS.ACTIVATION_AT_REMAINING + 0.01, 'weapon_roulette');
        const alreadyHoldingShotgun = m.players.get('player-0')!;
        alreadyHoldingShotgun.weaponId = 'shotgun';
        alreadyHoldingShotgun.specialAmmo = 1;
        alreadyHoldingShotgun.specialReserve = 0;
        m.update(0.05);

        for (const player of m.players.values()) {
          expect(player.weaponId).toBe('shotgun');
          expect(player.specialAmmo).toBe(WEAPONS.shotgun.magazineSize);
          expect(player.specialReserve).toBe(WEAPONS.shotgun.magazineSize);
        }

        m.update(MUTATORS.WEAPON_ROULETTE_INTERVAL_SECONDS);
        for (const player of m.players.values()) {
          expect(player.weaponId).toBe('pistol');
          expect(player.specialAmmo).toBe(WEAPONS.pistol.magazineSize);
        }

        m.update(MUTATORS.WEAPON_ROULETTE_INTERVAL_SECONDS);
        expect([...m.players.values()].map((player) => player.weaponId)).toEqual([
          'punch',
          'punch',
        ]);

        m.update(MUTATORS.WEAPON_ROULETTE_INTERVAL_SECONDS);
        for (const player of m.players.values()) {
          expect(player.weaponId).toBe('rifle');
          expect(player.ammo).toBe(WEAPONS.rifle.magazineSize);
        }
      });

      it('weapon_roulette persists through respawns and retires obsolete weapon pickups', () => {
        const map = makeMapData();
        map.pickupSpawns = [
          { x: 4, y: 4, type: 'gun_ammo' },
          { x: 5, y: 5, type: 'weapon_pistol' },
        ];
        const m = new Match(
          'roulette-persistence',
          map,
          [
            { id: 'player-0', nickname: 'Player 0' },
            { id: 'player-1', nickname: 'Player 1' },
          ],
          GameModeType.DEATHMATCH,
          () => 0,
        );
        process.env.FORCE_EVENT = 'weapon_roulette';
        try {
          m.startCountdown();
          m.update(MATCH.COUNTDOWN_DURATION + 0.05);
          const internals = m as unknown as MatchInternals;
          internals.matchTimer = MUTATORS.ACTIVATION_AT_REMAINING + 0.01;
          internals.midMatchSlot.activateAtElapsed = Number.POSITIVE_INFINITY;
          m.update(0.05);

          const p1 = m.players.get('player-1')!;
          m.onKill('player-0', p1.id, 'shotgun');
          const respawnTicks = Math.ceil(RESPAWN.DELAY / 0.05) + 1;
          for (let i = 0; i < respawnTicks; i++) m.update(0.05);
          expect(p1.isDead).toBe(false);
          expect(p1.weaponId).toBe('shotgun');

          expect(m.pickupManager.getPickups()).toHaveLength(0);
        } finally {
          delete process.env.FORCE_EVENT;
        }
      });

      it('weapon_roulette holds an exhausted weapon until the shared cycle advances', () => {
        const m = startActiveMatchAt(MUTATORS.ACTIVATION_AT_REMAINING + 0.01, 'weapon_roulette');
        m.update(0.05);
        const player = m.players.get('player-0')!;
        player.specialAmmo = 1;
        player.specialReserve = 0;

        m.queueInput(player.id, makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(player.specialAmmo).toBe(0);
        expect(player.weaponId).toBe('shotgun');
      });

      it('infinite_ammo keeps the magazine full when firing', () => {
        const m = startActiveMatchAt(MUTATORS.ACTIVATION_AT_REMAINING + 0.01, 'infinite_ammo');
        const player = m.players.get('player-0')!;
        m.update(0.05); // activation tick

        expect(player.ammo).toBe(WEAPONS.rifle.magazineSize);

        // Fire a burst: magazine should not deplete.
        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        // Run several ticks so the burst fires fully (BURST_INTERVAL spaced).
        for (let i = 0; i < 10; i++) {
          m.update(0.05);
        }
        expect(player.ammo).toBe(WEAPONS.rifle.magazineSize);
        expect(player.isReloading).toBe(false);
      });

      it('low_health snaps maxHealth and current HP to 1 on activation', () => {
        const m = startActiveMatchAt(MUTATORS.ACTIVATION_AT_REMAINING + 0.01, 'low_health');
        const p0 = m.players.get('player-0')!;
        const p1 = m.players.get('player-1')!;
        p0.health = 100;
        p1.health = 50;

        m.update(0.05); // activation tick

        expect(p0.maxHealth).toBe(MUTATORS.LOW_HEALTH_HP);
        expect(p1.maxHealth).toBe(MUTATORS.LOW_HEALTH_HP);
        expect(p0.health).toBe(MUTATORS.LOW_HEALTH_HP);
        expect(p1.health).toBe(MUTATORS.LOW_HEALTH_HP);
      });

      it('super_speed has no on-trigger state mutation but is reported active', () => {
        const m = startActiveMatchAt(MUTATORS.ACTIVATION_AT_REMAINING + 0.01, 'super_speed');
        const p0 = m.players.get('player-0')!;
        const startingHealth = p0.health;
        const startingMag = p0.ammo;

        m.update(0.05);

        expect(p0.health).toBe(startingHealth);
        expect(p0.ammo).toBe(startingMag);
        expect(m.activeMutators).toEqual(['super_speed']);
      });
    });

    describe('mid-match slot scheduling', () => {
      it('rolls the activation time inside the 40–70% elapsed window from the injected rng', () => {
        const low = createMatchWithPick(MUTATORS.POOL[0]); // rng ≈ 0
        low.startCountdown();
        low.update(MATCH.COUNTDOWN_DURATION + 0.05);
        const lowAt = (low as unknown as MatchInternals).midMatchSlot.activateAtElapsed;
        expect(lowAt).toBeGreaterThanOrEqual(
          MATCH.TIME_LIMIT * MUTATORS.MIDMATCH_MIN_ELAPSED_FRACTION,
        );

        const idx = MUTATORS.POOL.length - 1; // rng ≈ 0.875 → near the top of the window
        const high = createMatchWithPick(MUTATORS.POOL[idx]);
        high.startCountdown();
        high.update(MATCH.COUNTDOWN_DURATION + 0.05);
        const highAt = (high as unknown as MatchInternals).midMatchSlot.activateAtElapsed;
        expect(highAt).toBeLessThanOrEqual(
          MATCH.TIME_LIMIT * MUTATORS.MIDMATCH_MAX_ELAPSED_FRACTION,
        );
        expect(highAt).toBeGreaterThan(lowAt);
      });

      it('warns 5s ahead with isFinalMinute:false, then starts at the rolled time', () => {
        const m = createMatchWithPick('big_heads'); // rng = 4/8 → activation at 55% elapsed
        m.startCountdown();
        m.update(MATCH.COUNTDOWN_DURATION + 0.05);
        const internals = m as unknown as MatchInternals;
        const activateAt = internals.midMatchSlot.activateAtElapsed;

        // Just before the warning threshold: nothing yet.
        internals.matchTimer =
          MATCH.TIME_LIMIT - (activateAt - MUTATORS.WARNING_LEAD_SECONDS - 0.2);
        m.update(0.05);
        expect(m.consumeTickMutatorWarnings()).toHaveLength(0);

        // Crossing the warning threshold: one mid-match warning.
        internals.matchTimer =
          MATCH.TIME_LIMIT - (activateAt - MUTATORS.WARNING_LEAD_SECONDS + 0.1);
        m.update(0.05);
        const warnings = m.consumeTickMutatorWarnings();
        expect(warnings).toHaveLength(1);
        expect(warnings[0].event).toBe('big_heads');
        expect(warnings[0].isFinalMinute).toBe(false);
        expect(warnings[0].activatesInMs).toBeGreaterThan(0);
        expect(m.activeMutators).toHaveLength(0);

        // Crossing the activation time: the mutator starts.
        internals.matchTimer = MATCH.TIME_LIMIT - (activateAt + 0.1);
        m.update(0.05);
        const starts = m.consumeTickMutatorStarts();
        expect(starts).toHaveLength(1);
        expect(starts[0]).toEqual({ event: 'big_heads', isFinalMinute: false });
        expect(m.activeMutators).toEqual(['big_heads']);
      });

      it('never repeats the mid-match mutator in the final minute', () => {
        // Constant rng ≈ 0: mid-match picks POOL[0]; the final-minute draw
        // must then pick from the remaining pool.
        const m = startActiveMatchWithMidMutator(MUTATORS.POOL[0]);
        expect(m.activeMutators).toEqual([MUTATORS.POOL[0]]);

        const internals = m as unknown as MatchInternals;
        internals.matchTimer = MUTATORS.ACTIVATION_AT_REMAINING - 0.01;
        m.update(0.05);

        expect(m.activeMutators).toHaveLength(2);
        expect(m.activeMutators[1]).not.toBe(m.activeMutators[0]);
      });

      it('never pairs two loadout-owning mutators in random slots', () => {
        for (const first of ['fists_only', 'grenades_only', 'weapon_roulette'] as const) {
          const m = startActiveMatchWithMidMutator(first);
          const internals = m as unknown as MatchInternals;
          internals.matchTimer = MUTATORS.ACTIVATION_AT_REMAINING - 0.01;
          m.update(0.05);

          expect(m.activeMutators).toHaveLength(2);
          const loadoutOwners = m.activeMutators.filter((mutator) =>
            ['fists_only', 'grenades_only', 'weapon_roulette'].includes(mutator),
          );
          expect(loadoutOwners).toHaveLength(1);
        }
      });

      it('FORCE_EVENT pins the final-minute pick and the mid-match draw avoids it', () => {
        process.env.FORCE_EVENT = 'super_speed';
        try {
          // Constant rng ≈ 0 would pick POOL[0] ('super_speed'), but the
          // forced final-minute value is excluded from the mid-match draw.
          const m = startActiveMatchWithMidMutator(MUTATORS.POOL[0]);
          expect(m.activeMutators[0]).not.toBe('super_speed');

          const internals = m as unknown as MatchInternals;
          internals.matchTimer = MUTATORS.ACTIVATION_AT_REMAINING - 0.01;
          m.update(0.05);
          expect(m.activeMutators[1]).toBe('super_speed');
        } finally {
          delete process.env.FORCE_EVENT;
        }
      });

      it('FORCE_MIDMATCH_MUTATOR pins the mid-match pick', () => {
        process.env.FORCE_MIDMATCH_MUTATOR = 'vampire';
        try {
          const m = startActiveMatchWithMidMutator(MUTATORS.POOL[0]);
          expect(m.activeMutators).toEqual(['vampire']);
        } finally {
          delete process.env.FORCE_MIDMATCH_MUTATOR;
        }
      });

      it('a forced final loadout excludes every conflicting random mid loadout', () => {
        const owners = ['grenades_only', 'fists_only', 'weapon_roulette'] as const;
        for (const forced of owners) {
          process.env.FORCE_EVENT = forced;
          try {
            const attempted = owners.find((owner) => owner !== forced)!;
            const m = startActiveMatchWithMidMutator(attempted);
            expect(owners).not.toContain(m.activeMutators[0]);

            const internals = m as unknown as MatchInternals;
            internals.matchTimer = MUTATORS.ACTIVATION_AT_REMAINING - 0.01;
            m.update(0.05);
            expect(m.activeMutators[1]).toBe(forced);
          } finally {
            delete process.env.FORCE_EVENT;
          }
        }
      });

      it('random rematch rolls exclude both mutators from the previous round', () => {
        const previous: MutatorId[] = ['super_speed', 'blackout'];
        const m = new Match(
          'rematch-1',
          makeMapData(),
          [
            { id: 'player-0', nickname: 'Player 0' },
            { id: 'player-1', nickname: 'Player 1' },
          ],
          GameModeType.DEATHMATCH,
          () => 0,
          previous,
        );
        m.startCountdown();
        m.update(MATCH.COUNTDOWN_DURATION + 0.05);
        const internals = m as unknown as MatchInternals;
        internals.midMatchSlot.activateAtElapsed = 80;
        internals.matchTimer = MATCH.TIME_LIMIT - 80.1;

        m.update(0.05);

        expect(m.activeMutators).toHaveLength(1);
        expect(previous).not.toContain(m.activeMutators[0]);
      });

      it('FORCE_MIDMATCH_MUTATOR overrides rematch recency for smoke tooling', () => {
        process.env.FORCE_MIDMATCH_MUTATOR = 'blackout';
        try {
          const m = new Match(
            'forced-rematch-1',
            makeMapData(),
            [
              { id: 'player-0', nickname: 'Player 0' },
              { id: 'player-1', nickname: 'Player 1' },
            ],
            GameModeType.DEATHMATCH,
            () => 0,
            ['blackout'],
          );
          m.startCountdown();
          m.update(MATCH.COUNTDOWN_DURATION + 0.05);
          const internals = m as unknown as MatchInternals;
          internals.midMatchSlot.activateAtElapsed = 80;
          internals.matchTimer = MATCH.TIME_LIMIT - 80.1;
          m.update(0.05);
          expect(m.activeMutators).toEqual(['blackout']);
        } finally {
          delete process.env.FORCE_MIDMATCH_MUTATOR;
        }
      });
    });

    describe('big_heads', () => {
      /**
       * Place the victim so the shot ray passes 15px off their center:
       * outside the normal 12px half-hitbox, inside the scaled 18px one
       * (24/2 × 1.5).
       */
      function positionGrazingShot(m: Match): void {
        const p0 = m.players.get('player-0')!;
        const p1 = m.players.get('player-1')!;
        p0.position = { x: 100, y: 100 };
        p1.position = { x: 250, y: 115 };
        p0.aimAngle = 0;
        // Commit the teleported positions to the rewind buffer before the
        // shot. Otherwise hit validation can sample the prior spawn history,
        // making this geometry assertion depend on suite timing.
        m.update(0.05);
      }

      it('a shot that misses a normal hitbox hits a scaled one', () => {
        const m = startActiveMatchWithMidMutator('big_heads');
        positionGrazingShot(m);
        const p1 = m.players.get('player-1')!;

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(p1.health).toBeLessThan(PLAYER.MAX_HEALTH);
      });

      it('control: the same grazing shot misses without big_heads', () => {
        const m = createMatch();
        m.startCountdown();
        m.update(MATCH.COUNTDOWN_DURATION + 0.05);
        positionGrazingShot(m);
        const p1 = m.players.get('player-1')!;

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(p1.health).toBe(PLAYER.MAX_HEALTH);
      });
    });

    describe('vampire', () => {
      it('heals the attacker for half the damage dealt', () => {
        const m = startActiveMatchWithMidMutator('vampire');
        const p0 = m.players.get('player-0')!;
        const p1 = m.players.get('player-1')!;
        p0.position = { x: 100, y: 100 };
        p1.position = { x: 250, y: 100 };
        p0.health = 40;
        m.update(0.05); // seed the rewind buffer with the arranged duel

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);

        const damageDealt = PLAYER.MAX_HEALTH - p1.health;
        expect(damageDealt).toBeGreaterThan(0);
        expect(p0.health).toBeCloseTo(40 + damageDealt * MUTATORS.VAMPIRE_HEAL_FRACTION, 5);
      });

      it('never heals above maxHealth', () => {
        const m = startActiveMatchWithMidMutator('vampire');
        const p0 = m.players.get('player-0')!;
        const p1 = m.players.get('player-1')!;
        p0.position = { x: 100, y: 100 };
        p1.position = { x: 250, y: 100 };
        p0.health = PLAYER.MAX_HEALTH;
        m.update(0.05); // seed the rewind buffer with the arranged duel

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(p1.health).toBeLessThan(PLAYER.MAX_HEALTH);
        expect(p0.health).toBe(PLAYER.MAX_HEALTH);
      });
    });

    describe('turbo_grenades', () => {
      it('throws grenades at 1.5× speed', () => {
        const m = startActiveMatchWithMidMutator('turbo_grenades');

        m.queueInput('player-0', makeInput(1, { throwPressed: true, aimAngle: 0 }));
        m.update(0.05);

        const grenades = m.getActiveGrenades();
        expect(grenades).toHaveLength(1);
        const speed = Math.hypot(grenades[0].velocity.x, grenades[0].velocity.y);
        expect(speed).toBeCloseTo(
          GRENADE.THROW_SPEED * MUTATORS.TURBO_GRENADES_SPEED_MULTIPLIER,
          5,
        );
      });

      it('refills one grenade per refill interval, up to max', () => {
        const m = startActiveMatchWithMidMutator('turbo_grenades');
        const p0 = m.players.get('player-0')!;
        p0.grenades = 0;
        p0.grenadeRegenSeconds = 0;

        const ticks = Math.ceil(MUTATORS.TURBO_GRENADES_REFILL_SECONDS / 0.05) + 1;
        for (let i = 0; i < ticks; i++) {
          m.update(0.05);
        }
        expect(p0.grenades).toBe(1);
      });
    });

    describe('second_wind', () => {
      it('grants the respawn boost timer and 1.3× movement while it runs', () => {
        const m = startActiveMatchWithMidMutator('second_wind');
        const p1 = m.players.get('player-1')!;

        m.onKill('player-0', 'player-1', 'gun');
        expect(p1.isDead).toBe(true);

        // Tick through the respawn delay.
        const respawnTicks = Math.ceil(RESPAWN.DELAY / 0.05) + 1;
        for (let i = 0; i < respawnTicks; i++) {
          m.update(0.05);
        }
        expect(p1.isDead).toBe(false);
        expect(p1.secondWindTimer).toBeGreaterThan(MUTATORS.SECOND_WIND_DURATION_SECONDS - 0.2);

        // One boosted movement tick: BASE_SPEED × 1.3 × dt.
        const startX = p1.position.x;
        m.queueInput('player-1', makeInput(1, { moveX: 1 }));
        m.update(0.05);
        expect(p1.position.x - startX).toBeCloseTo(
          PLAYER.BASE_SPEED * MUTATORS.SECOND_WIND_SPEED_MULTIPLIER * 0.05,
          5,
        );
      });

      it('movement returns to normal after the boost expires', () => {
        const m = startActiveMatchWithMidMutator('second_wind');
        const p1 = m.players.get('player-1')!;

        m.onKill('player-0', 'player-1', 'gun');
        const respawnTicks = Math.ceil(RESPAWN.DELAY / 0.05) + 1;
        for (let i = 0; i < respawnTicks; i++) {
          m.update(0.05);
        }
        // Run out the boost window.
        const boostTicks = Math.ceil(MUTATORS.SECOND_WIND_DURATION_SECONDS / 0.05) + 1;
        for (let i = 0; i < boostTicks; i++) {
          m.update(0.05);
        }
        expect(p1.secondWindTimer).toBe(0);

        const startX = p1.position.x;
        m.queueInput('player-1', makeInput(1, { moveX: 1 }));
        m.update(0.05);
        expect(p1.position.x - startX).toBeCloseTo(PLAYER.BASE_SPEED * 0.05, 5);
      });

      it('respawning without the mutator grants no boost', () => {
        const m = createMatch();
        m.startCountdown();
        m.update(MATCH.COUNTDOWN_DURATION + 0.05);
        const p1 = m.players.get('player-1')!;

        m.onKill('player-0', 'player-1', 'gun');
        const respawnTicks = Math.ceil(RESPAWN.DELAY / 0.05) + 1;
        for (let i = 0; i < respawnTicks; i++) {
          m.update(0.05);
        }
        expect(p1.isDead).toBe(false);
        expect(p1.secondWindTimer).toBe(0);
      });
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

      // One press, one burst — three shots at WEAPONS.rifle.burstInterval apart.
      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(SERVER.TICK_INTERVAL / 1000);
      // Drain the rest of the burst.
      for (let i = 0; i < WEAPONS.rifle.burstSize; i++) {
        m.update(WEAPONS.rifle.burstInterval + 0.01);
      }

      expect(seen.length).toBeGreaterThanOrEqual(WEAPONS.rifle.burstSize);
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
    function startActiveWithCharacters(
      p0Char: 'mighty_man' | 'bruce' | 'frost_wizard',
      p1Char: 'mighty_man' | 'bruce' | 'frost_wizard',
    ): Match {
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

      it('deals one DAMAGE_PER_TICK on the activation tick regardless of distance', () => {
        // 3 tiles away — well inside the cone but past what used to be the
        // close band. Damage is now distance-independent.
        const m = startActiveWithCharacters('bruce', 'mighty_man');
        const bruce = m.players.get('player-0')!;
        const victim = m.players.get('player-1')!;
        bruce.position = { x: 100, y: 100 };
        victim.position = { x: 100 + 3 * 48, y: 100 };
        victim.health = PLAYER.MAX_HEALTH;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(victim.isDead).toBe(false);
        expect(victim.health).toBe(PLAYER.MAX_HEALTH - ABILITY.BRUCE_FIRE_BREATH.DAMAGE_PER_TICK);
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

      it('stacks 30 damage per scheduled tick — 3 ticks = 90 damage', () => {
        // Tick spacing = DURATION / DAMAGE_TICK_COUNT = 0.24s. With dt=0.05
        // per update, tick 0 lands on the activation update; tick 1 lands
        // once elapsed crosses 0.24 (the 5th sustain update); tick 2 lands
        // once elapsed crosses 0.48 (the 10th sustain update). 11 sustain
        // updates puts elapsed at 0.55 — past 0.48, before 0.72 — so
        // exactly 3 damage ticks should have fired.
        const m = startActiveWithCharacters('bruce', 'mighty_man');
        const bruce = m.players.get('player-0')!;
        const victim = m.players.get('player-1')!;
        bruce.position = { x: 100, y: 100 };
        victim.position = { x: 100 + 3 * 48, y: 100 };
        victim.health = PLAYER.MAX_HEALTH;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.05); // activation tick → tick 0 fires
        for (let i = 0; i < 11; i++) m.update(0.05); // through tick 2

        expect(victim.isDead).toBe(false);
        expect(victim.health).toBe(
          PLAYER.MAX_HEALTH - 3 * ABILITY.BRUCE_FIRE_BREATH.DAMAGE_PER_TICK,
        );
      });

      it('kills a full-HP victim who stays in the cone for the full cast (5 ticks)', () => {
        // 5 ticks × 30 = 150 damage > 100 HP, so the victim should die
        // somewhere during the cast.
        const m = startActiveWithCharacters('bruce', 'mighty_man');
        const bruce = m.players.get('player-0')!;
        const victim = m.players.get('player-1')!;
        bruce.position = { x: 100, y: 100 };
        victim.position = { x: 100 + 3 * 48, y: 100 };
        victim.health = PLAYER.MAX_HEALTH;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        for (let i = 0; i < 30; i++) m.update(0.05); // sustain past full duration

        expect(victim.isDead).toBe(true);
      });

      it('fires exactly DAMAGE_TICK_COUNT damage ticks over the active window', () => {
        // A victim who survives every tick (low DAMAGE_PER_TICK relative to
        // a very large HP pool) should take exactly TICK_COUNT × PER_TICK
        // damage — no over-fire from the per-tick wall-burn loop, no
        // under-fire near the duration boundary.
        const m = startActiveWithCharacters('bruce', 'mighty_man');
        const bruce = m.players.get('player-0')!;
        const victim = m.players.get('player-1')!;
        bruce.position = { x: 100, y: 100 };
        victim.position = { x: 100 + 3 * 48, y: 100 };
        const bigHp = 10_000;
        victim.maxHealth = bigHp;
        victim.health = bigHp;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        for (let i = 0; i < 30; i++) m.update(0.05);

        const expectedTotal =
          ABILITY.BRUCE_FIRE_BREATH.DAMAGE_TICK_COUNT * ABILITY.BRUCE_FIRE_BREATH.DAMAGE_PER_TICK;
        expect(victim.health).toBe(bigHp - expectedTotal);
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

    describe('Frost Wizard freeze', () => {
      it('freezes the nearest opponent and starts the wizard cooldown', () => {
        const m = startActiveWithCharacters('frost_wizard', 'bruce');
        const wizard = m.players.get('player-0')!;
        const target = m.players.get('player-1')!;
        expect(target.frozenTimer).toBe(0);
        expect(wizard.abilityCooldownSeconds).toBe(0);

        m.queueInput('player-0', makeInput(1, { abilityPressed: true }));
        m.update(0.001);

        expect(target.frozenTimer).toBeGreaterThan(0);
        expect(target.frozenTimer).toBeCloseTo(ABILITY.FROST_WIZARD_FREEZE.DURATION, 2);
        // Frost Lock has no active window — only cooldown advances.
        expect(wizard.abilityActiveSeconds).toBe(0);
        expect(wizard.abilityCooldownSeconds).toBeCloseTo(ABILITY.FROST_WIZARD_FREEZE.COOLDOWN, 2);
      });

      it('is a no-op when on cooldown — second press does nothing', () => {
        const m = startActiveWithCharacters('frost_wizard', 'bruce');
        const wizard = m.players.get('player-0')!;
        const target = m.players.get('player-1')!;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true }));
        m.update(0.05);
        // Let the freeze fully tick down so we can prove it doesn't refresh.
        m.update(ABILITY.FROST_WIZARD_FREEZE.DURATION + 0.5);
        expect(target.frozenTimer).toBe(0);
        expect(wizard.abilityCooldownSeconds).toBeGreaterThan(0);

        m.queueInput('player-0', makeInput(2, { abilityPressed: true }));
        m.update(0.05);

        // Second press should not freeze the target again — still on cooldown.
        expect(target.frozenTimer).toBe(0);
      });

      it('does not consume the cooldown if no living opponents exist', () => {
        const m = startActiveWithCharacters('frost_wizard', 'bruce');
        const wizard = m.players.get('player-0')!;
        const target = m.players.get('player-1')!;
        target.isDead = true;
        target.respawnTimer = 5;

        m.queueInput('player-0', makeInput(1, { abilityPressed: true }));
        m.update(0.001);

        expect(wizard.abilityCooldownSeconds).toBe(0);
        expect(target.frozenTimer).toBe(0);
      });

      it('clears frozenTimer on respawn', () => {
        const m = startActiveWithCharacters('frost_wizard', 'bruce');
        const target = m.players.get('player-1')!;
        target.frozenTimer = ABILITY.FROST_WIZARD_FREEZE.DURATION;

        m.onKill('player-0', 'player-1', 'gun');
        // Advance past the respawn delay so the player respawns.
        m.update(RESPAWN.DELAY + 0.05);

        expect(target.isDead).toBe(false);
        expect(target.frozenTimer).toBe(0);
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
  describe('shotgun weapon system', () => {
    /**
     * 10x10 open map with a shotgun spawn at tile (5,5) -> world (264,264)
     * and a bandage at (3,3) -> world (168,168).
     */
    function makeWeaponMapData(): MapData {
      return {
        ...makeMapData(),
        pickupSpawns: [
          { x: 5, y: 5, type: 'weapon_shotgun' as const },
          { x: 3, y: 3, type: 'bandage' as const },
        ],
      };
    }

    function startActiveWeaponMatch(): Match {
      const m = new Match('match-sg', makeWeaponMapData(), [
        { id: 'player-0', nickname: 'P0' },
        { id: 'player-1', nickname: 'P1' },
      ]);
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    /** Advance the match in small ticks (keeps announce-crossing detectable). */
    function advance(m: Match, seconds: number, step = 0.1): void {
      let remaining = seconds;
      while (remaining > 0) {
        const dt = Math.min(step, remaining);
        m.update(dt);
        remaining -= dt;
      }
    }

    /** Put a shotgun with full shells directly in the player's hands. */
    function equipShotgun(m: Match, playerId: string): void {
      const player = m.players.get(playerId)!;
      player.weaponId = 'shotgun';
      player.specialAmmo = WEAPONS.shotgun.magazineSize;
      player.specialReserve = WEAPONS.shotgun.pickupAmmo - WEAPONS.shotgun.magazineSize;
    }

    describe('map spawn + announcement', () => {
      it('starts the match with the shotgun pickup inactive on its respawn timer', () => {
        const m = startActiveWeaponMatch();
        const shotgunPickup = m.pickupManager
          .getPickups()
          .find((p) => p.type === 'weapon_shotgun')!;
        expect(shotgunPickup.isActive).toBe(false);
        expect(shotgunPickup.respawnTimer).toBeGreaterThan(0);
      });

      it('emits exactly one weaponIncoming warning ~5s before landing, then activates', () => {
        const m = startActiveWeaponMatch();
        // The countdown tick already consumed some time; drain any warnings
        // (there should be none this early).
        expect(m.consumeTickWeaponIncoming()).toHaveLength(0);

        const warnings: Array<{ weaponId: string; landsInMs: number }> = [];
        let remaining = PICKUP.WEAPON_RESPAWN_TIME + 1;
        while (remaining > 0) {
          m.update(0.1);
          warnings.push(...m.consumeTickWeaponIncoming());
          remaining -= 0.1;
        }

        expect(warnings).toHaveLength(1);
        expect(warnings[0].weaponId).toBe('shotgun');
        expect(warnings[0].landsInMs).toBeGreaterThan(0);
        expect(warnings[0].landsInMs).toBeLessThanOrEqual(PICKUP.WEAPON_ANNOUNCE_LEAD * 1000);

        const shotgunPickup = m.pickupManager
          .getPickups()
          .find((p) => p.type === 'weapon_shotgun')!;
        expect(shotgunPickup.isActive).toBe(true);
      });
    });

    describe('pickup / equip', () => {
      it('auto-equips with full shells when the player walks over it', () => {
        const m = startActiveWeaponMatch();
        advance(m, PICKUP.WEAPON_RESPAWN_TIME + 0.5);

        const player = m.players.get('player-0')!;
        player.position = { x: 5 * 48 + 24, y: 5 * 48 + 24 };
        m.update(0.05);

        expect(player.weaponId).toBe('shotgun');
        expect(player.specialAmmo).toBe(WEAPONS.shotgun.magazineSize);
        expect(player.specialReserve).toBe(
          WEAPONS.shotgun.pickupAmmo - WEAPONS.shotgun.magazineSize,
        );
        // Rifle magazine untouched by the equip.
        expect(player.ammo).toBe(WEAPONS.rifle.magazineSize);
        expect(m.getTickPickupCollections().some((c) => c.playerId === 'player-0')).toBe(true);
      });
    });

    describe('firing + racking', () => {
      it('fires pelletCount trails per blast, all tagged shotgun', () => {
        const m = startActiveWeaponMatch();
        equipShotgun(m, 'player-0');

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);

        const trails = m.getTickBulletTrails();
        expect(trails).toHaveLength(WEAPONS.shotgun.pelletCount);
        for (const trail of trails) {
          expect(trail.weaponId).toBe('shotgun');
        }
        expect(m.players.get('player-0')!.specialAmmo).toBe(WEAPONS.shotgun.magazineSize - 1);
      });

      it('pump-racking blocks a second shot until fireCooldown elapses', () => {
        const m = startActiveWeaponMatch();
        equipShotgun(m, 'player-0');
        const player = m.players.get('player-0')!;

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);
        expect(player.specialAmmo).toBe(1);

        // Immediate re-fire: still racking -> refused.
        m.queueInput('player-0', makeInput(2, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);
        expect(player.specialAmmo).toBe(1);

        // Wait out the racking, then fire again.
        advance(m, WEAPONS.shotgun.fireCooldown, 0.05);
        m.queueInput('player-0', makeInput(3, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);
        expect(player.specialAmmo).toBe(0);
      });

      it('auto-reloads from reserve when the mag empties, refusing fire mid-reload', () => {
        const m = startActiveWeaponMatch();
        equipShotgun(m, 'player-0');
        const player = m.players.get('player-0')!;

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);
        advance(m, WEAPONS.shotgun.fireCooldown, 0.05);
        m.queueInput('player-0', makeInput(2, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);

        // Mag is dry with reserve remaining -> auto-reload started.
        expect(player.specialAmmo).toBe(0);
        expect(player.isReloading).toBe(true);

        // Firing during the reload is refused.
        m.queueInput('player-0', makeInput(3, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);
        expect(m.getTickBulletTrails()).toHaveLength(0);

        // Reload completes: mag refilled from reserve.
        advance(m, WEAPONS.shotgun.reloadTime, 0.05);
        expect(player.isReloading).toBe(false);
        expect(player.specialAmmo).toBe(WEAPONS.shotgun.magazineSize);
        expect(player.specialReserve).toBe(
          WEAPONS.shotgun.pickupAmmo - 2 * WEAPONS.shotgun.magazineSize,
        );
      });

      it('reverts to the rifle when the last shell is spent', () => {
        const m = startActiveWeaponMatch();
        equipShotgun(m, 'player-0');
        const player = m.players.get('player-0')!;
        player.specialAmmo = 1;
        player.specialReserve = 0;

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(player.weaponId).toBe('rifle');
        expect(player.specialAmmo).toBe(0);
        expect(player.specialReserve).toBe(0);
        // Rifle mag was stowed untouched -> no forced reload.
        expect(player.ammo).toBe(WEAPONS.rifle.magazineSize);
        expect(player.isReloading).toBe(false);
      });

      it('starts a rifle reload on revert if the stowed rifle mag was empty', () => {
        const m = startActiveWeaponMatch();
        equipShotgun(m, 'player-0');
        const player = m.players.get('player-0')!;
        player.ammo = 0;
        player.specialAmmo = 1;
        player.specialReserve = 0;

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(player.weaponId).toBe('rifle');
        expect(player.isReloading).toBe(true);
      });

      it('death drops the shotgun and respawn is back on the rifle', () => {
        const m = startActiveWeaponMatch();
        equipShotgun(m, 'player-0');
        const player = m.players.get('player-0')!;

        m.onKill('player-1', 'player-0', 'gun');
        expect(player.weaponId).toBe('rifle');
        expect(player.specialAmmo).toBe(0);

        advance(m, RESPAWN.DELAY + 0.2, 0.05);
        expect(player.isDead).toBe(false);
        expect(player.weaponId).toBe('rifle');
        expect(player.ammo).toBe(WEAPONS.rifle.magazineSize);
      });
    });

    describe('damage + attribution', () => {
      it('point-blank blast sums pellet damage; stats count one shot and one hit', () => {
        const m = startActiveWeaponMatch();
        equipShotgun(m, 'player-0');
        const shooter = m.players.get('player-0')!;
        const victim = m.players.get('player-1')!;
        shooter.position = { x: 100, y: 100 };
        victim.position = { x: 150, y: 100 };
        victim.invulnerableTimer = 0;
        const startHp = victim.health;

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);

        const damage = startHp - victim.health;
        // All pellets land at ~50px: total well above a single pellet's max.
        expect(damage).toBeGreaterThan(WEAPONS.shotgun.damageMax);
        const confirmedTrails = m
          .getTickBulletTrails()
          .filter((trail) => trail.hitPlayerId === 'player-1');
        expect(confirmedTrails.length).toBeGreaterThan(1);
        expect(confirmedTrails.reduce((sum, trail) => sum + trail.damageApplied, 0)).toBeCloseTo(
          damage,
          5,
        );
        const stats = m.stats.getStats('player-0');
        expect(stats.shotsFired).toBe(1);
        expect(stats.shotsHit).toBe(1);
        expect(stats.damageDealt).toBeCloseTo(damage, 5);
      });

      it('a shotgun kill is attributed to shotgun in stats and the kill feed', () => {
        const m = startActiveWeaponMatch();
        equipShotgun(m, 'player-0');
        const shooter = m.players.get('player-0')!;
        const victim = m.players.get('player-1')!;
        shooter.position = { x: 100, y: 100 };
        victim.position = { x: 150, y: 100 };
        victim.invulnerableTimer = 0;
        victim.health = 10;

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(victim.isDead).toBe(true);
        // The victim died exactly once even though multiple pellets connected.
        expect(victim.deaths).toBe(1);
        const trails = m.getTickBulletTrails();
        expect(trails.some((trail) => trail.hitPlayerId === 'player-1')).toBe(true);
        expect(
          trails.some((trail) => trail.hitPlayerId === null && trail.damageApplied === 0),
        ).toBe(true);
        const stats = m.stats.getStats('player-0');
        expect(stats.killsByWeapon.shotgun).toBe(1);
        expect(stats.kills).toBe(1);
        const entry = m.getKillFeed().find((e) => e.victimId === 'player-1')!;
        expect(entry.weapon).toBe('shotgun');
      });

      it('shotgun pellets stop at walls', () => {
        const map = makeWeaponMapData();
        // Vertical wall at column 5.
        for (let row = 1; row < 9; row++) map.tiles[row][5] = 1;
        map.pickupSpawns = [];
        const m = new Match('match-sg-wall', map, [
          { id: 'player-0', nickname: 'P0' },
          { id: 'player-1', nickname: 'P1' },
        ]);
        m.startCountdown();
        m.update(MATCH.COUNTDOWN_DURATION + 0.05);
        equipShotgun(m, 'player-0');
        const shooter = m.players.get('player-0')!;
        const victim = m.players.get('player-1')!;
        shooter.position = { x: 2.5 * 48, y: 4.5 * 48 };
        victim.position = { x: 7.5 * 48, y: 4.5 * 48 };
        victim.invulnerableTimer = 0;
        const startHp = victim.health;

        m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.05);

        expect(victim.health).toBe(startHp);
      });
    });

    describe('bandage pickup', () => {
      it('heals BANDAGE_HEAL capped at max health and starts its respawn timer', () => {
        const m = startActiveWeaponMatch();
        const player = m.players.get('player-0')!;
        player.health = 50;
        player.position = { x: 3 * 48 + 24, y: 3 * 48 + 24 };
        m.update(0.05);

        expect(player.health).toBe(Math.min(player.maxHealth, 50 + PICKUP.BANDAGE_HEAL));
        const bandage = m.pickupManager.getPickups().find((p) => p.type === 'bandage')!;
        expect(bandage.isActive).toBe(false);
        expect(bandage.respawnTimer).toBeCloseTo(PICKUP.BANDAGE_RESPAWN_TIME, 1);
      });

      it('is not consumed at full health', () => {
        const m = startActiveWeaponMatch();
        const player = m.players.get('player-0')!;
        player.position = { x: 3 * 48 + 24, y: 3 * 48 + 24 };
        m.update(0.05);

        expect(player.health).toBe(player.maxHealth);
        const bandage = m.pickupManager.getPickups().find((p) => p.type === 'bandage')!;
        expect(bandage.isActive).toBe(true);
      });

      it('respawns on its own timer after collection', () => {
        const m = startActiveWeaponMatch();
        const player = m.players.get('player-0')!;
        player.health = 50;
        player.position = { x: 3 * 48 + 24, y: 3 * 48 + 24 };
        m.update(0.05);
        // Step away so the respawned bandage isn't instantly re-collected.
        player.position = { x: 100, y: 400 };

        advance(m, PICKUP.BANDAGE_RESPAWN_TIME + 0.5);
        const bandage = m.pickupManager.getPickups().find((p) => p.type === 'bandage')!;
        expect(bandage.isActive).toBe(true);
      });
    });
  });

  describe('overtime (sudden death)', () => {
    function startActiveMatchForOvertime(): Match {
      const m = createMatch();
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    it('a tie at time-out enters overtime instead of ending', () => {
      const m = startActiveMatchForOvertime();
      // Run the clock out with scores 0-0, deaths 0-0 — a genuine tie.
      m.update(MATCH.TIME_LIMIT + 1);

      expect(m.phase).toBe(MatchPhase.ACTIVE);
      expect(m.isOvertime).toBe(true);
      expect(m.matchTimer).toBeCloseTo(OVERTIME.DURATION, 5);

      // The one-shot announcement is queued exactly once.
      expect(m.consumeTickOvertimeStart()).toEqual({
        overtimeEndsInMs: OVERTIME.DURATION * 1000,
      });
      expect(m.consumeTickOvertimeStart()).toBeNull();
    });

    it('everyone gets a fresh single life at overtime start, dead players included', () => {
      const m = startActiveMatchForOvertime();
      m.update(MATCH.TIME_LIMIT - 1);
      // Mutual kill just before the horn: scores 1-1, deaths 1-1, both dead.
      m.onKill('player-0', 'player-1', 'gun');
      m.onKill('player-1', 'player-0', 'gun');
      m.update(1.5); // clock hits 0 while both are still down

      expect(m.isOvertime).toBe(true);
      for (const p of m.players.values()) {
        expect(p.isDead).toBe(false);
        expect(p.health).toBe(p.maxHealth);
        expect(p.weaponId).toBe('rifle');
      }
    });

    it('the first overtime kill ends the match immediately, killer wins', () => {
      const m = startActiveMatchForOvertime();
      m.update(MATCH.TIME_LIMIT + 1);
      expect(m.isOvertime).toBe(true);

      m.onKill('player-1', 'player-0', 'gun');
      expect(m.checkMatchEnd()).toBe(true);
      expect(m.phase).toBe(MatchPhase.ENDED);

      const result = m.getResult();
      expect(result.winnerId).toBe('player-1');
      expect(result.wentToOvertime).toBe(true);
    });

    it('overtime expiring with no kill ends as a true draw', () => {
      const m = startActiveMatchForOvertime();
      m.update(MATCH.TIME_LIMIT + 1);
      m.update(OVERTIME.DURATION + 1);

      expect(m.phase).toBe(MatchPhase.ENDED);
      const result = m.getResult();
      expect(result.winnerId).toBeNull();
      expect(result.wentToOvertime).toBe(true);
      // Duration counts regulation plus the full overtime.
      expect(result.duration).toBeCloseTo(MATCH.TIME_LIMIT + OVERTIME.DURATION, 5);
    });

    it('does not enter overtime when the scoreboard has a winner at time-out', () => {
      const m = startActiveMatchForOvertime();
      m.onKill('player-0', 'player-1', 'gun'); // 1-0
      m.update(MATCH.TIME_LIMIT + 1);

      expect(m.isOvertime).toBe(false);
      expect(m.phase).toBe(MatchPhase.ENDED);
      const result = m.getResult();
      expect(result.winnerId).toBe('player-0');
      expect(result.wentToOvertime).toBe(false);
    });

    it('freezes respawns during overtime (single life)', () => {
      const m = startActiveMatchForOvertime();
      m.update(MATCH.TIME_LIMIT + 1);
      expect(m.isOvertime).toBe(true);

      // Simulate the FFA no-kill-credit death path (no overtime winner set).
      const p0 = m.players.get('player-0')!;
      p0.isDead = true;
      p0.respawnTimer = RESPAWN.DELAY;
      m.update(RESPAWN.DELAY + 1);

      expect(p0.isDead).toBe(true);
      expect(p0.respawnTimer).toBe(RESPAWN.DELAY);
    });

    it('activates no new mutators during overtime', () => {
      const m = startActiveMatchForOvertime();
      m.update(0.05);
      m.consumeTickMutatorWarnings();
      m.consumeTickMutatorStarts();

      // Mid-clock tie: both reach the kill target the same tick.
      for (const p of m.players.values()) p.score = MATCH.KILL_TARGET;
      m.checkMatchEnd();
      expect(m.isOvertime).toBe(true);

      // Ungated, both mutator slots would fire immediately (elapsed is deep
      // past the mid-match window and matchTimer sits under the
      // final-minute threshold).
      let warnings = 0;
      let starts = 0;
      for (let i = 0; i < 100; i++) {
        m.update(0.05);
        warnings += m.consumeTickMutatorWarnings().length;
        starts += m.consumeTickMutatorStarts().length;
      }
      expect(warnings).toBe(0);
      expect(starts).toBe(0);
    });
  });

  describe('KOTH mode integration', () => {
    function makeKothMapData(): MapData {
      return {
        ...makeMapData(),
        kothHills: [
          { x: 4, y: 4 },
          { x: 1, y: 1 },
          { x: 7, y: 7 },
        ],
      };
    }

    function startActiveKothMatch(): Match {
      const m = new Match(
        'koth-1',
        makeKothMapData(),
        [
          { id: 'player-0', nickname: 'P0' },
          { id: 'player-1', nickname: 'P1' },
        ],
        GameModeType.KOTH,
      );
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    it('broadcasts hill state and scores sole occupancy through the real tick', () => {
      const m = startActiveKothMatch();
      const initial = m.getKothHudState();
      expect(initial).not.toBeNull();
      expect(initial!.hill).toEqual({ x: 4, y: 4 });

      // Park player-0 in the hill center (hill spans 192..288px), the
      // opponent far outside.
      const p0 = m.players.get('player-0')!;
      const p1 = m.players.get('player-1')!;
      p0.position = { x: 5 * 48, y: 5 * 48 };
      p1.position = { x: 8.5 * 48, y: 1.5 * 48 };

      for (let i = 0; i < 25; i++) m.update(0.05); // 1.25s
      expect(p0.score).toBe(1);
      expect(p1.score).toBe(0);
      expect(m.getKothHudState()!.occupantId).toBe('player-0');
    });

    it('ends at the hill score target with the leader as winner', () => {
      const m = startActiveKothMatch();
      m.players.get('player-0')!.score = KOTH.SCORE_TARGET;

      expect(m.checkMatchEnd()).toBe(true);
      const result = m.getResult();
      expect(result.gameMode).toBe(GameModeType.KOTH);
      expect(result.winnerId).toBe('player-0');
    });

    it('retires the hill during overtime', () => {
      const m = startActiveKothMatch();
      // Park both players outside every declared hill so the clock can run
      // out at 0-0 (a random spawn point may sit inside one).
      for (const p of m.players.values()) {
        p.position = { x: 8.5 * 48, y: 1.5 * 48 };
      }
      m.update(MATCH.TIME_LIMIT + 1); // 0-0 hill points → tie → overtime

      expect(m.isOvertime).toBe(true);
      expect(m.getKothHudState()).toBeNull();
    });

    it('deathmatch matches broadcast no koth state', () => {
      const m = createMatch();
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      expect(m.getKothHudState()).toBeNull();
    });

    it('broadcasts no hill state before ACTIVE (onStart has not initialized hills)', () => {
      const m = new Match(
        'koth-cd',
        makeKothMapData(),
        [
          { id: 'player-0', nickname: 'P0' },
          { id: 'player-1', nickname: 'P1' },
        ],
        GameModeType.KOTH,
      );
      expect(m.getKothHudState()).toBeNull(); // character select
      m.startCountdown();
      m.update(0.05);
      expect(m.getKothHudState()).toBeNull(); // countdown
    });
  });

  describe('Session 6: stat identities + Bubba/Jack abilities', () => {
    /** Lock arbitrary roster characters and run the match to ACTIVE. */
    function startActiveWithRoster(p0Char: CharacterId, p1Char: CharacterId): Match {
      const m = createMatch();
      m.setLock('player-0', p0Char);
      m.setLock('player-1', p1Char);
      m.update(0.05); // commits the locks → COUNTDOWN
      m.update(MATCH.COUNTDOWN_DURATION + 0.05); // → ACTIVE
      return m;
    }

    describe('per-character max HP', () => {
      it('commits the character HP pool when the lock lands', () => {
        const m = startActiveWithRoster('bubba', 'frost_wizard');
        const bubba = m.players.get('player-0')!;
        const wizard = m.players.get('player-1')!;
        expect(bubba.maxHealth).toBe(CHARACTERS.bubba.maxHealth);
        expect(bubba.health).toBe(CHARACTERS.bubba.maxHealth);
        expect(wizard.maxHealth).toBe(CHARACTERS.frost_wizard.maxHealth);
        expect(wizard.health).toBe(CHARACTERS.frost_wizard.maxHealth);
      });

      it('respawn refills to the character pool, not the baseline', () => {
        const m = startActiveWithRoster('bubba', 'mighty_man');
        const bubba = m.players.get('player-0')!;
        m.onKill('player-1', 'player-0', 'gun');
        const respawnTicks = Math.ceil(RESPAWN.DELAY / 0.05) + 1;
        for (let i = 0; i < respawnTicks; i++) m.update(0.05);
        expect(bubba.isDead).toBe(false);
        expect(bubba.health).toBe(CHARACTERS.bubba.maxHealth);
      });
    });

    describe('per-character speed', () => {
      /** Distance traveled from one full-right input over a single tick. */
      function distancePerTick(char: CharacterId): number {
        // Lock-to-one rule: the opponent must pick a different character.
        const m = startActiveWithRoster(char, char === 'mighty_man' ? 'bruce' : 'mighty_man');
        const p0 = m.players.get('player-0')!;
        p0.position = { x: 200, y: 200 };
        m.queueInput('player-0', makeInput(1, { moveX: 1 }));
        const dt = 0.05;
        m.update(dt);
        return p0.position.x - 200;
      }

      it('moves each character at BASE_SPEED × its multiplier', () => {
        expect(distancePerTick('mighty_man')).toBeCloseTo(PLAYER.BASE_SPEED * 0.05, 5);
        expect(distancePerTick('bubba')).toBeCloseTo(
          PLAYER.BASE_SPEED * CHARACTERS.bubba.speedMultiplier * 0.05,
          5,
        );
        expect(distancePerTick('frost_wizard')).toBeCloseTo(
          PLAYER.BASE_SPEED * CHARACTERS.frost_wizard.speedMultiplier * 0.05,
          5,
        );
        expect(distancePerTick('rook')).toBeCloseTo(
          PLAYER.BASE_SPEED * CHARACTERS.rook.speedMultiplier * 0.05,
          5,
        );
      });
    });

    describe('per-character hitbox (live hits)', () => {
      /**
       * Grazing shot 14px off the victim's center: outside a 24px box
       * (half 12), inside Bubba's 30px one (half 15).
       */
      function grazeVictim(m: Match): void {
        const p0 = m.players.get('player-0')!;
        const p1 = m.players.get('player-1')!;
        p0.position = { x: 100, y: 100 };
        p1.position = { x: 250, y: 114 };
      }

      it('the graze hits Bubba but not a 24px character', () => {
        const hitMatch = startActiveWithRoster('mighty_man', 'bubba');
        grazeVictim(hitMatch);
        const bubba = hitMatch.players.get('player-1')!;
        hitMatch.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        hitMatch.update(0.05);
        expect(bubba.health).toBeLessThan(bubba.maxHealth);

        const missMatch = startActiveWithRoster('mighty_man', 'jack');
        grazeVictim(missMatch);
        const jack = missMatch.players.get('player-1')!;
        missMatch.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
        missMatch.update(0.05);
        expect(jack.health).toBe(jack.maxHealth);
      });

      it("Bruce's fire breath also honors the wider box", () => {
        // Breath along y=100; victim offset 26px: outside 12 + 7 (=19)
        // for a 24px character, inside 15 + 7 (=22)... 26 > 22, so use
        // 21px: outside 19, inside 22.
        const m = startActiveWithRoster('bruce', 'bubba');
        const bruce = m.players.get('player-0')!;
        const bubba = m.players.get('player-1')!;
        bruce.position = { x: 100, y: 100 };
        bubba.position = { x: 196, y: 121 };
        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.05);
        expect(bubba.health).toBeLessThan(bubba.maxHealth);

        const control = startActiveWithRoster('bruce', 'mighty_man');
        const cBruce = control.players.get('player-0')!;
        const victim = control.players.get('player-1')!;
        cBruce.position = { x: 100, y: 100 };
        victim.position = { x: 196, y: 121 };
        control.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        control.update(0.05);
        expect(victim.health).toBe(victim.maxHealth);
      });
    });

    describe('Bubba: Iron Hide', () => {
      function activateIronHide(m: Match, seq = 1): void {
        m.queueInput('player-0', makeInput(seq, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.001);
      }

      it('activates with the roadmap window and a from-activation cooldown', () => {
        const m = startActiveWithRoster('bubba', 'mighty_man');
        const bubba = m.players.get('player-0')!;
        activateIronHide(m);
        expect(bubba.abilityActiveSeconds).toBeCloseTo(ABILITY.BUBBA_IRON_HIDE.DURATION, 2);
        expect(bubba.abilityCooldownSeconds).toBeCloseTo(ABILITY.BUBBA_IRON_HIDE.COOLDOWN, 2);
      });

      it('halves rifle damage while active (control: full damage after expiry)', () => {
        const m = startActiveWithRoster('bubba', 'mighty_man');
        const bubba = m.players.get('player-0')!;
        const shooter = m.players.get('player-1')!;
        bubba.position = { x: 250, y: 100 };
        shooter.position = { x: 100, y: 100 };

        activateIronHide(m);
        m.queueInput('player-1', makeInput(1, { firePressed: true, aimAngle: 0 }));
        m.update(0.001);
        const damagedWhileActive = bubba.maxHealth - bubba.health;
        expect(damagedWhileActive).toBeGreaterThan(0);
        const confirmedTrail = m.getTickBulletTrails()[0];
        expect(confirmedTrail.hitPlayerId).toBe('player-0');
        expect(confirmedTrail.damageApplied).toBeCloseTo(damagedWhileActive, 10);

        // Let the window (and the burst) fully expire, then shoot again
        // from the same spot: same distance → same raw damage, now unhalved.
        bubba.health = bubba.maxHealth;
        for (let i = 0; i < 120; i++) m.update(0.05);
        expect(bubba.abilityActiveSeconds).toBe(0);
        bubba.health = bubba.maxHealth;

        m.queueInput('player-1', makeInput(2, { firePressed: true, aimAngle: 0 }));
        m.update(0.001);
        const damagedAfterExpiry = bubba.maxHealth - bubba.health;
        expect(damagedAfterExpiry).toBeCloseTo(damagedWhileActive * 2, 5);
      });

      it('halves grenade damage while active', () => {
        const m = startActiveWithRoster('bubba', 'mighty_man');
        const bubba = m.players.get('player-0')!;
        const thrower = m.players.get('player-1')!;
        // Stand apart so the throw arms cleanly, then detonate point-blank.
        bubba.position = { x: 200, y: 100 };
        thrower.position = { x: 148, y: 100 };

        activateIronHide(m);
        m.queueInput('player-1', makeInput(1, { throwPressed: true, aimAngle: 0 }));
        m.update(0.001);
        m.queueInput('player-1', makeInput(2, { detonatePressed: true }));
        m.update(0.001);

        const taken = bubba.maxHealth - bubba.health;
        expect(taken).toBeGreaterThan(0);
        // A near-point-blank grenade deals close to full 100 damage raw;
        // halved it can never exceed 50.
        expect(taken).toBeLessThanOrEqual(GRENADE.DAMAGE / 2);
        expect(bubba.isDead).toBe(false);
      });

      it("halves Bruce's fire breath and Jack's axe (choke-point coverage)", () => {
        const fire = startActiveWithRoster('bubba', 'bruce');
        const fBubba = fire.players.get('player-0')!;
        const fBruce = fire.players.get('player-1')!;
        fBubba.position = { x: 250, y: 100 };
        fBruce.position = { x: 100, y: 100 };
        activateIronHide(fire);
        fire.queueInput('player-1', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        fire.update(0.001);
        expect(fBubba.maxHealth - fBubba.health).toBeCloseTo(
          ABILITY.BRUCE_FIRE_BREATH.DAMAGE_PER_TICK / 2,
          5,
        );

        const axe = startActiveWithRoster('bubba', 'jack');
        const aBubba = axe.players.get('player-0')!;
        const aJack = axe.players.get('player-1')!;
        aBubba.position = { x: 250, y: 100 };
        aJack.position = { x: 100, y: 100 };
        activateIronHide(axe);
        axe.queueInput('player-1', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        // Fly the axe into Bubba (150px at 520px/s ≈ 0.29s).
        for (let i = 0; i < 10; i++) axe.update(0.05);
        expect(aBubba.maxHealth - aBubba.health).toBeCloseTo(ABILITY.JACK_AXE_THROW.DAMAGE / 2, 5);
      });

      it('death cancels the active window but the cooldown keeps running', () => {
        const m = startActiveWithRoster('bubba', 'mighty_man');
        const bubba = m.players.get('player-0')!;
        activateIronHide(m);
        m.onKill('player-1', 'player-0', 'gun');
        expect(bubba.abilityActiveSeconds).toBe(0);
        expect(bubba.abilityCooldownSeconds).toBeGreaterThan(0);
      });
    });

    describe('Jack: Axe Throw', () => {
      it('spawns an axe along the aim angle and starts the 12s cooldown', () => {
        const m = startActiveWithRoster('jack', 'mighty_man');
        const jack = m.players.get('player-0')!;
        jack.position = { x: 200, y: 200 };

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: Math.PI / 2 }));
        m.update(0.001);

        const axes = m.getActiveAxes();
        expect(axes).toHaveLength(1);
        expect(axes[0].throwerId).toBe('player-0');
        expect(axes[0].angle).toBeCloseTo(Math.PI / 2, 5);
        expect(jack.abilityCooldownSeconds).toBeCloseTo(ABILITY.JACK_AXE_THROW.COOLDOWN, 2);
        // Instant cast — no active window (HUD animates only the cooldown arc).
        expect(jack.abilityActiveSeconds).toBe(0);
      });

      it('a direct hit deals 60, attributes the kill to the axe, and retires the axe', () => {
        const m = startActiveWithRoster('jack', 'frost_wizard');
        const jack = m.players.get('player-0')!;
        const victim = m.players.get('player-1')!;
        jack.position = { x: 100, y: 100 };
        victim.position = { x: 250, y: 100 };
        victim.health = 50; // one axe (60) is lethal

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        for (let i = 0; i < 10; i++) m.update(0.05);

        expect(victim.isDead).toBe(true);
        expect(m.getActiveAxes()).toHaveLength(0);
        expect(m.stats.getStats('player-0').killsByWeapon.axe).toBe(1);
        const feed = m.getKillFeed();
        expect(feed[feed.length - 1].weapon).toBe('axe');
      });

      it('lands (despawns) after ~6 tiles without a hit', () => {
        const m = startActiveWithRoster('jack', 'mighty_man');
        const jack = m.players.get('player-0')!;
        const bystander = m.players.get('player-1')!;
        jack.position = { x: 100, y: 100 };
        bystander.position = { x: 100 + 8 * 48, y: 300 }; // far off-line

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.001);
        expect(m.getActiveAxes()).toHaveLength(1);

        // 288px at 520px/s ≈ 0.55s of flight; run a full second.
        for (let i = 0; i < 20; i++) m.update(0.05);
        expect(m.getActiveAxes()).toHaveLength(0);
        expect(bystander.health).toBe(bystander.maxHealth);
      });

      it('cooldown gates a second throw', () => {
        const m = startActiveWithRoster('jack', 'mighty_man');
        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.001);
        m.queueInput('player-0', makeInput(2, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.001);
        expect(m.getActiveAxes()).toHaveLength(1);
      });

      it('overtime entry clears in-flight axes with the other regulation leftovers', () => {
        const m = startActiveWithRoster('jack', 'mighty_man');
        const jack = m.players.get('player-0')!;
        const opponent = m.players.get('player-1')!;
        // Keep the opponent far off the flight line so the axe stays live.
        jack.position = { x: 100, y: 100 };
        opponent.position = { x: 100, y: 400 };

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.001);
        expect(m.getActiveAxes()).toHaveLength(1);

        // Expire regulation on the NEXT small tick, while the axe has
        // flown only a few px of its 288px range — 0-0 → tie → overtime.
        m.matchTimer = 0.01;
        m.update(0.05);
        expect(m.isOvertime).toBe(true);
        expect(m.getActiveAxes()).toHaveLength(0);
      });
    });

    describe('Rook: Breach Dash', () => {
      it('moves three tiles along aim and starts the short cooldown', () => {
        const m = startActiveWithRoster('rook', 'mighty_man');
        const rook = m.players.get('player-0')!;
        rook.position = { x: 200, y: 200 };

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.001);

        expect(rook.position.x).toBeCloseTo(
          200 + ABILITY.ROOK_BREACH_DASH.DISTANCE_TILES * 48,
          5,
        );
        expect(rook.position.y).toBeCloseTo(200, 5);
        expect(rook.abilityCooldownSeconds).toBeCloseTo(
          ABILITY.ROOK_BREACH_DASH.COOLDOWN,
          2,
        );
        expect(rook.abilityActiveSeconds).toBe(0);
      });

      it('cannot dash again during cooldown', () => {
        const m = startActiveWithRoster('rook', 'mighty_man');
        const rook = m.players.get('player-0')!;
        rook.position = { x: 200, y: 200 };
        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.001);

        rook.position = { x: 200, y: 200 };
        m.queueInput('player-0', makeInput(2, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.001);
        expect(rook.position).toEqual({ x: 200, y: 200 });
      });

      it('refunds a point-blank dash into the map boundary', () => {
        const m = startActiveWithRoster('rook', 'mighty_man');
        const rook = m.players.get('player-0')!;
        rook.position = { x: 10 * 48 - PLAYER.HITBOX_WIDTH / 2, y: 200 };

        m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
        m.update(0.001);

        expect(rook.position.x).toBe(10 * 48 - PLAYER.HITBOX_WIDTH / 2);
        expect(rook.abilityCooldownSeconds).toBe(0);
      });
    });
  });

  describe('Session 7: punch melee', () => {
    function startActivePunchMatch(playerCount = 2): Match {
      const m = createMatch(playerCount);
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    /** Advance the match in small fixed ticks. */
    function advance(m: Match, seconds: number, step = 0.05): void {
      let remaining = seconds;
      while (remaining > 0) {
        const dt = Math.min(step, remaining);
        m.update(dt);
        remaining -= dt;
      }
    }

    function equipPunch(m: Match, playerId: string): void {
      m.players.get(playerId)!.weaponId = 'punch';
    }

    it('one swing deals ONE flat application per victim, no trails, event with hit:true', () => {
      const m = startActivePunchMatch();
      equipPunch(m, 'player-0');
      const puncher = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      puncher.position = { x: 100, y: 100 };
      // Point-blank on the aim line: several fan rays cross the box, but
      // the victim must absorb exactly one 60-damage application.
      victim.position = { x: 150, y: 100 };
      victim.invulnerableTimer = 0;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(victim.health).toBe(victim.maxHealth - WEAPONS.punch.damageMax);
      expect(m.getTickBulletTrails()).toHaveLength(0);
      const events = m.getTickPunchEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        playerId: 'player-0',
        position: { x: 100, y: 100 },
        aimAngle: 0,
        hit: true,
      });
      const stats = m.stats.getStats('player-0');
      expect(stats.shotsFired).toBe(1);
      expect(stats.shotsHit).toBe(1);
      expect(stats.damageDealt).toBe(WEAPONS.punch.damageMax);
    });

    it('a whiff past melee reach emits the event with hit:false and harms nobody', () => {
      const m = startActivePunchMatch();
      equipPunch(m, 'player-0');
      const puncher = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      puncher.position = { x: 100, y: 100 };
      victim.position = { x: 200, y: 100 }; // box face at 88px > 56px reach
      victim.invulnerableTimer = 0;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(victim.health).toBe(victim.maxHealth);
      // Thrower exclusion: the fan can never hit the puncher themselves.
      expect(puncher.health).toBe(puncher.maxHealth);
      const events = m.getTickPunchEvents();
      expect(events).toHaveLength(1);
      expect(events[0].hit).toBe(false);
      const stats = m.stats.getStats('player-0');
      expect(stats.shotsFired).toBe(1);
      expect(stats.shotsHit).toBe(0);
    });

    it('punch events are cleared after one tick, like bullet trails', () => {
      const m = startActivePunchMatch();
      equipPunch(m, 'player-0');
      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(m.getTickPunchEvents()).toHaveLength(1);
      m.update(0.05);
      expect(m.getTickPunchEvents()).toHaveLength(0);
    });

    it('a wide arc CAN strike two distinct victims in one swing', () => {
      const m = startActivePunchMatch(3);
      equipPunch(m, 'player-0');
      const puncher = m.players.get('player-0')!;
      const v1 = m.players.get('player-1')!;
      const v2 = m.players.get('player-2')!;
      puncher.position = { x: 100, y: 100 };
      v1.position = { x: 150, y: 100 }; // dead ahead
      v2.position = { x: 135, y: 135 }; // ~45° into the lower half of the arc
      v1.invulnerableTimer = 0;
      v2.invulnerableTimer = 0;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(v1.health).toBe(v1.maxHealth - WEAPONS.punch.damageMax);
      expect(v2.health).toBe(v2.maxHealth - WEAPONS.punch.damageMax);
      // Still one swing for accuracy purposes.
      const stats = m.stats.getStats('player-0');
      expect(stats.shotsFired).toBe(1);
      expect(stats.shotsHit).toBe(1);
      expect(stats.damageDealt).toBe(2 * WEAPONS.punch.damageMax);
    });

    it('walls block the swing (and x-ray does NOT pierce for punches)', () => {
      const map = makeMapData();
      // Vertical wall at column 5 (x 240–288).
      for (let row = 1; row < 9; row++) map.tiles[row][5] = 1;
      const m = new Match('punch-wall', map, [
        { id: 'player-0', nickname: 'P0' },
        { id: 'player-1', nickname: 'P1' },
      ]);
      m.setLock('player-0', 'mighty_man');
      m.setLock('player-1', 'bruce');
      m.update(0.05);
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      equipPunch(m, 'player-0');
      const puncher = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      // Victim within melee reach but on the far side of the wall.
      puncher.position = { x: 230, y: 120 };
      victim.position = { x: 290, y: 120 };
      victim.invulnerableTimer = 0;

      // Activate x-ray first: piercing must still not apply to fists.
      m.queueInput('player-0', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(puncher.abilityActiveSeconds).toBeGreaterThan(0);
      m.queueInput('player-0', makeInput(2, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(victim.health).toBe(victim.maxHealth);

      // Control: the same geometry without the wall connects.
      const open = startActivePunchMatch();
      equipPunch(open, 'player-0');
      const oPuncher = open.players.get('player-0')!;
      const oVictim = open.players.get('player-1')!;
      oPuncher.position = { x: 230, y: 120 };
      oVictim.position = { x: 290, y: 120 };
      oVictim.invulnerableTimer = 0;
      open.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      open.update(0.05);
      expect(oVictim.health).toBe(oVictim.maxHealth - WEAPONS.punch.damageMax);
    });

    it('the 0.5s swing cooldown gates the next swing', () => {
      const m = startActivePunchMatch();
      equipPunch(m, 'player-0');
      const puncher = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      puncher.position = { x: 100, y: 100 };
      victim.position = { x: 150, y: 100 };
      victim.invulnerableTimer = 0;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(victim.health).toBe(victim.maxHealth - WEAPONS.punch.damageMax);
      victim.health = victim.maxHealth;

      // Immediate second swing: still recovering — refused, no event.
      m.queueInput('player-0', makeInput(2, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(victim.health).toBe(victim.maxHealth);
      expect(m.getTickPunchEvents()).toHaveLength(0);

      // After the cooldown the next swing lands.
      advance(m, WEAPONS.punch.fireCooldown);
      m.queueInput('player-0', makeInput(3, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(victim.health).toBe(victim.maxHealth - WEAPONS.punch.damageMax);
    });

    it('Iron Hide halves punch damage (stats credit the applied amount)', () => {
      const m = createMatch();
      m.setLock('player-0', 'mighty_man');
      m.setLock('player-1', 'bubba');
      m.update(0.05);
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      equipPunch(m, 'player-0');
      const puncher = m.players.get('player-0')!;
      const bubba = m.players.get('player-1')!;
      puncher.position = { x: 100, y: 100 };
      bubba.position = { x: 150, y: 100 };
      bubba.invulnerableTimer = 0;

      m.queueInput('player-1', makeInput(1, { abilityPressed: true, aimAngle: 0 }));
      m.update(0.001);
      expect(bubba.abilityActiveSeconds).toBeGreaterThan(0);

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.001);

      const halved = WEAPONS.punch.damageMax / 2;
      expect(bubba.maxHealth - bubba.health).toBeCloseTo(halved, 5);
      expect(m.stats.getStats('player-0').damageDealt).toBeCloseTo(halved, 5);
    });

    it('a frozen player cannot punch', () => {
      const m = startActivePunchMatch();
      equipPunch(m, 'player-0');
      const puncher = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      puncher.position = { x: 100, y: 100 };
      victim.position = { x: 150, y: 100 };
      victim.invulnerableTimer = 0;
      puncher.frozenTimer = 1;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(victim.health).toBe(victim.maxHealth);
      expect(m.getTickPunchEvents()).toHaveLength(0);
    });

    it('a punch kill is attributed to punch in stats and the kill feed', () => {
      const m = startActivePunchMatch();
      equipPunch(m, 'player-0');
      const puncher = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      puncher.position = { x: 100, y: 100 };
      victim.position = { x: 150, y: 100 };
      victim.invulnerableTimer = 0;
      victim.health = 50; // one punch (60) is lethal

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(victim.isDead).toBe(true);
      expect(victim.deaths).toBe(1);
      const stats = m.stats.getStats('player-0');
      expect(stats.killsByWeapon.punch).toBe(1);
      expect(stats.kills).toBe(1);
      const entry = m.getKillFeed().find((e) => e.victimId === 'player-1')!;
      expect(entry.weapon).toBe('punch');
    });
  });

  describe('Session 7: pistol', () => {
    function startActivePistolMatch(): Match {
      const m = createMatch();
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    function advance(m: Match, seconds: number, step = 0.05): void {
      let remaining = seconds;
      while (remaining > 0) {
        const dt = Math.min(step, remaining);
        m.update(dt);
        remaining -= dt;
      }
    }

    /** Put a pistol with a full mag + reserve directly in the player's hands. */
    function equipPistol(m: Match, playerId: string, reserve = 24): void {
      const player = m.players.get(playerId)!;
      player.weaponId = 'pistol';
      player.specialAmmo = WEAPONS.pistol.magazineSize;
      player.specialReserve = reserve;
    }

    it('fires one pistol-tagged trail, decrements specialAmmo, full damage up close', () => {
      const m = startActivePistolMatch();
      equipPistol(m, 'player-0');
      const shooter = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      shooter.position = { x: 100, y: 100 };
      victim.position = { x: 140, y: 100 }; // hit at 28px — inside falloffRangeMin
      victim.invulnerableTimer = 0;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      const trails = m.getTickBulletTrails();
      expect(trails).toHaveLength(1);
      expect(trails[0].weaponId).toBe('pistol');
      expect(trails[0]).toMatchObject({
        hitPlayerId: 'player-1',
        damageApplied: WEAPONS.pistol.damageMax,
      });
      expect(shooter.specialAmmo).toBe(WEAPONS.pistol.magazineSize - 1);
      // Rifle magazine untouched — the pistol has its own pool.
      expect(shooter.ammo).toBe(WEAPONS.rifle.magazineSize);
      expect(victim.health).toBe(victim.maxHealth - WEAPONS.pistol.damageMax);
    });

    it('deals falloff-floor damage at long range', () => {
      const m = startActivePistolMatch();
      equipPistol(m, 'player-0');
      const shooter = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      shooter.position = { x: 100, y: 100 };
      victim.position = { x: 450, y: 100 }; // hit at 338px — past falloffRangeMax
      victim.invulnerableTimer = 0;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(victim.health).toBe(victim.maxHealth - WEAPONS.pistol.damageMin);
    });

    it('the 0.22s semi-auto cooldown gates the next shot', () => {
      const m = startActivePistolMatch();
      equipPistol(m, 'player-0');
      const shooter = m.players.get('player-0')!;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(shooter.specialAmmo).toBe(WEAPONS.pistol.magazineSize - 1);

      // Immediate re-fire: still pacing — refused.
      m.queueInput('player-0', makeInput(2, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(shooter.specialAmmo).toBe(WEAPONS.pistol.magazineSize - 1);

      // Wait out the cooldown, then fire again.
      advance(m, WEAPONS.pistol.fireCooldown);
      m.queueInput('player-0', makeInput(3, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(shooter.specialAmmo).toBe(WEAPONS.pistol.magazineSize - 2);
    });

    it('never queues a burst — exactly one round per trigger pull', () => {
      const m = startActivePistolMatch();
      equipPistol(m, 'player-0');
      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      // Run past the rifle burst interval: no follow-up rounds appear.
      advance(m, 0.5);
      expect(m.players.get('player-0')!.specialAmmo).toBe(WEAPONS.pistol.magazineSize - 1);
    });

    it('auto-reloads from reserve when the mag empties, refusing fire mid-reload', () => {
      const m = startActivePistolMatch();
      equipPistol(m, 'player-0', 12);
      const shooter = m.players.get('player-0')!;
      shooter.specialAmmo = 1;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(shooter.specialAmmo).toBe(0);
      expect(shooter.isReloading).toBe(true);

      // Firing during the reload is refused.
      m.queueInput('player-0', makeInput(2, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(m.getTickBulletTrails()).toHaveLength(0);

      // Reload completes: mag refilled from reserve.
      advance(m, WEAPONS.pistol.reloadTime);
      expect(shooter.isReloading).toBe(false);
      expect(shooter.specialAmmo).toBe(WEAPONS.pistol.magazineSize);
      expect(shooter.specialReserve).toBe(0);
    });

    it('reverts to the rifle when the last round is spent with no reserve', () => {
      const m = startActivePistolMatch();
      equipPistol(m, 'player-0', 0);
      const shooter = m.players.get('player-0')!;
      shooter.specialAmmo = 1;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(shooter.weaponId).toBe('rifle');
      expect(shooter.specialAmmo).toBe(0);
      expect(shooter.specialReserve).toBe(0);
    });

    it('a pistol kill is attributed to pistol in stats and the kill feed', () => {
      const m = startActivePistolMatch();
      equipPistol(m, 'player-0');
      const shooter = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      shooter.position = { x: 100, y: 100 };
      victim.position = { x: 140, y: 100 };
      victim.invulnerableTimer = 0;
      victim.health = 10;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(victim.isDead).toBe(true);
      const stats = m.stats.getStats('player-0');
      expect(stats.killsByWeapon.pistol).toBe(1);
      const entry = m.getKillFeed().find((e) => e.victimId === 'player-1')!;
      expect(entry.weapon).toBe('pistol');
    });
  });

  describe('Session 7: Gun Game mode integration', () => {
    function makeGunGameMapData(): MapData {
      return {
        ...makeMapData(),
        pickupSpawns: [
          { x: 5, y: 5, type: 'weapon_shotgun' as const },
          { x: 3, y: 3, type: 'gun_ammo' as const },
          { x: 6, y: 6, type: 'grenade' as const },
          { x: 4, y: 4, type: 'bandage' as const },
        ],
      };
    }

    function startActiveGunGameMatch(rng: () => number = Math.random): Match {
      const m = new Match(
        'gg-1',
        makeGunGameMapData(),
        [
          { id: 'player-0', nickname: 'P0' },
          { id: 'player-1', nickname: 'P1' },
        ],
        GameModeType.GUN_GAME,
        rng,
      );
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    it('enforces the ladder loadout from score through the real tick', () => {
      const m = startActiveGunGameMatch();
      const p0 = m.players.get('player-0')!;
      expect(p0.weaponId).toBe('rifle'); // rung 0

      p0.score = 2;
      m.update(0.05);
      expect(p0.weaponId).toBe('shotgun');
      expect(p0.specialAmmo).toBe(WEAPONS.shotgun.magazineSize);
      expect(p0.specialReserve).toBe(GUN_GAME.SHOTGUN_RESERVE_FLOOR);

      p0.score = 8;
      m.update(0.05);
      expect(p0.weaponId).toBe('punch');
    });

    it('gates gun fire on the grenade rung through the input loop; grenades still throw', () => {
      const m = startActiveGunGameMatch();
      const p0 = m.players.get('player-0')!;
      p0.score = 6;
      m.update(0.05); // rung equip: rifle in hand, pouch filled
      expect(p0.weaponId).toBe('rifle');
      expect(p0.grenades).toBe(GRENADE.MAX_COUNT);
      const magBefore = p0.ammo;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(m.getTickBulletTrails()).toHaveLength(0);
      expect(p0.ammo).toBe(magBefore);

      // The grenade button is the rung's whole point — still live.
      m.queueInput('player-0', makeInput(2, { throwPressed: true, aimAngle: 0 }));
      m.update(0.05);
      expect(p0.grenades).toBe(GRENADE.MAX_COUNT - 1);
    });

    it('the first punch-rung kill wins the match immediately', () => {
      const m = startActiveGunGameMatch();
      const p0 = m.players.get('player-0')!;
      const p1 = m.players.get('player-1')!;
      p0.score = 8;
      m.update(0.05); // equips the fists
      expect(p0.weaponId).toBe('punch');

      p0.position = { x: 100, y: 100 };
      p1.position = { x: 150, y: 100 };
      p1.invulnerableTimer = 0;
      p1.health = 50;

      m.queueInput('player-0', makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(p0.score).toBe(9);
      expect(m.phase).toBe(MatchPhase.ENDED);
      const result = m.getResult();
      expect(result.gameMode).toBe(GameModeType.GUN_GAME);
      expect(result.winnerId).toBe('player-0');
    });

    it('wrong-weapon kills never advance the ladder through the real kill path', () => {
      const m = startActiveGunGameMatch();
      const p0 = m.players.get('player-0')!;
      const p1 = m.players.get('player-1')!;
      p0.score = 2; // shotgun rung
      m.update(0.05);

      // Rifle-tagged kill (e.g. suicide-credit / stale weapon): no advance.
      m.onKill('player-0', 'player-1', 'gun');
      expect(p0.score).toBe(2);
      expect(p1.deaths).toBe(1);

      // Ability kill: no advance either.
      m.onKill('player-0', 'player-1', 'axe');
      expect(p0.score).toBe(2);
    });

    it('timer expiry crowns the ladder leader', () => {
      const m = startActiveGunGameMatch();
      m.players.get('player-0')!.score = 3;
      m.players.get('player-1')!.score = 1;
      m.matchTimer = 0.01;
      m.update(0.05);

      expect(m.phase).toBe(MatchPhase.ENDED);
      expect(m.getResult().winnerId).toBe('player-0');
    });

    it('a tie at expiry enters overtime, rung weapons come back, scoring stays frozen', () => {
      const m = startActiveGunGameMatch();
      const p0 = m.players.get('player-0')!;
      const p1 = m.players.get('player-1')!;
      p0.score = 4;
      p1.score = 4;
      m.matchTimer = 0.01;
      m.update(0.05);
      expect(m.isOvertime).toBe(true);

      // The overtime reset put everyone on the rifle; the mode re-equips
      // the pistol rung within a tick.
      m.update(0.05);
      expect(p0.weaponId).toBe('pistol');
      expect(p1.weaponId).toBe('pistol');
      expect(p0.specialAmmo).toBe(WEAPONS.pistol.magazineSize);

      // An overtime kill decides the duel but never moves the ladder.
      m.onKill('player-0', 'player-1', 'pistol');
      expect(p0.score).toBe(4);
      m.update(0.05);
      expect(m.phase).toBe(MatchPhase.ENDED);
      expect(m.getResult().winnerId).toBe('player-0');
    });

    it('spawns only bandage pickups and never announces the shotgun', () => {
      const m = startActiveGunGameMatch();
      const pickups = m.pickupManager.getPickups();
      expect(pickups).toHaveLength(1);
      expect(pickups[0].type).toBe('bandage');

      // Run past the weapon respawn window: no INCOMING warning can fire
      // because the shotgun pickup was never created.
      let warnings = 0;
      let remaining = PICKUP.WEAPON_RESPAWN_TIME + 1;
      while (remaining > 0) {
        m.update(0.1);
        warnings += m.consumeTickWeaponIncoming().length;
        remaining -= 0.1;
      }
      expect(warnings).toBe(0);

      // Control: the same map in deathmatch spawns all four.
      const dm = new Match('gg-dm', makeGunGameMapData(), [
        { id: 'player-0', nickname: 'P0' },
        { id: 'player-1', nickname: 'P1' },
      ]);
      expect(dm.pickupManager.getPickups()).toHaveLength(4);
    });

    describe('mutator roll exclusion', () => {
      type MatchInternals = {
        matchTimer: number;
        midMatchSlot: { activateAtElapsed: number };
      };

      it('neither roll can pick a loadout-breaking mutator, for any rng value', () => {
        // Sweep constant rng values across [0, 1): every candidate index
        // for both slots gets exercised.
        for (let k = 0; k < 16; k++) {
          const rng = () => k / 16 + 0.0001;
          const m = startActiveGunGameMatch(rng);
          const internals = m as unknown as MatchInternals;

          // Fire the mid-match slot (warning + start on one tick)...
          internals.midMatchSlot.activateAtElapsed = 80;
          internals.matchTimer = MATCH.TIME_LIMIT - 80.1;
          m.update(0.05);
          // ...then the final-minute slot the same way.
          internals.matchTimer = MUTATORS.ACTIVATION_AT_REMAINING - 0.01;
          m.update(0.05);

          expect(m.activeMutators).toHaveLength(2);
          expect(m.activeMutators).not.toContain('grenades_only');
          expect(m.activeMutators).not.toContain('infinite_ammo');
          expect(m.activeMutators).not.toContain('fists_only');
          expect(m.activeMutators).not.toContain('weapon_roulette');
        }
      });

      it('FORCE_EVENT still pins an excluded mutator (smoke tool bypass)', () => {
        process.env.FORCE_EVENT = 'grenades_only';
        try {
          const m = startActiveGunGameMatch(() => 0.0001);
          const internals = m as unknown as MatchInternals;
          internals.midMatchSlot.activateAtElapsed = Number.POSITIVE_INFINITY;
          internals.matchTimer = MUTATORS.ACTIVATION_AT_REMAINING - 0.01;
          m.update(0.05);
          expect(m.activeMutators).toEqual(['grenades_only']);
        } finally {
          delete process.env.FORCE_EVENT;
        }
      });
    });
  });

  describe('Last Stand mode integration', () => {
    function startActiveLastStand(playerCount = 2): Match {
      const m = new Match(
        'last-stand-1',
        makeMapData(),
        Array.from({ length: playerCount }, (_, i) => ({
          id: `player-${i}`,
          nickname: `P${i}`,
        })),
        GameModeType.LAST_STAND,
      );
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    it('publishes lives through score and respawns while stock remains', () => {
      const m = startActiveLastStand();
      const victim = m.players.get('player-1')!;
      expect(victim.score).toBe(LAST_STAND.STARTING_LIVES);

      m.onKill('player-0', 'player-1', 'gun');
      expect(victim.score).toBe(4);
      expect(victim.isDead).toBe(true);
      m.update(RESPAWN.DELAY + 0.1);
      expect(victim.isDead).toBe(false);
      expect(victim.score).toBe(4);
      expect(m.phase).toBe(MatchPhase.ACTIVE);
    });

    it('ends a duel immediately when the final stock is lost', () => {
      const m = startActiveLastStand();
      const victim = m.players.get('player-1')!;
      victim.score = 1;
      m.onKill('player-0', 'player-1', 'gun');
      m.update(0.05);

      expect(victim.score).toBe(0);
      expect(m.phase).toBe(MatchPhase.ENDED);
      expect(m.getResult().gameMode).toBe(GameModeType.LAST_STAND);
      expect(m.getResult().winnerId).toBe('player-0');
    });

    it('keeps a zero-stock fighter eliminated while an N-player round continues', () => {
      const m = startActiveLastStand(3);
      const eliminated = m.players.get('player-2')!;
      eliminated.score = 1;
      m.onKill('player-0', 'player-2', 'gun');
      m.update(RESPAWN.DELAY + 0.1);

      expect(m.phase).toBe(MatchPhase.ACTIVE);
      expect(eliminated.isDead).toBe(true);
      expect(eliminated.respawnTimer).toBe(0);
    });

    it('excludes zero-stock fighters from a tied-clock overtime reset', () => {
      const m = startActiveLastStand(3);
      const p0 = m.players.get('player-0')!;
      const p1 = m.players.get('player-1')!;
      const eliminated = m.players.get('player-2')!;
      p0.score = 2;
      p1.score = 2;
      eliminated.score = 0;
      eliminated.isDead = true;
      eliminated.respawnTimer = 0;
      m.matchTimer = 0.01;
      m.update(0.05);

      expect(m.isOvertime).toBe(true);
      expect(p0.isDead).toBe(false);
      expect(p1.isDead).toBe(false);
      expect(eliminated.isDead).toBe(true);
      expect(eliminated.respawnTimer).toBe(0);
    });

    it('ends an all-eliminated double knockout as a draw without empty overtime', () => {
      const m = startActiveLastStand();
      const p0 = m.players.get('player-0')!;
      const p1 = m.players.get('player-1')!;
      p0.score = 1;
      p1.score = 1;
      m.onKill('player-1', 'player-0', 'grenade');
      m.onKill('player-0', 'player-1', 'grenade');
      m.update(0.05);

      expect(m.phase).toBe(MatchPhase.ENDED);
      expect(m.isOvertime).toBe(false);
      expect(m.getResult().winnerId).toBeNull();
    });
  });

  describe('Kill Confirmed mode integration', () => {
    function startActiveKillConfirmed(): Match {
      const m = new Match(
        'confirmed-1',
        makeMapData(),
        [
          { id: 'player-0', nickname: 'P0' },
          { id: 'player-1', nickname: 'P1' },
        ],
        GameModeType.KILL_CONFIRMED,
      );
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    it('publishes a death tag and scores only when an opponent collects it', () => {
      const m = startActiveKillConfirmed();
      const collector = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      collector.position = { x: 80, y: 80 };
      victim.position = { x: 300, y: 240 };
      m.onKill(collector.id, victim.id, 'gun');

      expect(collector.score).toBe(0);
      expect(m.getKillConfirmedTags()).toMatchObject([
        { ownerId: victim.id, position: { x: 300, y: 240 } },
      ]);

      collector.position = { x: 300, y: 240 };
      m.update(0.05);
      expect(collector.score).toBe(1);
      expect(m.getKillConfirmedTags()).toEqual([]);
    });

    it('ends immediately when a collected tag reaches the score target', () => {
      const m = startActiveKillConfirmed();
      const collector = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      collector.score = KILL_CONFIRMED.SCORE_TARGET - 1;
      collector.position = { x: 80, y: 80 };
      victim.position = { x: 300, y: 240 };
      m.onKill(collector.id, victim.id, 'gun');
      collector.position = { x: 300, y: 240 };
      m.update(0.05);

      expect(m.phase).toBe(MatchPhase.ENDED);
      expect(m.getResult().winnerId).toBe(collector.id);
    });
  });

  describe('One in the Chamber mode integration', () => {
    function makeChamberMapData(): MapData {
      return {
        ...makeMapData(),
        pickupSpawns: [
          { x: 2, y: 2, type: 'weapon_pistol' as const },
          { x: 3, y: 3, type: 'gun_ammo' as const },
          { x: 4, y: 4, type: 'grenade' as const },
          { x: 5, y: 5, type: 'bandage' as const },
        ],
      };
    }

    function startActiveChamberMatch(): Match {
      const m = new Match(
        'chamber-1',
        makeChamberMapData(),
        [
          { id: 'player-0', nickname: 'P0' },
          { id: 'player-1', nickname: 'P1' },
        ],
        GameModeType.ONE_IN_THE_CHAMBER,
        () => 0,
      );
      m.startCountdown();
      m.update(MATCH.COUNTDOWN_DURATION + 0.05);
      return m;
    }

    it('starts with one round and a landed pistol shot kills and reloads', () => {
      const m = startActiveChamberMatch();
      const shooter = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      shooter.position = { x: 100, y: 100 };
      victim.position = { x: 260, y: 100 };
      victim.invulnerableTimer = 0;

      expect(shooter.weaponId).toBe('pistol');
      expect(shooter.specialAmmo).toBe(1);
      m.queueInput(shooter.id, makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(victim.isDead).toBe(true);
      expect(victim.health).toBe(0);
      expect(shooter.score).toBe(1);
      expect(shooter.weaponId).toBe('pistol');
      expect(shooter.specialAmmo).toBe(1);
      expect(m.getTickBulletTrails()[0]).toMatchObject({
        weaponId: 'pistol',
        hitPlayerId: victim.id,
        damageApplied: 100,
      });
    });

    it('a missed round becomes lethal fists until a punch earns it back', () => {
      const m = startActiveChamberMatch();
      const fighter = m.players.get('player-0')!;
      const victim = m.players.get('player-1')!;
      fighter.position = { x: 100, y: 100 };
      victim.position = { x: 150, y: 100 };
      victim.invulnerableTimer = 0;

      m.queueInput(fighter.id, makeInput(1, { firePressed: true, aimAngle: Math.PI }));
      m.update(0.05);
      expect(fighter.weaponId).toBe('punch');
      expect(fighter.specialAmmo).toBe(0);

      m.queueInput(fighter.id, makeInput(2, { firePressed: true, aimAngle: 0 }));
      m.update(WEAPONS.punch.fireCooldown + 0.05);
      expect(victim.isDead).toBe(true);
      expect(fighter.score).toBe(1);
      expect(fighter.weaponId).toBe('pistol');
      expect(fighter.specialAmmo).toBe(1);
    });

    it('keeps spawn invulnerability intact and still spends the blocked shot', () => {
      const m = startActiveChamberMatch();
      const shooter = m.players.get('player-0')!;
      const protectedPlayer = m.players.get('player-1')!;
      shooter.position = { x: 100, y: 100 };
      protectedPlayer.position = { x: 200, y: 100 };
      protectedPlayer.invulnerableTimer = 1;

      m.queueInput(shooter.id, makeInput(1, { firePressed: true, aimAngle: 0 }));
      m.update(0.05);

      expect(protectedPlayer.isDead).toBe(false);
      expect(protectedPlayer.health).toBe(protectedPlayer.maxHealth);
      expect(shooter.score).toBe(0);
      expect(shooter.weaponId).toBe('punch');
      expect(shooter.specialAmmo).toBe(0);
    });

    it('gates grenades and character abilities through the real input loop', () => {
      const m = startActiveChamberMatch();
      const fighter = m.players.get('player-0')!;
      fighter.characterId = 'jack';
      fighter.grenades = GRENADE.MAX_COUNT;
      m.queueInput(
        fighter.id,
        makeInput(1, {
          throwPressed: true,
          detonatePressed: true,
          abilityPressed: true,
        }),
      );
      m.update(0.05);

      expect(fighter.grenades).toBe(0);
      expect(fighter.abilityCooldownSeconds).toBe(0);
      expect(m.combatManager.getGrenades()).toHaveLength(0);
      expect(m.combatManager.getAxes()).toHaveLength(0);
    });

    it('respawns with one round and leaves only bandages on the map', () => {
      const m = startActiveChamberMatch();
      const victim = m.players.get('player-1')!;
      m.onKill('player-0', victim.id, 'pistol');
      m.update(RESPAWN.DELAY + 0.1);

      expect(victim.isDead).toBe(false);
      expect(victim.weaponId).toBe('pistol');
      expect(victim.specialAmmo).toBe(1);
      expect(victim.specialReserve).toBe(0);
      expect(m.pickupManager.getPickups().map((pickup) => pickup.type)).toEqual(['bandage']);
    });

    it('ends at the score target and re-chambers a tied overtime duel', () => {
      const decisive = startActiveChamberMatch();
      const winner = decisive.players.get('player-0')!;
      winner.score = ONE_IN_THE_CHAMBER.SCORE_TARGET - 1;
      decisive.onKill(winner.id, 'player-1', 'punch');
      decisive.update(0.05);
      expect(decisive.phase).toBe(MatchPhase.ENDED);
      expect(decisive.getResult()).toMatchObject({
        winnerId: winner.id,
        gameMode: GameModeType.ONE_IN_THE_CHAMBER,
      });

      const tied = startActiveChamberMatch();
      tied.players.get('player-0')!.score = 3;
      tied.players.get('player-1')!.score = 3;
      tied.matchTimer = 0.01;
      tied.update(0.05);
      expect(tied.isOvertime).toBe(true);
      tied.update(0.05);
      for (const player of tied.players.values()) {
        expect(player.weaponId).toBe('pistol');
        expect(player.specialAmmo).toBe(1);
      }
    });
  });

  describe('FORCE_MATCH_SECONDS smoke pin', () => {
    it('overrides regulation length when set to a positive number', () => {
      process.env.FORCE_MATCH_SECONDS = '360';
      try {
        const m = createMatch();
        expect(m.getTimeLimit()).toBe(360);
      } finally {
        delete process.env.FORCE_MATCH_SECONDS;
      }
    });

    it('ignores invalid values and keeps MATCH.TIME_LIMIT', () => {
      for (const bad of ['0', '-5', 'soon', '']) {
        process.env.FORCE_MATCH_SECONDS = bad;
        try {
          const m = createMatch();
          expect(m.getTimeLimit()).toBe(MATCH.TIME_LIMIT);
        } finally {
          delete process.env.FORCE_MATCH_SECONDS;
        }
      }
    });
  });
});
