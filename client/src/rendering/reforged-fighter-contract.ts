import type { CharacterId, WeaponId } from '@shared/config/game.js';
import type { DeathDirection, Direction4 } from '@shared/types/character.js';

export const REFORGED_FIGHTER_ATLAS_ID = 'fighter-art-i.core';
export const REFORGED_FIGHTER_TEXTURE_KEY = 'reforged-fighter-art-i';
export const REFORGED_FIGHTER_IMPORT_CACHE_KEY = 'reforged-fighter-art-i-import';
export const REFORGED_FIGHTER_ATLAS_IMAGE = 'assets/reforged/fighter-art-i/fighter-art-i.core.png';
export const REFORGED_FIGHTER_ATLAS_IMPORT =
  'assets/reforged/fighter-art-i/fighter-art-i.core.json';
export const REFORGED_FIGHTER_FRAME_SIZE = 64;

export const REFORGED_FIGHTER_IDS = [
  'mighty_man',
  'bruce',
  'frost_wizard',
] as const satisfies readonly CharacterId[];

export type ReforgedFighterId = (typeof REFORGED_FIGHTER_IDS)[number];
export type ReforgedFighterLivingState = 'idle' | 'move' | 'attack' | 'ability' | 'damage';
export type ReforgedFighterState = ReforgedFighterLivingState | 'death';
export type ReforgedFighterQuality = 'full' | 'reduced';

const DIRECTIONS: readonly Direction4[] = ['down', 'up', 'side', 'side-left'];
const DEATH_DIRECTIONS: readonly DeathDirection[] = ['side', 'side-left'];
const FRAME_COUNTS: Readonly<Record<ReforgedFighterLivingState, number>> = Object.freeze({
  idle: 2,
  move: 4,
  attack: 4,
  ability: 4,
  damage: 2,
});
const STATE_START: Readonly<Record<ReforgedFighterLivingState | 'death', number>> = Object.freeze({
  idle: 0,
  move: 8,
  attack: 24,
  ability: 40,
  damage: 56,
  death: 64,
});
const DEATH_VARIANTS: Readonly<Record<ReforgedFighterId, number>> = Object.freeze({
  mighty_man: 3,
  bruce: 2,
  frost_wizard: 3,
});
const EXPECTED_ASSET_FRAME_COUNTS: Readonly<Record<ReforgedFighterId, number>> = Object.freeze({
  mighty_man: 100,
  bruce: 88,
  frost_wizard: 100,
});

export interface ReforgedFighterImportFrame {
  readonly assetId: string;
  readonly frameIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotated: false;
  readonly trimmed: false;
}

export interface ReforgedFighterImportMetadata {
  readonly schemaVersion: 1;
  readonly atlas: {
    readonly id: typeof REFORGED_FIGHTER_ATLAS_ID;
    readonly image: 'fighter-art-i.core.png';
    readonly width: number;
    readonly height: number;
    readonly format: 'RGBA8888';
    readonly padding: number;
    readonly extrude: number;
    readonly premultipliedAlpha: false;
  };
  readonly assets: Readonly<Record<string, { readonly frameCount: number }>>;
  readonly frames: Readonly<Record<string, ReforgedFighterImportFrame>>;
  readonly integrity: { readonly textureSha256: string };
}

export function isReforgedFighterId(value: CharacterId): value is ReforgedFighterId {
  return REFORGED_FIGHTER_IDS.includes(value as ReforgedFighterId);
}

export function shouldUseReforgedFighterBody(
  characterId: CharacterId,
  weaponId: WeaponId,
  modernArtEnabled: boolean,
  atlasAvailable: boolean,
): characterId is ReforgedFighterId {
  if (!modernArtEnabled || !atlasAvailable || !isReforgedFighterId(characterId)) return false;
  // The Batch 28 body sheets own only each fighter's established carried-object
  // identity. Keep the complete legacy body/overlay path for weapon states that
  // would otherwise draw two objects or hide an authoritative pickup.
  if (characterId === 'mighty_man') return weaponId === 'rifle';
  if (characterId === 'frost_wizard') return weaponId !== 'bat';
  return true;
}

export function reforgedFighterQualityTreatment(quality: ReforgedFighterQuality): Readonly<{
  authoredBodyStates: true;
  authoredAbilityCue: true;
  secondaryParticles: boolean;
}> {
  return Object.freeze({
    authoredBodyStates: true,
    authoredAbilityCue: true,
    secondaryParticles: quality === 'full',
  });
}

export function reforgedFighterAssetId(fighterId: ReforgedFighterId): string {
  return `fighter.${fighterId.replace('_', '-')}.core`;
}

