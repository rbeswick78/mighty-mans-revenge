import type { CharacterId, WeaponId } from '@shared/config/game.js';
import type { DeathDirection, Direction4 } from '@shared/types/character.js';

export const REFORGED_FIGHTER_ART_II_ATLAS_ID = 'fighter-art-ii.core';
export const REFORGED_FIGHTER_ART_II_TEXTURE_KEY = 'reforged-fighter-art-ii';
export const REFORGED_FIGHTER_ART_II_IMPORT_CACHE_KEY = 'reforged-fighter-art-ii-import';
export const REFORGED_FIGHTER_ART_II_ATLAS_IMAGE =
  'assets/reforged/fighter-art-ii/fighter-art-ii.core.png';
export const REFORGED_FIGHTER_ART_II_ATLAS_IMPORT =
  'assets/reforged/fighter-art-ii/fighter-art-ii.core.json';
export const REFORGED_FIGHTER_ART_II_FRAME_SIZE = 64;

export const REFORGED_FIGHTER_ART_II_IDS = [
  'bubba',
  'jack',
  'rook',
] as const satisfies readonly CharacterId[];
export type ReforgedFighterArtIIId = (typeof REFORGED_FIGHTER_ART_II_IDS)[number];
export type ReforgedFighterArtIIAsset =
  | 'bubba'
  | 'jack-axe-absent'
  | 'jack-axe-present'
  | 'rook-body'
  | 'rook-helmet';
export type ReforgedFighterArtIILivingState = 'idle' | 'move' | 'attack' | 'ability' | 'damage';
export type ReforgedFighterArtIIState = ReforgedFighterArtIILivingState | 'death';
export type ReforgedFighterArtIIQuality = 'full' | 'reduced';

const DIRECTIONS: readonly Direction4[] = ['down', 'up', 'side', 'side-left'];
const DEATH_DIRECTIONS: readonly DeathDirection[] = ['side', 'side-left'];
const FRAME_COUNTS: Readonly<Record<ReforgedFighterArtIILivingState, number>> = Object.freeze({
  idle: 2,
  move: 4,
  attack: 4,
  ability: 4,
  damage: 2,
});
const STATE_START: Readonly<Record<ReforgedFighterArtIIState, number>> = Object.freeze({
  idle: 0,
  move: 8,
  attack: 24,
  ability: 40,
  damage: 56,
  death: 64,
});
const DEATH_VARIANTS: Readonly<Record<ReforgedFighterArtIIAsset, number>> = Object.freeze({
  bubba: 2,
  'jack-axe-absent': 2,
  'jack-axe-present': 1,
  'rook-body': 1,
  'rook-helmet': 1,
});
const EXPECTED_ASSET_FRAME_COUNTS: Readonly<Record<ReforgedFighterArtIIAsset, number>> =
  Object.freeze({
    bubba: 88,
    'jack-axe-absent': 88,
    'jack-axe-present': 76,
    'rook-body': 76,
    'rook-helmet': 76,
  });
const ASSET_IDS: Readonly<Record<ReforgedFighterArtIIAsset, string>> = Object.freeze({
  bubba: 'fighter.bubba.core',
  'jack-axe-absent': 'fighter.jack.axe-absent',
  'jack-axe-present': 'fighter.jack.axe-present',
  'rook-body': 'fighter.rook.body',
  'rook-helmet': 'fighter.rook.helmet',
});

export interface ReforgedFighterArtIIImportFrame {
  readonly assetId: string;
  readonly frameIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotated: false;
  readonly trimmed: false;
}

export interface ReforgedFighterArtIIImportMetadata {
  readonly schemaVersion: 1;
  readonly atlas: {
    readonly id: typeof REFORGED_FIGHTER_ART_II_ATLAS_ID;
    readonly image: 'fighter-art-ii.core.png';
    readonly width: 2048;
    readonly height: 2048;
    readonly format: 'RGBA8888';
    readonly padding: 3;
    readonly extrude: 2;
    readonly premultipliedAlpha: false;
  };
  readonly assets: Readonly<Record<string, { readonly frameCount: number }>>;
  readonly frames: Readonly<Record<string, ReforgedFighterArtIIImportFrame>>;
  readonly integrity: { readonly textureSha256: string };
}

export function isReforgedFighterArtIIId(value: CharacterId): value is ReforgedFighterArtIIId {
  return REFORGED_FIGHTER_ART_II_IDS.includes(value as ReforgedFighterArtIIId);
}

export function shouldUseReforgedFighterArtIIBody(
  characterId: CharacterId,
  weaponId: WeaponId,
  modernArtEnabled: boolean,
  atlasAvailable: boolean,
): characterId is ReforgedFighterArtIIId {
  if (!modernArtEnabled || !atlasAvailable || !isReforgedFighterArtIIId(characterId)) {
    return false;
  }
  return characterId !== 'rook' || weaponId === 'rifle';
}

export function reforgedFighterArtIIQualityTreatment(
  quality: ReforgedFighterArtIIQuality,
): Readonly<{
  authoredBodyStates: true;
  authoredAbilityCue: true;
  synchronizedLayers: true;
  secondaryParticles: boolean;
}> {
  return Object.freeze({
    authoredBodyStates: true,
    authoredAbilityCue: true,
    synchronizedLayers: true,
    secondaryParticles: quality === 'full',
  });
}

