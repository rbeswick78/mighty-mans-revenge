import { describe, expect, it, vi } from 'vitest';
import { BOT, DISABLED_SERVER_CAPABILITIES, type PlayerId } from '@shared/game';

import { GameServer } from './server.js';

interface TestChannel {
  emit: ReturnType<typeof vi.fn>;
}

function channelsOf(server: GameServer): Map<PlayerId, TestChannel> {
  return (
    server as unknown as {
      channels: Map<PlayerId, TestChannel>;
    }
  ).channels;
}

describe('GameServer snapshot fanout', () => {
  it('encodes one identical payload for every connected recipient', () => {
    const server = new GameServer(0, DISABLED_SERVER_CAPABILITIES);
    const alpha: TestChannel = { emit: vi.fn() };
    const bravo: TestChannel = { emit: vi.fn() };
    channelsOf(server).set('alpha', alpha);
    channelsOf(server).set('bravo', bravo);
    const stringify = vi.spyOn(JSON, 'stringify');

    const message = { type: 'server:pong', clientTime: 42, serverTime: 84 } as const;
    server.sendToMany(['alpha', `${BOT.PLAYER_ID_PREFIX}quiet`, 'bravo'], message);

    expect(stringify).toHaveBeenCalledTimes(1);
    const expected = JSON.stringify(message);
    expect(alpha.emit).toHaveBeenCalledWith('message', expected);
    expect(bravo.emit).toHaveBeenCalledWith('message', expected);
    expect(alpha.emit.mock.calls[0]?.[1]).toBe(bravo.emit.mock.calls[0]?.[1]);
    stringify.mockRestore();
  });

  it('does not allocate a payload when every recipient is a server bot', () => {
    const server = new GameServer(0, DISABLED_SERVER_CAPABILITIES);
    const stringify = vi.spyOn(JSON, 'stringify');

    server.sendToMany([`${BOT.PLAYER_ID_PREFIX}one`, `${BOT.PLAYER_ID_PREFIX}two`], {
      type: 'server:pong',
      clientTime: 1,
      serverTime: 2,
    });

    expect(stringify).not.toHaveBeenCalled();
    stringify.mockRestore();
  });
});
