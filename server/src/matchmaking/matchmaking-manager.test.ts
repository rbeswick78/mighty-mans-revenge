import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MatchPhase,
  MATCH,
  MUTATORS,
  OVERTIME,
  DRAFT,
  listMapNames,
  GameModeType,
  GAME_MODE_ROTATION,
  createEmptyCharacterWins,
  practiceGauntletChaosBounty,
  dailyChallengeKey,
} from '@shared/game';
import type {
  CharacterId,
  MutatorId,
  PlayerId,
  ServerMessage,
  ServerDraftStateMessage,
} from '@shared/game';
import { MatchmakingManager } from './matchmaking-manager.js';
import { getGameMode } from '../game/modes/index.js';
import { PersistentStatsStore } from '../persistence/persistent-stats-store.js';
import type { GameServer } from '../network/server.js';

interface SentMessage {
  playerId: PlayerId;
  message: ServerMessage;
  reliable: boolean;
}

function makeFakeServer() {
  const sent: SentMessage[] = [];
  /** Mutable so tests can decide who the leaderboard rebroadcast reaches. */
  const connected: PlayerId[] = [];
  const fake = {
    sendTo: vi.fn((playerId: PlayerId, message: ServerMessage, opts?: { reliable?: boolean }) => {
      sent.push({ playerId, message, reliable: !!opts?.reliable });
    }),
    getConnectedPlayerIds: vi.fn(() => [...connected]),
    playerCount: 2,
  } as unknown as GameServer;
  return { fake, sent, connected };
}

/**
 * Deterministic rng for draft tests: returns the given values in order,
 * then keeps returning the last one (drafts consume a variable number of
 * rolls; padding with the final value keeps sequences short).
 */
function seededRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function latestDraftState(sent: SentMessage[]): ServerDraftStateMessage {
  const found = [...sent].reverse().find((s) => s.message.type === 'server:draftState');
  if (!found || found.message.type !== 'server:draftState') {
    throw new Error('no draftState broadcast');
  }
  return found.message;
}

/**
 * Complete a live draft: tick once so the draft broadcasts a snapshot,
 * read who picks first from it, then send both picks (map from the first
 * picker, mode from the second). Keeps every test that just needs "a
 * match" exercising the real draft path instead of a FORCE pin.
 */
function walkDraft(
  mgr: MatchmakingManager,
  sent: SentMessage[],
  picks: { map?: string; mode?: GameModeType } = {},
): void {
  mgr.tick(0.05, 0);
  const snap = latestDraftState(sent);
  const first = snap.currentPickerId!;
  const second = snap.players.find((p) => p.id !== first)!.id;
  mgr.handleDraftPick(first, 'map', picks.map ?? snap.mapOptions[0]);
  mgr.handleDraftPick(second, 'mode', picks.mode ?? snap.modeOptions[0]);
}

