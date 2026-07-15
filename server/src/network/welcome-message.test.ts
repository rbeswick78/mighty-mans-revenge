import { describe, expect, it } from 'vitest';
import type { PlayerId } from '@shared/game';
import { serverCapabilitiesFromEnv } from '../config/feature-flags.js';
import { createWelcomeMessage } from './welcome-message.js';

describe('server welcome capability advertisement', () => {
  it('adds a complete disabled snapshot without changing the legacy player id contract', () => {
    expect(createWelcomeMessage('player-1' as PlayerId, serverCapabilitiesFromEnv({}))).toEqual({
      type: 'server:welcome',
      playerId: 'player-1',
      capabilities: {
        newShell: false,
        schedules: false,
        largeWorlds: false,
        modernArt: false,
        battleRoyale: false,
      },
    });
  });
});
