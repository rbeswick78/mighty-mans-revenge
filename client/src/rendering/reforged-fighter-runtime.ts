import Phaser from 'phaser';
import type { DeathDirection, Direction4 } from '@shared/types/character.js';
import {
  REFORGED_FIGHTER_ATLAS_IMAGE,
  REFORGED_FIGHTER_ATLAS_IMPORT,
  REFORGED_FIGHTER_IDS,
  REFORGED_FIGHTER_IMPORT_CACHE_KEY,
  REFORGED_FIGHTER_TEXTURE_KEY,
  expectedReforgedFighterFrameCount,
  normalizeReforgedFighterImportMetadata,
  reforgedFighterAnimationKey,
  reforgedFighterDeathFrameIndices,
  reforgedFighterFrameName,
  reforgedFighterLivingFrameIndices,
  type ReforgedFighterId,
  type ReforgedFighterLivingState,
} from './reforged-fighter-contract.js';

const DIRECTIONS: readonly Direction4[] = ['down', 'up', 'side', 'side-left'];
const DEATH_DIRECTIONS: readonly DeathDirection[] = ['side', 'side-left'];
const DEATH_VARIANTS: Readonly<Record<ReforgedFighterId, number>> = Object.freeze({
  mighty_man: 3,
  bruce: 2,
  frost_wizard: 3,
});
const STATE_TIMING: Readonly<
  Record<ReforgedFighterLivingState, { readonly frameRate: number; readonly repeat: number }>
> = Object.freeze({
  idle: { frameRate: 3, repeat: -1 },
  move: { frameRate: 10, repeat: -1 },
  attack: { frameRate: 12, repeat: 0 },
  ability: { frameRate: 10, repeat: 0 },
  damage: { frameRate: 12, repeat: 0 },
});

export function preloadReforgedFighterAtlas(scene: Phaser.Scene): void {
  scene.load.json(REFORGED_FIGHTER_IMPORT_CACHE_KEY, REFORGED_FIGHTER_ATLAS_IMPORT);
  scene.load.image(REFORGED_FIGHTER_TEXTURE_KEY, REFORGED_FIGHTER_ATLAS_IMAGE);
}

export function registerReforgedFighterAtlas(scene: Phaser.Scene): boolean {
  const metadata = normalizeReforgedFighterImportMetadata(
    scene.cache.json.get(REFORGED_FIGHTER_IMPORT_CACHE_KEY),
  );
  if (!metadata || !scene.textures.exists(REFORGED_FIGHTER_TEXTURE_KEY)) return false;
  const texture = scene.textures.get(REFORGED_FIGHTER_TEXTURE_KEY);
  for (const [name, frame] of Object.entries(metadata.frames)) {
    if (!texture.has(name)) texture.add(name, 0, frame.x, frame.y, frame.width, frame.height);
  }
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return true;
}

export function createReforgedFighterAnimations(scene: Phaser.Scene): void {
  if (!reforgedFighterAtlasAvailable(scene)) return;
  for (const fighterId of REFORGED_FIGHTER_IDS) {
    for (const direction of DIRECTIONS) {
      for (const state of ['idle', 'move', 'attack', 'ability', 'damage'] as const) {
        const key = reforgedFighterAnimationKey(fighterId, state, direction);
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frames: reforgedFighterLivingFrameIndices(state, direction).map((frameIndex) => ({
            key: REFORGED_FIGHTER_TEXTURE_KEY,
            frame: reforgedFighterFrameName(fighterId, frameIndex),
          })),
          frameRate: STATE_TIMING[state].frameRate,
          repeat: STATE_TIMING[state].repeat,
        });
      }
    }
    for (let deathCount = 1; deathCount <= DEATH_VARIANTS[fighterId]; deathCount += 1) {
      for (const direction of DEATH_DIRECTIONS) {
        const key = reforgedFighterAnimationKey(fighterId, 'death', direction, deathCount);
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frames: reforgedFighterDeathFrameIndices(fighterId, direction, deathCount).map(
            (frameIndex) => ({
              key: REFORGED_FIGHTER_TEXTURE_KEY,
              frame: reforgedFighterFrameName(fighterId, frameIndex),
            }),
          ),
          frameRate: 6 / 0.65,
          repeat: 0,
        });
      }
    }
  }
}

export function reforgedFighterAtlasAvailable(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists(REFORGED_FIGHTER_TEXTURE_KEY)) return false;
  const texture = scene.textures.get(REFORGED_FIGHTER_TEXTURE_KEY);
  return REFORGED_FIGHTER_IDS.every(
    (fighterId) =>
      texture.has(reforgedFighterFrameName(fighterId, 0)) &&
      texture.has(
        reforgedFighterFrameName(fighterId, expectedReforgedFighterFrameCount(fighterId) - 1),
      ),
  );
}
