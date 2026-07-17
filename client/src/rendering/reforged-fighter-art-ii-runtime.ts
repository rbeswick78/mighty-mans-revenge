import Phaser from 'phaser';
import type { DeathDirection, Direction4 } from '@shared/types/character.js';
import {
  REFORGED_FIGHTER_ART_II_ATLAS_IMAGE,
  REFORGED_FIGHTER_ART_II_ATLAS_IMPORT,
  REFORGED_FIGHTER_ART_II_IMPORT_CACHE_KEY,
  REFORGED_FIGHTER_ART_II_TEXTURE_KEY,
  expectedReforgedFighterArtIIFrameCount,
  normalizeReforgedFighterArtIIImportMetadata,
  reforgedFighterArtIIAnimationKey,
  reforgedFighterArtIIAssetId,
  reforgedFighterArtIIDeathFrameIndices,
  reforgedFighterArtIIDeathVariantCount,
  reforgedFighterArtIIFrameName,
  reforgedFighterArtIILivingFrameIndices,
  type ReforgedFighterArtIIAsset,
  type ReforgedFighterArtIILivingState,
} from './reforged-fighter-art-ii-contract.js';

const ASSETS: readonly ReforgedFighterArtIIAsset[] = [
  'bubba',
  'jack-axe-absent',
  'jack-axe-present',
  'rook-body',
  'rook-helmet',
];
const DIRECTIONS: readonly Direction4[] = ['down', 'up', 'side', 'side-left'];
const DEATH_DIRECTIONS: readonly DeathDirection[] = ['side', 'side-left'];
const STATE_TIMING: Readonly<
  Record<ReforgedFighterArtIILivingState, { readonly frameRate: number; readonly repeat: number }>
> = Object.freeze({
  idle: { frameRate: 3, repeat: -1 },
  move: { frameRate: 10, repeat: -1 },
  attack: { frameRate: 12, repeat: 0 },
  ability: { frameRate: 10, repeat: 0 },
  damage: { frameRate: 12, repeat: 0 },
});

export function preloadReforgedFighterArtIIAtlas(scene: Phaser.Scene): void {
  scene.load.json(REFORGED_FIGHTER_ART_II_IMPORT_CACHE_KEY, REFORGED_FIGHTER_ART_II_ATLAS_IMPORT);
  scene.load.image(REFORGED_FIGHTER_ART_II_TEXTURE_KEY, REFORGED_FIGHTER_ART_II_ATLAS_IMAGE);
}

export function registerReforgedFighterArtIIAtlas(scene: Phaser.Scene): boolean {
  const metadata = normalizeReforgedFighterArtIIImportMetadata(
    scene.cache.json.get(REFORGED_FIGHTER_ART_II_IMPORT_CACHE_KEY),
  );
  if (!metadata || !scene.textures.exists(REFORGED_FIGHTER_ART_II_TEXTURE_KEY)) return false;
  const texture = scene.textures.get(REFORGED_FIGHTER_ART_II_TEXTURE_KEY);
  for (const [name, frame] of Object.entries(metadata.frames)) {
    if (!texture.has(name)) texture.add(name, 0, frame.x, frame.y, frame.width, frame.height);
  }
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return true;
}

export function createReforgedFighterArtIIAnimations(scene: Phaser.Scene): void {
  if (!reforgedFighterArtIIAtlasAvailable(scene)) return;
  for (const asset of ASSETS) {
    for (const direction of DIRECTIONS) {
      for (const state of ['idle', 'move', 'attack', 'ability', 'damage'] as const) {
        const key = reforgedFighterArtIIAnimationKey(asset, state, direction);
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frames: reforgedFighterArtIILivingFrameIndices(state, direction).map((frameIndex) => ({
            key: REFORGED_FIGHTER_ART_II_TEXTURE_KEY,
            frame: reforgedFighterArtIIFrameName(asset, frameIndex),
          })),
          frameRate: STATE_TIMING[state].frameRate,
          repeat: STATE_TIMING[state].repeat,
        });
      }
    }
    for (
      let deathCount = 1;
      deathCount <= reforgedFighterArtIIDeathVariantCount(asset);
      deathCount += 1
    ) {
      for (const direction of DEATH_DIRECTIONS) {
        const key = reforgedFighterArtIIAnimationKey(asset, 'death', direction, deathCount);
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frames: reforgedFighterArtIIDeathFrameIndices(asset, direction, deathCount).map(
            (frameIndex) => ({
              key: REFORGED_FIGHTER_ART_II_TEXTURE_KEY,
              frame: reforgedFighterArtIIFrameName(asset, frameIndex),
            }),
          ),
          frameRate: 6 / 0.65,
          repeat: 0,
        });
      }
    }
  }
}

export function reforgedFighterArtIIAtlasAvailable(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists(REFORGED_FIGHTER_ART_II_TEXTURE_KEY)) return false;
  const texture = scene.textures.get(REFORGED_FIGHTER_ART_II_TEXTURE_KEY);
  return ASSETS.every(
    (asset) =>
      texture.has(reforgedFighterArtIIFrameName(asset, 0)) &&
      texture.has(
        reforgedFighterArtIIFrameName(asset, expectedReforgedFighterArtIIFrameCount(asset) - 1),
      ) &&
      texture.has(reforgedFighterArtIIAssetId(asset) + '/000'),
  );
}
