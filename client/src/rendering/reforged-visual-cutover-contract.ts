export const REFORGED_VISUAL_ATLAS_IDS = [
  'modernUi',
  'fighterArtI',
  'fighterArtII',
  'weaponPickup',
  'biomeEnvironment',
  'combatFeedback',
] as const;

export type ReforgedVisualAtlasId = (typeof REFORGED_VISUAL_ATLAS_IDS)[number];
export type ReforgedVisualAtlasAvailability = Readonly<Record<ReforgedVisualAtlasId, boolean>>;

export interface ReforgedVisualCutoverSelection {
  readonly active: boolean;
  readonly modernArtAdvertised: boolean;
  readonly atlasAvailability: ReforgedVisualAtlasAvailability;
  readonly missingAtlases: readonly ReforgedVisualAtlasId[];
  readonly owner: 'modern-system' | 'legacy-fallback';
}

export const REFORGED_LIVE_FEEDBACK_EVENTS = [
  'muzzle',
  'scenery-impact',
  'confirmed-player-impact',
  'explosion',
  'healing',
  'armor',
  'ability-release',
  'elimination',
] as const;
export type ReforgedLiveFeedbackEvent = (typeof REFORGED_LIVE_FEEDBACK_EVENTS)[number];

export function reforgedFeedbackOwner(
  event: ReforgedLiveFeedbackEvent | 'bat' | 'punch' | 'future-rarity' | 'future-zone',
  cutoverActive: boolean,
): 'modern-system' | 'legacy-fallback' | 'dormant' {
  if (event === 'future-rarity' || event === 'future-zone') return 'dormant';
  if (event === 'bat' || event === 'punch') return 'legacy-fallback';
  return cutoverActive ? 'modern-system' : 'legacy-fallback';
}

/** Literal capability plus all six compatible atlases select one atomic owner. */
export function selectReforgedVisualCutover(
  modernArtAdvertised: boolean,
  atlasAvailability: ReforgedVisualAtlasAvailability,
): ReforgedVisualCutoverSelection {
  const missingAtlases = REFORGED_VISUAL_ATLAS_IDS.filter((id) => !atlasAvailability[id]);
  const active = modernArtAdvertised && missingAtlases.length === 0;
  return Object.freeze({
    active,
    modernArtAdvertised,
    atlasAvailability: Object.freeze({ ...atlasAvailability }),
    missingAtlases: Object.freeze(missingAtlases),
    owner: active ? 'modern-system' : 'legacy-fallback',
  });
}
