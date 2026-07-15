import type Phaser from 'phaser';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../layout.js';
import { ReforgedMenuTokens } from './design-tokens.js';

export const MENU_LOGICAL_WIDTH = 1280;
export const MENU_LOGICAL_HEIGHT = 720;

export interface MenuSafeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface MenuDisplayRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface MenuViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface MenuSafeArea {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

const ZERO_INSETS: MenuSafeInsets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

const finiteNonNegative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

/**
 * Convert viewport safe-area intrusions into logical menu coordinates. Browser
 * letterboxing is subtracted first, so a notch hidden entirely inside a side
 * bar does not unnecessarily squeeze the 16:9 content area.
 */
export function calculateMenuSafeArea(
  displayRect: MenuDisplayRect,
  viewport: MenuViewportSize,
  insets: MenuSafeInsets = ZERO_INSETS,
  edgePadding = ReforgedMenuTokens.space.safeEdge,
): MenuSafeArea {
  const displayWidth = Math.max(1, finiteNonNegative(displayRect.width));
  const displayHeight = Math.max(1, finiteNonNegative(displayRect.height));
  const scaleX = MENU_LOGICAL_WIDTH / displayWidth;
  const scaleY = MENU_LOGICAL_HEIGHT / displayHeight;
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

  const left = Math.min(MENU_LOGICAL_WIDTH / 2, leftIntrusion + padding);
  const right = Math.max(MENU_LOGICAL_WIDTH / 2, MENU_LOGICAL_WIDTH - rightIntrusion - padding);
  const top = Math.min(MENU_LOGICAL_HEIGHT / 2, topIntrusion + padding);
  const bottom = Math.max(MENU_LOGICAL_HEIGHT / 2, MENU_LOGICAL_HEIGHT - bottomIntrusion - padding);

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

export function readBrowserSafeInsets(): MenuSafeInsets {
  return {
    top: cssSafeInset('--mmr-safe-area-top'),
    right: cssSafeInset('--mmr-safe-area-right'),
    bottom: cssSafeInset('--mmr-safe-area-bottom'),
    left: cssSafeInset('--mmr-safe-area-left'),
  };
}

export function currentMenuSafeArea(canvas: HTMLCanvasElement): MenuSafeArea {
  const rect = canvas.getBoundingClientRect();
  return calculateMenuSafeArea(
    { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
    readBrowserSafeInsets(),
  );
}

export function useReforgedMenuLogicalSize(scale: Phaser.Scale.ScaleManager): void {
  if (scale.width === MENU_LOGICAL_WIDTH && scale.height === MENU_LOGICAL_HEIGHT) return;
  scale.setGameSize(MENU_LOGICAL_WIDTH, MENU_LOGICAL_HEIGHT);
}

export function useLegacyLogicalSize(scale: Phaser.Scale.ScaleManager): void {
  if (scale.width === CANVAS_WIDTH && scale.height === CANVAS_HEIGHT) return;
  scale.setGameSize(CANVAS_WIDTH, CANVAS_HEIGHT);
}
