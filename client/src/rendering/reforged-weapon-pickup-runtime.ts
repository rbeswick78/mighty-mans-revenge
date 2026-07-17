import Phaser from 'phaser';
import type { Direction4 } from '@shared/types/character.js';
import {
  REFORGED_GUN_ART_IDS,
  REFORGED_WEAPON_PICKUP_ATLAS_IMAGE,
  REFORGED_WEAPON_PICKUP_ATLAS_IMPORT,
  REFORGED_WEAPON_PICKUP_IMPORT_CACHE_KEY,
  REFORGED_WEAPON_PICKUP_TEXTURE_KEY,
  normalizeReforgedWeaponPickupImportMetadata,
  reforgedGunAnimationKey,
  reforgedGunAssetId,
  reforgedGunFrameIndices,
  reforgedWeaponPickupFrameName,
} from './reforged-weapon-pickup-contract.js';

const DIRECTIONS: readonly Direction4[] = ['down', 'up', 'side', 'side-left'];

export function preloadReforgedWeaponPickupAtlas(scene: Phaser.Scene): void {
  scene.load.json(REFORGED_WEAPON_PICKUP_IMPORT_CACHE_KEY, REFORGED_WEAPON_PICKUP_ATLAS_IMPORT);
  scene.load.image(REFORGED_WEAPON_PICKUP_TEXTURE_KEY, REFORGED_WEAPON_PICKUP_ATLAS_IMAGE);
}

export function registerReforgedWeaponPickupAtlas(scene: Phaser.Scene): boolean {
  const metadata = normalizeReforgedWeaponPickupImportMetadata(
    scene.cache.json.get(REFORGED_WEAPON_PICKUP_IMPORT_CACHE_KEY),
  );
  if (!metadata || !scene.textures.exists(REFORGED_WEAPON_PICKUP_TEXTURE_KEY)) return false;
  const texture = scene.textures.get(REFORGED_WEAPON_PICKUP_TEXTURE_KEY);
  for (const [name, frame] of Object.entries(metadata.frames)) {
    if (!texture.has(name)) texture.add(name, 0, frame.x, frame.y, frame.width, frame.height);
  }
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return true;
}

export function createReforgedWeaponPickupAnimations(scene: Phaser.Scene): void {
  if (!reforgedWeaponPickupAtlasAvailable(scene)) return;
  for (const id of REFORGED_GUN_ART_IDS) {
    for (const direction of DIRECTIONS) {
      for (const state of ['hold', 'shoot', 'racking', 'dry'] as const) {
        const key = reforgedGunAnimationKey(id, state, direction);
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frames: reforgedGunFrameIndices(state, direction).map((frameIndex) => ({
            key: REFORGED_WEAPON_PICKUP_TEXTURE_KEY,
            frame: reforgedWeaponPickupFrameName(reforgedGunAssetId(id), frameIndex),
          })),
          frameRate: state === 'shoot' ? 16 : state === 'racking' ? 4 : 5,
          repeat: state === 'hold' ? -1 : 0,
        });
      }
    }
  }
}

export function reforgedWeaponPickupAtlasAvailable(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists(REFORGED_WEAPON_PICKUP_TEXTURE_KEY)) return false;
  const texture = scene.textures.get(REFORGED_WEAPON_PICKUP_TEXTURE_KEY);
  return (
    REFORGED_GUN_ART_IDS.every((id) =>
      texture.has(reforgedWeaponPickupFrameName(reforgedGunAssetId(id), 23)),
    ) &&
    texture.has(reforgedWeaponPickupFrameName('pickup.sustain.core', 7)) &&
    texture.has(reforgedWeaponPickupFrameName('rarity.presentation.core', 5))
  );
}