export function reforgedFighterArtIIAssetForCharacter(
  fighterId: ReforgedFighterArtIIId,
  axeless = false,
  layer: 'body' | 'helmet' = 'body',
): ReforgedFighterArtIIAsset {
  if (fighterId === 'bubba') return 'bubba';
  if (fighterId === 'jack') return axeless ? 'jack-axe-absent' : 'jack-axe-present';
  return layer === 'helmet' ? 'rook-helmet' : 'rook-body';
}

export function reforgedFighterArtIIAssetId(asset: ReforgedFighterArtIIAsset): string {
  return ASSET_IDS[asset];
}

export function reforgedFighterArtIIFrameName(
  asset: ReforgedFighterArtIIAsset,
  frameIndex: number,
): string {
  return `${reforgedFighterArtIIAssetId(asset)}/${String(frameIndex).padStart(3, '0')}`;
}

export function reforgedFighterArtIILivingFrameIndices(
  state: ReforgedFighterArtIILivingState,
  direction: Direction4,
): readonly number[] {
  const directionIndex = DIRECTIONS.indexOf(direction);
  const count = FRAME_COUNTS[state];
  const start = STATE_START[state] + directionIndex * count;
  return Object.freeze(Array.from({ length: count }, (_, index) => start + index));
}

export function reforgedFighterArtIIDeathFrameIndices(
  asset: ReforgedFighterArtIIAsset,
  direction: DeathDirection,
  deathCount: number,
): readonly number[] {
  const variantCount = DEATH_VARIANTS[asset];
  const normalizedDeathCount = Number.isFinite(deathCount)
    ? Math.max(1, Math.floor(deathCount))
    : 1;
  const variant = (normalizedDeathCount - 1) % variantCount;
  const directionIndex = DEATH_DIRECTIONS.indexOf(direction);
  const start = STATE_START.death + variant * 12 + directionIndex * 6;
  return Object.freeze(Array.from({ length: 6 }, (_, index) => start + index));
}

export function reforgedFighterArtIIAnimationKey(
  asset: ReforgedFighterArtIIAsset,
  state: ReforgedFighterArtIIState,
  direction: Direction4 | DeathDirection,
  deathCount = 1,
): string {
  const suffix =
    state === 'death'
      ? `-v${((Math.max(1, Math.floor(deathCount)) - 1) % DEATH_VARIANTS[asset]) + 1}`
      : '';
  return `reforged-ii-${asset}-${direction}-${state}${suffix}`;
}

export function expectedReforgedFighterArtIIFrameCount(asset: ReforgedFighterArtIIAsset): number {
  return EXPECTED_ASSET_FRAME_COUNTS[asset];
}

export function reforgedFighterArtIIDeathVariantCount(asset: ReforgedFighterArtIIAsset): number {
  return DEATH_VARIANTS[asset];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function normalizeReforgedFighterArtIIImportMetadata(
  value: unknown,
): ReforgedFighterArtIIImportMetadata | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const atlas = value.atlas;
  const assets = value.assets;
  const frames = value.frames;
  const integrity = value.integrity;
  if (!isRecord(atlas) || !isRecord(assets) || !isRecord(frames) || !isRecord(integrity)) {
    return null;
  }
  if (
    atlas.id !== REFORGED_FIGHTER_ART_II_ATLAS_ID ||
    atlas.image !== 'fighter-art-ii.core.png' ||
    atlas.width !== 2048 ||
    atlas.height !== 2048 ||
    atlas.format !== 'RGBA8888' ||
    atlas.padding !== 3 ||
    atlas.extrude !== 2 ||
    atlas.premultipliedAlpha !== false ||
    typeof integrity.textureSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(integrity.textureSha256) ||
    Object.keys(assets).length !== Object.keys(EXPECTED_ASSET_FRAME_COUNTS).length ||
    Object.keys(frames).length !== 404
  ) {
    return null;
  }
  for (const asset of Object.keys(EXPECTED_ASSET_FRAME_COUNTS) as ReforgedFighterArtIIAsset[]) {
    const assetId = reforgedFighterArtIIAssetId(asset);
    const metadataAsset = assets[assetId];
    if (
      !isRecord(metadataAsset) ||
      metadataAsset.frameCount !== EXPECTED_ASSET_FRAME_COUNTS[asset]
    ) {
      return null;
    }
    for (let index = 0; index < EXPECTED_ASSET_FRAME_COUNTS[asset]; index += 1) {
      const frame = frames[reforgedFighterArtIIFrameName(asset, index)];
      if (
        !isRecord(frame) ||
        frame.assetId !== assetId ||
        frame.frameIndex !== index ||
        !Number.isInteger(frame.x) ||
        !Number.isInteger(frame.y) ||
        frame.width !== REFORGED_FIGHTER_ART_II_FRAME_SIZE ||
        frame.height !== REFORGED_FIGHTER_ART_II_FRAME_SIZE ||
        frame.rotated !== false ||
        frame.trimmed !== false ||
        (frame.x as number) < 0 ||
        (frame.y as number) < 0 ||
        (frame.x as number) + REFORGED_FIGHTER_ART_II_FRAME_SIZE > 2048 ||
        (frame.y as number) + REFORGED_FIGHTER_ART_II_FRAME_SIZE > 2048
      ) {
        return null;
      }
    }
  }
  return value as unknown as ReforgedFighterArtIIImportMetadata;
}
