import type { ServerCapabilities } from '../types/network.js';

/**
 * Safe fallback for old servers, partial handshakes, and invalid wire data.
 * Reforged features must remain unreachable unless the server explicitly
 * advertises support for them.
 */
export const DISABLED_SERVER_CAPABILITIES: Readonly<ServerCapabilities> = Object.freeze({
  newShell: false,
  schedules: false,
  largeWorlds: false,
  modernArt: false,
  battleRoyale: false,
});

/** Normalize an untrusted or version-skewed handshake into a complete snapshot. */
export function normalizeServerCapabilities(value: unknown): Readonly<ServerCapabilities> {
  const advertised = isRecord(value) ? value : {};
  return Object.freeze({
    newShell: advertised['newShell'] === true,
    schedules: advertised['schedules'] === true,
    largeWorlds: advertised['largeWorlds'] === true,
    modernArt: advertised['modernArt'] === true,
    battleRoyale: advertised['battleRoyale'] === true,
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
