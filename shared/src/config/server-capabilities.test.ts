import { describe, expect, it } from 'vitest';
import {
  DISABLED_SERVER_CAPABILITIES,
  normalizeServerCapabilities,
} from './server-capabilities.js';

describe('server capabilities', () => {
  it('keeps every unfinished capability disabled by default', () => {
    expect(DISABLED_SERVER_CAPABILITIES).toEqual({
      newShell: false,
      schedules: false,
      largeWorlds: false,
      modernArt: false,
      battleRoyale: false,
    });
    expect(Object.isFrozen(DISABLED_SERVER_CAPABILITIES)).toBe(true);
  });

  it('treats an absent old-server advertisement as fully disabled', () => {
    expect(normalizeServerCapabilities(undefined)).toEqual(DISABLED_SERVER_CAPABILITIES);
  });

  it('accepts only explicit true values from partial or malformed advertisements', () => {
    const normalized = normalizeServerCapabilities({
      newShell: true,
      schedules: 'true',
      largeWorlds: 1,
      modernArt: false,
      futureCapability: true,
    });

    expect(normalized).toEqual({
      newShell: true,
      schedules: false,
      largeWorlds: false,
      modernArt: false,
      battleRoyale: false,
    });
    expect(Object.isFrozen(normalized)).toBe(true);
  });
});
