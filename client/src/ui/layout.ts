// Shared UI layout constants. The canvas is split vertically into the
// gameboard (top) and a dedicated HUD strip (bottom). Both hud.ts and
// touch-input.ts need to know the boundary so UI never overlays the
// playfield and touches in the HUD strip don't spawn joysticks.

export const MAP_WIDTH_PX = 960;
export const MAP_HEIGHT_PX = 576; // 20 cols x 12 rows @ 48px
export const HUD_STRIP_HEIGHT = 144;
export const CANVAS_WIDTH = MAP_WIDTH_PX;
export const CANVAS_HEIGHT = MAP_HEIGHT_PX + HUD_STRIP_HEIGHT; // 720 (4:3)
