import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MatchPhase, MATCH, MUTATORS, listMapNames } from '@shared/game';
import type { PlayerId, ServerMessage } from '@shared/game';
import { MatchmakingManager } from './matchmaking-manager.js';
import { PersistentStatsStore } from '../persistence/persistent-stats-store.js';
import type { GameServer } from '../network/server.js';

interface SentMessage {
  playerId: PlayerId;
  message: ServerMessage;
  reliable: boolean;
}

function makeFakeServer() {
  const sent: SentMessage[] = [];
  const fake = {
    sendTo: vi.fn((playerId: PlayerId, message: ServerMessage, opts?: { reliable?: boolean }) => {
      sent.push({ playerId, message, reliable: !!opts?.reliable });
    }),
    playerCount: 2,
  } as unknown as GameServer;
  return { fake, sent };
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
    // Find the active match and force it to ENDED so the next tick promotes
    // it into post-match state via onMatchEnded.
    const matches = mgr.getActiveMatches();
    expect(matches).toHaveLength(1);
    matches[0].phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
  }

  it('starts a rematch when both players request it', () => {
    startMatchAndForceEnd('A', 'B');
    sent.length = 0; // clear matchEnd messages

    mgr.handleRematchRequest('A');
    // After A's request, B should have been notified
    const aMsgs = sent.filter((s) => s.playerId === 'B' && s.message.type === 'server:rematchStatus');
    expect(aMsgs).toHaveLength(1);

    mgr.handleRematchRequest('B');

    const matchFoundMsgs = sent.filter((s) => s.message.type === 'server:matchFound');
    expect(matchFoundMsgs.map((m) => m.playerId).sort()).toEqual(['A', 'B']);

    // A new match should be active
    expect(mgr.getActiveMatches()).toHaveLength(1);
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
        (s) => s.message.type === 'server:matchmakingStatus'
          && s.message.status === 'cancelled',
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

      expect(sent).toContainEqual(expect.objectContaining({
        playerId: 'A',
        message: expect.objectContaining({
          type: 'server:matchmakingStatus',
          status: 'cancelled',
        }),
        reliable: true,
      }));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('MatchmakingManager map rotation', () => {
  let mgr: MatchmakingManager;
  let sent: SentMessage[];

  beforeEach(() => {
    const { fake, sent: bucket } = makeFakeServer();
    sent = bucket;
    mgr = new MatchmakingManager(fake);
  });

  afterEach(() => {
    delete process.env.FORCE_MAP;
  });

  function matchFoundMapName(playerId: PlayerId): string {
    const msg = sent.find(
      (s) => s.playerId === playerId && s.message.type === 'server:matchFound',
    );
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
    ];
    pairs.forEach(([p1, p2], i) => {
      sent.length = 0;
      mgr.handleJoinMatchmaking(p1, p1);
      mgr.handleJoinMatchmaking(p2, p2);
      expect(matchFoundMapName(p1)).toBe(names[i % names.length]);
      expect(matchFoundMapName(p2)).toBe(names[i % names.length]);
    });
    expect(matchFoundMapName('G')).toBe(names[0]); // wrapped
  });

  it('matchEnd promises the next map and the rematch delivers it', () => {
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

    // Chain continues: second rematch plays map #3, then wraps to #1.
    endActiveMatch();
    expect(lastMatchEndNextMap()).toBe(names[2]);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMapName('A')).toBe(names[2]);

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

  it('ignores an unknown FORCE_MAP and falls back to rotation', () => {
    process.env.FORCE_MAP = 'No Such Arena';
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMapName('A')).toBe(listMapNames()[0]);
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
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('records the match into the store and ships the rivalry in matchEnd', () => {
    const { fake, sent } = makeFakeServer();
    store = new PersistentStatsStore(dataDir);
    const mgr = new MatchmakingManager(fake, () => 0, store);

    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');
    const match = mgr.getActiveMatches()[0];
    // Give Ryan a decisive scoreboard so the winner is unambiguous.
    match.players.get('A')!.score = 3;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    // Lifetime store took the match...
    expect(store.getLifetime('Ryan')!.wins).toBe(1);
    expect(store.getLifetime('Dave')!.losses).toBe(1);

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
    }
  });

  it('ships rivalry: null when no store is configured', () => {
    const { fake, sent } = makeFakeServer();
    const mgr = new MatchmakingManager(fake);

    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');
    mgr.getActiveMatches()[0].phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    const matchEnd = sent.find((s) => s.message.type === 'server:matchEnd');
    if (!matchEnd || matchEnd.message.type !== 'server:matchEnd') {
      throw new Error('missing matchEnd');
    }
    expect(matchEnd.message.result.rivalry).toBeNull();
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
