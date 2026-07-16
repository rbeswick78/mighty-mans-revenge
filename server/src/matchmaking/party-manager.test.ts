import { describe, expect, it } from 'vitest';
import { GameModeType, normalizeMatchIntent } from '@shared/game';
import type { MatchFormat, MatchIntent, PartyState, PlayerId, ServerMessage } from '@shared/game';
import { PARTY_BOT_FILL_WAIT_MS, PARTY_EMPTY_EXPIRY_MS } from '@shared/game';
import { PartyManager } from './party-manager.js';

const id = (value: string) => value as PlayerId;
const player1 = id('player-11111111');
const player2 = id('player-22222222');
const player3 = id('player-33333333');
const player4 = id('player-44444444');
const player5 = id('player-55555555');

function intent(format: MatchFormat, humanCount: number, fighterId = 'mighty_man'): MatchIntent {
  return {
    intentId: `intent_${format}_${humanCount}`,
    format,
    composition: { humanCount, botCount: format === 'duel' ? 2 - humanCount : 4 - humanCount },
    mode: format === 'crew' ? GameModeType.DEATHMATCH : GameModeType.KOTH,
    fighterId,
    scheduledArena: {
      mode: format === 'crew' ? GameModeType.DEATHMATCH : GameModeType.KOTH,
      mapName: 'Wasteland Outpost',
      rotationEndsAt: 99_999,
    },
  } as MatchIntent;
}

function harness(
  codes: string[] = ['ABCDE'],
  queueResult: string | null = 'match_12345678',
  normalizeIntent: (value: unknown) => Readonly<MatchIntent> | null = (value) =>
    value as Readonly<MatchIntent>,
) {
  let now = 1_000;
  let monotonicNow = 100;
  const sent: Array<{ playerId: PlayerId; message: ServerMessage }> = [];
  const queued: PartyState[] = [];
  const manager = new PartyManager({
    sendTo: (playerId, message) => sent.push({ playerId, message }),
    normalizeIntent,
    now: () => now,
    monotonicNow: () => monotonicNow,
    createPartyId: () => `party_${sent.length}_12345678`,
    createCode: () => codes.shift() ?? 'ZZZZZ',
    queueParty: (state) => {
      queued.push(state as PartyState);
      return queueResult;
    },
  });
  return {
    manager,
    sent,
    queued,
    advance: (milliseconds: number) => {
      now += milliseconds;
      monotonicNow += milliseconds;
    },
    advanceWall: (milliseconds: number) => (now += milliseconds),
    advanceMonotonic: (milliseconds: number) => (monotonicNow += milliseconds),
  };
}

function latestState(sent: Array<{ message: ServerMessage }>) {
  const message = [...sent]
    .reverse()
    .find((entry) => entry.message.type === 'server:partyState')?.message;
  if (!message || message.type !== 'server:partyState') throw new Error('missing party state');
  return message.state;
}

