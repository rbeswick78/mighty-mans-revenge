import type { WeaponId } from '@shared/config/game.js';
import type { Direction4 } from '@shared/types/character.js';
import { PickupType } from '@shared/types/pickup.js';
import type { GunOverlayState } from './weapon-overlay-key.js';

export const REFORGED_WEAPON_PICKUP_ATLAS_ID = 'weapon-pickup-art.core';
export const REFORGED_WEAPON_PICKUP_TEXTURE_KEY = 'reforged-weapon-pickup-art';
export const REFORGED_WEAPON_PICKUP_IMPORT_CACHE_KEY = 'reforged-weapon-pickup-art-import';
export const REFORGED_WEAPON_PICKUP_ATLAS_IMAGE =
  'assets/reforged/weapon-pickup-art/weapon-pickup-art.core.png';
export const REFORGED_WEAPON_PICKUP_ATLAS_IMPORT =
  'assets/reforged/weapon-pickup-art/weapon-pickup-art.core.json';
export const REFORGED_WEAPON_PICKUP_FRAME_SIZE = 64;

export const REFORGED_GUN_ART_IDS = [
  'rifle',
  'pistol',
  'shotgun',
  'smg',
  'sniper-rifle',
  'launcher',
] as const;
export type ReforgedGunArtId = (typeof REFORGED_GUN_ART_IDS)[number];
export const REFORGED_FUTURE_GUN_ART_IDS = [] as const;
export type ReforgedRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythical';
export type ReforgedWeaponPickupQuality = 'full' | 'reduced';

const DIRECTIONS: readonly Direction4[] = ['down', 'up', 'side', 'side-left'];
const RARITIES: readonly ReforgedRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythical',
];
const SUSTAIN_FRAMES: Readonly<Partial<Record<PickupType, number>>> = Object.freeze({
  [PickupType.GUN_AMMO]: 0,
  [PickupType.GRENADE]: 1,
  [PickupType.BANDAGE]: 2,
  [PickupType.ARMOR]: 3,
  [PickupType.OVERCHARGE]: 4,
});

export interface ReforgedWeaponPickupImportFrame {
  readonly assetId: string;
  readonly frameIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: 64;
  readonly height: 64;
  readonly rotated: false;
  readonly trimmed: false;
}

export interface ReforgedWeaponPickupImportMetadata {
  readonly schemaVersion: 1;
  readonly atlas: {
    readonly id: typeof REFORGED_WEAPON_PICKUP_ATLAS_ID;
    readonly image: 'weapon-pickup-art.core.png';
    readonly width: 1024;
    readonly height: 1024;
    readonly format: 'RGBA8888';
    readonly padding: 3;
    readonly extrude: 2;
    readonly premultipliedAlpha: false;
  };
  readonly assets: Readonly<Record<string, { readonly frameCount: number }>>;
  readonly frames: Readonly<Record<string, ReforgedWeaponPickupImportFrame>>;
  readonly integrity: { readonly textureSha256: string };
}

export function reforgedGunAssetId(id: ReforgedGunArtId): string {
  return `weapon.${id}.core`;
}

export function reforgedWeaponPickupFrameName(assetId: string, frameIndex: number): string {
  return `${assetId}/${String(frameIndex).padStart(3, '0')}`;
}

export function liveReforgedGunArtId(weaponId: WeaponId): ReforgedGunArtId | null {
  if (weaponId === 'sniper_rifle') return 'sniper-rifle';
  if (
    weaponId === 'rifle' ||
    weaponId === 'pistol' ||
    weaponId === 'shotgun' ||
    weaponId === 'smg' ||
    weaponId === 'launcher'
  ) {
    return weaponId;
  }
  return null;
}

export function shouldUseReforgedGunArt(
  weaponId: WeaponId,
  modernArtEnabled: boolean,
  atlasAvailable: boolean,
): boolean {
  return modernArtEnabled && atlasAvailable && liveReforgedGunArtId(weaponId) !== null;
}

export function reforgedGunFrameIndices(
  state: GunOverlayState | 'dry',
  direction: Direction4,
): readonly number[] {
  const directionIndex = DIRECTIONS.indexOf(direction);
  if (state === 'dry') return Object.freeze([16 + directionIndex]);
  if (state === 'racking') return Object.freeze([directionIndex * 2, directionIndex * 2 + 1]);
  const start = (state === 'shoot' ? 8 : 0) + directionIndex * 2;
  return Object.freeze([start, start + 1]);
}

