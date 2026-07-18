export const REFORGED_ENVIRONMENT_ATLAS_ID = 'biome-environment-art.core';
import { TileType, type MapDecoration } from '@shared/types/map.js';

export const REFORGED_ENVIRONMENT_TEXTURE_KEY = 'reforged-biome-environment-art';
export const REFORGED_ENVIRONMENT_IMPORT_CACHE_KEY = 'reforged-biome-environment-art-import';
export const REFORGED_ENVIRONMENT_ATLAS_IMAGE =
  'assets/reforged/biome-environment-art/biome-environment-art.core.png';
export const REFORGED_ENVIRONMENT_ATLAS_IMPORT =
  'assets/reforged/biome-environment-art/biome-environment-art.core.json';
export const REFORGED_ENVIRONMENT_FRAME_SIZE = 64;

export const REFORGED_BIOME_FAMILIES = [
  'wasteland',
  'overgrown',
  'industrial',
  'irradiated',
] as const;
export type ReforgedBiomeFamily = (typeof REFORGED_BIOME_FAMILIES)[number];
export type ReforgedEnvironmentQuality = 'full' | 'reduced';

export const REFORGED_ENVIRONMENT_FRAME_ROLES = Object.freeze({
  'ground-a': 0,
  'ground-b': 1,
  'ground-c': 2,
  'transition-horizontal': 3,
  'transition-vertical': 4,
  'transition-corner': 5,
  'wall-intact': 6,
  'wall-damaged': 7,
  'low-cover-intact': 8,
  'low-cover-damaged': 9,
  'prop-a-intact': 10,
  'prop-a-damaged': 11,
  'prop-b-intact': 12,
  'prop-b-damaged': 13,
  'landmark-intact': 14,
  'landmark-damaged': 15,
  'shadow-wall': 16,
  'shadow-low-cover': 17,
  'shadow-prop': 18,
  'navigation-anchor': 19,
} as const);
export type ReforgedEnvironmentFrameRole = keyof typeof REFORGED_ENVIRONMENT_FRAME_ROLES;

export const REFORGED_BIOME_TRANSITIONS: Readonly<
  Record<ReforgedBiomeFamily, ReforgedBiomeFamily>
> = Object.freeze({
  wasteland: 'overgrown',
  overgrown: 'industrial',
  industrial: 'irradiated',
  irradiated: 'wasteland',
});

export interface ReforgedEnvironmentImportFrame {
  readonly assetId: string;
  readonly frameIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: 64;
  readonly height: 64;
  readonly rotated: false;
  readonly trimmed: false;
}

export interface ReforgedEnvironmentImportMetadata {
  readonly schemaVersion: 1;
  readonly atlas: {
    readonly id: typeof REFORGED_ENVIRONMENT_ATLAS_ID;
    readonly image: 'biome-environment-art.core.png';
    readonly width: 1024;
    readonly height: 512;
    readonly format: 'RGBA8888';
    readonly padding: 3;
    readonly extrude: 2;
    readonly premultipliedAlpha: false;
  };
  readonly assets: Readonly<Record<string, { readonly frameCount: number }>>;
  readonly frames: Readonly<Record<string, ReforgedEnvironmentImportFrame>>;
  readonly integrity: { readonly textureSha256: string };
}

export function reforgedEnvironmentAssetId(family: ReforgedBiomeFamily): string {
  return `environment.${family}.core`;
}

export function reforgedEnvironmentFrameName(assetId: string, frameIndex: number): string {
  return `${assetId}/${String(frameIndex).padStart(3, '0')}`;
}

export function reforgedEnvironmentFrame(
  family: ReforgedBiomeFamily,
  role: ReforgedEnvironmentFrameRole,
): string {
  return reforgedEnvironmentFrameName(
    reforgedEnvironmentAssetId(family),
    REFORGED_ENVIRONMENT_FRAME_ROLES[role],
  );
}

export function shouldPresentReforgedEnvironmentKit(
  owner: 'verification-preview' | 'live-map',
  modernArtEnabled: boolean,
  atlasAvailable: boolean,
): boolean {
  return (
    (owner === 'verification-preview' || owner === 'live-map') && modernArtEnabled && atlasAvailable
  );
}

const THEME_FAMILIES: Readonly<Record<string, ReforgedBiomeFamily>> = Object.freeze({
  wasteland: 'wasteland',
  suburb: 'overgrown',
  scrapyard: 'industrial',
  overpass: 'industrial',
  checkpoint: 'industrial',
  refinery: 'industrial',
  irradiated: 'irradiated',
});

