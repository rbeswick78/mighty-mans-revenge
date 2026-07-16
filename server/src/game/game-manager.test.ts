import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ARENA_SCHEDULE,
  createEmptyKillsByWeapon,
  DISABLED_SERVER_CAPABILITIES,
  GameModeType,
} from '@shared/game';
import type { ClientMessage, MatchFormat, PlayerId, ServerMessage } from '@shared/game';
import { GameManager } from './game-manager.js';
import { PersistentStatsStore } from '../persistence/persistent-stats-store.js';
import type { GameServer } from '../network/server.js';

interface SentMessage {
  playerId: PlayerId;
  message: ServerMessage;
  reliable: boolean;
}

/**
 * Fake GameServer that captures the handlers GameManager wires up, so a
 * test can simulate a connection without real geckos networking.
 */
function makeFakeServer(schedules = false, newShell = false) {
  const sent: SentMessage[] = [];
  const connected: PlayerId[] = [];
  let connectHandler: ((playerId: PlayerId) => void) | null = null;
  let disconnectHandler: ((playerId: PlayerId) => void) | null = null;
  let messageHandler: ((playerId: PlayerId, message: ClientMessage) => void) | null = null;
  const fake = {
    sendTo: vi.fn((playerId: PlayerId, message: ServerMessage, opts?: { reliable?: boolean }) => {
      sent.push({ playerId, message, reliable: !!opts?.reliable });
    }),
    getConnectedPlayerIds: vi.fn(() => [...connected]),
    getCapabilities: vi.fn(() => ({ ...DISABLED_SERVER_CAPABILITIES, schedules, newShell })),
    broadcast: vi.fn((message: ServerMessage) => {
      for (const playerId of connected) {
        sent.push({ playerId, message, reliable: false });
      }
    }),
    onConnect: vi.fn((handler: (playerId: PlayerId) => void) => {
      connectHandler = handler;
    }),
    onDisconnect: vi.fn((handler: (playerId: PlayerId) => void) => {
      disconnectHandler = handler;
    }),
    onMessage: vi.fn((handler: (playerId: PlayerId, message: ClientMessage) => void) => {
      messageHandler = handler;
    }),
  } as unknown as GameServer;
  const connect = (playerId: PlayerId): void => {
    if (!connectHandler) throw new Error('GameManager never registered onConnect');
    if (!connected.includes(playerId)) connected.push(playerId);
    connectHandler(playerId);
  };
  const disconnect = (playerId: PlayerId): void => {
    if (!disconnectHandler) throw new Error('GameManager never registered onDisconnect');
    const index = connected.indexOf(playerId);
    if (index >= 0) connected.splice(index, 1);
    disconnectHandler(playerId);
  };
  const message = (playerId: PlayerId, value: ClientMessage): void => {
    if (!messageHandler) throw new Error('GameManager never registered onMessage');
    messageHandler(playerId, value);
  };
  return { fake, sent, connect, disconnect, message, connected };
}

