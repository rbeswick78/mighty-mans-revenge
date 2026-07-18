import type { GameplayOverlaySafeArea, GameplayViewportContract } from './gameplay-viewport.js';

export interface HudPoint {
  readonly x: number;
  readonly y: number;
}

export interface HudRect extends HudPoint {
  readonly width: number;
  readonly height: number;
}

export interface ResponsiveCombatHudLayout {
  readonly mode: GameplayViewportContract['mode'];
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly safeArea: GameplayOverlaySafeArea;
  readonly vitalsPanel: HudRect;
  readonly healthBar: HudRect;
  readonly staminaBar: HudRect;
  readonly ammo: HudPoint;
  readonly grenades: HudPoint;
  readonly specialWeapon: HudPoint;
  readonly ability: HudPoint;
  readonly score: HudPoint;
  readonly modeStatus: HudPoint;
  readonly timer: HudPoint;
  readonly activeEvent: HudPoint;
  readonly killFeed: HudPoint;
  readonly contract: HudRect;
  readonly countdown: HudPoint;
  readonly modeBriefingTitle: HudPoint;
  readonly modeBriefingObjective: HudPoint;
  readonly controlBriefing: HudRect;
  readonly death: HudPoint;
  readonly callouts: {
    readonly combat: HudPoint;
    readonly contract: HudPoint;
    readonly event: HudPoint;
  };
  readonly menu: {
    readonly launcher: HudRect;
    readonly panel: HudRect;
  };
  readonly touchActions: {
    readonly taunt: HudPoint;
    readonly grenade: HudPoint;
    readonly ability: HudPoint;
    readonly reload: HudPoint;
  };
}

const LEGACY_SAFE_AREA: GameplayOverlaySafeArea = Object.freeze({
  left: 0,
  top: 0,
  right: 960,
  bottom: 720,
  width: 960,
  height: 720,
});

function point(x: number, y: number): HudPoint {
  return Object.freeze({ x, y });
}

function rect(x: number, y: number, width: number, height: number): HudRect {
  return Object.freeze({ x, y, width, height });
}

function legacyLayout(): ResponsiveCombatHudLayout {
  return Object.freeze({
    mode: 'legacy',
    logicalWidth: 960,
    logicalHeight: 720,
    safeArea: LEGACY_SAFE_AREA,
    vitalsPanel: rect(0, 576, 960, 144),
    healthBar: rect(16, 592, 200, 20),
    staminaBar: rect(16, 618, 200, 16),
    ammo: point(16, 646),
    grenades: point(16, 670),
    specialWeapon: point(16, 696),
    ability: point(252, 610),
    score: point(480, 590),
    modeStatus: point(480, 620),
    timer: point(480, 644),
    activeEvent: point(480, 680),
    killFeed: point(944, 592),
    contract: rect(315, 8, 330, 42),
    countdown: point(480, 288),
    modeBriefingTitle: point(480, 360),
    modeBriefingObjective: point(480, 390),
    controlBriefing: rect(70, 405, 820, 96),
    death: point(480, 288),
    callouts: Object.freeze({
      combat: point(480, 118),
      contract: point(480, 163),
      event: point(480, 208),
    }),
    menu: Object.freeze({
      launcher: rect(816, 14, 128, 42),
      panel: rect(210, 145, 540, 430),
    }),
    touchActions: Object.freeze({
      taunt: point(808, 116),
      grenade: point(904, 116),
      ability: point(904, 208),
      reload: point(808, 208),
    }),
  });
}

function normalizeSafeArea(
  viewport: GameplayViewportContract,
  safeArea: GameplayOverlaySafeArea | null,
): GameplayOverlaySafeArea {
  if (safeArea) return safeArea;
  return Object.freeze({
    left: 0,
    top: 0,
    right: viewport.logicalWidth,
    bottom: viewport.logicalHeight,
    width: viewport.logicalWidth,
    height: viewport.logicalHeight,
  });
}

/**
 * One logical-coordinate layout for desktop and mobile FIT surfaces. The
 * browser safe area may move overlays inward, but never changes the logical
 * viewport or derives gameplay state from screen coordinates.
 */
export function responsiveCombatHudLayout(
  viewport: GameplayViewportContract,
  safeArea: GameplayOverlaySafeArea | null,
): ResponsiveCombatHudLayout {
  if (viewport.mode === 'legacy') return legacyLayout();

  const safe = normalizeSafeArea(viewport, safeArea);
  const centerX = (safe.left + safe.right) / 2;
  const centerY = (safe.top + safe.bottom) / 2;
  const vitalsWidth = Math.min(308, safe.width * 0.28);
  const vitalsHeight = 136;
  const vitalsTop = safe.bottom - vitalsHeight;
  const healthX = safe.left + 12;
  const healthY = vitalsTop + 12;
  const contractWidth = Math.min(330, Math.max(260, safe.width * 0.3));
  const panelWidth = Math.min(540, safe.width - 64);
  const panelHeight = Math.min(430, safe.height - 48);
  const panelX = centerX - panelWidth / 2;
  const panelY = centerY - panelHeight / 2;
  const actionY = safe.bottom - 40;

  return Object.freeze({
    mode: 'large-world',
    logicalWidth: viewport.logicalWidth,
    logicalHeight: viewport.logicalHeight,
    safeArea: safe,
    vitalsPanel: rect(safe.left, vitalsTop, vitalsWidth, vitalsHeight),
    healthBar: rect(healthX, healthY, 200, 20),
    staminaBar: rect(healthX, healthY + 26, 200, 16),
    ammo: point(healthX, healthY + 54),
    grenades: point(healthX, healthY + 78),
    specialWeapon: point(healthX, healthY + 104),
    ability: point(safe.left + vitalsWidth - 56, healthY + 18),
    score: point(centerX, safe.top + 8),
    modeStatus: point(centerX, safe.top + 38),
    timer: point(centerX, safe.top + 62),
    activeEvent: point(centerX, safe.top + 92),
    killFeed: point(safe.right, safe.top + 68),
    contract: rect(safe.left, safe.top, contractWidth, 42),
    countdown: point(centerX, centerY),
    modeBriefingTitle: point(centerX, centerY + 72),
    modeBriefingObjective: point(centerX, centerY + 102),
    controlBriefing: rect(
      centerX - Math.min(820, safe.width - 64) / 2,
      centerY + 117,
      Math.min(820, safe.width - 64),
      96,
    ),
    death: point(centerX, centerY),
    callouts: Object.freeze({
      combat: point(centerX, centerY - 190),
      contract: point(centerX, centerY - 125),
      event: point(centerX, centerY - 60),
    }),
    menu: Object.freeze({
      launcher: rect(safe.right - 128, safe.top, 128, 42),
      panel: rect(panelX, panelY, panelWidth, panelHeight),
    }),
    touchActions: Object.freeze({
      reload: point(safe.right - 328, actionY),
      taunt: point(safe.right - 232, actionY),
      grenade: point(safe.right - 136, actionY),
      ability: point(safe.right - 40, actionY),
    }),
  });
}

export function hudRectsOverlap(a: HudRect, b: HudRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
