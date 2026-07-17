import type { CharacterId } from '@shared/config/game.js';
import type { Direction4 } from '@shared/types/character.js';

export const REFORGED_COMBAT_FEEDBACK_ATLAS_ID = 'combat-feedback-art.core';
export const REFORGED_COMBAT_FEEDBACK_TEXTURE_KEY = 'reforged-combat-feedback-art';
export const REFORGED_COMBAT_FEEDBACK_IMPORT_CACHE_KEY = 'reforged-combat-feedback-art-import';
export const REFORGED_COMBAT_FEEDBACK_ATLAS_IMAGE =
  'assets/reforged/combat-feedback-art/combat-feedback-art.core.png';
export const REFORGED_COMBAT_FEEDBACK_ATLAS_IMPORT =
  'assets/reforged/combat-feedback-art/combat-feedback-art.core.json';
export const REFORGED_COMBAT_FEEDBACK_ASSET_ID = 'feedback.presentation.core';
export const REFORGED_COMBAT_FEEDBACK_FRAME_SIZE = 64;
export const REFORGED_COMBAT_FEEDBACK_EXPLOSION_RADIUS_PX = 30;
export const REFORGED_COMBAT_FEEDBACK_POOL_CAPACITY = 32;

export const REFORGED_COMBAT_FEEDBACK_DIRECTIONS = [
  'side',
  'down',
  'side-left',
  'up',
] as const satisfies readonly Direction4[];

export const REFORGED_COMBAT_FEEDBACK_FIGHTERS = [
  'mighty_man',
  'bruce',
  'frost_wizard',
  'bubba',
  'jack',
  'rook',
] as const satisfies readonly CharacterId[];
export type ReforgedCombatFeedbackFighter = (typeof REFORGED_COMBAT_FEEDBACK_FIGHTERS)[number];

export const REFORGED_COMBAT_FEEDBACK_RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
] as const;
export type ReforgedCombatFeedbackRarity = (typeof REFORGED_COMBAT_FEEDBACK_RARITIES)[number];

export const REFORGED_COMBAT_FEEDBACK_FAMILIES = [
  'muzzle',
  'scenery-impact',
  'player-impact',
  'explosion',
  'healing',
  'armor',
  'ability',
  'rarity',
  'zone',
  'elimination',
] as const;
export type ReforgedCombatFeedbackFamily = (typeof REFORGED_COMBAT_FEEDBACK_FAMILIES)[number];
export type ReforgedCombatFeedbackQuality = 'full' | 'reduced';
export type ReforgedCombatFeedbackOwner = 'live-established-event' | 'verification-preview';

export const REFORGED_COMBAT_FEEDBACK_TIMING_MS = Object.freeze({
  muzzle: 120,
  'scenery-impact': 150,
  'player-impact': 150,
  explosion: 420,
  healing: 360,
  armor: 360,
  ability: 300,
  rarity: 600,
  zone: 800,
  elimination: 260,
} satisfies Record<ReforgedCombatFeedbackFamily, number>);

export interface ReforgedCombatFeedbackImportFrame {
  readonly assetId: typeof REFORGED_COMBAT_FEEDBACK_ASSET_ID;
  readonly frameIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: 64;
  readonly height: 64;
  readonly rotated: false;
  readonly trimmed: false;
}

export interface ReforgedCombatFeedbackImportMetadata {
  readonly schemaVersion: 1;
  readonly atlas: {
    readonly id: typeof REFORGED_COMBAT_FEEDBACK_ATLAS_ID;
    readonly image: 'combat-feedback-art.core.png';
    readonly width: 1024;
    readonly height: 512;
    readonly format: 'RGBA8888';
    readonly padding: 3;
    readonly extrude: 2;
    readonly premultipliedAlpha: false;
  };
  readonly assets: Readonly<
    Record<typeof REFORGED_COMBAT_FEEDBACK_ASSET_ID, { readonly frameCount: 96 }>
  >;
  readonly frames: Readonly<Record<string, ReforgedCombatFeedbackImportFrame>>;
  readonly integrity: { readonly textureSha256: string };
}

export interface ReforgedFeedbackPoolSlotState {
  readonly active: boolean;
  readonly sequence: number;
}

export interface ReforgedAbilityEdgeState {
  readonly active: boolean;
  readonly cooling: boolean;
}

export function reforgedCombatFeedbackFrameName(frameIndex: number): string {
  return `${REFORGED_COMBAT_FEEDBACK_ASSET_ID}/${String(frameIndex).padStart(3, '0')}`;
}

function frameRange(start: number, count: number): readonly string[] {
  return Object.freeze(
    Array.from({ length: count }, (_, index) => reforgedCombatFeedbackFrameName(start + index)),
  );
}

function directionOffset(direction: Direction4): number {
  return Math.max(0, REFORGED_COMBAT_FEEDBACK_DIRECTIONS.indexOf(direction));
}

export function reforgedCombatFeedbackDirection(angle: number): Direction4 {
  const quarter = Math.PI / 4;
  const threeQuarter = (Math.PI * 3) / 4;
  if (angle > -quarter && angle <= quarter) return 'side';
  if (angle > quarter && angle <= threeQuarter) return 'down';
  if (angle > -threeQuarter && angle <= -quarter) return 'up';
  return 'side-left';
}

export function reforgedMuzzleFrames(direction: Direction4): readonly string[] {
  return frameRange(directionOffset(direction) * 4, 4);
}

export function reforgedImpactFrames(
  kind: 'scenery' | 'player',
  direction: Direction4,
): readonly string[] {
  return frameRange((kind === 'scenery' ? 16 : 28) + directionOffset(direction) * 3, 3);
}

