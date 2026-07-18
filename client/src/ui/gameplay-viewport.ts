import type Phaser from 'phaser';

import { normalizeServerCapabilities } from '@shared/config/server-capabilities.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, MAP_HEIGHT_PX, MAP_WIDTH_PX } from './layout.js';

export const GAMEPLAY_LOGICAL_WIDTH = 1280;
export const GAMEPLAY_LOGICAL_HEIGHT = 720;
export const GAMEPLAY_SAFE_EDGE = 32;

export type GameplayViewportMode = 'legacy' | 'large-world';

export interface GameplayDisplayRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface GameplayViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface GameplaySafeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface GameplayOverlaySafeArea {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface GameplayViewportContract {
  readonly mode: GameplayViewportMode;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly worldBounds: {
    readonly left: 0;
    readonly top: 0;
    readonly width: typeof MAP_WIDTH_PX;
    readonly height: typeof MAP_HEIGHT_PX;
  };
}

const ZERO_INSETS: GameplaySafeInsets = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

const LEGACY_GAMEPLAY_VIEWPORT: GameplayViewportContract = Object.freeze({
  mode: 'legacy',
  logicalWidth: CANVAS_WIDTH,
  logicalHeight: CANVAS_HEIGHT,
  worldBounds: Object.freeze({ left: 0, top: 0, width: MAP_WIDTH_PX, height: MAP_HEIGHT_PX }),
});

const LARGE_WORLD_GAMEPLAY_VIEWPORT: GameplayViewportContract = Object.freeze({
  mode: 'large-world',
  logicalWidth: GAMEPLAY_LOGICAL_WIDTH,
  logicalHeight: GAMEPLAY_LOGICAL_HEIGHT,
  worldBounds: Object.freeze({ left: 0, top: 0, width: MAP_WIDTH_PX, height: MAP_HEIGHT_PX }),
});

const finiteNonNegative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

/**
 * Select the complete gameplay surface from the normalized server-owned gate.
 * Unknown, absent, partial, or malformed capability values retain the exact
 * established 960x720 gameplay canvas.
 */
export function gameplayViewportForCapabilities(
  capabilities: unknown,
  battleRoyaleMatch = false,
): GameplayViewportContract {
  const normalized = normalizeServerCapabilities(capabilities);
  return normalized.largeWorlds || (normalized.battleRoyale && battleRoyaleMatch)
    ? LARGE_WORLD_GAMEPLAY_VIEWPORT
    : LEGACY_GAMEPLAY_VIEWPORT;
}

/**
 * Convert browser safe-area intrusions into the fixed logical 16:9 gameplay
 * surface. Letterboxing is removed before conversion, so side bars absorb a
 * notch without shrinking or widening the competitive logical view.
 */
export function calculateGameplayOverlaySafeArea(
  displayRect: GameplayDisplayRect,
  viewport: GameplayViewportSize,
  insets: GameplaySafeInsets = ZERO_INSETS,
  edgePadding = GAMEPLAY_SAFE_EDGE,
): GameplayOverlaySafeArea {
  const displayWidth = Math.max(1, finiteNonNegative(displayRect.width));
  const displayHeight = Math.max(1, finiteNonNegative(displayRect.height));
  const scaleX = GAMEPLAY_LOGICAL_WIDTH / displayWidth;
  const scaleY = GAMEPLAY_LOGICAL_HEIGHT / displayHeight;
  const rightLetterbox = Math.max(
    0,
    finiteNonNegative(viewport.width) -
      (finiteNonNegative(displayRect.left) + finiteNonNegative(displayRect.width)),
  );
  const bottomLetterbox = Math.max(
    0,
    finiteNonNegative(viewport.height) -
      (finiteNonNegative(displayRect.top) + finiteNonNegative(displayRect.height)),
  );

  const leftIntrusion = Math.max(0, finiteNonNegative(insets.left) - displayRect.left) * scaleX;
  const rightIntrusion = Math.max(0, finiteNonNegative(insets.right) - rightLetterbox) * scaleX;
  const topIntrusion = Math.max(0, finiteNonNegative(insets.top) - displayRect.top) * scaleY;
  const bottomIntrusion = Math.max(0, finiteNonNegative(insets.bottom) - bottomLetterbox) * scaleY;
  const padding = finiteNonNegative(edgePadding);

  const left = Math.min(GAMEPLAY_LOGICAL_WIDTH / 2, leftIntrusion + padding);
  const right = Math.max(
    GAMEPLAY_LOGICAL_WIDTH / 2,
    GAMEPLAY_LOGICAL_WIDTH - rightIntrusion - padding,
  );
  const top = Math.min(GAMEPLAY_LOGICAL_HEIGHT / 2, topIntrusion + padding);
  const bottom = Math.max(
    GAMEPLAY_LOGICAL_HEIGHT / 2,
    GAMEPLAY_LOGICAL_HEIGHT - bottomIntrusion - padding,
  );

  return Object.freeze({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  });
}

function cssSafeInset(name: string): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function readGameplaySafeInsets(): GameplaySafeInsets {
  return {
    top: cssSafeInset('--mmr-safe-area-top'),
    right: cssSafeInset('--mmr-safe-area-right'),
    bottom: cssSafeInset('--mmr-safe-area-bottom'),
    left: cssSafeInset('--mmr-safe-area-left'),
  };
}

export function currentGameplayOverlaySafeArea(canvas: HTMLCanvasElement): GameplayOverlaySafeArea {
  const rect = canvas.getBoundingClientRect();
  return calculateGameplayOverlaySafeArea(
    { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
    readGameplaySafeInsets(),
  );
}

export function useGameplayLogicalSize(
  scale: Phaser.Scale.ScaleManager,
  capabilities: unknown,
  battleRoyaleMatch = false,
): GameplayViewportContract {
  const viewport = gameplayViewportForCapabilities(capabilities, battleRoyaleMatch);
  if (scale.width !== viewport.logicalWidth || scale.height !== viewport.logicalHeight) {
    scale.setGameSize(viewport.logicalWidth, viewport.logicalHeight);
  }
  return viewport;
}