describe('GameManager connection leaderboard', () => {
  let dataDir: string;
  let store: PersistentStatsStore | null;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'mmr-gm-stats-'));
    store = null;
  });

  afterEach(async () => {
    await store?.flush();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('sends the all-time leaderboard reliably to a new connection', () => {
    const { fake, sent, connect } = makeFakeServer();
    store = new PersistentStatsStore(dataDir);
    store.recordMatch(
      [
        {
          nickname: 'Ryan',
          kills: 5,
          deaths: 2,
          killsByWeapon: createEmptyKillsByWeapon(),
          contractCompleted: true,
          characterId: 'mighty_man',
        },
        {
          nickname: 'Dave',
          kills: 2,
          deaths: 5,
          killsByWeapon: createEmptyKillsByWeapon(),
          contractCompleted: false,
          characterId: 'bruce',
        },
      ],
      'Ryan',
    );
    new GameManager(fake, store);

    connect('p1');

    const leaderboard = sent.find((s) => s.message.type === 'server:leaderboard');
    if (!leaderboard || leaderboard.message.type !== 'server:leaderboard') {
      throw new Error('missing server:leaderboard on connect');
    }
    expect(leaderboard.playerId).toBe('p1');
    expect(leaderboard.reliable).toBe(true);
    expect(leaderboard.message.entries.map((e) => e.nickname)).toEqual(['Ryan', 'Dave']);
  });

  it('sends empty entries on connect when the store has no players', () => {
    const { fake, sent, connect } = makeFakeServer();
    store = new PersistentStatsStore(dataDir);
    new GameManager(fake, store);

    connect('p1');

    const leaderboard = sent.find((s) => s.message.type === 'server:leaderboard');
    if (!leaderboard || leaderboard.message.type !== 'server:leaderboard') {
      throw new Error('missing server:leaderboard on connect');
    }
    expect(leaderboard.message.entries).toEqual([]);
    const daily = sent.find((s) => s.message.type === 'server:dailyGauntletLeaderboard');
    if (!daily || daily.message.type !== 'server:dailyGauntletLeaderboard') {
      throw new Error('missing server:dailyGauntletLeaderboard on connect');
    }
    expect(daily.message.entries).toEqual([]);
  });

  it('sends the server-clock Daily Run standings reliably on connect', () => {
    const { fake, sent, connect } = makeFakeServer();
    store = new PersistentStatsStore(dataDir);
    store.recordDailyGauntletClear('2026-07-13', 'Ryan', 6800, 100);
    store.recordDailyGauntletClear('2026-07-13', 'Dave', 7200, 200);
    new GameManager(fake, store, () => new Date('2026-07-13T23:59:59Z'));

    connect('p1');

    const daily = sent.find((s) => s.message.type === 'server:dailyGauntletLeaderboard');
    if (!daily || daily.message.type !== 'server:dailyGauntletLeaderboard') {
      throw new Error('missing server:dailyGauntletLeaderboard on connect');
    }
    expect(daily.playerId).toBe('p1');
    expect(daily.reliable).toBe(true);
    expect(daily.message).toEqual({
      type: 'server:dailyGauntletLeaderboard',
      challengeKey: '2026-07-13',
      entries: [
        { nickname: 'Dave', score: 7200 },
        { nickname: 'Ryan', score: 6800 },
      ],
    });
  });

  it('pushes a fresh empty board when the server UTC date rolls over', () => {
    const { fake, sent, connect } = makeFakeServer();
    store = new PersistentStatsStore(dataDir);
    let now = new Date('2026-07-13T23:59:59Z');
    const manager = new GameManager(fake, store, () => now);
    connect('p1');
    sent.length = 0;

    now = new Date('2026-07-14T00:00:01Z');
    (manager as unknown as { tick: (dt: number, tick: number) => void }).tick(0.05, 20);

    const daily = sent.find((s) => s.message.type === 'server:dailyGauntletLeaderboard');
    if (!daily || daily.message.type !== 'server:dailyGauntletLeaderboard') {
      throw new Error('missing rollover Daily leaderboard');
    }
    expect(daily.reliable).toBe(true);
    expect(daily.message).toEqual({
      type: 'server:dailyGauntletLeaderboard',
      challengeKey: '2026-07-14',
      entries: [],
    });
  });

  it('sends no leaderboard when no store is configured', () => {
    const { fake, sent, connect } = makeFakeServer();
    new GameManager(fake);

    connect('p1');

    expect(sent.some((s) => s.message.type === 'server:leaderboard')).toBe(false);
    expect(sent.some((s) => s.message.type === 'server:dailyGauntletLeaderboard')).toBe(false);
  });

  it('sends and refreshes authoritative schedules only when advertised', () => {
    const { fake, sent, connect } = makeFakeServer(true);
    let now = new Date('2026-07-15T12:00:00.250Z');
    const manager = new GameManager(fake, undefined, () => now);

    connect('p1');
    const initial = sent.find((entry) => entry.message.type === 'server:lobbyConfig');
    expect(initial?.reliable).toBe(true);
    if (!initial || initial.message.type !== 'server:lobbyConfig') {
      throw new Error('missing advertised schedule on connect');
    }
    expect(initial.message.serverTime).toBe(now.getTime());
    expect(initial.message.schedules).toHaveLength(8);

    sent.length = 0;
    (manager as unknown as { tick: (dt: number, tick: number) => void }).tick(0.05, 1);
    (manager as unknown as { tick: (dt: number, tick: number) => void }).tick(0.05, 2);
    expect(sent.filter((entry) => entry.message.type === 'server:lobbyConfig')).toHaveLength(1);

    now = new Date(now.getTime() + 1000);
    (manager as unknown as { tick: (dt: number, tick: number) => void }).tick(0.05, 3);
    expect(sent.filter((entry) => entry.message.type === 'server:lobbyConfig')).toHaveLength(2);

    const lock = manager.lockArenaForQueue('p1', GameModeType.KOTH);
    expect(lock?.mode).toBe(GameModeType.KOTH);
    const lockedMap = lock?.mapName;
    sent.length = 0;
    now = new Date(now.getTime() + ARENA_SCHEDULE.ROTATION_MS);
    (manager as unknown as { tick: (dt: number, tick: number) => void }).tick(0.05, 4);
    const refreshed = sent.find((entry) => entry.message.type === 'server:lobbyConfig');
    if (!refreshed || refreshed.message.type !== 'server:lobbyConfig') {
      throw new Error('missing locked schedule refresh');
    }
    expect(refreshed.message.lockedArena?.mapName).toBe(lockedMap);
    expect(
      refreshed.message.schedules.find(({ mode }) => mode === GameModeType.KOTH)?.mapName,
    ).not.toBe(lockedMap);

    manager.releaseArenaScheduleLock('p1');
    const released = sent.at(-1);
    expect(released?.message.type).toBe('server:lobbyConfig');
    if (released?.message.type === 'server:lobbyConfig') {
      expect(released.message.lockedArena).toBeUndefined();
    }
  });

  it('keeps the established server behavior when schedules are disabled', () => {
    const { fake, sent, connect } = makeFakeServer(false);
    const manager = new GameManager(fake, undefined, () => new Date('2026-07-15T12:00:00Z'));
    connect('p1');
    (manager as unknown as { tick: (dt: number, tick: number) => void }).tick(0.05, 1);
    expect(sent.some((entry) => entry.message.type === 'server:lobbyConfig')).toBe(false);
  });

  it('normalizes and routes a live generalized intent through its own schedule lock', () => {
    const { fake, sent, connect, message } = makeFakeServer(true);
    const now = new Date('2026-07-15T12:00:00Z');
    const manager = new GameManager(fake, undefined, () => now);
    connect('p1');
    const config = sent.find(({ message }) => message.type === 'server:lobbyConfig')?.message;
    if (!config || config.type !== 'server:lobbyConfig') throw new Error('missing schedule');
    const scheduledArena = config.schedules.find(({ mode }) => mode === GameModeType.KOTH)!;

    message('p1', {
      type: 'client:submitMatchIntent',
      nickname: 'Alpha',
      intent: {
        intentId: 'intent_live_0001',
        format: 'duel',
        composition: { humanCount: 1, botCount: 1 },
        mode: GameModeType.KOTH,
        fighterId: 'bruce',
        scheduledArena,
      },
    });

    const found = sent.find(
      ({ playerId, message }) => playerId === 'p1' && message.type === 'server:matchFound',
    )?.message;
    expect(found).toMatchObject({
      type: 'server:matchFound',
      mapName: scheduledArena.mapName,
      gameMode: GameModeType.KOTH,
      matchKind: 'duel',
      standardMatch: {
        format: 'duel',
        composition: { humanCount: 1, botCount: 1 },
        scheduledArena,
        participants: expect.arrayContaining([
          expect.objectContaining({ playerId: 'p1', fighterId: 'bruce', source: 'human' }),
          expect.objectContaining({ source: 'standard_bot' }),
        ]),
      },
    });
    expect(manager.matchmakingManager.getActiveMatches()).toHaveLength(1);
    const lockSnapshots = sent.filter(
      ({ playerId, message }) =>
        playerId === 'p1' &&
        message.type === 'server:lobbyConfig' &&
        message.lockedArena !== undefined,
    );
    expect(lockSnapshots).toHaveLength(1);
    expect(sent.at(-1)?.message).toMatchObject({ type: 'server:lobbyConfig' });
  });

  it('rejects malformed, stale, incompatible, capability-off, and replayed intents', () => {
    const now = new Date('2026-07-15T12:00:00Z');
    const enabled = makeFakeServer(true);
    const manager = new GameManager(enabled.fake, undefined, () => now);
    enabled.connect('p1');
    const config = enabled.sent.find(
      ({ message }) => message.type === 'server:lobbyConfig',
    )?.message;
    if (!config || config.type !== 'server:lobbyConfig') throw new Error('missing schedule');
    const scheduledArena = config.schedules[0]!;
    const valid: ClientMessage = {
      type: 'client:submitMatchIntent',
      nickname: 'Alpha',
      intent: {
        intentId: 'intent_wait_0001',
        format: 'duel',
        composition: { humanCount: 2, botCount: 0 },
        mode: scheduledArena.mode,
        fighterId: 'mighty_man',
        scheduledArena,
      },
    };
    enabled.message('p1', valid);
    enabled.message('p1', valid);
    enabled.message('p1', {
      ...valid,
      intent: { ...valid.intent, intentId: 'intent_wait_0002', fighterId: 'not_real' as never },
    });
    enabled.message('p1', {
      ...valid,
      intent: {
        ...valid.intent,
        intentId: 'intent_wait_0003',
        scheduledArena: { ...scheduledArena, rotationEndsAt: now.getTime() },
      },
    });
    expect(manager.matchmakingManager.getQueueLength()).toBe(1);
    expect(manager.matchmakingManager.getActiveMatches()).toHaveLength(0);

    const disabled = makeFakeServer(false);
    const disabledManager = new GameManager(disabled.fake, undefined, () => now);
    disabled.connect('p2');
    disabled.message('p2', {
      ...valid,
      intent: { ...valid.intent, intentId: 'intent_wait_0004' },
    });
    expect(disabledManager.matchmakingManager.getQueueLength()).toBe(0);
  });
});