export function reforgedFighterFrameName(fighterId: ReforgedFighterId, frameIndex: number): string {
  return `${reforgedFighterAssetId(fighterId)}/${String(frameIndex).padStart(3, '0')}`;
}

export function reforgedFighterLivingFrameIndices(
  state: ReforgedFighterLivingState,
  direction: Direction4,
): readonly number[] {
  const directionIndex = DIRECTIONS.indexOf(direction);
  const count = FRAME_COUNTS[state];
  const start = STATE_START[state] + directionIndex * count;
  return Object.freeze(Array.from({ length: count }, (_, index) => start + index));
}

export function reforgedFighterDeathFrameIndices(
  fighterId: ReforgedFighterId,
  direction: DeathDirection,
  deathCount: number,
): readonly number[] {
  const variantCount = DEATH_VARIANTS[fighterId];
  const normalizedDeathCount = Number.isFinite(deathCount)
    ? Math.max(1, Math.floor(deathCount))
    : 1;
  const variant = (normalizedDeathCount - 1) % variantCount;
  const directionIndex = DEATH_DIRECTIONS.indexOf(direction);
  const start = STATE_START.death + variant * 12 + directionIndex * 6;
  return Object.freeze(Array.from({ length: 6 }, (_, index) => start + index));
}

export function reforgedFighterAnimationKey(
  fighterId: ReforgedFighterId,
  state: ReforgedFighterState,
  direction: Direction4 | DeathDirection,
  deathCount = 1,
): string {
  const suffix =
    state === 'death'
      ? `-v${((Math.max(1, Math.floor(deathCount)) - 1) % DEATH_VARIANTS[fighterId]) + 1}`
      : '';
  return `reforged-${fighterId}-${direction}-${state}${suffix}`;
}

export function expectedReforgedFighterFrameCount(fighterId: ReforgedFighterId): number {
  return EXPECTED_ASSET_FRAME_COUNTS[fighterId];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

export function normalizeReforgedFighterImportMetadata(
  value: unknown,
): ReforgedFighterImportMetadata | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const atlas = value.atlas;
  const assets = value.assets;
  const frames = value.frames;
  const integrity = value.integrity;
  if (!isRecord(atlas) || !isRecord(assets) || !isRecord(frames) || !isRecord(integrity)) {
    return null;
  }
  if (
    atlas.id !== REFORGED_FIGHTER_ATLAS_ID ||
    atlas.image !== 'fighter-art-i.core.png' ||
    atlas.width !== 2048 ||
    atlas.height !== 1024 ||
    atlas.format !== 'RGBA8888' ||
    atlas.padding !== 3 ||
    atlas.extrude !== 2 ||
    atlas.premultipliedAlpha !== false ||
    !positiveInteger(atlas.width) ||
    !positiveInteger(atlas.height) ||
    !positiveInteger(atlas.padding) ||
    !positiveInteger(atlas.extrude) ||
    typeof integrity.textureSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(integrity.textureSha256)
  ) {
    return null;
  }
  if (
    Object.keys(assets).length !== REFORGED_FIGHTER_IDS.length ||
    Object.keys(frames).length !== 288
  ) {
    return null;
  }

  for (const fighterId of REFORGED_FIGHTER_IDS) {
    const assetId = reforgedFighterAssetId(fighterId);
    const asset = assets[assetId];
    if (!isRecord(asset) || asset.frameCount !== EXPECTED_ASSET_FRAME_COUNTS[fighterId])
      return null;
    for (let index = 0; index < EXPECTED_ASSET_FRAME_COUNTS[fighterId]; index += 1) {
      const frame = frames[reforgedFighterFrameName(fighterId, index)];
      if (
        !isRecord(frame) ||
        frame.assetId !== assetId ||
        frame.frameIndex !== index ||
        !Number.isInteger(frame.x) ||
        !Number.isInteger(frame.y) ||
        frame.width !== REFORGED_FIGHTER_FRAME_SIZE ||
        frame.height !== REFORGED_FIGHTER_FRAME_SIZE ||
        frame.rotated !== false ||
        frame.trimmed !== false ||
        (frame.x as number) < 0 ||
        (frame.y as number) < 0 ||
        (frame.x as number) + REFORGED_FIGHTER_FRAME_SIZE > (atlas.width as number) ||
        (frame.y as number) + REFORGED_FIGHTER_FRAME_SIZE > (atlas.height as number)
      ) {
        return null;
      }
    }
  }
  return value as unknown as ReforgedFighterImportMetadata;
}
