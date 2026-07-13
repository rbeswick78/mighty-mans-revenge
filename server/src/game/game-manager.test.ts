import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEmptyKillsByWeapon } from '@shared/game';
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
function makeFakeServer() {
  const sent: SentMessage[] = [];
  let connectHandler: ((playerId: PlayerId) => void) | null = null;
  const fake = {
    sendTo: vi.fn((playerId: PlayerId, message: ServerMessage, opts?: { reliable?: boolean }) => {
      sent.push({ playerId, message, reliable: !!opts?.reliable });
    }),
    getConnectedPlayerIds: vi.fn(() => []),
    onConnect: vi.fn((handler: (playerId: PlayerId) => void) => {
      connectHandler = handler;
    }),
    onDisconnect: vi.fn(),
    onMessage: vi.fn(),
  } as unknown as GameServer;
  const connect = (playerId: PlayerId): void => {
    if (!connectHandler) throw new Error('GameManager never registered onConnect');
    connectHandler(playerId);
  };
  return { fake, sent, connect };
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
        { nickname: 'Ryan', kills: 5, deaths: 2, killsByWeapon: createEmptyKillsByWeapon(), contractCompleted: true },
        { nickname: 'Dave', kills: 2, deaths: 5, killsByWeapon: createEmptyKillsByWeapon(), contractCompleted: false },
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
  });

  it('sends no leaderboard when no store is configured', () => {
    const { fake, sent, connect } = makeFakeServer();
    new GameManager(fake);

    connect('p1');

    expect(sent.some((s) => s.message.type === 'server:leaderboard')).toBe(false);
  });
});
