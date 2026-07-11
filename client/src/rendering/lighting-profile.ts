export interface LightingProfile {
  ambientAlpha: number;
  playerLightRadius: number;
}

/**
 * Rendering-only lighting presets. Blackout changes what players can see,
 * not any authoritative combat rule, so these values intentionally stay in
 * the client package.
 */
export const LIGHTING_PROFILES = Object.freeze({
  normal: Object.freeze({
    ambientAlpha: 0.2,
    playerLightRadius: 0,
  }),
  blackout: Object.freeze({
    ambientAlpha: 0.78,
    playerLightRadius: 140,
  }),
}) satisfies Readonly<Record<'normal' | 'blackout', LightingProfile>>;

export function lightingProfile(blackoutActive: boolean): LightingProfile {
  return blackoutActive ? LIGHTING_PROFILES.blackout : LIGHTING_PROFILES.normal;
}
