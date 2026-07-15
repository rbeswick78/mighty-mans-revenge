import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockChannel {
  connectCallback: ((error?: Error) => void) | null;
  disconnectCallback: (() => void) | null;
  messageCallback: ((data: unknown) => void) | null;
  close: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
}

const transport = vi.hoisted(() => ({
  channels: [] as MockChannel[],
}));

vi.mock('@geckos.io/client', () => ({
  default: vi.fn(() => {
    const channel: MockChannel = {
      connectCallback: null,
      disconnectCallback: null,
      messageCallback: null,
      close: vi.fn(),
      emit: vi.fn(),
    };
    transport.channels.push(channel);
    return {
      close: channel.close,
      emit: channel.emit,
      onConnect: (callback: (error?: Error) => void) => {
        channel.connectCallback = callback;
      },
      onDisconnect: (callback: () => void) => {
        channel.disconnectCallback = callback;
      },
      on: (_event: string, callback: (data: unknown) => void) => {
        channel.messageCallback = callback;
      },
    };
  }),
}));

import { NetworkConnection } from './connection.js';

describe('NetworkConnection recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    transport.channels = [];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('survives a half-open close failure and completes the scheduled retry', async () => {
    const connection = new NetworkConnection('http://localhost:3000');
    const states: string[] = [];
    connection.onStateChange((state) => states.push(state));

    await connection.connect();
    const failed = transport.channels[0]!;
    failed.close.mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'close')");
    });
    failed.connectCallback?.(new Error('handshake failed'));
    failed.disconnectCallback?.();

    expect(connection.getState()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(999);
    expect(transport.channels).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(failed.close).toHaveBeenCalledOnce();
    expect(transport.channels).toHaveLength(2);
    transport.channels[1]!.connectCallback?.();
    expect(connection.getState()).toBe('connected');
    expect(states).toEqual(['connecting', 'reconnecting', 'connecting', 'connected']);
  });

  it('turns a silent handshake stall into visible retry state after five seconds', async () => {
    const connection = new NetworkConnection('http://localhost:3000');
    await connection.connect();

    await vi.advanceTimersByTimeAsync(4999);
    expect(connection.getState()).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1);
    expect(connection.getState()).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(1000);
    expect(transport.channels[0]!.close).toHaveBeenCalledOnce();
    expect(transport.channels).toHaveLength(2);
    expect(connection.getState()).toBe('connecting');
  });

  it('lets a player skip backoff without a stale channel disrupting the new connection', async () => {
    const connection = new NetworkConnection('http://localhost:3000');
    const playerIds: string[] = [];
    connection.onMessage((message) => {
      if (message.type === 'server:welcome') playerIds.push(message.playerId);
    });
    await connection.connect();
    const stale = transport.channels[0]!;
    stale.connectCallback?.(new Error('handshake failed'));
    stale.messageCallback?.(JSON.stringify({ type: 'server:welcome', playerId: 'stale' }));

    connection.retryNow();
    expect(stale.close).toHaveBeenCalledOnce();
    expect(transport.channels).toHaveLength(2);
    expect(connection.getState()).toBe('connecting');

    stale.connectCallback?.();
    stale.disconnectCallback?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(transport.channels).toHaveLength(2);

    transport.channels[1]!.connectCallback?.();
    transport.channels[1]!.messageCallback?.(
      JSON.stringify({ type: 'server:welcome', playerId: 'current' }),
    );
    expect(connection.getState()).toBe('connected');
    expect(playerIds).toEqual(['current']);
  });

  it('keeps a legacy welcome reader working when a new server adds capabilities', async () => {
    const connection = new NetworkConnection('http://localhost:3000');
    const playerIds: string[] = [];
    connection.onMessage((message) => {
      if (message.type === 'server:welcome') playerIds.push(message.playerId);
    });

    await connection.connect();
    transport.channels[0]!.connectCallback?.();
    transport.channels[0]!.messageCallback?.(
      JSON.stringify({
        type: 'server:welcome',
        playerId: 'new-server-player',
        capabilities: {
          newShell: false,
          schedules: false,
          largeWorlds: false,
          modernArt: false,
          battleRoyale: false,
        },
      }),
    );

    expect(playerIds).toEqual(['new-server-player']);
  });

  it('stops after five backoff attempts and exposes a terminal disconnected state', async () => {
    const connection = new NetworkConnection('http://localhost:3000');
    await connection.connect();
    transport.channels[0]!.connectCallback?.(new Error('initial failure'));

    for (const [index, delay] of [1000, 2000, 4000, 8000, 16000].entries()) {
      await vi.advanceTimersByTimeAsync(delay);
      transport.channels[index + 1]!.connectCallback?.(new Error(`retry ${index + 1} failed`));
    }

    expect(transport.channels).toHaveLength(6);
    expect(connection.getState()).toBe('disconnected');
    expect(transport.channels[5]!.close).toHaveBeenCalledOnce();
  });

  it('disconnects safely while a half-open channel exists and cancels pending retry work', async () => {
    const connection = new NetworkConnection('http://localhost:3000');
    await connection.connect();
    const failed = transport.channels[0]!;
    failed.close.mockImplementation(() => {
      throw new Error('peer was never created');
    });
    failed.connectCallback?.(new Error('handshake failed'));

    expect(() => connection.disconnect()).not.toThrow();
    expect(connection.getState()).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(32000);
    expect(transport.channels).toHaveLength(1);
  });
});