describe('MatchmakingManager rematch flow', () => {
  let mgr: MatchmakingManager;
  let sent: SentMessage[];

  beforeEach(() => {
    const { fake, sent: bucket } = makeFakeServer();
    sent = bucket;
    mgr = new MatchmakingManager(fake);
  });

  function startMatchAndForceEnd(p1: PlayerId, p2: PlayerId): void {
    mgr.handleJoinMatchmaking(p1, 'A');
    mgr.handleJoinMatchmaking(p2, 'B');
    walkDraft(mgr, sent);
    // Find the active match and force it to ENDED so the next tick promotes
    // it into post-match state via onMatchEnded.
    const matches = mgr.getActiveMatches();
    expect(matches).toHaveLength(1);
    matches[0].phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
  }

  function endRoundWithWinner(winnerId: PlayerId, tick: number) {
    const match = mgr.getActiveMatches()[0];
    expect(match).toBeDefined();
    match.players.get(winnerId)!.score = 1;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, tick);
    const end = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!end || end.message.type !== 'server:matchEnd') {
      throw new Error('missing matchEnd');
    }
    return end.message.result;
  }

  function startRevengeRematch(expectedPicker: PlayerId, tick: number): void {
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    mgr.tick(0.05, tick);
    const draft = latestDraftState(sent);
    expect(draft.firstPickerId).toBe(expectedPicker);
    expect(draft.firstPickerReason).toBe('revenge');
    const other = draft.players.find((player) => player.id !== expectedPicker)!.id;
    mgr.handleDraftPick(expectedPicker, 'map', draft.mapOptions[0]);
    mgr.handleDraftPick(other, 'mode', draft.modeOptions[0]);
  }

  it('scores a first-to-three set, gives the loser revenge picks, then resets after a clinch', () => {
    mgr.handleJoinMatchmaking('A', 'Alpha');
    mgr.handleJoinMatchmaking('B', 'Bravo');
    walkDraft(mgr, sent);

    const first = endRoundWithWinner('A', 1);
    expect(first.rivalrySet).toEqual({
      winsToClinch: 3,
      roundsPlayed: 1,
      players: [
        { playerId: 'A', nickname: 'Alpha', wins: 1 },
        { playerId: 'B', nickname: 'Bravo', wins: 0 },
      ],
      championId: null,
    });

    startRevengeRematch('B', 2);
    const second = endRoundWithWinner('A', 3);
    expect(second.rivalrySet?.players.map((player) => player.wins)).toEqual([2, 0]);
    expect(second.rivalrySet?.roundsPlayed).toBe(2);

    startRevengeRematch('B', 4);
    const clincher = endRoundWithWinner('A', 5);
    expect(clincher.rivalrySet?.championId).toBe('A');
    expect(clincher.rivalrySet?.players.map((player) => player.wins)).toEqual([3, 0]);

    // Both opt into a new set. The clincher's loser still gets the revenge
    // draft, but the score itself restarts at 0-0 before this round.
    startRevengeRematch('B', 6);
    const newSet = endRoundWithWinner('B', 7);
    expect(newSet.rivalrySet).toEqual({
      winsToClinch: 3,
      roundsPlayed: 1,
      players: [
        { playerId: 'A', nickname: 'Alpha', wins: 0 },
        { playerId: 'B', nickname: 'Bravo', wins: 1 },
      ],
      championId: null,
    });
  });

  it('starts a rematch draft when both players request it', () => {
    startMatchAndForceEnd('A', 'B');
    sent.length = 0; // clear matchEnd messages

    mgr.handleRematchRequest('A');
    // After A's request, B should have been notified
    const aMsgs = sent.filter(
      (s) => s.playerId === 'B' && s.message.type === 'server:rematchStatus',
    );
    expect(aMsgs).toHaveLength(1);

    mgr.handleRematchRequest('B');

    // Both agreed → a fresh draft opens rather than an instant match.
    expect(mgr.getActiveMatches()).toHaveLength(0);
    walkDraft(mgr, sent);

    const matchFoundMsgs = sent.filter((s) => s.message.type === 'server:matchFound');
    expect(matchFoundMsgs.map((m) => m.playerId).sort()).toEqual(['A', 'B']);

    // A new match should be active
    expect(mgr.getActiveMatches()).toHaveLength(1);
  });

  it('carries the previous round mutators through the rematch draft', () => {
    mgr.handleJoinMatchmaking('A', 'Alpha');
    mgr.handleJoinMatchmaking('B', 'Bravo');
    walkDraft(mgr, sent);
    const first = mgr.getActiveMatches()[0];
    const previous: MutatorId[] = ['vampire', 'blackout'];
    (first.activeMutators as MutatorId[]).push(...previous);
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    walkDraft(mgr, sent);

    const rematch = mgr.getActiveMatches()[0] as unknown as {
      rematchMutatorExclusions: ReadonlySet<MutatorId>;
    };
    expect([...rematch.rematchMutatorExclusions]).toEqual(previous);
  });

  it('rolls a different contract for a direct rematch', () => {
    mgr.handleJoinMatchmaking('A', 'Alpha');
    mgr.handleJoinMatchmaking('B', 'Bravo');
    walkDraft(mgr, sent);
    const first = mgr.getActiveMatches()[0];
    const previousContract = first.getContractHudState().id;
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    walkDraft(mgr, sent);

    expect(mgr.getActiveMatches()[0].getContractHudState().id).not.toBe(previousContract);
  });

  it('resets the post-match timeout when a player requests rematch', () => {
    vi.useFakeTimers();
    try {
      startMatchAndForceEnd('A', 'B');
      sent.length = 0;

      // Burn most of the initial 60s window before A clicks rematch.
      vi.advanceTimersByTime(55_000);
      mgr.handleRematchRequest('A');

      // 50s after A's click — would have been past the original timeout if it
      // hadn't been reset (55s + 50s = 105s total since match end). The
      // post-match state must still be live so B can complete the rematch.
      vi.advanceTimersByTime(50_000);
      mgr.handleRematchRequest('B');
      walkDraft(mgr, sent);

      const matchFoundMsgs = sent.filter((s) => s.message.type === 'server:matchFound');
      expect(matchFoundMsgs.map((m) => m.playerId).sort()).toEqual(['A', 'B']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the post-match state if neither player clicks within the window', () => {
    vi.useFakeTimers();
    try {
      startMatchAndForceEnd('A', 'B');
      sent.length = 0;

      // Run past the timeout without any rematch requests.
      vi.advanceTimersByTime(60_001);

      const cancelMsgs = sent.filter(
        (s) => s.message.type === 'server:matchmakingStatus' && s.message.status === 'cancelled',
      );
      expect(cancelMsgs.map((m) => m.playerId).sort()).toEqual(['A', 'B']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('responds when a rematch request arrives after the post-match window expired', () => {
    vi.useFakeTimers();
    try {
      startMatchAndForceEnd('A', 'B');
      sent.length = 0;

      vi.advanceTimersByTime(60_001);
      sent.length = 0;

      mgr.handleRematchRequest('A');

      expect(sent).toContainEqual(
        expect.objectContaining({
          playerId: 'A',
          message: expect.objectContaining({
            type: 'server:matchmakingStatus',
            status: 'cancelled',
          }),
          reliable: true,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('MatchmakingManager map rotation (FORCE-pinned, draft skipped)', () => {
  let mgr: MatchmakingManager;
  let sent: SentMessage[];

  beforeEach(() => {
    const { fake, sent: bucket } = makeFakeServer();
    sent = bucket;
    mgr = new MatchmakingManager(fake);
    // Any FORCE pin disables the draft; pinning the MODE leaves the map
    // side on the rotation cursor under test.
    process.env.FORCE_MODE = GameModeType.DEATHMATCH;
  });

  afterEach(() => {
    delete process.env.FORCE_MAP;
    delete process.env.FORCE_MODE;
  });

  function matchFoundMapName(playerId: PlayerId): string {
    const msg = sent.find((s) => s.playerId === playerId && s.message.type === 'server:matchFound');
    if (!msg || msg.message.type !== 'server:matchFound') {
      throw new Error(`no matchFound for ${playerId}`);
    }
    return msg.message.mapName;
  }

  function endActiveMatch(): void {
    const matches = mgr.getActiveMatches();
    expect(matches).toHaveLength(1);
    matches[0].phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
  }

  function lastMatchEndNextMap(): string | null {
    const msgs = sent.filter((s) => s.message.type === 'server:matchEnd');
    expect(msgs.length).toBeGreaterThan(0);
    const last = msgs[msgs.length - 1];
    if (last.message.type !== 'server:matchEnd') throw new Error('unreachable');
    return last.message.result.nextMapName;
  }

  it('fresh matches cycle the registry order and wrap', () => {
    const names = listMapNames();
    const pairs: Array<[PlayerId, PlayerId]> = [
      ['A', 'B'],
      ['C', 'D'],
      ['E', 'F'],
      ['G', 'H'],
      ['I', 'J'],
      ['K', 'L'],
    ];
    pairs.forEach(([p1, p2], i) => {
      sent.length = 0;
      mgr.handleJoinMatchmaking(p1, p1);
      mgr.handleJoinMatchmaking(p2, p2);
      expect(matchFoundMapName(p1)).toBe(names[i % names.length]);
      expect(matchFoundMapName(p2)).toBe(names[i % names.length]);
    });
    expect(matchFoundMapName('K')).toBe(names[0]); // wrapped
  });

  it('matchEnd promises the next map and the pinned rematch delivers it', () => {
    const names = listMapNames();
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMapName('A')).toBe(names[0]);

    // First match ends → results promise map #2 → rematch plays map #2.
    endActiveMatch();
    expect(lastMatchEndNextMap()).toBe(names[1]);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMapName('A')).toBe(names[1]);

    // Chain continues through maps #3, #4, and #5, then wraps to #1.
    endActiveMatch();
    expect(lastMatchEndNextMap()).toBe(names[2]);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMapName('A')).toBe(names[2]);

    endActiveMatch();
    expect(lastMatchEndNextMap()).toBe(names[3]);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMapName('A')).toBe(names[3]);

    endActiveMatch();
    expect(lastMatchEndNextMap()).toBe(names[4]);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMapName('A')).toBe(names[4]);

    endActiveMatch();
    expect(lastMatchEndNextMap()).toBe(names[0]);
  });

  it('FORCE_MAP pins fresh matches, the promised next map, and rematches', () => {
    const names = listMapNames();
    process.env.FORCE_MAP = names[2];

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMapName('A')).toBe(names[2]);

    endActiveMatch();
    expect(lastMatchEndNextMap()).toBe(names[2]);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMapName('A')).toBe(names[2]);
  });

  it('ignores an unknown FORCE_MAP and falls back to rotation (still no draft)', () => {
    process.env.FORCE_MAP = 'No Such Arena';
    delete process.env.FORCE_MODE;
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    // A present-but-invalid pin still means "no draft" — it degrades to
    // the deterministic rotation, never to a surprise draft.
    expect(matchFoundMapName('A')).toBe(listMapNames()[0]);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);
  });
});

describe('MatchmakingManager mode rotation (FORCE-pinned, draft skipped)', () => {
  let mgr: MatchmakingManager;
  let sent: SentMessage[];

  beforeEach(() => {
    const { fake, sent: bucket } = makeFakeServer();
    sent = bucket;
    mgr = new MatchmakingManager(fake);
    // Any FORCE pin disables the draft; pinning the MAP leaves the mode
    // side on the rotation cursor under test.
    process.env.FORCE_MAP = listMapNames()[0];
  });

  afterEach(() => {
    delete process.env.FORCE_MAP;
    delete process.env.FORCE_MODE;
  });

  function matchFoundMode(playerId: PlayerId): GameModeType {
    const msg = sent.find((s) => s.playerId === playerId && s.message.type === 'server:matchFound');
    if (!msg || msg.message.type !== 'server:matchFound') {
      throw new Error(`no matchFound for ${playerId}`);
    }
    return msg.message.gameMode;
  }

  function endActiveMatch(): void {
    const matches = mgr.getActiveMatches();
    expect(matches).toHaveLength(1);
    matches[0].phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
  }

  function lastMatchEndNextMode(): GameModeType | null {
    const msgs = sent.filter((s) => s.message.type === 'server:matchEnd');
    expect(msgs.length).toBeGreaterThan(0);
    const last = msgs[msgs.length - 1];
    if (last.message.type !== 'server:matchEnd') throw new Error('unreachable');
    return last.message.result.nextGameMode;
  }

  it('fresh matches cycle every mode and wrap', () => {
    const pairs: Array<[PlayerId, PlayerId]> = [
      ['A', 'B'],
      ['C', 'D'],
      ['E', 'F'],
      ['G', 'H'],
      ['I', 'J'],
      ['K', 'L'],
      ['M', 'N'],
      ['O', 'P'],
      ['Q', 'R'],
    ];
    pairs.forEach(([p1, p2], i) => {
      sent.length = 0;
      mgr.handleJoinMatchmaking(p1, p1);
      mgr.handleJoinMatchmaking(p2, p2);
      const expected = GAME_MODE_ROTATION[i % GAME_MODE_ROTATION.length];
      expect(matchFoundMode(p1)).toBe(expected);
      expect(matchFoundMode(p2)).toBe(expected);
    });
    expect(matchFoundMode('Q')).toBe(GAME_MODE_ROTATION[0]); // wrapped
  });

  it('matchEnd promises the next mode and the pinned rematch delivers it', () => {
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMode('A')).toBe(GameModeType.DEATHMATCH);

    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.KOTH);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.KOTH);

    // Chain continues into Gun Game...
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.GUN_GAME);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.GUN_GAME);

    // ...then continues into Last Stand...
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.LAST_STAND);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.LAST_STAND);

    // ...then Kill Confirmed...
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.KILL_CONFIRMED);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.KILL_CONFIRMED);

    // ...then One in the Chamber...
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.ONE_IN_THE_CHAMBER);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.ONE_IN_THE_CHAMBER);

    // ...then Core Run...
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.CORE_RUN);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.CORE_RUN);

    // ...then Bounty Hunt...
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.BOUNTY_HUNT);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.BOUNTY_HUNT);

    // ...then wraps back to DM.
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.DEATHMATCH);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.DEATHMATCH);
  });

  it('FORCE_MODE pins fresh matches, the promised next mode, and rematches', () => {
    process.env.FORCE_MODE = GameModeType.KOTH;

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMode('A')).toBe(GameModeType.KOTH);

    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.KOTH);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.KOTH);
  });

  it('ignores an unknown FORCE_MODE and falls back to rotation (still no draft)', () => {
    process.env.FORCE_MODE = 'no_such_mode';
    delete process.env.FORCE_MAP;
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMode('A')).toBe(GAME_MODE_ROTATION[0]);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);
  });

  it('FORCE_MODE=gun_game pins fresh matches and rematches to Gun Game', () => {
    process.env.FORCE_MODE = GameModeType.GUN_GAME;

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMode('A')).toBe(GameModeType.GUN_GAME);

    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.GUN_GAME);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.GUN_GAME);
  });

  it('KOTH gameState snapshots carry hill state; DM ones do not', () => {
    process.env.FORCE_MODE = GameModeType.KOTH;
    const dt = 0.05;

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');

    const totalTicks = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 10;
    for (let i = 1; i <= totalTicks; i++) mgr.tick(dt, i);

    const active = sent.filter(
      (s) => s.message.type === 'server:gameState' && s.message.phase === MatchPhase.ACTIVE,
    );
    expect(active.length).toBeGreaterThan(0);
    for (const { message } of active) {
      if (message.type !== 'server:gameState') throw new Error('unreachable');
      expect(message.koth).toBeDefined();
      expect(message.koth!.hill).toBeDefined();
      expect(message.isOvertime).toBe(false);
      expect(message.contract.target).toBeGreaterThan(0);
      expect(message.contract.players).toEqual([
        expect.objectContaining({ playerId: 'A', progress: expect.any(Number) }),
        expect.objectContaining({ playerId: 'B', progress: expect.any(Number) }),
      ]);
    }
  });

  it('Core Run snapshots carry the persistent moving objective state', () => {
    process.env.FORCE_MODE = GameModeType.CORE_RUN;
    const dt = 0.05;

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');

    const totalTicks = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 10;
    for (let i = 1; i <= totalTicks; i++) mgr.tick(dt, i);

    const active = sent.filter(
      (s) => s.message.type === 'server:gameState' && s.message.phase === MatchPhase.ACTIVE,
    );
    expect(active.length).toBeGreaterThan(0);
    for (const { message } of active) {
      if (message.type !== 'server:gameState') throw new Error('unreachable');
      expect(message.coreRun).toMatchObject({
        position: { x: expect.any(Number), y: expect.any(Number) },
        carrierId: null,
        carryFraction: expect.any(Number),
      });
      expect(message.confirmedTags).toBeUndefined();
      expect(message.koth).toBeUndefined();
    }
  });

  it('Bounty Hunt snapshots carry one authoritative marked fighter', () => {
    process.env.FORCE_MODE = GameModeType.BOUNTY_HUNT;
    const dt = 0.05;

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');

    const totalTicks = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 10;
    for (let i = 1; i <= totalTicks; i++) mgr.tick(dt, i);

    const active = sent.filter(
      (s) => s.message.type === 'server:gameState' && s.message.phase === MatchPhase.ACTIVE,
    );
    expect(active.length).toBeGreaterThan(0);
    for (const { message } of active) {
      if (message.type !== 'server:gameState') throw new Error('unreachable');
      expect(['A', 'B']).toContain(message.bountyHunt?.targetId);
      expect(message.coreRun).toBeUndefined();
      expect(message.koth).toBeUndefined();
    }
  });

  it('snapshots carry Wasteland Warp countdown state only after activation', () => {
    process.env.FORCE_MODE = GameModeType.DEATHMATCH;
    const dt = 0.05;
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');
    const toActive = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 5;
    for (let i = 1; i <= toActive; i++) mgr.tick(dt, i);

    const before = [...sent]
      .reverse()
      .find(
        (entry) =>
          entry.message.type === 'server:gameState' && entry.message.phase === MatchPhase.ACTIVE,
      );
    expect(
      before?.message.type === 'server:gameState' && before.message.wastelandWarp,
    ).toBeUndefined();

    const match = mgr.getActiveMatches()[0];
    (
      match as unknown as {
        startMutator: (mutator: MutatorId, isFinalMinute: boolean) => void;
      }
    ).startMutator('wasteland_warp', false);
    sent.length = 0;
    mgr.tick(dt, 1000);

    const after = sent.find(
      (entry) =>
        entry.message.type === 'server:gameState' && entry.message.phase === MatchPhase.ACTIVE,
    );
    if (!after || after.message.type !== 'server:gameState') {
      throw new Error('missing active warp snapshot');
    }
    expect(after.message.wastelandWarp).toMatchObject({
      secondsUntilSwap: expect.any(Number),
      sequence: 0,
    });
  });

  it('snapshots carry Scrapstorm warnings and transient impact cues', () => {
    process.env.FORCE_MODE = GameModeType.DEATHMATCH;
    const dt = 0.05;
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');
    const toActive = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 5;
    for (let i = 1; i <= toActive; i++) mgr.tick(dt, i);

    const match = mgr.getActiveMatches()[0];
    (
      match as unknown as {
        startMutator: (mutator: MutatorId, isFinalMinute: boolean) => void;
      }
    ).startMutator('scrapstorm', false);
    sent.length = 0;
    const warningTicks = Math.ceil(MUTATORS.SCRAPSTORM_FIRST_WARNING_DELAY_SECONDS / dt) + 1;
    for (let i = 1; i <= warningTicks; i++) mgr.tick(dt, 1000 + i);

    const warning = [...sent]
      .reverse()
      .find(
        (entry) =>
          entry.message.type === 'server:gameState' &&
          entry.message.scrapstorm?.targetPosition != null,
      );
    if (!warning || warning.message.type !== 'server:gameState') {
      throw new Error('missing Scrapstorm warning snapshot');
    }
    expect(warning.message.scrapstorm).toMatchObject({
      targetPosition: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      targetPlayerId: expect.stringMatching(/^[AB]$/),
      secondsUntilImpact: expect.any(Number),
      radius: MUTATORS.SCRAPSTORM_RADIUS_PX,
    });

    sent.length = 0;
    const impactTicks = Math.ceil(MUTATORS.SCRAPSTORM_WARNING_SECONDS / dt) + 1;
    for (let i = 1; i <= impactTicks; i++) mgr.tick(dt, 2000 + i);
    const impact = sent.find(
      (entry) =>
        entry.message.type === 'server:gameState' && entry.message.barrelExplosions.length > 0,
    );
    expect(impact).toBeDefined();
  });

  it('broadcasts overtimeStart and flags gameState when a tie runs out the clock', () => {
    const dt = 0.05;
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');

    const toActive = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 5;
    for (let i = 1; i <= toActive; i++) mgr.tick(dt, i);

    // Fast-forward the authoritative clock to the final moment; the 0-0
    // scoreboard is a genuine tie when it expires.
    const match = mgr.getActiveMatches()[0];
    match.matchTimer = 0.06;
    sent.length = 0;
    mgr.tick(dt, toActive + 1);
    mgr.tick(dt, toActive + 2);

    const overtimeMsgs = sent.filter((s) => s.message.type === 'server:overtimeStart');
    expect(overtimeMsgs.map((m) => m.playerId).sort()).toEqual(['A', 'B']);
    for (const { message, reliable } of overtimeMsgs) {
      if (message.type !== 'server:overtimeStart') throw new Error('unreachable');
      expect(message.overtimeEndsInMs).toBe(OVERTIME.DURATION * 1000);
      expect(reliable).toBe(true);
    }

    const lastState = [...sent].reverse().find((s) => s.message.type === 'server:gameState');
    if (!lastState || lastState.message.type !== 'server:gameState') {
      throw new Error('missing gameState');
    }
    expect(lastState.message.isOvertime).toBe(true);
    expect(lastState.message.matchTimer).toBeLessThanOrEqual(OVERTIME.DURATION);
    expect(lastState.message.matchTimer).toBeGreaterThan(OVERTIME.DURATION - 1);
  });
});

