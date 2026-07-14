import { GAUNTLET_BOON_IDS, type GauntletBoonId } from '@shared/config/game.js';
import type { MatchResult } from '@shared/types/game.js';

export const GAUNTLET_BUILD_CODEX_STORAGE_KEY = 'mmr_gauntlet_build_codex';

export const GAUNTLET_BUILD_IDS = [
  'scrap_plating+kill_salvage',
  'scrap_plating+quick_charge',
  'scrap_plating+spawn_rush',
  'kill_salvage+quick_charge',
  'kill_salvage+spawn_rush',
  'quick_charge+spawn_rush',
] as const;
export type GauntletBuildId = (typeof GAUNTLET_BUILD_IDS)[number];

export interface GauntletBuildDefinition {
  id: GauntletBuildId;
  name: string;
  boonIds: readonly [GauntletBoonId, GauntletBoonId];
}

export interface GauntletBuildCodex {
  discovered: GauntletBuildId[];
}

export const GAUNTLET_BUILD_DEFS: Readonly<Record<GauntletBuildId, GauntletBuildDefinition>> =
  Object.freeze({
    'scrap_plating+kill_salvage': {
      id: 'scrap_plating+kill_salvage',
      name: 'IRON SCAVENGER',
      boonIds: ['scrap_plating', 'kill_salvage'],
    },
    'scrap_plating+quick_charge': {
      id: 'scrap_plating+quick_charge',
      name: 'ARC PLATING',
      boonIds: ['scrap_plating', 'quick_charge'],
    },
    'scrap_plating+spawn_rush': {
      id: 'scrap_plating+spawn_rush',
      name: 'RAM RAID',
      boonIds: ['scrap_plating', 'spawn_rush'],
    },
    'kill_salvage+quick_charge': {
      id: 'kill_salvage+quick_charge',
      name: 'COMBAT ENGINE',
      boonIds: ['kill_salvage', 'quick_charge'],
    },
    'kill_salvage+spawn_rush': {
      id: 'kill_salvage+spawn_rush',
      name: 'BLOODHOUND',
      boonIds: ['kill_salvage', 'spawn_rush'],
    },
    'quick_charge+spawn_rush': {
      id: 'quick_charge+spawn_rush',
      name: 'REDLINE',
      boonIds: ['quick_charge', 'spawn_rush'],
    },
  });

const BOON_ORDER = new Map<GauntletBoonId, number>(
  GAUNTLET_BOON_IDS.map((boonId, index) => [boonId, index]),
);

function safeBuildIds(values: unknown): GauntletBuildId[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<GauntletBuildId>();
  for (const value of values) {
    if (
      typeof value === 'string' &&
      (GAUNTLET_BUILD_IDS as readonly string[]).includes(value) &&
      !seen.has(value as GauntletBuildId)
    ) {
      seen.add(value as GauntletBuildId);
    }
  }
  return [...seen];
}

/** Resolve a complete two-boon loadout to its canonical, order-independent build. */
export function gauntletBuildForBoons(
  boonIds: readonly GauntletBoonId[] | undefined,
): GauntletBuildDefinition | null {
  const unique = [...new Set(boonIds ?? [])].filter((boonId) =>
    (GAUNTLET_BOON_IDS as readonly string[]).includes(boonId),
  );
  if (unique.length !== 2) return null;
  unique.sort((a, b) => (BOON_ORDER.get(a) ?? 0) - (BOON_ORDER.get(b) ?? 0));
  const id = unique.join('+') as GauntletBuildId;
  return GAUNTLET_BUILD_DEFS[id] ?? null;
}

export function normalizeGauntletBuildCodex(value: string | null): GauntletBuildCodex {
  if (!value) return { discovered: [] };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return { discovered: [] };
    return { discovered: safeBuildIds((parsed as { discovered?: unknown }).discovered) };
  } catch {
    return { discovered: [] };
  }
}

export function gauntletBuildCodexUpdate(
  result: MatchResult | null,
  previous: GauntletBuildCodex,
): {
  codex: GauntletBuildCodex;
  build: GauntletBuildDefinition | null;
  isNewDiscovery: boolean;
} {
  const discovered = safeBuildIds(previous.discovered);
  const build = gauntletBuildForBoons(result?.gauntlet?.boonIds);
  const isClear = result?.gauntlet?.outcome === 'cleared';
  const isNewDiscovery = isClear && build !== null && !discovered.includes(build.id);
  return {
    codex: {
      discovered: isNewDiscovery && build ? [...discovered, build.id] : discovered,
    },
    build,
    isNewDiscovery,
  };
}

export function gauntletBuildCodexLabel(
  codex: GauntletBuildCodex,
  build: GauntletBuildDefinition | null = null,
  isNewDiscovery = false,
): string {
  const count = safeBuildIds(codex.discovered).length;
  const progress = `CODEX ${count}/${GAUNTLET_BUILD_IDS.length}`;
  if (isNewDiscovery && build) return `NEW BUILD: ${build.name}  //  ${progress}`;
  if (build) return `BUILD: ${build.name}  //  ${progress}`;
  return `BUILD CODEX: ${count}/${GAUNTLET_BUILD_IDS.length}`;
}
