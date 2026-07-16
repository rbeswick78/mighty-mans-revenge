// Established fixed-world and legacy overlay geometry. Capability-off play
// still splits the 960x720 canvas into the gameboard and dedicated HUD strip.
// The capability-owned 1280x720 path now derives its overlays from
// responsive-combat-hud.ts; these constants remain the exact fallback through
// Batch 54.

export const MAP_WIDTH_PX = 960;
export const MAP_HEIGHT_PX = 576; // 20 cols x 12 rows @ 48px
export const HUD_STRIP_HEIGHT = 144;
export const CANVAS_WIDTH = MAP_WIDTH_PX;
export const CANVAS_HEIGHT = MAP_HEIGHT_PX + HUD_STRIP_HEIGHT; // 720 (4:3)

// The fixed match-menu launcher owns the top-right edge. Touch actions begin
// below it so their visible circles and hit areas never compete with MENU.
export const MATCH_MENU_LAUNCHER_X = 816;
export const MATCH_MENU_LAUNCHER_Y = 14;
export const MATCH_MENU_LAUNCHER_WIDTH = 128;
export const MATCH_MENU_LAUNCHER_HEIGHT = 42;
export const MATCH_MENU_LAUNCHER_HIT_PADDING_Y = 8;
export const TOUCH_ACTION_TOP_PX =
  MATCH_MENU_LAUNCHER_Y + MATCH_MENU_LAUNCHER_HEIGHT + MATCH_MENU_LAUNCHER_HIT_PADDING_Y + 12;
