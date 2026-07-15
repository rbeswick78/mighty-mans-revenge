import { normalizeServerCapabilities } from '@shared/game';
import type { ServerCapabilities } from '@shared/game';

type FeatureFlagEnvironment = Readonly<Record<string, string | undefined>>;

export const CAPABILITY_FLAG_ENV = Object.freeze({
  newShell: 'CAPABILITY_NEW_SHELL',
  schedules: 'CAPABILITY_SCHEDULES',
  largeWorlds: 'CAPABILITY_LARGE_WORLDS',
  modernArt: 'CAPABILITY_MODERN_ART',
  battleRoyale: 'CAPABILITY_BATTLE_ROYALE',
} as const satisfies Readonly<Record<keyof ServerCapabilities, string>>);

/**
 * Capability flags are strict opt-ins. Unset, false, 1, and malformed values
 * all stay disabled; only the literal value "true" advertises support.
 */
export function serverCapabilitiesFromEnv(
  env: FeatureFlagEnvironment = process.env,
): Readonly<ServerCapabilities> {
  return normalizeServerCapabilities({
    newShell: env[CAPABILITY_FLAG_ENV.newShell] === 'true',
    schedules: env[CAPABILITY_FLAG_ENV.schedules] === 'true',
    largeWorlds: env[CAPABILITY_FLAG_ENV.largeWorlds] === 'true',
    modernArt: env[CAPABILITY_FLAG_ENV.modernArt] === 'true',
    battleRoyale: env[CAPABILITY_FLAG_ENV.battleRoyale] === 'true',
  });
}