describe('MatchmakingManager pre-match draft', () => {
  let sent: SentMessage[];
  let fake: GameServer;

  beforeEach(() => {
    const made = makeFakeServer();
    fake = made.fake;
    sent = made.sent;
  });

  afterEach(() => {
    delete process.env.FORCE_MAP;
    delete process.env.FORCE_MODE;
  });

  function makeManager(rngValues: number[]): MatchmakingManager {
    return new MatchmakingManager(fake, () => 0, undefined, seededRng(rngValues));
  }

  function pairUp(mgr: MatchmakingManager): void {
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
  }

  function matchFoundMessages(bucket: SentMessage[]) {
    return bucket
      .filter((s) => s.message.type === 'server:matchFound')
      .map((s) => {
        if (s.message.type !== 'server:matchFound') throw new Error('unreachable');
        return { playerId: s.playerId, message: s.message, reliable: s.reliable };
      });
  }

  it('rolls who picks first with the injected rng (second entrant wins the roll)', () => {
    const mgr = makeManager([0.9, 0]);
    pairUp(mgr);

    // Drafting, not matched: no Match, no matchFound.
    expect(mgr.getActiveMatches()).toHaveLength(0);
    mgr.tick(0.05, 1);
    expect(sent.some((s) => s.message.type === 'server:matchFound')).toBe(false);

    const snap = latestDraftState(sent);
    expect(snap.firstPickerId).toBe('B');
    expect(snap.currentPickerId).toBe('B');
    expect(snap.players.map((p) => p.id).sort()).toEqual(['A', 'B']);
  });

  it('rolls who picks first with the injected rng (first entrant wins the roll)', () => {
    const mgr = makeManager([0.1, 0]);
    pairUp(mgr);
    mgr.tick(0.05, 1);

    const snap = latestDraftState(sent);
    expect(snap.firstPickerId).toBe('A');
    expect(snap.currentPickerId).toBe('A');
  });

  it('first pick claims map; the second picker may only pick the remaining category', () => {
    const names = listMapNames();
    const mgr = makeManager([0, 0]); // A first, B second
    pairUp(mgr);

    mgr.handleDraftPick('A', 'map', names[1]);
    mgr.tick(0.05, 1);
    let snap = latestDraftState(sent);
    expect(snap.mapPick).toBe(names[1]);
    expect(snap.modePick).toBeNull();
    // The roles are distinct: the turn moved to the OTHER entrant with a
    // fresh second-pick window.
    expect(snap.currentPickerId).toBe('B');
    expect(snap.pickDeadlineMs).toBeGreaterThan((DRAFT.SECOND_PICK_SECONDS - 1) * 1000);
    expect(snap.pickDeadlineMs).toBeLessThanOrEqual(DRAFT.SECOND_PICK_SECONDS * 1000);

    // B tries to re-pick the claimed category — ignored.
    mgr.handleDraftPick('B', 'map', names[2]);
    mgr.tick(0.05, 2);
    snap = latestDraftState(sent);
    expect(snap.mapPick).toBe(names[1]);
    expect(snap.modePick).toBeNull();
    expect(sent.some((s) => s.message.type === 'server:matchFound')).toBe(false);

    // B picks the remaining category — draft finalizes.
    mgr.handleDraftPick('B', 'mode', GameModeType.KOTH);
    const found = matchFoundMessages(sent);
    expect(found.map((f) => f.playerId).sort()).toEqual(['A', 'B']);
  });

  it('first pick claims mode; the second picker then picks the map (mirror order)', () => {
    const names = listMapNames();
    const mgr = makeManager([0.9, 0]); // B first, A second
    pairUp(mgr);

    mgr.handleDraftPick('B', 'mode', GameModeType.GUN_GAME);
    mgr.tick(0.05, 1);
    let snap = latestDraftState(sent);
    expect(snap.modePick).toBe(GameModeType.GUN_GAME);
    expect(snap.mapPick).toBeNull();
    expect(snap.currentPickerId).toBe('A');

    // A tries the claimed category — ignored.
    mgr.handleDraftPick('A', 'mode', GameModeType.KOTH);
    mgr.tick(0.05, 2);
    snap = latestDraftState(sent);
    expect(snap.modePick).toBe(GameModeType.GUN_GAME);
    expect(sent.some((s) => s.message.type === 'server:matchFound')).toBe(false);

    mgr.handleDraftPick('A', 'map', names[0]);
    const match = mgr.getActiveMatches()[0];
    expect(match.gameModeType).toBe(GameModeType.GUN_GAME);
    expect(match.mapManager.getMapData().name).toBe(names[0]);
  });

  it('ignores wrong-turn picks, unknown values, and picks from players outside the draft', () => {
    const names = listMapNames();
    const mgr = makeManager([0, 0]); // A first
    pairUp(mgr);

    mgr.handleDraftPick('B', 'map', names[0]); // not B's turn
    mgr.handleDraftPick('A', 'map', 'No Such Arena'); // unknown map
    mgr.handleDraftPick('A', 'mode', 'no_such_mode'); // unknown mode
    mgr.handleDraftPick('Z', 'map', names[0]); // not in any draft

    mgr.tick(0.05, 1);
    const snap = latestDraftState(sent);
    expect(snap.mapPick).toBeNull();
    expect(snap.modePick).toBeNull();
    expect(snap.currentPickerId).toBe('A');
    expect(sent.some((s) => s.message.type === 'server:matchFound')).toBe(false);
    expect(mgr.getActiveMatches()).toHaveLength(0);
  });

  it('creates the match with exactly the drafted map+mode and stops broadcasting', () => {
    const names = listMapNames();
    const mgr = makeManager([0, 0]); // A first
    pairUp(mgr);

    // Capture the draft's matchId so the matchFound correlation holds.
    mgr.tick(0.05, 1);
    const draftMatchId = latestDraftState(sent).matchId;

    mgr.handleDraftPick('A', 'map', names[2]);
    mgr.handleDraftPick('B', 'mode', GameModeType.KOTH);

    const found = matchFoundMessages(sent);
    expect(found.map((f) => f.playerId).sort()).toEqual(['A', 'B']);
    for (const f of found) {
      expect(f.message.matchId).toBe(draftMatchId);
      expect(f.message.mapName).toBe(names[2]);
      expect(f.message.gameMode).toBe(GameModeType.KOTH);
      expect(f.reliable).toBe(true);
    }

    const matched = sent.filter(
      (s) => s.message.type === 'server:matchmakingStatus' && s.message.status === 'matched',
    );
    expect(matched.map((s) => s.playerId).sort()).toEqual(['A', 'B']);

    // The Match itself was constructed from the drafted pair.
    const match = mgr.getActiveMatches()[0];
    expect(match.mapManager.getMapData().name).toBe(names[2]);
    expect(match.gameModeType).toBe(GameModeType.KOTH);

    // Draft broadcast stops once the match exists.
    sent.length = 0;
    mgr.tick(0.05, 2);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);
  });

  it('auto-picks the map on first-pick timeout and hands the mode to the second picker with a fresh window', () => {
    const names = listMapNames();
    // Rolls: first=A, second=B; timeout: category 0.4 (<0.5 → map),
    // option 0 → first registry map.
    const mgr = makeManager([0, 0, 0.4, 0]);
    pairUp(mgr);

    // Burn the entire first-pick window in 1s ticks.
    for (let i = 1; i <= DRAFT.FIRST_PICK_SECONDS; i++) mgr.tick(1, i);

    const snap = latestDraftState(sent);
    expect(snap.mapPick).toBe(names[0]);
    expect(snap.modePick).toBeNull();
    expect(snap.firstPickerId).toBe('A');
    expect(snap.currentPickerId).toBe('B');
    expect(snap.pickDeadlineMs).toBe(DRAFT.SECOND_PICK_SECONDS * 1000);
    expect(sent.some((s) => s.message.type === 'server:matchFound')).toBe(false);
  });

  it('first-pick timeout can auto-claim the mode category instead', () => {
    // Timeout rolls: category 0.6 (≥0.5 → mode), option 0.5 → middle mode.
    const mgr = makeManager([0, 0, 0.6, 0.5]);
    pairUp(mgr);

    for (let i = 1; i <= DRAFT.FIRST_PICK_SECONDS; i++) mgr.tick(1, i);

    const snap = latestDraftState(sent);
    const expectedMode = GAME_MODE_ROTATION[Math.floor(0.5 * GAME_MODE_ROTATION.length)];
    expect(snap.modePick).toBe(expectedMode);
    expect(snap.mapPick).toBeNull();
    expect(snap.currentPickerId).toBe('B');
  });

  it('auto-picks the remaining category on second-pick timeout and finalizes', () => {
    const names = listMapNames();
    // Rolls: first=A, second=B; second-pick timeout consumes ONE option
    // roll (the category is forced to the remaining one): 0.9 → last map.
    const mgr = makeManager([0, 0, 0.9]);
    pairUp(mgr);

    mgr.handleDraftPick('A', 'mode', GameModeType.DEATHMATCH);
    for (let i = 1; i <= DRAFT.SECOND_PICK_SECONDS; i++) mgr.tick(1, i);

    const expectedMap = names[Math.floor(0.9 * names.length)];
    const found = matchFoundMessages(sent);
    expect(found.map((f) => f.playerId).sort()).toEqual(['A', 'B']);
    for (const f of found) {
      expect(f.message.mapName).toBe(expectedMap);
      expect(f.message.gameMode).toBe(GameModeType.DEATHMATCH);
    }
    const match = mgr.getActiveMatches()[0];
    expect(match.mapManager.getMapData().name).toBe(expectedMap);
  });

  it('broadcasts a full snapshot to every entrant each tick with a counting-down deadline', () => {
    const names = listMapNames();
    const mgr = makeManager([0, 0]);
    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');

    mgr.tick(0.05, 1);
    const perTick = sent.filter((s) => s.message.type === 'server:draftState');
    expect(perTick.map((s) => s.playerId).sort()).toEqual(['A', 'B']);
    // Same cadence contract as characterSelectState: unreliable, the next
    // tick repairs a drop.
    expect(perTick.every((s) => !s.reliable)).toBe(true);

    const snap1 = latestDraftState(sent);
    expect(snap1.players).toEqual([
      { id: 'A', nickname: 'Ryan' },
      { id: 'B', nickname: 'Dave' },
    ]);
    expect(snap1.firstPickerId).toBe('A');
    expect(snap1.currentPickerId).toBe('A');
    expect(snap1.mapPick).toBeNull();
    expect(snap1.modePick).toBeNull();
    expect(snap1.mapOptions).toEqual([...names]);
    expect(snap1.modeOptions).toEqual([...GAME_MODE_ROTATION]);
    expect(snap1.pickDeadlineMs).toBeGreaterThan(0);
    expect(snap1.pickDeadlineMs).toBeLessThanOrEqual(DRAFT.FIRST_PICK_SECONDS * 1000);

    sent.length = 0;
    mgr.tick(0.05, 2);
    const snap2 = latestDraftState(sent);
    expect(snap2.pickDeadlineMs).toBeLessThan(snap1.pickDeadlineMs);

    // Picks land in the very next snapshot.
    mgr.handleDraftPick('A', 'map', names[1]);
    sent.length = 0;
    mgr.tick(0.05, 3);
    const snap3 = latestDraftState(sent);
    expect(snap3.mapPick).toBe(names[1]);
    expect(snap3.currentPickerId).toBe('B');
  });

  it('FORCE_MAP skips the draft entirely (immediate matchFound, no draftState)', () => {
    const names = listMapNames();
    process.env.FORCE_MAP = names[1];
    const mgr = makeManager([0, 0]);
    pairUp(mgr);

    const found = matchFoundMessages(sent);
    expect(found.map((f) => f.playerId).sort()).toEqual(['A', 'B']);
    expect(found[0].message.mapName).toBe(names[1]);

    mgr.tick(0.05, 1);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);
  });

  it('FORCE_MODE skips the draft entirely (immediate matchFound, no draftState)', () => {
    process.env.FORCE_MODE = GameModeType.KOTH;
    const mgr = makeManager([0, 0]);
    pairUp(mgr);

    const found = matchFoundMessages(sent);
    expect(found.map((f) => f.playerId).sort()).toEqual(['A', 'B']);
    expect(found[0].message.gameMode).toBe(GameModeType.KOTH);

    mgr.tick(0.05, 1);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);
  });

  it('a rematch opens a fresh draft with a fresh roll and plays the drafted map/mode', () => {
    const names = listMapNames();
    // Fresh roll: A first. Rematch roll: 0.9 → B first.
    const mgr = makeManager([0, 0, 0.9, 0]);
    pairUp(mgr);
    walkDraft(mgr, sent);

    const match = mgr.getActiveMatches()[0];
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    sent.length = 0;

    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');

    // No instant match — a new draft with a fresh who-picks-first roll.
    expect(mgr.getActiveMatches()).toHaveLength(0);
    expect(sent.some((s) => s.message.type === 'server:matchFound')).toBe(false);
    mgr.tick(0.05, 2);
    const snap = latestDraftState(sent);
    expect(snap.firstPickerId).toBe('B');

    mgr.handleDraftPick('B', 'mode', GameModeType.GUN_GAME);
    mgr.handleDraftPick('A', 'map', names[2]);

    const rematch = mgr.getActiveMatches()[0];
    expect(rematch.gameModeType).toBe(GameModeType.GUN_GAME);
    expect(rematch.mapManager.getMapData().name).toBe(names[2]);
  });

  it('tears the draft down when an entrant disconnects', () => {
    const mgr = makeManager([0, 0]);
    pairUp(mgr);
    sent.length = 0;

    mgr.handlePlayerDisconnect('A');

    const disc = sent.filter((s) => s.message.type === 'server:opponentDisconnected');
    expect(disc).toHaveLength(1);
    expect(disc[0].playerId).toBe('B');
    expect(disc[0].reliable).toBe(true);

    // Broadcast stops and no match ever forms.
    sent.length = 0;
    mgr.tick(0.05, 1);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);
    expect(mgr.getActiveMatches()).toHaveLength(0);

    // The remaining player is back in the lobby and can re-queue.
    mgr.handleJoinMatchmaking('B', 'B');
    expect(
      sent.some(
        (s) =>
          s.playerId === 'B' &&
          s.message.type === 'server:matchmakingStatus' &&
          s.message.status === 'queued',
      ),
    ).toBe(true);
  });

  it('treats returnToLobby from a drafting player as a draft teardown', () => {
    const mgr = makeManager([0, 0]);
    pairUp(mgr);
    sent.length = 0;

    mgr.handleReturnToLobby('B');

    const disc = sent.filter((s) => s.message.type === 'server:opponentDisconnected');
    expect(disc.map((d) => d.playerId)).toEqual(['A']);
    mgr.tick(0.05, 1);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);

    // BOTH entrants were released — re-pairing starts a brand-new draft.
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    sent.length = 0;
    mgr.tick(0.05, 2);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(true);
  });

  it('ignores joinMatchmaking from a player already in a draft', () => {
    const mgr = makeManager([0, 0]);
    pairUp(mgr);
    sent.length = 0;

    mgr.handleJoinMatchmaking('A', 'A');

    expect(mgr.getQueueLength()).toBe(0);
    expect(
      sent.some((s) => s.playerId === 'A' && s.message.type === 'server:matchmakingStatus'),
    ).toBe(false);
  });
});

