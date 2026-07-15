import { describe, expect, it } from 'vitest';
import { CAPABILITY_FLAG_ENV, serverCapabilitiesFromEnv } from './feature-flags.js';

describe('server capability feature flags', () => {
  it('defaults every capability off', () => {
    expect(serverCapabilitiesFromEnv({})).toEqual({
      newShell: false,
      schedules: false,
      largeWorlds: false,
      modernArt: false,
      battleRoyale: false,
    });
  });

  it('enables only literal true flags', () => {
    expect(
      serverCapabilitiesFromEnv({
        [CAPABILITY_FLAG_ENV.newShell]: 'true',
        [CAPABILITY_FLAG_ENV.schedules]: 'TRUE',
        [CAPABILITY_FLAG_ENV.largeWorlds]: '1',
        [CAPABILITY_FLAG_ENV.modernArt]: 'false',
        [CAPABILITY_FLAG_ENV.battleRoyale]: 'true',
      }),
    ).toEqual({
      newShell: true,
      schedules: false,
      largeWorlds: false,
      modernArt: false,
      battleRoyale: true,
    });
  });
});
