/**
 * Resurrect-64 by Kerrie Lake (https://lospec.com/palette-list/resurrect-64).
 * Selected for Mighty Man's Revenge — warm, dusty, cohesive 64-color set.
 *
 * Two layers:
 *   RESURRECT_64 — the full palette as 32-bit RGB ints. Use for LUT
 *                  generation, art tooling, color quantization.
 *   Wasteland    — semantic slots (PLAYER_TINT, FLOOR_FILL, …) mapping
 *                  game roles to specific palette entries for the dusty
 *                  desert wasteland theme. Game code should reach for
 *                  these names rather than raw hex.
 */

export const RESURRECT_64: readonly number[] = Object.freeze([
  0x2e222f, 0x3e3546, 0x625565, 0x966c6c, 0xab947a, 0x694f62, 0x7f708a, 0x9babb2,
  0xc7dcd0, 0xffffff, 0x6e2727, 0xb33831, 0xea4f36, 0xf57d4a, 0xae2334, 0xe83b3b,
  0xfb6b1d, 0xf79617, 0xf9c22b, 0x7a3045, 0x9e4539, 0xcd683d, 0xe6904e, 0xfbb954,
  0x4c3e24, 0x676633, 0xa2a947, 0xd5e04b, 0xfbff86, 0x165a4c, 0x239063, 0x1ebc73,
  0x91db69, 0xcddf6c, 0x313638, 0x374e4a, 0x547e64, 0x92a984, 0xb2ba90, 0x0b5e65,
  0x0b8a8f, 0x0eaf9b, 0x30e1b9, 0x8ff8e2, 0x323353, 0x484a77, 0x4d65b4, 0x4d9be6,
  0x8fd3ff, 0x45293f, 0x6b3e75, 0x905ea9, 0xa884f3, 0xeaaded, 0x753c54, 0xa24b6f,
  0xcf657f, 0xed8099, 0x831c5d, 0xc32454, 0xf04f78, 0xf68181, 0xfca790, 0xfdcbb0,
]);

/** Convert a 0xRRGGBB int to a CSS-style "#rrggbb" string for Phaser.Text. */
export function cssHex(rgb: number): string {
  return '#' + rgb.toString(16).padStart(6, '0');
}

export const Wasteland = Object.freeze({
  // --- Players ---
  PLAYER_TINT: 0xfbb954,        // sand-yellow hero
  ENEMY_TINT: 0xb33831,         // dried blood threat
  DEATH_TINT: 0xb33831,         // tween target on death flash

  // --- Map / environment ---
  FLOOR_FILL: 0x4c3e24,         // sun-baked tobacco dirt
  FLOOR_LINE: 0x676633,         // olive-drab grout highlight
  WALL_FILL: 0x694f62,          // crumbling concrete
  WALL_LINE: 0x3e3546,          // deep ash shadow
  COVER_FILL: 0xab947a,         // tan sandbag / leather scrap
  COVER_LINE: 0x694f62,         // shadow under sandbag
  SPAWN_MARKER: 0x91db69,       // dusty mint waypoint
  CANVAS_BG: 0x2e222f,          // near-black plum (outside playfield)

  // --- Pickups ---
  PICKUP_AMMO: 0xfdcbb0,        // bone — paper cartridge box
  PICKUP_GRENADE: 0xcd683d,     // rust — corroded crate
  PICKUP_FLASH: 0xfdcbb0,
  PICKUP_SPARKLE_A: 0xfdcbb0,
  PICKUP_SPARKLE_B: 0xfbff86,

  // --- Combat / projectiles ---
  GRENADE_TINT: 0x374e4a,       // dark oxidized steel
  BULLET_TRAIL: 0xfbff86,       // bleached cream tracer
  AIM_LINE: 0xc7dcd0,           // soft bone-white guide
  CROSSHAIR: 0xea4f36,          // hot red bullseye reticle
  GRENADE_AIM: 0xfb6b1d,        // hot orange preview
  GRENADE_DETONATE: 0xea4f36,   // hotter red about-to-blow

  // --- Explosions & hits ---
  MUZZLE_FLASH: 0xfdcbb0,
  EXPLOSION_RING: 0xf57d4a,
  EXPLOSION_FLASH: 0xfbff86,
  EXPLOSION_PARTICLE_A: 0xf57d4a,
  EXPLOSION_PARTICLE_B: 0xea4f36,
  EXPLOSION_PARTICLE_C: 0xf9c22b,
  HIT_FLASH: 0xb33831,
  HIT_PARTICLE: 0xb33831,

  // --- HUD chrome ---
  HUD_STRIP_BG: 0x2e222f,
  HUD_STRIP_BORDER: 0x694f62,
  HEALTH_BAR_BG: 0x3e3546,
  HEALTH_GOOD: 0x91db69,
  HEALTH_WARNING: 0xf9c22b,
  HEALTH_DANGER: 0xb33831,
  STAMINA_BAR_BG: 0x3e3546,
  STAMINA_FILL: 0x4d9be6,

  // --- Text ---
  TEXT_PRIMARY: 0xc7dcd0,
  TEXT_NICKNAME: 0xfdcbb0,
  TEXT_DAMAGE: 0xed8099,
  TEXT_LOADING: 0xf57d4a,
  TEXT_LOW_AMMO: 0xf9c22b,
  TEXT_RELOAD_WARNING: 0xf9c22b,
  TEXT_GRENADE_READY: 0xc7dcd0,
  TEXT_GRENADE_LIVE: 0xea4f36,
  TEXT_DEATH: 0xb33831,
  TEXT_DISCONNECT: 0xb33831,

  // --- Touch UI ---
  JOYSTICK: 0xc7dcd0,

  // --- Loading bar ---
  LOADING_BAR_BG: 0x3e3546,
  LOADING_BAR_FILL: 0xf57d4a,
});

/** Health-bar color ramp shared by HUD and overhead bars. */
export function healthColor(ratio: number): number {
  if (ratio > 0.6) return Wasteland.HEALTH_GOOD;
  if (ratio > 0.3) return Wasteland.HEALTH_WARNING;
  return Wasteland.HEALTH_DANGER;
}