describe('MatchmakingManager persistent stats integration', () => {
  let dataDir: string;
  let store: PersistentStatsStore | null;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'mmr-mm-stats-'));
    store = null;
  });

  afterEach(async () => {
    // Drain queued writes before deleting the dir so the background write
    // doesn't race rmSync.
    await store?.flush();
    vi.unstubAllEnvs();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('records the match into the store and ships the rivalry in matchEnd', () => {
    const { fake, sent } = makeFakeServer();
    store = new PersistentStatsStore(dataDir);
    const mgr = new MatchmakingManager(fake, () => 0, store);

    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');
    walkDraft(mgr, sent);
    const match = mgr.getActiveMatches()[0];
    const initialFound = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!initialFound || initialFound.message.type !== 'server:matchFound') {
      throw new Error('missing initial matchFound');
    }
    expect(initialFound.message.characterWins).toEqual(createEmptyCharacterWins());
    // Give Ryan a decisive scoreboard so the winner is unambiguous.
    match.players.get('A')!.characterId = 'jack';
    match.players.get('B')!.characterId = 'bubba';
    match.players.get('A')!.score = 3;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    // Lifetime store took the match...
    expect(store.getLifetime('Ryan')!.wins).toBe(1);
    expect(store.getLifetime('Dave')!.losses).toBe(1);
    expect(store.getLifetime('Ryan')!.characterWins.jack).toBe(1);
    expect(store.getLifetime('Dave')!.characterWins.bubba).toBe(0);

    // ...and both matchEnd messages carry the updated rivalry.
    const matchEndMsgs = sent.filter((s) => s.message.type === 'server:matchEnd');
    expect(matchEndMsgs).toHaveLength(2);
    for (const { message } of matchEndMsgs) {
      if (message.type !== 'server:matchEnd') throw new Error('unreachable');
      expect(message.result.rivalry).toEqual({
        nicknameA: 'Dave',
        nicknameB: 'Ryan',
        winsA: 0,
        winsB: 1,
        draws: 0,
      });
      expect(message.result.winStreaks).toEqual({
        A: { previous: 0, current: 1, previousBest: 0, best: 1 },
        B: { previous: 0, current: 0, previousBest: 0, best: 0 },
      });
    }

    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    walkDraft(mgr, sent);
    const rematchFound = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound');
    if (!rematchFound || rematchFound.message.type !== 'server:matchFound') {
      throw new Error('missing rematch matchFound');
    }
    expect(rematchFound.message.characterWins?.jack).toBe(1);
  });

  it('rebroadcasts the refreshed leaderboard to every connection after stats are recorded', () => {
    const { fake, sent, connected } = makeFakeServer();
    store = new PersistentStatsStore(dataDir);
    const mgr = new MatchmakingManager(fake, () => 0, store);

    // A third, idle connection (lobby) must get the refresh too.
    connected.push('A', 'B', 'C');

    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');
    walkDraft(mgr, sent);
    const match = mgr.getActiveMatches()[0];
    match.players.get('A')!.score = 3;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    const leaderboardMsgs = sent.filter((s) => s.message.type === 'server:leaderboard');
    expect(leaderboardMsgs.map((s) => s.playerId)).toEqual(['A', 'B', 'C']);
    for (const { message, reliable } of leaderboardMsgs) {
      if (message.type !== 'server:leaderboard') throw new Error('unreachable');
      expect(reliable).toBe(true);
      // Ryan won, so he leads Dave; the just-recorded match is included.
      expect(message.entries.map((e) => e.nickname)).toEqual(['Ryan', 'Dave']);
      expect(message.entries[0].wins).toBe(1);
    }
  });

  it('persists completed contracts and returns the updated career total', () => {
    vi.stubEnv('FORCE_CONTRACT', 'hot_shot');
    const { fake, sent } = makeFakeServer();
    store = new PersistentStatsStore(dataDir);
    const mgr = new MatchmakingManager(fake, () => 0, store);

    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');
    walkDraft(mgr, sent);
    const match = mgr.getActiveMatches()[0];
    for (let i = 0; i < 8; i++) match.stats.recordHit('A');
    match.players.get('A')!.score = 3;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    expect(store.getLifetime('Ryan')!.contractsCompleted).toBe(1);
    expect(store.getLifetime('Dave')!.contractsCompleted).toBe(0);
    const end = sent.find((entry) => entry.message.type === 'server:matchEnd');
    if (!end || end.message.type !== 'server:matchEnd') {
      throw new Error('missing matchEnd');
    }
    expect(end.message.result.contract).toMatchObject({
      id: 'hot_shot',
      careerCompletions: { A: 1, B: 0 },
      players: [
        { playerId: 'A', progress: 8, completed: true },
        { playerId: 'B', progress: 0, completed: false },
      ],
    });
  });

  it('sends no leaderboard when no store is configured', () => {
    const { fake, sent, connected } = makeFakeServer();
    const mgr = new MatchmakingManager(fake);
    connected.push('A', 'B');

    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');
    walkDraft(mgr, sent);
    mgr.getActiveMatches()[0].phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    expect(sent.some((s) => s.message.type === 'server:leaderboard')).toBe(false);
  });

  it('ships rivalry: null when no store is configured', () => {
    const { fake, sent } = makeFakeServer();
    const mgr = new MatchmakingManager(fake);

    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');
    walkDraft(mgr, sent);
    mgr.getActiveMatches()[0].phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    const matchEnd = sent.find((s) => s.message.type === 'server:matchEnd');
    if (!matchEnd || matchEnd.message.type !== 'server:matchEnd') {
      throw new Error('missing matchEnd');
    }
    expect(matchEnd.message.result.rivalry).toBeNull();
  });
});