export const REFORGED_EXPLOSION_FRAMES = frameRange(40, 8);
export const REFORGED_HEALING_FRAMES = frameRange(48, 4);
export const REFORGED_ARMOR_FRAMES = frameRange(52, 4);

export function reforgedAbilityFrames(fighter: ReforgedCombatFeedbackFighter): readonly string[] {
  return frameRange(56 + Math.max(0, REFORGED_COMBAT_FEEDBACK_FIGHTERS.indexOf(fighter)) * 3, 3);
}

export function reforgedAbilityReleaseRotation(
  fighter: ReforgedCombatFeedbackFighter,
  authoritativeAimAngle: number,
): number {
  return fighter === 'bruce' || fighter === 'jack' || fighter === 'rook'
    ? authoritativeAimAngle
    : 0;
}

export function reforgedRarityFrame(rarity: ReforgedCombatFeedbackRarity): string {
  return reforgedCombatFeedbackFrameName(
    74 + Math.max(0, REFORGED_COMBAT_FEEDBACK_RARITIES.indexOf(rarity)),
  );
}

export const REFORGED_ZONE_FRAMES = frameRange(80, 8);

export function reforgedEliminationFrames(direction: Direction4): readonly string[] {
  return frameRange(88 + directionOffset(direction) * 2, 2);
}

export function shouldPresentReforgedCombatFeedback(
  family: ReforgedCombatFeedbackFamily,
  owner: ReforgedCombatFeedbackOwner,
  modernArtEnabled: boolean,
  atlasAvailable: boolean,
): boolean {
  if (!modernArtEnabled || !atlasAvailable) return false;
  if (owner === 'verification-preview') return true;
  return family !== 'rarity' && family !== 'zone';
}

export function reforgedCombatFeedbackQualityTreatment(quality: ReforgedCombatFeedbackQuality) {
  const full = quality === 'full';
  return Object.freeze({
    decisiveEvent: true,
    confirmedImpactPoint: true,
    explosionRadiusCue: true,
    healingArmorIdentity: true,
    abilityRelease: true,
    rarityShape: true,
    zoneBoundary: true,
    eliminationCue: true,
    secondarySparks: full,
    smokeDebrisFacets: full,
    softLight: full,
    shortTrails: full,
    bloomRequired: false,
    poolLimit: full ? 32 : 16,
  });
}

export function selectReforgedFeedbackPoolSlot(
  slots: readonly ReforgedFeedbackPoolSlotState[],
  activeLimit: number,
): number {
  const limit = Math.max(0, Math.min(activeLimit, slots.length));
  for (let index = 0; index < limit; index += 1) {
    if (!slots[index].active) return index;
  }
  let oldest = 0;
  for (let index = 1; index < limit; index += 1) {
    if (slots[index].sequence < slots[oldest].sequence) oldest = index;
  }
  return limit === 0 ? -1 : oldest;
}

export function shouldReleaseReforgedAbilityFeedback(
  fighter: ReforgedCombatFeedbackFighter,
  previous: ReforgedAbilityEdgeState | null,
  current: ReforgedAbilityEdgeState,
  isDead: boolean,
): boolean {
  if (!previous || isDead) return false;
  const continuous = fighter === 'mighty_man' || fighter === 'bruce' || fighter === 'bubba';
  return continuous ? current.active && !previous.active : current.cooling && !previous.cooling;
}

export function reforgedFeedbackAnimationFrame(
  frameCount: number,
  elapsedMs: number,
  durationMs: number,
): number {
  if (frameCount <= 1) return 0;
  const progress = Math.max(0, Math.min(0.999999, elapsedMs / Math.max(1, durationMs)));
  return Math.min(frameCount - 1, Math.floor(progress * frameCount));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function normalizeReforgedCombatFeedbackImportMetadata(
  value: unknown,
): ReforgedCombatFeedbackImportMetadata | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const { atlas, assets, frames, integrity } = value;
  if (!isRecord(atlas) || !isRecord(assets) || !isRecord(frames) || !isRecord(integrity))
    return null;
  if (
    atlas.id !== REFORGED_COMBAT_FEEDBACK_ATLAS_ID ||
    atlas.image !== 'combat-feedback-art.core.png' ||
    atlas.width !== 1024 ||
    atlas.height !== 512 ||
    atlas.format !== 'RGBA8888' ||
    atlas.padding !== 3 ||
    atlas.extrude !== 2 ||
    atlas.premultipliedAlpha !== false ||
    typeof integrity.textureSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(integrity.textureSha256) ||
    Object.keys(assets).length !== 1 ||
    Object.keys(frames).length !== 96
  )
    return null;
  const asset = assets[REFORGED_COMBAT_FEEDBACK_ASSET_ID];
  if (!isRecord(asset) || asset.frameCount !== 96) return null;
  for (let index = 0; index < 96; index += 1) {
    const frame = frames[reforgedCombatFeedbackFrameName(index)];
    if (
      !isRecord(frame) ||
      frame.assetId !== REFORGED_COMBAT_FEEDBACK_ASSET_ID ||
      frame.frameIndex !== index ||
      !Number.isInteger(frame.x) ||
      !Number.isInteger(frame.y) ||
      frame.width !== 64 ||
      frame.height !== 64 ||
      frame.rotated !== false ||
      frame.trimmed !== false ||
      (frame.x as number) < 0 ||
      (frame.y as number) < 0 ||
      (frame.x as number) + 64 > 1024 ||
      (frame.y as number) + 64 > 512
    )
      return null;
  }
  return value as unknown as ReforgedCombatFeedbackImportMetadata;
}