/** Presentation-only projection; unknown/absent current themes remain wasteland. */
export function reforgedBiomeFamilyForTheme(themeId: string | undefined): ReforgedBiomeFamily {
  return THEME_FAMILIES[themeId ?? 'wasteland'] ?? 'wasteland';
}

export function reforgedEnvironmentGroundRole(
  row: number,
  col: number,
): ReforgedEnvironmentFrameRole {
  const index = (((row * 19349663) ^ (col * 73856093)) >>> 0) % 3;
  return (['ground-a', 'ground-b', 'ground-c'] as const)[index];
}

export function reforgedEnvironmentTileRole(
  tileType: TileType,
  row: number,
  col: number,
): ReforgedEnvironmentFrameRole {
  if (tileType === TileType.WALL) return 'wall-intact';
  if (tileType === TileType.COVER_LOW) return 'low-cover-intact';
  return reforgedEnvironmentGroundRole(row, col);
}

/**
 * Existing animated gates and caches have no compatible Batch 31 state grid,
 * so they explicitly retain their registered legacy presentation. Other
 * decoration roles project from authored map metadata without changing it.
 */
export function reforgedEnvironmentDecorationRole(
  decoration: MapDecoration,
): ReforgedEnvironmentFrameRole | null {
  if (decoration.interaction === 'shootable_gate' || decoration.interaction === 'scavenger_cache') {
    return null;
  }
  if (decoration.hazard === 'explosive_barrel') return 'prop-b-intact';
  if (decoration.texture.includes('car') || decoration.texture.includes('container')) {
    return 'landmark-intact';
  }
  return 'prop-a-intact';
}

export function reforgedEnvironmentDamagedRole(
  role: ReforgedEnvironmentFrameRole,
): ReforgedEnvironmentFrameRole | null {
  const pairs: Partial<Record<ReforgedEnvironmentFrameRole, ReforgedEnvironmentFrameRole>> = {
    'wall-intact': 'wall-damaged',
    'low-cover-intact': 'low-cover-damaged',
    'prop-a-intact': 'prop-a-damaged',
    'prop-b-intact': 'prop-b-damaged',
    'landmark-intact': 'landmark-damaged',
  };
  return pairs[role] ?? null;
}

export function reforgedEnvironmentQualityTreatment(quality: ReforgedEnvironmentQuality) {
  const full = quality === 'full';
  return Object.freeze({
    groundHierarchy: true,
    collisionSilhouette: true,
    damagedPairing: true,
    landmarkNegativeSpace: true,
    transitionEdges: true,
    shadowDirection: true,
    navigationAnchor: true,
    secondaryWear: full,
    decorativeFlecks: full,
    bloom: false,
    additiveAtmosphere: false,
  });
}

const EXPECTED_ASSETS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    REFORGED_BIOME_FAMILIES.map((family) => [reforgedEnvironmentAssetId(family), 20]),
  ),
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function normalizeReforgedEnvironmentImportMetadata(
  value: unknown,
): ReforgedEnvironmentImportMetadata | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const { atlas, assets, frames, integrity } = value;
  if (!isRecord(atlas) || !isRecord(assets) || !isRecord(frames) || !isRecord(integrity))
    return null;
  if (
    atlas.id !== REFORGED_ENVIRONMENT_ATLAS_ID ||
    atlas.image !== 'biome-environment-art.core.png' ||
    atlas.width !== 1024 ||
    atlas.height !== 512 ||
    atlas.format !== 'RGBA8888' ||
    atlas.padding !== 3 ||
    atlas.extrude !== 2 ||
    atlas.premultipliedAlpha !== false ||
    typeof integrity.textureSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(integrity.textureSha256) ||
    Object.keys(assets).length !== 4 ||
    Object.keys(frames).length !== 80
  )
    return null;
  for (const [assetId, frameCount] of Object.entries(EXPECTED_ASSETS)) {
    const asset = assets[assetId];
    if (!isRecord(asset) || asset.frameCount !== frameCount) return null;
    for (let index = 0; index < frameCount; index += 1) {
      const frame = frames[reforgedEnvironmentFrameName(assetId, index)];
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
        (frame.y as number) + 64 > 512
      )
        return null;
    }
  }
  return value as unknown as ReforgedEnvironmentImportMetadata;
}