describe('MatchmakingManager solo practice flow', () => {
  let dataDir: string;
  let store: PersistentStatsStore;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'mmr-practice-stats-'));
    store = new PersistentStatsStore(dataDir);
  });

  afterEach(async () => {
    await store.flush();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('starts immediately, locks Rusty, keeps stats clean, and auto-accepts a direct rematch', () => {
    const { fake, sent, connected } = makeFakeServer();
    connected.push('A');
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0]));

    mgr.handleStartPractice('A', 'Alpha');
    expect(mgr.getQueueLength()).toBe(0);
    expect(mgr.getActiveMatches()).toHaveLength(1);
    const first = mgr.getActiveMatches()[0];
    const bot = [...first.players.values()].find((player) => player.id.startsWith('bot:'))!;
    expect(bot.nickname).toBe('RUSTY');
    expect(first.selectionState.get(bot.id)?.locked).not.toBeNull();

    const found = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!found || found.message.type !== 'server:matchFound') {
      throw new Error('missing practice matchFound');
    }
    expect(found.message.opponents).toEqual([{ id: bot.id, nickname: 'RUSTY' }]);

    const previousMutators: MutatorId[] = ['second_wind', 'blackout'];
    (first.activeMutators as MutatorId[]).push(...previousMutators);
    first.players.get('A')!.score = 3;
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    const ended = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!ended || ended.message.type !== 'server:matchEnd') {
      throw new Error('missing practice matchEnd');
    }
    expect(ended.message.result.isPractice).toBe(true);
    expect(ended.message.result.rivalry).toBeNull();
    expect(ended.message.result.winStreaks).toBeUndefined();
    expect(ended.message.result.rivalrySet?.players[0].wins).toBe(1);
    expect(store.getLifetime('Alpha')).toBeNull();
    expect(store.getLifetime('Rusty')).toBeNull();
    expect(sent.some((entry) => entry.message.type === 'server:leaderboard')).toBe(false);

    sent.length = 0;
    mgr.handleRematchRequest('A');
    expect(mgr.getActiveMatches()).toHaveLength(1);
    const rematch = mgr.getActiveMatches()[0];
    expect(rematch.mapManager.getMapData().name).toBe('Overgrown Suburb');
    expect(rematch.gameModeType).toBe(GameModeType.KOTH);
    expect(rematch.players.has(bot.id)).toBe(true);
    expect(rematch.selectionState.get(bot.id)?.locked).not.toBeNull();
    expect(sent.some((entry) => entry.message.type === 'server:draftState')).toBe(false);
    const rematchInternals = rematch as unknown as {
      rematchMutatorExclusions: ReadonlySet<MutatorId>;
    };
    expect([...rematchInternals.rematchMutatorExclusions]).toEqual(previousMutators);
  });

  it('pins a validated Spar mode through the result promise and direct rematch', () => {
    const { fake, sent } = makeFakeServer();
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0]));

    mgr.handleStartPractice('A', 'Alpha', 'scrapper', 'sparring', GameModeType.CORE_RUN);
    const first = mgr.getActiveMatches()[0];
    expect(first.gameModeType).toBe(GameModeType.CORE_RUN);

    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    const ended = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!ended || ended.message.type !== 'server:matchEnd') {
      throw new Error('missing pinned practice matchEnd');
    }
    expect(ended.message.result.nextGameMode).toBe(GameModeType.CORE_RUN);

    mgr.handleRematchRequest('A');
    expect(mgr.getActiveMatches()[0].gameModeType).toBe(GameModeType.CORE_RUN);
  });

  it('pins a validated Spar rival through direct rematches', () => {
    const { fake } = makeFakeServer();
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0]));

    mgr.handleStartPractice('A', 'Alpha', 'scrapper', 'sparring', undefined, 'frost_wizard');
    const first = mgr.getActiveMatches()[0];
    const firstBot = [...first.selectionState.entries()].find(([playerId]) =>
      playerId.startsWith('bot:'),
    );
    expect(firstBot?.[1].locked).toBe('frost_wizard');

    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    mgr.handleRematchRequest('A');

    const rematch = mgr.getActiveMatches()[0];
    const rematchBot = [...rematch.selectionState.entries()].find(([playerId]) =>
      playerId.startsWith('bot:'),
    );
    expect(rematchBot?.[1].locked).toBe('frost_wizard');
  });

  it('rejects malformed Spar pins and ignores pins on Gauntlet requests', () => {
    const invalid = makeFakeServer();
    const invalidMgr = new MatchmakingManager(invalid.fake, () => 0, store, seededRng([0, 0, 0]));
    invalidMgr.handleStartPractice(
      'A',
      'Alpha',
      'scrapper',
      'sparring',
      'not-a-mode' as GameModeType,
      'not-a-fighter' as CharacterId,
    );
    const invalidMatch = invalidMgr.getActiveMatches()[0];
    expect(invalidMatch.gameModeType).toBe(GameModeType.DEATHMATCH);
    const invalidBot = [...invalidMatch.selectionState.entries()].find(([playerId]) =>
      playerId.startsWith('bot:'),
    );
    expect(invalidBot?.[1].locked).toBe('mighty_man');

    const gauntlet = makeFakeServer();
    const gauntletMgr = new MatchmakingManager(gauntlet.fake, () => 0, store, seededRng([0, 0, 0]));
    gauntletMgr.handleStartPractice(
      'B',
      'Bravo',
      'rookie',
      'gauntlet',
      GameModeType.CORE_RUN,
      'rook',
    );
    const gauntletMatch = gauntletMgr.getActiveMatches()[0];
    expect(gauntletMatch.gameModeType).toBe(GameModeType.DEATHMATCH);
    const gauntletBot = [...gauntletMatch.selectionState.entries()].find(([playerId]) =>
      playerId.startsWith('bot:'),
    );
    expect(gauntletBot?.[1].locked).toBe('mighty_man');
  });

  it('pins a shared UTC Daily Run opening and retries the same challenge after failure', () => {
    const { fake, sent } = makeFakeServer();
    const challengeDate = new Date('2026-07-13T23:30:00Z');
    const mgr = new MatchmakingManager(
      fake,
      () => 0,
      store,
      seededRng([0.99, 0.99, 0.99]),
      () => challengeDate,
    );

    mgr.handleStartPractice('A', 'Alpha', 'warlord', 'daily');
    const opening = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!opening || opening.message.type !== 'server:matchFound' || !opening.message.gauntlet) {
      throw new Error('missing Daily Run matchFound');
    }
    const openingSummary = {
      mapName: opening.message.mapName,
      gameMode: opening.message.gameMode,
      opponentCharacterId: opening.message.gauntlet.opponentCharacterId,
    };
    expect(opening.message.gauntlet).toMatchObject({
      stage: 1,
      difficulty: 'rookie',
      runScore: 0,
      challengeKey: dailyChallengeKey(challengeDate),
      dailyChase: { kind: 'set_pace' },
    });

    const first = mgr.getActiveMatches()[0];
    const botId = [...first.players.keys()].find((playerId) => playerId.startsWith('bot:'))!;
    const openingContractId = first.getContractHudState().id;
    const openingPlayerPosition = { ...first.players.get('A')!.position };
    const openingBotPosition = { ...first.players.get(botId)!.position };
    expect(first.selectionState.get(botId)?.locked).toBe(openingSummary.opponentCharacterId);

    const { fake: secondFake } = makeFakeServer();
    const secondMgr = new MatchmakingManager(
      secondFake,
      () => 0,
      store,
      seededRng([0.01, 0.01, 0.01]),
      () => challengeDate,
    );
    secondMgr.handleStartPractice('B', 'Bravo', 'scrapper', 'daily');
    const second = secondMgr.getActiveMatches()[0];
    const secondBotId = [...second.players.keys()].find((playerId) =>
      playerId.startsWith('bot:'),
    )!;
    expect(second.mapManager.getMapData().name).toBe(openingSummary.mapName);
    expect(second.gameModeType).toBe(openingSummary.gameMode);
    expect(second.getContractHudState().id).toBe(openingContractId);
    expect(second.players.get('B')?.position).toEqual(openingPlayerPosition);
    expect(second.players.get(secondBotId)?.position).toEqual(openingBotPosition);

    first.players.get(botId)!.score = 3;
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    const ended = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!ended || ended.message.type !== 'server:matchEnd') {
      throw new Error('missing Daily Run result');
    }
    expect(ended.message.result.gauntlet).toMatchObject({
      outcome: 'failed',
      challengeKey: '2026-07-13',
      nextStage: 1,
    });
    expect(ended.message.result.nextMapName).toBe(openingSummary.mapName);
    expect(ended.message.result.nextGameMode).toBe(openingSummary.gameMode);

    sent.length = 0;
    mgr.handleRematchRequest('A');
    const retry = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!retry || retry.message.type !== 'server:matchFound') {
      throw new Error('missing Daily Run retry');
    }
    expect({
      mapName: retry.message.mapName,
      gameMode: retry.message.gameMode,
      opponentCharacterId: retry.message.gauntlet?.opponentCharacterId,
      challengeKey: retry.message.gauntlet?.challengeKey,
      dailyChase: retry.message.gauntlet?.dailyChase,
    }).toEqual({
      ...openingSummary,
      challengeKey: '2026-07-13',
      dailyChase: { kind: 'set_pace' },
    });
    const retryMatch = mgr.getActiveMatches()[0];
    expect(retryMatch.getContractHudState().id).toBe(openingContractId);
    expect(retryMatch.players.get('A')?.position).toEqual(openingPlayerPosition);
    expect(retryMatch.players.get(botId)?.position).toEqual(openingBotPosition);
  });

  it('records a completed Daily Run, returns its rank, and rebroadcasts standings', () => {
    process.env.FORCE_MODE = GameModeType.DEATHMATCH;
    try {
      const { fake, sent, connected } = makeFakeServer();
      connected.push('A', 'OBSERVER');
      const challengeDate = new Date('2026-07-13T18:00:00Z');
      const mgr = new MatchmakingManager(
        fake,
        () => 0,
        store,
        seededRng([0, 0, 0, 0]),
        () => challengeDate,
      );

      mgr.handleStartPractice('A', 'Alpha', 'rookie', 'daily');
      for (let stage = 1; stage <= 3; stage += 1) {
        const match = mgr.getActiveMatches()[0];
        match.players.get('A')!.score = 3;
        match.matchTimer = 60;
        match.phase = MatchPhase.ENDED;
        mgr.tick(0.05, stage);
        if (stage < 3) {
          expect(
            sent.some((entry) => entry.message.type === 'server:dailyGauntletLeaderboard'),
          ).toBe(false);
          sent.length = 0;
          mgr.handleRematchRequest('A');
          const nextStage = sent.find(
            (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
          );
          if (!nextStage || nextStage.message.type !== 'server:matchFound') {
            throw new Error('missing next Daily Run stage');
          }
          expect(nextStage.message.gauntlet?.dailyChase).toEqual({ kind: 'set_pace' });
        }
      }

      const cleared = [...sent]
        .reverse()
        .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
      if (!cleared || cleared.message.type !== 'server:matchEnd') {
        throw new Error('missing ranked Daily Run clear');
      }
      expect(cleared.message.result.gauntlet).toMatchObject({
        challengeKey: '2026-07-13',
        outcome: 'cleared',
        dailyRank: 1,
      });
      expect(cleared.message.result.gauntlet?.dailyBestScore).toBe(
        cleared.message.result.gauntlet?.runScore,
      );
      expect(store.getLifetime('Alpha')).toBeNull();
      expect(store.getDailyGauntletLeaderboard('2026-07-13', 5)).toEqual([
        {
          nickname: 'Alpha',
          score: cleared.message.result.gauntlet?.runScore,
        },
      ]);

      const updates = sent.filter(
        (entry) => entry.message.type === 'server:dailyGauntletLeaderboard',
      );
      expect(updates.map((entry) => entry.playerId)).toEqual(['A', 'OBSERVER']);
      for (const update of updates) {
        if (update.message.type !== 'server:dailyGauntletLeaderboard') continue;
        expect(update.reliable).toBe(true);
        expect(update.message.challengeKey).toBe('2026-07-13');
        expect(update.message.entries[0]).toMatchObject({ nickname: 'Alpha' });
      }

      sent.length = 0;
      mgr.handleRematchRequest('A');
      const retry = sent.find(
        (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
      );
      if (!retry || retry.message.type !== 'server:matchFound') {
        throw new Error('missing ranked Daily Run retry');
      }
      expect(retry.message.gauntlet?.dailyChase).toEqual({
        kind: 'defend_lead',
        targetScore: (cleared.message.result.gauntlet?.runScore ?? 0) + 1,
      });
    } finally {
      delete process.env.FORCE_MODE;
    }
  });

  it('removes a queued player before opening practice', () => {
    const { fake } = makeFakeServer();
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0]));
    mgr.handleJoinMatchmaking('A', 'Alpha');
    expect(mgr.getQueueLength()).toBe(1);
    mgr.handleStartPractice('A', 'Alpha');
    expect(mgr.getQueueLength()).toBe(0);
    expect(mgr.getActiveMatches()).toHaveLength(1);
  });

  it('forecasts only mode-compatible chaos for a forced One in the Chamber run', () => {
    process.env.FORCE_MODE = GameModeType.ONE_IN_THE_CHAMBER;
    try {
      const { fake, sent } = makeFakeServer();
      const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0, 0]));
      mgr.handleStartPractice('A', 'Alpha', 'rookie', 'gauntlet');

      const first = mgr.getActiveMatches()[0];
      first.players.get('A')!.score = 8;
      first.phase = MatchPhase.ENDED;
      mgr.tick(0.05, 1);

      const ended = [...sent]
        .reverse()
        .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
      if (!ended || ended.message.type !== 'server:matchEnd') {
        throw new Error('missing forced-mode Gauntlet result');
      }
      const routes = ended.message.result.gauntlet?.routeOptions ?? [];
      const excluded = getGameMode(GameModeType.ONE_IN_THE_CHAMBER).excludedMutators ?? [];
      expect(routes).toHaveLength(2);
      expect(routes.every((route) => route.gameMode === GameModeType.ONE_IN_THE_CHAMBER)).toBe(
        true,
      );
      expect(routes.every((route) => route.forecastMutatorId !== undefined)).toBe(true);
      for (const route of routes) {
        expect(excluded).not.toContain(route.forecastMutatorId);
      }
    } finally {
      delete process.env.FORCE_MODE;
    }
  });

  it('banks the human combat highlights into the authoritative Gauntlet result', () => {
    const { fake, sent } = makeFakeServer();
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0, 0]));
    mgr.handleStartPractice('A', 'Alpha', 'rookie', 'gauntlet');

    const match = mgr.getActiveMatches()[0];
    const botId = [...match.players.keys()].find((playerId) => playerId.startsWith('bot:'))!;
    match.onKill('A', botId, 'gun');
    match.players.get('A')!.score = 3;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    const ended = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!ended || ended.message.type !== 'server:matchEnd') {
      throw new Error('missing styled Gauntlet result');
    }
    expect(ended.message.result.gauntlet).toMatchObject({
      outcome: 'advanced',
      stageScore: 1650,
      runScore: 1650,
      styleBonus: 50,
    });
  });

  it('runs an escalating three-stage Gauntlet and resets a failed run', () => {
    const { fake, sent, connected } = makeFakeServer();
    connected.push('A');
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0, 0]));

    // The selected sparring difficulty is deliberately ignored in Gauntlet.
    mgr.handleStartPractice('A', 'Alpha', 'warlord', 'gauntlet');
    const opening = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!opening || opening.message.type !== 'server:matchFound') {
      throw new Error('missing Gauntlet matchFound');
    }
    expect(opening.message.gauntlet).toEqual({
      stage: 1,
      totalStages: 3,
      difficulty: 'rookie',
      runScore: 0,
      opponentCharacterId: 'mighty_man',
    });

    const first = mgr.getActiveMatches()[0];
    const firstRival = [...first.selectionState.entries()].find(([id]) =>
      id.startsWith('bot:'),
    )?.[1].locked;
    expect(firstRival).toBe('mighty_man');
    first.players.get('A')!.score = 3;
    first.matchTimer = 100;
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    const firstEnd = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!firstEnd || firstEnd.message.type !== 'server:matchEnd') {
      throw new Error('missing Gauntlet stage-one result');
    }
    expect(firstEnd.message.result.gauntlet).toMatchObject({
      stage: 1,
      difficulty: 'rookie',
      opponentCharacterId: 'mighty_man',
      outcome: 'advanced',
      stageScore: 1800,
      runScore: 1800,
      chaosBountyBonus: 0,
      flawlessBonus: 400,
      paceBonus: 200,
      nextStage: 2,
      nextDifficulty: 'scrapper',
      routeOptions: [
        {
          id: 'route_a',
          mapName: 'Overgrown Suburb',
          gameMode: GameModeType.KOTH,
          opponentCharacterId: 'bruce',
        },
        {
          id: 'route_b',
          mapName: 'Scrapyard',
          gameMode: GameModeType.GUN_GAME,
          opponentCharacterId: 'frost_wizard',
        },
      ],
    });
    const firstRoutes = firstEnd.message.result.gauntlet?.routeOptions ?? [];
    expect(firstRoutes).toHaveLength(2);
    expect(firstRoutes.every((route) => route.forecastMutatorId !== undefined)).toBe(true);
    expect(new Set(firstRoutes.map((route) => route.forecastMutatorId)).size).toBe(2);
    const secondForecast = firstRoutes[1].forecastMutatorId!;
    const secondBounty = practiceGauntletChaosBounty(secondForecast);
    expect(firstEnd.message.result.rivalrySet).toBeNull();
    expect(store.getLifetime('Alpha')).toBeNull();

    sent.length = 0;
    mgr.handleRematchRequest('A', 'route_b');
    const secondFound = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!secondFound || secondFound.message.type !== 'server:matchFound') {
      throw new Error('missing Gauntlet stage-two matchFound');
    }
    expect(secondFound.message.gauntlet).toEqual({
      stage: 2,
      totalStages: 3,
      difficulty: 'scrapper',
      runScore: 1800,
      opponentCharacterId: 'frost_wizard',
      forecastMutatorId: secondForecast,
    });
    expect(secondFound.message.mapName).toBe('Scrapyard');
    expect(secondFound.message.gameMode).toBe(GameModeType.GUN_GAME);

    const second = mgr.getActiveMatches()[0];
    const secondRival = [...second.selectionState.entries()].find(([id]) =>
      id.startsWith('bot:'),
    )?.[1].locked;
    expect(secondRival).toBe('frost_wizard');
    second.players.get('A')!.score = 3;
    second.stats.recordDeath('A');
    second.matchTimer = 47.9;
    second.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 2);
    const secondEnd = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!secondEnd || secondEnd.message.type !== 'server:matchEnd') {
      throw new Error('missing Gauntlet stage-two result');
    }
    expect(secondEnd.message.result.gauntlet).toMatchObject({
      stage: 2,
      difficulty: 'scrapper',
      opponentCharacterId: 'frost_wizard',
      forecastMutatorId: secondForecast,
      outcome: 'advanced',
      stageScore: 1294 + secondBounty,
      runScore: 3094 + secondBounty,
      chaosBountyBonus: secondBounty,
      flawlessBonus: 0,
      paceBonus: 94,
      nextStage: 3,
      nextDifficulty: 'warlord',
      routeOptions: [
        {
          id: 'route_a',
          mapName: 'Collapsed Overpass',
          gameMode: GameModeType.LAST_STAND,
          opponentCharacterId: 'bubba',
        },
        {
          id: 'route_b',
          mapName: 'Checkpoint Zero',
          gameMode: GameModeType.KILL_CONFIRMED,
          opponentCharacterId: 'jack',
        },
      ],
    });
    const secondRoutes = secondEnd.message.result.gauntlet?.routeOptions ?? [];
    expect(secondRoutes).toHaveLength(2);
    expect(secondRoutes.every((route) => route.forecastMutatorId !== undefined)).toBe(true);
    expect(new Set(secondRoutes.map((route) => route.forecastMutatorId)).size).toBe(2);
    expect(secondRoutes.map((route) => route.forecastMutatorId)).not.toContain(secondForecast);
    const thirdForecast = secondRoutes[0].forecastMutatorId!;
    const thirdBounty = practiceGauntletChaosBounty(thirdForecast);

    sent.length = 0;
    mgr.handleRematchRequest(
      'A',
      'not-a-server-route' as Parameters<MatchmakingManager['handleRematchRequest']>[1],
    );
    const thirdFound = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!thirdFound || thirdFound.message.type !== 'server:matchFound') {
      throw new Error('missing Gauntlet stage-three matchFound');
    }
    expect(thirdFound.message.gauntlet).toEqual({
      stage: 3,
      totalStages: 3,
      difficulty: 'warlord',
      runScore: 3094 + secondBounty,
      opponentCharacterId: 'bubba',
      forecastMutatorId: thirdForecast,
    });
    expect(thirdFound.message.mapName).toBe('Collapsed Overpass');
    expect(thirdFound.message.gameMode).toBe(GameModeType.LAST_STAND);

    const third = mgr.getActiveMatches()[0];
    const thirdRival = [...third.selectionState.entries()].find(([id]) =>
      id.startsWith('bot:'),
    )?.[1].locked;
    expect(thirdRival).toBe('bubba');
    expect(new Set([firstRival, secondRival, thirdRival]).size).toBe(3);
    third.players.get('A')!.score = 3;
    third.matchTimer = 0;
    third.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 3);
    const cleared = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!cleared || cleared.message.type !== 'server:matchEnd') {
      throw new Error('missing Gauntlet clear result');
    }
    expect(cleared.message.result.gauntlet).toMatchObject({
      stage: 3,
      difficulty: 'warlord',
      opponentCharacterId: 'bubba',
      forecastMutatorId: thirdForecast,
      outcome: 'cleared',
      stageScore: 1600 + thirdBounty,
      runScore: 4694 + secondBounty + thirdBounty,
      chaosBountyBonus: thirdBounty,
      flawlessBonus: 400,
      paceBonus: 0,
      nextStage: 1,
      nextDifficulty: 'rookie',
    });
    expect(cleared.message.result.gauntlet?.routeOptions).toBeUndefined();

    sent.length = 0;
    mgr.handleRematchRequest('A');
    const retry = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!retry || retry.message.type !== 'server:matchFound') {
      throw new Error('missing post-clear Gauntlet retry');
    }
    expect(retry.message.gauntlet).toEqual({
      stage: 1,
      totalStages: 3,
      difficulty: 'rookie',
      runScore: 0,
      opponentCharacterId: 'mighty_man',
    });

    const retryMatch = mgr.getActiveMatches()[0];
    const bot = [...retryMatch.players.values()].find((player) => player.id.startsWith('bot:'))!;
    bot.score = 3;
    retryMatch.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 4);
    const failed = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!failed || failed.message.type !== 'server:matchEnd') {
      throw new Error('missing Gauntlet failure result');
    }
    expect(failed.message.result.gauntlet).toMatchObject({
      stage: 1,
      difficulty: 'rookie',
      opponentCharacterId: 'mighty_man',
      outcome: 'failed',
      stageScore: 0,
      runScore: 0,
      chaosBountyBonus: 0,
      nextStage: 1,
      nextDifficulty: 'rookie',
    });
    expect(failed.message.result.gauntlet?.routeOptions).toBeUndefined();
  });
});