describe('GameManager party wire integration', () => {
  it.each([
    ['duel', 2, 0, GameModeType.KOTH],
    ['rumble', 2, 2, GameModeType.GUN_GAME],
    ['crew', 2, 2, GameModeType.DEATHMATCH],
  ] as const)(
    'routes authoritative create/join/leave for %s',
    (format, humanCount, botCount, mode) => {
      const now = new Date('2026-07-15T18:00:00Z');
      const { fake, sent, connect, message } = makeFakeServer(true, true);
      new GameManager(fake, undefined, () => now);
      connect('leader');
      connect('member');
      const config = sent.find(
        ({ playerId, message: candidate }) =>
          playerId === 'leader' && candidate.type === 'server:lobbyConfig',
      )?.message;
      if (!config || config.type !== 'server:lobbyConfig') throw new Error('missing config');
      const arena = config.schedules.find((entry) => entry.mode === mode);
      if (!arena) throw new Error('missing scheduled arena');
      message('leader', {
        type: 'client:createParty',
        requestId: `create_${format}_1111`,
        nickname: 'Alpha',
        format: format as MatchFormat,
        fighterId: 'mighty_man',
        intent: {
          intentId: `party_intent_${format}`,
          format: format as MatchFormat,
          composition: { humanCount, botCount },
          mode,
          fighterId: 'mighty_man',
          scheduledArena: arena,
        },
      });
      const created = [...sent]
        .reverse()
        .find(
          ({ playerId, message: candidate }) =>
            playerId === 'leader' && candidate.type === 'server:partyState',
        )?.message;
      if (!created || created.type !== 'server:partyState') throw new Error('missing party');
      message('member', {
        type: 'client:joinParty',
        requestId: `join_${format}_111111`,
        nickname: 'Bravo',
        joinTarget: `https://game.test${created.state.joinPath}`,
        fighterId: 'bruce',
      });
      const joined = [...sent]
        .reverse()
        .find(
          ({ playerId, message: candidate }) =>
            playerId === 'leader' && candidate.type === 'server:partyState',
        )?.message;
      if (!joined || joined.type !== 'server:partyState') throw new Error('missing joined state');
      expect(joined.state.members.map((member) => member.nickname)).toEqual(['Alpha', 'Bravo']);
      message('member', {
        type: 'client:leaveParty',
        requestId: `leave_${format}_11111`,
        partyId: joined.state.partyId,
        expectedVersion: joined.state.version,
      });
      expect(sent.at(-1)?.message).toMatchObject({ type: 'server:partyLeft', reason: 'left' });
    },
  );

  it('routes readiness through generalized queue authority and retains match lifecycle state', () => {
    const now = new Date('2026-07-15T18:00:00Z');
    const { fake, sent, connect, message } = makeFakeServer(true, true);
    const manager = new GameManager(fake, undefined, () => now);
    connect('leader');
    connect('member');
    const config = sent.find(
      ({ playerId, message: candidate }) =>
        playerId === 'leader' && candidate.type === 'server:lobbyConfig',
    )?.message;
    if (!config || config.type !== 'server:lobbyConfig') throw new Error('missing config');
    const arena = config.schedules.find((entry) => entry.mode === GameModeType.KOTH)!;
    message('leader', {
      type: 'client:createParty',
      requestId: 'create_ready_111',
      nickname: 'Alpha',
      format: 'duel',
      fighterId: 'mighty_man',
      intent: {
        intentId: 'party_ready_intent',
        format: 'duel',
        composition: { humanCount: 2, botCount: 0 },
        mode: GameModeType.KOTH,
        fighterId: 'mighty_man',
        scheduledArena: arena,
      },
    });
    const created = [...sent]
      .reverse()
      .find(
        ({ playerId, message: candidate }) =>
          playerId === 'leader' && candidate.type === 'server:partyState',
      )?.message;
    if (!created || created.type !== 'server:partyState') throw new Error('missing party');
    message('member', {
      type: 'client:joinParty',
      requestId: 'join_ready_2222',
      nickname: 'Bravo',
      joinTarget: created.state.code,
      fighterId: 'bruce',
    });
    let state = [...sent]
      .reverse()
      .find(
        ({ playerId, message: candidate }) =>
          playerId === 'leader' && candidate.type === 'server:partyState',
      )?.message;
    if (!state || state.type !== 'server:partyState') throw new Error('missing joined state');
    message('leader', {
      type: 'client:setPartyReady',
      requestId: 'ready_leader_11',
      partyId: state.state.partyId,
      expectedVersion: state.state.version,
      ready: true,
    });
    state = [...sent]
      .reverse()
      .find(
        ({ playerId, message: candidate }) =>
          playerId === 'member' && candidate.type === 'server:partyState',
      )?.message;
    if (!state || state.type !== 'server:partyState') throw new Error('missing ready state');
    message('member', {
      type: 'client:setPartyReady',
      requestId: 'ready_member_11',
      partyId: state.state.partyId,
      expectedVersion: state.state.version,
      ready: true,
    });
    expect(manager.matchmakingManager.getActiveMatches()).toHaveLength(1);
    expect(
      [...sent]
        .reverse()
        .find(
          ({ playerId, message: candidate }) =>
            playerId === 'leader' && candidate.type === 'server:partyState',
        )?.message,
    ).toMatchObject({
      type: 'server:partyState',
      state: { lifecycle: 'match', members: [{ ready: true }, { ready: true }] },
    });
  });

  it('routes the additive version-fenced party rematch mutation', () => {
    const { fake, connect, message } = makeFakeServer(true, true);
    const manager = new GameManager(fake, undefined, () => new Date('2026-07-15T18:00:00Z'));
    const parties = (
      manager as unknown as {
        parties: {
          requestRematch(
            playerId: PlayerId,
            requestId: unknown,
            partyId: unknown,
            expectedVersion: unknown,
          ): boolean;
        };
      }
    ).parties;
    const requestRematch = vi.spyOn(parties, 'requestRematch').mockReturnValue(true);
    connect('leader');

    message('leader', {
      type: 'client:requestPartyRematch',
      requestId: 'rematch_wire_15',
      partyId: 'party_wire_15',
      expectedVersion: 15,
    });

    expect(requestRematch).toHaveBeenCalledWith('leader', 'rematch_wire_15', 'party_wire_15', 15);
  });

  it('keeps old/capability-off servers fail-closed and ignores malformed schedule echoes', () => {
    const now = new Date('2026-07-15T18:00:00Z');
    const disabled = makeFakeServer(true, false);
    new GameManager(disabled.fake, undefined, () => now);
    disabled.connect('p1');
    const config = disabled.sent.find(
      ({ message }) => message.type === 'server:lobbyConfig',
    )?.message;
    if (!config || config.type !== 'server:lobbyConfig') throw new Error('missing config');
    const arena = config.schedules.find((entry) => entry.mode === GameModeType.KOTH)!;
    disabled.message('p1', {
      type: 'client:createParty',
      requestId: 'create_disabled_1',
      nickname: 'Alpha',
      format: 'duel',
      fighterId: 'mighty_man',
      intent: {
        intentId: 'intent_disabled_1',
        format: 'duel',
        composition: { humanCount: 2, botCount: 0 },
        mode: GameModeType.KOTH,
        fighterId: 'mighty_man',
        scheduledArena: { ...arena, mapName: 'not-authoritative' },
      },
    });
    expect(disabled.sent.some(({ message }) => message.type === 'server:partyState')).toBe(false);
    expect(disabled.sent.at(-1)?.message).toMatchObject({
      type: 'server:partyError',
      code: 'invalid_intent',
    });
  });
});
