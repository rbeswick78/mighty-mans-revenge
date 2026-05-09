import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatchPhase, MATCH, EVENT } from '@shared/game';
import type { PlayerId, ServerMessage } from '@shared/game';
import { MatchmakingManager } from './matchmaking-manager.js';
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
        (MATCH.COUNTDOWN_DURATION + MATCH.TIME_LIMIT - EVENT.ACTIVATION_AT_REMAINING + 1) / dt,
      );

      for (let i = 1; i <= totalTicks; i++) {
        mgr.tick(dt, i);
        for (const s of sent) {
          if (s.message.type === 'server:matchStart' && matchStartTick === -1) {
            matchStartTick = i;
            matchEndsInMsValue = s.message.matchEndsInMs;
          }
          if (s.message.type === 'server:eventStart' && eventStartTick === -1) {
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
      expect(displayAtEvent).toBeGreaterThan(EVENT.ACTIVATION_AT_REMAINING - 0.06);
      expect(displayAtEvent).toBeLessThan(EVENT.ACTIVATION_AT_REMAINING + 0.06);
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