describe('PartyManager authoritative lifecycle', () => {
  it.each([
    ['duel', 2],
    ['rumble', 4],
    ['crew', 4],
  ] as const)('creates, fills, projects fighters, and enforces %s capacity', (format, capacity) => {
    const { manager, sent } = harness();
    expect(
      manager.create(
        player1,
        'create_111111',
        'Alpha',
        format,
        'mighty_man',
        intent(format, capacity),
      ),
    ).toBe(true);
    const joiners = [player2, player3, player4].slice(0, capacity - 1);
    const fighters = ['bruce', 'frost_wizard', 'bubba'] as const;
    joiners.forEach((playerId, index) =>
      expect(
        manager.join(
          playerId,
          `join_${index}_111111`,
          `P${index + 2}`,
          'https://game.test/?party=abcde',
          fighters[index],
        ),
      ).toBe(true),
    );
    const state = latestState(sent);
    expect(state.format).toBe(format);
    expect(state.formatCapacity).toBe(capacity);
    expect(state.capacity).toBe(capacity);
    expect(state.lifecycle).toBe('assembling');
    expect(state.slots).toHaveLength(capacity);
    expect(state.slots.every((slot) => slot.status === 'occupied')).toBe(true);
    expect(state.members.map((member) => member.fighterId)).toEqual([
      'mighty_man',
      ...fighters.slice(0, capacity - 1),
    ]);
    expect(manager.join(player5, 'join_full_111', 'P5', 'ABCDE', 'rook')).toBe(false);
    expect(sent.at(-1)?.message).toMatchObject({ type: 'server:partyError', code: 'party_full' });
  });

  it('retries code collisions and keeps a vacated code reserved until empty expiry', () => {
    const { manager, sent, advance } = harness(['ABCDE', 'ABCDE', 'FGHJK', 'ABCDE']);
    manager.create(player1, 'create_111111', 'Alpha', 'duel', 'mighty_man', intent('duel', 2));
    manager.create(player2, 'create_222222', 'Bravo', 'duel', 'bruce', intent('duel', 2, 'bruce'));
    expect(latestState(sent).code).toBe('FGHJK');
    const first = manager.getStateForPlayer(player1)!;
    manager.leave(player1, 'leave_1111111', first.partyId, first.version);
    expect(manager.getRoomCount()).toBe(2);
    advance(PARTY_EMPTY_EXPIRY_MS - 1);
    expect(manager.expireEmptyRooms()).toBe(0);
    advance(1);
    expect(manager.expireEmptyRooms()).toBe(1);
  });

  it('authorizes leader intent and kick while members may leave or change visible fighters', () => {
    const { manager, sent } = harness();
    manager.create(player1, 'create_111111', 'Alpha', 'rumble', 'mighty_man', intent('rumble', 4));
    manager.join(player2, 'join_22222222', 'Bravo', 'ABCDE', 'bruce');
    let state = manager.getStateForPlayer(player1)!;
    expect(
      manager.updateIntent(
        player2,
        'intent_bad_222',
        state.partyId,
        state.version,
        intent('rumble', 4, 'bruce'),
      ),
    ).toBe(false);
    expect(sent.at(-1)?.message).toMatchObject({ type: 'server:partyError', code: 'not_leader' });
    expect(
      manager.updateFighter(player2, 'fighter_22222', state.partyId, state.version, 'frost_wizard'),
    ).toBe(true);
    state = manager.getStateForPlayer(player1)!;
    expect(state.members[1]?.fighterId).toBe('frost_wizard');
    const updatedIntent: MatchIntent = {
      ...intent('rumble', 4),
      intentId: 'intent_updated_1',
      mode: GameModeType.DEATHMATCH,
      scheduledArena: {
        mode: GameModeType.DEATHMATCH,
        mapName: 'Checkpoint Zero',
        rotationEndsAt: 99_999,
      },
    };
    expect(
      manager.updateIntent(player1, 'intent_good_111', state.partyId, state.version, updatedIntent),
    ).toBe(true);
    state = manager.getStateForPlayer(player1)!;
    expect(state.intent).toMatchObject({
      intentId: 'intent_updated_1',
      mode: GameModeType.DEATHMATCH,
      scheduledArena: { mapName: 'Checkpoint Zero' },
    });
    expect(manager.kick(player1, 'kick_11111111', state.partyId, state.version, player2)).toBe(
      true,
    );
    expect(
      sent.some(
        ({ playerId, message }) =>
          playerId === player2 &&
          message.type === 'server:partyLeft' &&
          message.reason === 'kicked',
      ),
    ).toBe(true);
  });

  it('rejects malformed, duplicate-fighter, stale, replayed, unknown, and unauthorized mutations', () => {
    const { manager, sent } = harness();
    expect(manager.join(player2, 'join_22222222', 'Bravo', 'bad-link', 'bruce')).toBe(false);
    expect(
      manager.create(player1, 'create_111111', 'Alpha', 'duel', 'mighty_man', intent('duel', 2)),
    ).toBe(true);
    expect(manager.join(player2, 'join_22222222', 'Bravo', 'ABCDE', 'mighty_man')).toBe(false);
    expect(manager.join(player2, 'join_22222223', 'Bravo', 'ABCDE', 'bruce')).toBe(true);
    const state = manager.getStateForPlayer(player1)!;
    expect(manager.updateFighter(player2, 'fighter_22222', state.partyId, 1, 'frost_wizard')).toBe(
      false,
    );
    expect(sent.at(-2)?.message).toMatchObject({ type: 'server:partyError', code: 'stale_party' });
    expect(
      manager.updateFighter(player2, 'fighter_22222', state.partyId, state.version, 'frost_wizard'),
    ).toBe(false);
    expect(sent.at(-1)?.message).toMatchObject({
      type: 'server:partyError',
      code: 'replayed_request',
    });
    expect(manager.kick(player2, 'kick_22222222', state.partyId, state.version, player1)).toBe(
      false,
    );
    expect(sent.at(-1)?.message).toMatchObject({ type: 'server:partyError', code: 'not_leader' });
  });

  it('transfers leadership to the earliest remaining member when the creator leaves', () => {
    const { manager, sent } = harness();
    manager.create(player1, 'create_111111', 'Alpha', 'crew', 'mighty_man', intent('crew', 4));
    manager.join(player2, 'join_22222222', 'Bravo', 'ABCDE', 'bruce');
    const state = manager.getStateForPlayer(player1)!;
    expect(manager.leave(player1, 'leave_1111111', state.partyId, state.version)).toBe(true);
    expect(manager.getStateForPlayer(player2)).toMatchObject({
      leaderId: player2,
      lifecycle: 'assembling',
      members: [{ playerId: player2, ready: false }],
    });
    expect(sent.at(-1)?.message).toMatchObject({ type: 'server:partyLeft', reason: 'left' });
  });

  it.each([
    ['duel', 2],
    ['rumble', 4],
    ['crew', 4],
  ] as const)('queues and launches a full ready %s party exactly once', (format, capacity) => {
    const { manager, queued } = harness();
    manager.create(
      player1,
      'create_111111',
      'Alpha',
      format,
      'mighty_man',
      intent(format, capacity),
    );
    const players = [player1, player2, player3, player4].slice(0, capacity);
    const fighters = ['mighty_man', 'bruce', 'frost_wizard', 'bubba'] as const;
    players.slice(1).forEach((playerId, index) => {
      manager.join(playerId, `join_ready_${index}`, `P${index + 2}`, 'ABCDE', fighters[index + 1]);
    });
    players.forEach((playerId, index) => {
      const state = manager.getStateForPlayer(playerId)!;
      expect(
        manager.setReady(playerId, `ready_${format}_${index}`, state.partyId, state.version, true),
      ).toBe(true);
    });
    const state = manager.getStateForPlayer(player1)!;
    expect(queued).toHaveLength(1);
    expect(state).toMatchObject({ lifecycle: 'match', matchId: 'match_12345678' });
    expect(state.members.every((member) => member.ready)).toBe(true);
    expect(state.slots.every((slot) => slot.status === 'occupied')).toBe(true);
  });

  it('projects open human slots, waits when current members ready, and cancels idempotently', () => {
    const { manager, queued, sent } = harness();
    manager.create(player1, 'create_111111', 'Alpha', 'rumble', 'mighty_man', intent('rumble', 4));
    let state = manager.getStateForPlayer(player1)!;
    expect(state.slots.map((slot) => slot.status)).toEqual(['occupied', 'open', 'open', 'open']);
    expect(manager.setReady(player1, 'ready_open_111', state.partyId, state.version, true)).toBe(
      true,
    );
    state = manager.getStateForPlayer(player1)!;
    expect(state.lifecycle).toBe('queued');
    expect(state.botFillOffer).toMatchObject({
      status: 'waiting',
      waitStartedAt: 1_000,
      eligibleAt: 1_000 + PARTY_BOT_FILL_WAIT_MS,
      serverTime: 1_000,
      openSlotCount: 3,
    });
    expect(queued).toHaveLength(0);
    const version = state.version;
    expect(manager.setReady(player1, 'ready_same_111', state.partyId, version, true)).toBe(true);
    expect(manager.getStateForPlayer(player1)?.version).toBe(version);
    expect(manager.cancelQueue(player1, 'cancel_open_11', state.partyId, version)).toBe(true);
    state = manager.getStateForPlayer(player1)!;
    expect(state).toMatchObject({ lifecycle: 'assembling', members: [{ ready: false }] });
    expect(state.botFillOffer).toBeUndefined();
    expect(manager.cancelQueue(player1, 'cancel_again_1', state.partyId, state.version)).toBe(
      false,
    );
    expect(sent.at(-1)?.message).toMatchObject({
      type: 'server:partyError',
      code: 'invalid_request',
    });
  });

  it.each([
    ['duel', 2, 1],
    ['rumble', 2, 1],
    ['rumble', 3, 2],
    ['rumble', 4, 1],
    ['rumble', 4, 3],
    ['crew', 2, 1],
    ['crew', 3, 2],
    ['crew', 4, 1],
    ['crew', 4, 3],
  ] as const)(
    'offers and confirms bot fill for %s requested=%i connected=%i without automatic replacement',
    (format, requestedHumans, connectedHumans) => {
      const { manager, queued, advance } = harness();
      const players = [player1, player2, player3, player4].slice(0, connectedHumans);
      const fighters = ['mighty_man', 'bruce', 'frost_wizard', 'bubba'] as const;
      manager.create(
        player1,
        `create_${format}_${requestedHumans}`,
        'Alpha',
        format,
        fighters[0],
        intent(format, requestedHumans),
      );
      players.slice(1).forEach((playerId, index) => {
        manager.join(
          playerId,
          `join_fill_${format}_${index}`,
          `P${index + 2}`,
          'ABCDE',
          fighters[index + 1],
        );
      });
      players.forEach((playerId, index) => {
        const state = manager.getStateForPlayer(playerId)!;
        manager.setReady(
          playerId,
          `ready_fill_${format}_${index}`,
          state.partyId,
          state.version,
          true,
        );
      });

      let state = manager.getStateForPlayer(player1)!;
      expect(state.botFillOffer?.status).toBe('waiting');
      advance(14_999);
      expect(manager.tick()).toBe(0);
      expect(manager.getStateForPlayer(player1)?.botFillOffer?.status).toBe('waiting');
      expect(queued).toHaveLength(0);
      advance(1);
      expect(manager.tick()).toBe(1);
      state = manager.getStateForPlayer(player1)!;
      expect(state.botFillOffer).toMatchObject({
        status: 'available',
        openSlotCount: requestedHumans - connectedHumans,
      });
      expect(queued).toHaveLength(0);
      expect(
        manager.confirmBotFill(
          player1,
          `confirm_${format}_${requestedHumans}_${connectedHumans}`,
          state.partyId,
          state.version,
        ),
      ).toBe(true);
      expect(queued).toHaveLength(1);
      expect(queued[0]?.intent.composition).toEqual({
        humanCount: connectedHumans,
        botCount: (format === 'duel' ? 2 : 4) - connectedHumans,
      });
      expect(manager.getStateForPlayer(player1)).toMatchObject({
        lifecycle: 'match',
        capacity: connectedHumans,
        matchId: 'match_12345678',
      });
      expect(manager.getStateForPlayer(player1)?.botFillOffer).toBeUndefined();
    },
  );

  it('uses monotonic eligibility while projecting the captured server wall clock', () => {
    const { manager, advanceWall, advanceMonotonic } = harness();
    manager.create(player1, 'create_clock_1', 'Alpha', 'duel', 'mighty_man', intent('duel', 2));
    let state = manager.getStateForPlayer(player1)!;
    manager.setReady(player1, 'ready_clock_11', state.partyId, state.version, true);
    state = manager.getStateForPlayer(player1)!;
    expect(state.botFillOffer).toMatchObject({ waitStartedAt: 1_000, eligibleAt: 16_000 });
    advanceWall(60_000);
    advanceMonotonic(14_999);
    expect(manager.tick()).toBe(0);
    advanceMonotonic(1);
    expect(manager.tick()).toBe(1);
    expect(manager.getStateForPlayer(player1)?.botFillOffer).toMatchObject({
      status: 'available',
      waitStartedAt: 1_000,
      eligibleAt: 16_000,
      serverTime: 61_000,
    });
  });

  it('rejects early, unauthorized, stale, and replayed confirmations', () => {
    const { manager, advance, sent } = harness();
    manager.create(player1, 'create_guard_1', 'Alpha', 'rumble', 'mighty_man', intent('rumble', 4));
    manager.join(player2, 'join_guard_222', 'Bravo', 'ABCDE', 'bruce');
    for (const [index, playerId] of [player1, player2].entries()) {
      const state = manager.getStateForPlayer(playerId)!;
      manager.setReady(playerId, `ready_guard_${index}`, state.partyId, state.version, true);
    }
    let state = manager.getStateForPlayer(player1)!;
    advance(14_999);
    manager.tick();
    expect(manager.confirmBotFill(player1, 'confirm_early_1', state.partyId, state.version)).toBe(
      false,
    );
    advance(1);
    manager.tick();
    state = manager.getStateForPlayer(player1)!;
    expect(manager.confirmBotFill(player2, 'confirm_member_1', state.partyId, state.version)).toBe(
      false,
    );
    expect(sent.at(-1)?.message).toMatchObject({ type: 'server:partyError', code: 'not_leader' });
    expect(manager.confirmBotFill(player1, 'confirm_stale_1', state.partyId, 1)).toBe(false);
    expect(sent.at(-2)?.message).toMatchObject({ type: 'server:partyError', code: 'stale_party' });
    expect(manager.confirmBotFill(player1, 'confirm_stale_1', state.partyId, state.version)).toBe(
      false,
    );
    expect(sent.at(-1)?.message).toMatchObject({
      type: 'server:partyError',
      code: 'replayed_request',
    });
  });

  it('invalidates offers on cancellation, membership, fighter, intent, disconnect, and reconnect edges', () => {
    const { manager, advance } = harness();
    manager.create(player1, 'create_reset_1', 'Alpha', 'crew', 'mighty_man', intent('crew', 4));
    let state = manager.getStateForPlayer(player1)!;
    manager.setReady(player1, 'ready_reset_11', state.partyId, state.version, true);
    advance(PARTY_BOT_FILL_WAIT_MS);
    manager.tick();
    state = manager.getStateForPlayer(player1)!;
    expect(state.botFillOffer?.status).toBe('available');

    manager.cancelQueue(player1, 'cancel_reset_1', state.partyId, state.version);
    state = manager.getStateForPlayer(player1)!;
    expect(state.botFillOffer).toBeUndefined();
    manager.updateFighter(player1, 'fighter_reset1', state.partyId, state.version, 'bruce');
    state = manager.getStateForPlayer(player1)!;
    expect(state.members[0]?.ready).toBe(false);
    manager.updateIntent(
      player1,
      'intent_reset_11',
      state.partyId,
      state.version,
      intent('crew', 4, 'bruce'),
    );
    state = manager.getStateForPlayer(player1)!;
    manager.setReady(player1, 'ready_reset_22', state.partyId, state.version, true);
    advance(PARTY_BOT_FILL_WAIT_MS);
    manager.tick();
    expect(manager.join(player2, 'join_reset_222', 'Bravo', 'ABCDE', 'mighty_man')).toBe(true);
    state = manager.getStateForPlayer(player2)!;
    expect(state).toMatchObject({ lifecycle: 'assembling' });
    expect(state.botFillOffer).toBeUndefined();
    expect(state.members.every((member) => !member.ready)).toBe(true);
    expect(manager.disconnect(player2)).toBe(true);
    state = manager.getStateForPlayer(player1)!;
    expect(state.botFillOffer).toBeUndefined();
    expect(manager.join(player3, 'reconnect_reset', 'Bravo', 'ABCDE', 'mighty_man')).toBe(true);
    expect(manager.getStateForPlayer(player3)?.botFillOffer).toBeUndefined();
  });

  it('revalidates schedule and rolls back the requested human intent when confirmation fails', () => {
    let wallNow = 1_000;
    const normalize = (value: unknown) =>
      normalizeMatchIntent(value, {
        serverTime: wallNow,
        allowedArenaNames: ['Wasteland Outpost'],
      });
    const { manager, advance, sent } = harness([], null, normalize);
    manager.create(player1, 'create_drift_1', 'Alpha', 'duel', 'mighty_man', intent('duel', 2));
    let state = manager.getStateForPlayer(player1)!;
    manager.setReady(player1, 'ready_drift_11', state.partyId, state.version, true);
    advance(PARTY_BOT_FILL_WAIT_MS);
    wallNow = 100_000;
    manager.tick();
    state = manager.getStateForPlayer(player1)!;
    expect(manager.confirmBotFill(player1, 'confirm_drift1', state.partyId, state.version)).toBe(
      false,
    );
    expect(sent.at(-2)?.message).toMatchObject({
      type: 'server:partyError',
      code: 'invalid_intent',
    });
    expect(manager.getStateForPlayer(player1)).toMatchObject({
      lifecycle: 'assembling',
      capacity: 2,
      intent: { composition: { humanCount: 2, botCount: 0 } },
      members: [{ ready: false }],
    });
  });

  it('rejects stale and replayed readiness/cancellation requests with authoritative repair', () => {
    const { manager, sent } = harness();
    manager.create(player1, 'create_111111', 'Alpha', 'duel', 'mighty_man', intent('duel', 2));
    const state = manager.getStateForPlayer(player1)!;
    expect(manager.setReady(player1, 'ready_stale_11', state.partyId, 99, true)).toBe(false);
    expect(sent.at(-2)?.message).toMatchObject({ type: 'server:partyError', code: 'stale_party' });
    expect(manager.setReady(player1, 'ready_stale_11', state.partyId, state.version, true)).toBe(
      false,
    );
    expect(sent.at(-1)?.message).toMatchObject({
      type: 'server:partyError',
      code: 'replayed_request',
    });
  });

  it('cleans up disconnects, transfers earliest leadership, and accepts a reconnect into the open slot', () => {
    const { manager, advance } = harness();
    manager.create(player1, 'create_111111', 'Alpha', 'rumble', 'mighty_man', intent('rumble', 4));
    advance(10);
    manager.join(player2, 'join_22222222', 'Bravo', 'ABCDE', 'bruce');
    advance(10);
    manager.join(player3, 'join_33333333', 'Charlie', 'ABCDE', 'frost_wizard');
    expect(manager.disconnect(player1)).toBe(true);
    let state = manager.getStateForPlayer(player2)!;
    expect(state.leaderId).toBe(player2);
    expect(state.slots.map((slot) => slot.status)).toEqual([
      'occupied',
      'occupied',
      'open',
      'open',
    ]);
    expect(manager.join(player4, 'rejoin_444444', 'Alpha', 'ABCDE', 'mighty_man')).toBe(true);
    state = manager.getStateForPlayer(player4)!;
    expect(state.members.map((member) => member.playerId)).toEqual([player2, player3, player4]);
    expect(state.leaderId).toBe(player2);
  });

  it.each([
    ['duel', 2],
    ['rumble', 4],
    ['crew', 4],
  ] as const)(
    'retains a full authoritative %s party through Results and a valid rematch transition',
    (format, capacity) => {
      const { manager } = harness();
      const players = [player1, player2, player3, player4].slice(0, capacity);
      const fighters = ['mighty_man', 'bruce', 'frost_wizard', 'bubba'] as const;
      manager.create(
        player1,
        'create_111111',
        'Alpha',
        format,
        fighters[0],
        intent(format, capacity),
      );
      players.slice(1).forEach((playerId, index) => {
        manager.join(
          playerId,
          `join_life_${format}_${index}`,
          `P${index + 2}`,
          'ABCDE',
          fighters[index + 1],
        );
      });
      for (const [index, playerId] of players.entries()) {
        const state = manager.getStateForPlayer(playerId)!;
        manager.setReady(
          playerId,
          `ready_life_${format}_${index}`,
          state.partyId,
          state.version,
          true,
        );
      }
      let state = manager.getStateForPlayer(player1)!;
      expect(manager.markLifecycle(state.partyId, 'results', state.matchId)).toBe(true);
      state = manager.getStateForPlayer(player1)!;
      expect(state.lifecycle).toBe('results');
      const resultsVersion = state.version;
      expect(manager.markLifecycle(state.partyId, 'results', state.matchId)).toBe(true);
      expect(manager.getStateForPlayer(player1)?.version).toBe(resultsVersion);
      expect(manager.markLifecycle(state.partyId, 'match', 'rematch_12345678')).toBe(true);
      for (const playerId of players) {
        expect(manager.getStateForPlayer(playerId)).toMatchObject({
          format,
          lifecycle: 'match',
          matchId: 'rematch_12345678',
          leaderId: player1,
        });
      }
    },
  );
});
