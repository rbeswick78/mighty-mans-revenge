import Phaser from 'phaser';
import {
  REFORGED_BIOME_FAMILIES,
  REFORGED_ENVIRONMENT_ATLAS_IMAGE,
  REFORGED_ENVIRONMENT_ATLAS_IMPORT,
  REFORGED_ENVIRONMENT_IMPORT_CACHE_KEY,
  REFORGED_ENVIRONMENT_TEXTURE_KEY,
  normalizeReforgedEnvironmentImportMetadata,
  reforgedEnvironmentAssetId,
  reforgedEnvironmentFrameName,
} from './reforged-environment-contract.js';

export function preloadReforgedEnvironmentAtlas(scene: Phaser.Scene): void {
  scene.load.json(REFORGED_ENVIRONMENT_IMPORT_CACHE_KEY, REFORGED_ENVIRONMENT_ATLAS_IMPORT);
  scene.load.image(REFORGED_ENVIRONMENT_TEXTURE_KEY, REFORGED_ENVIRONMENT_ATLAS_IMAGE);
}

export function registerReforgedEnvironmentAtlas(scene: Phaser.Scene): boolean {
  const metadata = normalizeReforgedEnvironmentImportMetadata(
    scene.cache.json.get(REFORGED_ENVIRONMENT_IMPORT_CACHE_KEY),
  );
  if (!metadata || !scene.textures.exists(REFORGED_ENVIRONMENT_TEXTURE_KEY)) return false;
  const texture = scene.textures.get(REFORGED_ENVIRONMENT_TEXTURE_KEY);
  for (const [name, frame] of Object.entries(metadata.frames)) {
    if (!texture.has(name)) texture.add(name, 0, frame.x, frame.y, frame.width, frame.height);
  }
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return true;
}

export function reforgedEnvironmentAtlasAvailable(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists(REFORGED_ENVIRONMENT_TEXTURE_KEY)) return false;
  const texture = scene.textures.get(REFORGED_ENVIRONMENT_TEXTURE_KEY);
  return REFORGED_BIOME_FAMILIES.every((family) =>
    texture.has(reforgedEnvironmentFrameName(reforgedEnvironmentAssetId(family), 19)),
  );
}
