import Phaser from 'phaser';
import {
  REFORGED_COMBAT_FEEDBACK_ATLAS_IMAGE,
  REFORGED_COMBAT_FEEDBACK_ATLAS_IMPORT,
  REFORGED_COMBAT_FEEDBACK_IMPORT_CACHE_KEY,
  REFORGED_COMBAT_FEEDBACK_TEXTURE_KEY,
  normalizeReforgedCombatFeedbackImportMetadata,
  reforgedCombatFeedbackFrameName,
} from './reforged-combat-feedback-contract.js';

export function preloadReforgedCombatFeedbackAtlas(scene: Phaser.Scene): void {
  scene.load.json(REFORGED_COMBAT_FEEDBACK_IMPORT_CACHE_KEY, REFORGED_COMBAT_FEEDBACK_ATLAS_IMPORT);
  scene.load.image(REFORGED_COMBAT_FEEDBACK_TEXTURE_KEY, REFORGED_COMBAT_FEEDBACK_ATLAS_IMAGE);
}

export function registerReforgedCombatFeedbackAtlas(scene: Phaser.Scene): boolean {
  const metadata = normalizeReforgedCombatFeedbackImportMetadata(
    scene.cache.json.get(REFORGED_COMBAT_FEEDBACK_IMPORT_CACHE_KEY),
  );
  if (!metadata || !scene.textures.exists(REFORGED_COMBAT_FEEDBACK_TEXTURE_KEY)) return false;
  const texture = scene.textures.get(REFORGED_COMBAT_FEEDBACK_TEXTURE_KEY);
  for (const [name, frame] of Object.entries(metadata.frames)) {
    if (!texture.has(name)) texture.add(name, 0, frame.x, frame.y, frame.width, frame.height);
  }
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return true;
}

export function reforgedCombatFeedbackAtlasAvailable(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists(REFORGED_COMBAT_FEEDBACK_TEXTURE_KEY)) return false;
  const texture = scene.textures.get(REFORGED_COMBAT_FEEDBACK_TEXTURE_KEY);
  return (
    texture.has(reforgedCombatFeedbackFrameName(0)) &&
    texture.has(reforgedCombatFeedbackFrameName(95))
  );
}
