import { describe, expect, it } from 'vitest';
import { lobbyConnectionPresentation } from './lobby-connection.js';

describe('lobbyConnectionPresentation', () => {
  it('enables play only after the authoritative transport is online', () => {
    expect(lobbyConnectionPresentation('connected')).toMatchObject({
      label: 'SIGNAL ONLINE',
      playEnabled: true,
      retryVisible: false,
    });
    for (const state of ['connecting', 'reconnecting', 'disconnected'] as const) {
      expect(lobbyConnectionPresentation(state).playEnabled).toBe(false);
    }
  });

  it('offers an immediate retry during backoff and after automatic attempts end', () => {
    expect(lobbyConnectionPresentation('connecting')).toMatchObject({
      label: 'LINKING TO OUTPOST...',
      retryVisible: false,
    });
    expect(lobbyConnectionPresentation('reconnecting')).toMatchObject({
      label: 'SIGNAL LOST // AUTO-RETRYING',
      retryVisible: true,
    });
    expect(lobbyConnectionPresentation('disconnected')).toMatchObject({
      label: 'OUTPOST OFFLINE // RETRY',
      retryVisible: true,
    });
  });
});
