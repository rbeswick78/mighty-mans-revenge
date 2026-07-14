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
  recipe: string;
  description: string;
}

export interface GauntletBuildCodex {
  discovered: GauntletBuildId[];
  bestScores: Partial<Record<GauntletBuildId, number>>;
}

export interface GauntletBuildCodexEntry extends GauntletBuildDefinition {
  discovered: boolean;
  bestScore: number | null;
}

export const GAUNTLET_BUILD_DEFS: Readonly<Record<GauntletBuildId, GauntletBuildDefinition>> =
  Object.freeze({
    'scrap_plating+kill_salvage': {
      id: 'scrap_plating+kill_salvage',
      name: 'IRON SCAVENGER',
      boonIds: ['scrap_plating', 'kill_salvage'],
      recipe: 'SCRAP PLATING + KILL SALVAGE',
      description: 'PLATE UP. SALVAGE EVERY KILL.',
    },
    'scrap_plating+quick_charge': {
      id: 'scrap_plating+quick_charge',
      name: 'ARC PLATING',
      boonIds: ['scrap_plating', 'quick_charge'],
      recipe: 'SCRAP PLATING + QUICK CHARGE',
      description: 'ARMORED ABILITY PRESSURE.',
    },
    'scrap_plating+spawn_rush': {
      id: 'scrap_plating+spawn_rush',
      name: 'RAM RAID',
      boonIds: ['scrap_plating', 'spawn_rush'],
      recipe: 'SCRAP PLATING + SPAWN RUSH',
      description: 'ARMORED OPENING ASSAULT.',
    },
    'kill_salvage+quick_charge': {
      id: 'kill_salvage+quick_charge',
      name: 'COMBAT ENGINE',
      boonIds: ['kill_salvage', 'quick_charge'],
      recipe: 'KILL SALVAGE + QUICK CHARGE',
      description: 'KILLS FUEL HEALTH AND POWERS.',
    },
    'kill_salvage+spawn_rush': {
      id: 'kill_salvage+spawn_rush',
      name: 'BLOODHOUND',
      boonIds: ['kill_salvage', 'spawn_rush'],
      recipe: 'KILL SALVAGE + SPAWN RUSH',
      description: 'CHASE FAST. FEED ON KILLS.',
    },
    'quick_charge+spawn_rush': {
      id: 'quick_charge+spawn_rush',
      name: 'REDLINE',
      boonIds: ['quick_charge', 'spawn_rush'],
      recipe: 'QUICK CHARGE + SPAWN RUSH',
      description: 'FULL SPEED. FAST POWERS.',
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

function safeBestScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function safeBestScores(
  values: unknown,
  discovered: readonly GauntletBuildId[],
): Partial<Record<GauntletBuildId, number>> {
  if (!values || typeof values !== 'object') return {};
  const source = values as Record<string, unknown>;
  const scores: Partial<Record<GauntletBuildId, number>> = {};
  for (const id of discovered) {
    const score = safeBestScore(source[id]);
    if (score !== null) scores[id] = score;
  }
  return scores;
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
  if (!value) return { discovered: [], bestScores: {} };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return { discovered: [], bestScores: {} };
    const source = parsed as { discovered?: unknown; bestScores?: unknown };
    const discovered = safeBuildIds(source.discovered);
    return {
      discovered,
      bestScores: safeBestScores(source.bestScores, discovered),
    };
  } catch {
    return { discovered: [], bestScores: {} };
  }
}

export function gauntletBuildCodexUpdate(
  result: MatchResult | null,
  previous: GauntletBuildCodex,
): {
  codex: GauntletBuildCodex;
  build: GauntletBuildDefinition | null;
  isNewDiscovery: boolean;
  isNewBest: boolean;
} {
  const discovered = safeBuildIds(previous.discovered);
  const bestScores = safeBestScores(previous.bestScores, discovered);
  const build = gauntletBuildForBoons(result?.gauntlet?.boonIds);
  const isClear = result?.gauntlet?.outcome === 'cleared';
  const isNewDiscovery = isClear && build !== null && !discovered.includes(build.id);
  const score = safeBestScore(result?.gauntlet?.runScore);
  const previousBest = build ? bestScores[build.id] : undefined;
  const isNewBest =
    isClear &&
    build !== null &&
    score !== null &&
    (previousBest === undefined || score > previousBest);
  const nextBestScores =
    isNewBest && build && score !== null ? { ...bestScores, [build.id]: score } : bestScores;
  return {
    codex: {
      discovered: isNewDiscovery && build ? [...discovered, build.id] : discovered,
      bestScores: nextBestScores,
    },
    build,
    isNewDiscovery,
    isNewBest,
  };
}

export function gauntletBuildCodexEntries(codex: GauntletBuildCodex): GauntletBuildCodexEntry[] {
  const discovered = safeBuildIds(codex.discovered);
  const bestScores = safeBestScores(codex.bestScores, discovered);
  return GAUNTLET_BUILD_IDS.map((id) => ({
    ...GAUNTLET_BUILD_DEFS[id],
    discovered: discovered.includes(id),
    bestScore: bestScores[id] ?? null,
  }));
}

export function gauntletBuildCodexCombinedBest(codex: GauntletBuildCodex): number {
  return gauntletBuildCodexEntries(codex).reduce(
    (total, entry) => total + (entry.bestScore ?? 0),
    0,
  );
}

export function gauntletBuildCodexLabel(
  codex: GauntletBuildCodex,
  build: GauntletBuildDefinition | null = null,
  state: { isNewDiscovery?: boolean; isNewBest?: boolean } = {},
): string {
  const count = safeBuildIds(codex.discovered).length;
  const progress = `CODEX ${count}/${GAUNTLET_BUILD_IDS.length}`;
  const bestScore = build ? safeBestScore(codex.bestScores[build.id]) : null;
  const best = bestScore === null ? 'BEST --' : `BEST ${bestScore.toLocaleString('en-US')}`;
  if (state.isNewDiscovery && build) {
    return `NEW BUILD: ${build.name}  //  ${best}  //  ${progress}`;
  }
  if (state.isNewBest && build) {
    return `NEW BUILD BEST: ${build.name}  //  ${best}  //  ${progress}`;
  }
  if (build) return `BUILD: ${build.name}  //  ${best}  //  ${progress}`;
  return `BUILD CODEX: ${count}/${GAUNTLET_BUILD_IDS.length}`;
}
