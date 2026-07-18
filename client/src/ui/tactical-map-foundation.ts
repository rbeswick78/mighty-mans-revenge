import type { WorldBounds } from '../rendering/gameplay-coordinate-space.js';
import type { HudPoint, HudRect, ResponsiveCombatHudLayout } from './responsive-combat-hud.js';

export interface TacticalMapLayout {
  readonly overlay: HudRect;
  readonly panel: HudRect;
  readonly map: HudRect;
  readonly title: HudPoint;
  readonly hint: HudPoint;
  readonly launcher: HudRect;
}

function point(x: number, y: number): HudPoint {
  return Object.freeze({ x, y });
}

function rect(x: number, y: number, width: number, height: number): HudRect {
  return Object.freeze({ x, y, width, height });
}

/** Responsive BR tactical overlay, derived only from viewport-safe HUD geometry. */
export function tacticalMapLayoutForGameplay(
  hud: ResponsiveCombatHudLayout,
  worldBounds: WorldBounds,
): TacticalMapLayout {
  const safe = hud.safeArea;
  const maxWidth = Math.max(320, safe.width - 64);
  const maxHeight = Math.max(260, safe.height - 96);
  const mapAspect = worldBounds.width / worldBounds.height;
  let mapWidth = Math.min(maxWidth - 40, (maxHeight - 76) * mapAspect);
  let mapHeight = mapWidth / mapAspect;
  if (mapHeight > maxHeight - 76) {
    mapHeight = maxHeight - 76;
    mapWidth = mapHeight * mapAspect;
  }
  const panelWidth = mapWidth + 40;
  const panelHeight = mapHeight + 76;
  const panel = rect(
    safe.left + (safe.width - panelWidth) / 2,
    safe.top + (safe.height - panelHeight) / 2,
    panelWidth,
    panelHeight,
  );
  return Object.freeze({
    overlay: rect(0, 0, hud.logicalWidth, hud.logicalHeight),
    panel,
    map: rect(panel.x + 20, panel.y + 40, mapWidth, mapHeight),
    title: point(panel.x + 20, panel.y + 14),
    hint: point(panel.x + panel.width - 20, panel.y + panel.height - 18),
    launcher: rect(hud.menu.launcher.x - 112, hud.menu.launcher.y, 100, hud.menu.launcher.height),
  });
}
