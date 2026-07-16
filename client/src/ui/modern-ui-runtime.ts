import Phaser from 'phaser';

import {
  MODERN_UI_ATLAS_IMAGE,
  MODERN_UI_ATLAS_IMPORT,
  MODERN_UI_IMPORT_CACHE_KEY,
  MODERN_UI_TEXTURE_KEY,
  modernUiPanelFrame,
  normalizeModernUiImportMetadata,
  type ModernUiPanelRole,
} from './modern-ui-contract.js';
import { MENU_FONTS } from './menu/fonts.js';

const MODERN_UI_SCENES = new WeakMap<Phaser.Scene, boolean>();

export const MODERN_UI_FONTS = Object.freeze({
  HEADER: '"Arial Narrow", "Roboto Condensed", "Segoe UI", sans-serif',
  BODY: '"Segoe UI", Arial, sans-serif',
});

export function preloadModernUiAtlas(scene: Phaser.Scene): void {
  scene.load.json(MODERN_UI_IMPORT_CACHE_KEY, MODERN_UI_ATLAS_IMPORT);
  scene.load.image(MODERN_UI_TEXTURE_KEY, MODERN_UI_ATLAS_IMAGE);
}

export function registerModernUiAtlas(scene: Phaser.Scene): boolean {
  const metadata = normalizeModernUiImportMetadata(
    scene.cache.json.get(MODERN_UI_IMPORT_CACHE_KEY),
  );
  if (!metadata || !scene.textures.exists(MODERN_UI_TEXTURE_KEY)) return false;
  const texture = scene.textures.get(MODERN_UI_TEXTURE_KEY);
  for (const [name, frame] of Object.entries(metadata.frames)) {
    if (!texture.has(name)) {
      texture.add(name, 0, frame.x, frame.y, frame.width, frame.height);
    }
  }
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return true;
}

export function configureModernUiScene(scene: Phaser.Scene, enabled: boolean): boolean {
  const active = enabled && scene.textures.exists(MODERN_UI_TEXTURE_KEY);
  MODERN_UI_SCENES.set(scene, active);
  return active;
}

export function modernUiEnabledForScene(scene: Phaser.Scene): boolean {
  return MODERN_UI_SCENES.get(scene) ?? false;
}

export function menuHeaderFont(scene: Phaser.Scene): string {
  return modernUiEnabledForScene(scene) ? MODERN_UI_FONTS.HEADER : MENU_FONTS.HEADER;
}

export function menuBodyFont(scene: Phaser.Scene): string {
  return modernUiEnabledForScene(scene) ? MODERN_UI_FONTS.BODY : MENU_FONTS.BODY;
}

export function createModernUiNineSlice(
  scene: Phaser.Scene,
  role: ModernUiPanelRole,
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.GameObjects.NineSlice {
  return scene.add
    .nineslice(x, y, MODERN_UI_TEXTURE_KEY, modernUiPanelFrame(role), width, height, 12, 12, 12, 12)
    .setOrigin(0);
}