export function reforgedGunAnimationKey(
  id: ReforgedGunArtId,
  state: GunOverlayState | 'dry',
  direction: Direction4,
): string {
  return `reforged-weapon-${id}-${direction}-${state}`;
}

export function reforgedGunPresentationFrame(
  id: ReforgedGunArtId,
  presentation: 'ground' | 'hud' | 'ammo' | 'container',
): string {
  const index = { ground: 20, hud: 21, ammo: 22, container: 23 }[presentation];
  return reforgedWeaponPickupFrameName(reforgedGunAssetId(id), index);
}

export function reforgedPickupFrame(type: PickupType): string | null {
  if (type === PickupType.WEAPON_PISTOL) return reforgedGunPresentationFrame('pistol', 'ground');
  if (type === PickupType.WEAPON_SHOTGUN) return reforgedGunPresentationFrame('shotgun', 'ground');
  const frame = SUSTAIN_FRAMES[type];
  return frame === undefined ? null : reforgedWeaponPickupFrameName('pickup.sustain.core', frame);
}

export function reforgedSupplyFrame(
  presentation: 'supply' | 'container' | 'damaged-container',
): string {
  return reforgedWeaponPickupFrameName(
    'pickup.sustain.core',
    { supply: 5, container: 6, 'damaged-container': 7 }[presentation],
  );
}

export function reforgedRarityFrame(rarity: ReforgedRarity): string {
  return reforgedWeaponPickupFrameName('rarity.presentation.core', RARITIES.indexOf(rarity));
}

export function reforgedWeaponPickupQualityTreatment(
  quality: ReforgedWeaponPickupQuality,
): Readonly<{
  badge: true;
  rim: true;
  mainSilhouette: true;
  pickupIdentity: true;
  timing: true;
  boundedFacets: boolean;
  softLight: boolean;
  secondaryMotion: boolean;
  bloom: false;
  extraParticles: false;
}> {
  const full = quality === 'full';
  return Object.freeze({
    badge: true,
    rim: true,
    mainSilhouette: true,
    pickupIdentity: true,
    timing: true,
    boundedFacets: full,
    softLight: full,
    secondaryMotion: full,
    bloom: false,
    extraParticles: false,
  });
}

const EXPECTED_ASSETS: Readonly<Record<string, number>> = Object.freeze({
  'pickup.sustain.core': 8,
  'rarity.presentation.core': 6,
  'weapon.launcher.core': 24,
  'weapon.pistol.core': 24,
  'weapon.rifle.core': 24,
  'weapon.shotgun.core': 24,
  'weapon.smg.core': 24,
  'weapon.sniper-rifle.core': 24,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function normalizeReforgedWeaponPickupImportMetadata(
  value: unknown,
): ReforgedWeaponPickupImportMetadata | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const { atlas, assets, frames, integrity } = value;
  if (!isRecord(atlas) || !isRecord(assets) || !isRecord(frames) || !isRecord(integrity)) {
    return null;
  }
  if (
    atlas.id !== REFORGED_WEAPON_PICKUP_ATLAS_ID ||
    atlas.image !== 'weapon-pickup-art.core.png' ||
    atlas.width !== 1024 ||
    atlas.height !== 1024 ||
    atlas.format !== 'RGBA8888' ||
    atlas.padding !== 3 ||
    atlas.extrude !== 2 ||
    atlas.premultipliedAlpha !== false ||
    typeof integrity.textureSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(integrity.textureSha256) ||
    Object.keys(assets).length !== 8 ||
    Object.keys(frames).length !== 158
  ) {
    return null;
  }
  for (const [assetId, frameCount] of Object.entries(EXPECTED_ASSETS)) {
    const asset = assets[assetId];
    if (!isRecord(asset) || asset.frameCount !== frameCount) return null;
    for (let index = 0; index < frameCount; index += 1) {
      const frame = frames[reforgedWeaponPickupFrameName(assetId, index)];
      if (
        !isRecord(frame) ||
        frame.assetId !== assetId ||
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
        (frame.y as number) + 64 > 1024
      ) {
        return null;
      }
    }
  }
  return value as unknown as ReforgedWeaponPickupImportMetadata;
}
