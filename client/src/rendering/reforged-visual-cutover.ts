import Phaser from 'phaser';

import { modernUiAtlasAvailable } from '../ui/modern-ui-runtime.js';
import { reforgedCombatFeedbackAtlasAvailable } from './reforged-combat-feedback-runtime.js';
import { reforgedEnvironmentAtlasAvailable } from './reforged-environment-runtime.js';
import { reforgedFighterArtIIAtlasAvailable } from './reforged-fighter-art-ii-runtime.js';
import { reforgedFighterAtlasAvailable } from './reforged-fighter-runtime.js';
import { reforgedWeaponPickupAtlasAvailable } from './reforged-weapon-pickup-runtime.js';
import {
  selectReforgedVisualCutover,
  type ReforgedVisualAtlasAvailability,
  type ReforgedVisualCutoverSelection,
} from './reforged-visual-cutover-contract.js';

export type {
  ReforgedVisualAtlasAvailability,
  ReforgedVisualAtlasId,
  ReforgedVisualCutoverSelection,
} from './reforged-visual-cutover-contract.js';

export function reforgedVisualAtlasAvailability(
  scene: Phaser.Scene,
): ReforgedVisualAtlasAvailability {
  return Object.freeze({
    modernUi: modernUiAtlasAvailable(scene),
    fighterArtI: reforgedFighterAtlasAvailable(scene),
    fighterArtII: reforgedFighterArtIIAtlasAvailable(scene),
    weaponPickup: reforgedWeaponPickupAtlasAvailable(scene),
    biomeEnvironment: reforgedEnvironmentAtlasAvailable(scene),
    combatFeedback: reforgedCombatFeedbackAtlasAvailable(scene),
  });
}

export function reforgedVisualCutoverForScene(
  scene: Phaser.Scene,
  modernArtAdvertised: boolean,
): ReforgedVisualCutoverSelection {
  return selectReforgedVisualCutover(modernArtAdvertised, reforgedVisualAtlasAvailability(scene));
}
