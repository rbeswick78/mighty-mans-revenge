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
import type { PlayerId, ServerMessage } from '@shared/game';
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
function makeFakeServer(schedules = false) {
  const sent: SentMessage[] = [];
  const connected: PlayerId[] = [];
  let connectHandler: ((playerId: PlayerId) => void) | null = null;
  const fake = {
    sendTo: vi.fn((playerId: PlayerId, message: ServerMessage, opts?: { reliable?: boolean }) => {
      sent.push({ playerId, message, reliable: !!opts?.reliable });
    }),
    getConnectedPlayerIds: vi.fn(() => [...connected]),
    getCapabilities: vi.fn(() => ({ ...DISABLED_SERVER_CAPABILITIES, schedules })),
    broadcast: vi.fn((message: ServerMessage) => {
      for (const playerId of connected) {
        sent.push({ playerId, message, reliable: false });
      }
    }),
    onConnect: vi.fn((handler: (playerId: PlayerId) => void) => {
      connectHandler = handler;
    }),
    onDisconnect: vi.fn(),
    onMessage: vi.fn(),
  } as unknown as GameServer;
  const connect = (playerId: PlayerId): void => {
    if (!connectHandler) throw new Error('GameManager never registered onConnect');
    if (!connected.includes(playerId)) connected.push(playerId);
    connectHandler(playerId);
  };
  return { fake, sent, connect, connected };
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
});