describe('match clock alignment (regression: 3-second event/timer offset)', () => {
  it('matchEndsInMs equals the wall-clock time between matchStart broadcast and eventStart broadcast', () => {
    process.env.FORCE_EVENT = 'infinite_ammo';
    try {
      const { fake, sent } = makeFakeServer();
      const mgr = new MatchmakingManager(fake);
      const dt = 0.05;

      mgr.handleJoinMatchmaking('A', 'A');
      mgr.handleJoinMatchmaking('B', 'B');
      walkDraft(mgr, sent);
      expect(mgr.getActiveMatches()).toHaveLength(1);

      // Skip CHARACTER_SELECT — both players lock immediately so the
      // match transitions to COUNTDOWN on the next tick.
      mgr.handleCharacterLock('A', 'mighty_man');
      mgr.handleCharacterLock('B', 'bruce');

      let matchStartTick = -1;
      let matchEndsInMsValue = 0;
      let eventStartTick = -1;
      const totalTicks = Math.ceil(
        (MATCH.COUNTDOWN_DURATION + MATCH.TIME_LIMIT - MUTATORS.ACTIVATION_AT_REMAINING + 1) / dt,
      );

      for (let i = 1; i <= totalTicks; i++) {
        mgr.tick(dt, i);
        for (const s of sent) {
          if (s.message.type === 'server:matchStart' && matchStartTick === -1) {
            matchStartTick = i;
            matchEndsInMsValue = s.message.matchEndsInMs;
          }
          // Only the FINAL-MINUTE start is clock-aligned; the mid-match
          // mutator fires earlier at a random time and must be ignored.
          if (
            s.message.type === 'server:eventStart' &&
            s.message.isFinalMinute &&
            eventStartTick === -1
          ) {
            eventStartTick = i;
          }
        }
        sent.length = 0;
      }

      expect(matchStartTick).toBeGreaterThan(0);
      expect(eventStartTick).toBeGreaterThan(0);

      // Wall-clock ms between matchStart and eventStart on the server.
      const elapsedMs = (eventStartTick - matchStartTick) * dt * 1000;

      // The client computes display = matchEndsInMs - elapsedMs. For the
      // displayed timer to read ~ACTIVATION_AT_REMAINING when eventStart
      // fires, matchEndsInMs - elapsedMs must equal ACTIVATION_AT_REMAINING * 1000.
      const displayAtEventMs = matchEndsInMsValue - elapsedMs;
      const displayAtEvent = displayAtEventMs / 1000;

      // Allow a 1-tick (50ms) tolerance for tick discretization.
      expect(displayAtEvent).toBeGreaterThan(MUTATORS.ACTIVATION_AT_REMAINING - 0.06);
      expect(displayAtEvent).toBeLessThan(MUTATORS.ACTIVATION_AT_REMAINING + 0.06);
    } finally {
      delete process.env.FORCE_EVENT;
    }
  });

  it('every active-phase gameState carries the authoritative matchTimer for client re-anchoring', () => {
    const { fake, sent } = makeFakeServer();
    const mgr = new MatchmakingManager(fake);
    const dt = 0.05;

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    walkDraft(mgr, sent);

    // Skip CHARACTER_SELECT — both players lock immediately.
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');

    // Run through the countdown plus a handful of active ticks.
    const totalTicks = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 20;
    for (let i = 1; i <= totalTicks; i++) {
      mgr.tick(dt, i);
    }

    const activeStateMessages = sent.filter(
      (s) => s.message.type === 'server:gameState' && s.message.phase === MatchPhase.ACTIVE,
    );
    expect(activeStateMessages.length).toBeGreaterThan(0);

    // Each active snapshot must carry a sane matchTimer (descending toward 0,
    // never larger than TIME_LIMIT). The first one should be very close to
    // TIME_LIMIT; the last one should be smaller; all should be <= TIME_LIMIT.
    let prev = Number.POSITIVE_INFINITY;
    for (const m of activeStateMessages) {
      if (m.message.type !== 'server:gameState') throw new Error('unreachable');
      expect(m.message.matchTimer).toBeLessThanOrEqual(MATCH.TIME_LIMIT);
      expect(m.message.matchTimer).toBeLessThanOrEqual(prev + 1e-6);
      expect(m.message.matchTimer).toBeGreaterThanOrEqual(0);
      prev = m.message.matchTimer;
    }
  });
});
