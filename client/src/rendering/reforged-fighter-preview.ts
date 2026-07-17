import type { CharacterId } from '@shared/config/game.js';
import type { Direction4 } from '@shared/types/character.js';
import {
  REFORGED_FIGHTER_TEXTURE_KEY,
  isReforgedFighterId,
  reforgedFighterAnimationKey,
  reforgedFighterFrameName,
  reforgedFighterLivingFrameIndices,
} from './reforged-fighter-contract.js';
import {
  REFORGED_FIGHTER_ART_II_TEXTURE_KEY,
  isReforgedFighterArtIIId,
  reforgedFighterArtIIAnimationKey,
  reforgedFighterArtIIAssetForCharacter,
  reforgedFighterArtIIFrameName,
  reforgedFighterArtIILivingFrameIndices,
  type ReforgedFighterArtIIAsset,
} from './reforged-fighter-art-ii-contract.js';

export interface ReforgedFighterPreviewLayer {
  readonly texture: string;
  readonly frame: string;
  readonly animation: string;
}

export interface ReforgedFighterPreview {
  readonly body: ReforgedFighterPreviewLayer;
  readonly overlay: ReforgedFighterPreviewLayer | null;
}

/** Static/menu projection of the roster's established carried-object truth. */
export function reforgedFighterPreview(
  fighterId: CharacterId,
  direction: Direction4,
  modernCutoverActive: boolean,
): ReforgedFighterPreview | null {
  if (!modernCutoverActive) return null;
  if (isReforgedFighterId(fighterId)) {
    const index = reforgedFighterLivingFrameIndices('idle', direction)[0];
    return Object.freeze({
      body: Object.freeze({
        texture: REFORGED_FIGHTER_TEXTURE_KEY,
        frame: reforgedFighterFrameName(fighterId, index),
        animation: reforgedFighterAnimationKey(fighterId, 'idle', direction),
      }),
      overlay: null,
    });
  }
  if (!isReforgedFighterArtIIId(fighterId)) return null;
  const bodyAsset = reforgedFighterArtIIAssetForCharacter(fighterId, false, 'body');
  const body = previewLayer(bodyAsset, direction);
  const overlay = fighterId === 'rook' ? previewLayer('rook-helmet', direction) : null;
  return Object.freeze({ body, overlay });
}

function previewLayer(
  asset: ReforgedFighterArtIIAsset,
  direction: Direction4,
): ReforgedFighterPreviewLayer {
  const index = reforgedFighterArtIILivingFrameIndices('idle', direction)[0];
  return Object.freeze({
    texture: REFORGED_FIGHTER_ART_II_TEXTURE_KEY,
    frame: reforgedFighterArtIIFrameName(asset, index),
    animation: reforgedFighterArtIIAnimationKey(asset, 'idle', direction),
  });
}
