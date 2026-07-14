import { describe, expect, it } from 'vitest';
import type { GauntletBoonId } from '@shared/config/game.js';
import type { MatchResult } from '@shared/types/game.js';
import {
  GAUNTLET_BUILD_DEFS,
  GAUNTLET_BUILD_IDS,
  gauntletBuildCodexCombinedBest,
  gauntletBuildCodexEntries,
  gauntletBuildCodexLabel,
  gauntletBuildCodexUpdate,
  gauntletBuildForBoons,
  normalizeGauntletBuildCodex,
  type GauntletBuildCodex,
} from './gauntlet-build-codex.js';

function result(
  outcome: 'advanced' | 'failed' | 'cleared',
  boonIds: GauntletBoonId[],
): MatchResult {
  return {
    matchId: 'build-run',
    winnerId: 'human',
    playerStats: new Map(),
    duration: 73,
    gameMode: 'deathmatch' as MatchResult['gameMode'],
    awards: [],
    rivalry: null,
    rivalrySet: null,
    isPractice: true,
    nextMapName: 'Scrapyard',
    nextGameMode: 'deathmatch' as MatchResult['gameMode'],
    wentToOvertime: false,
    gauntlet: {
      stage: 3,
      totalStages: 3,
      difficulty: 'warlord',
      runScore: 6000,
      outcome,
      stageScore: outcome === 'cleared' ? 2000 : 0,
      contractBonus: 0,
      regulationBonus: 0,
      flawlessBonus: 0,
      paceBonus: 0,
      nextStage: 1,
      nextDifficulty: 'rookie',
      boonIds,
    },
  };
}

describe('Gauntlet Build Codex', () => {
  it('names all six order-independent two-boon builds', () => {
    expect(GAUNTLET_BUILD_IDS).toHaveLength(6);
    for (const id of GAUNTLET_BUILD_IDS) {
      const build = GAUNTLET_BUILD_DEFS[id];
      expect(gauntletBuildForBoons(build.boonIds)).toEqual(build);
      expect(gauntletBuildForBoons([...build.boonIds].reverse())).toEqual(build);
    }
    expect(gauntletBuildForBoons(['quick_charge'])).toBeNull();
    expect(gauntletBuildForBoons(['quick_charge', 'quick_charge'])).toBeNull();
  });

  it('normalizes malformed, unknown, and duplicate browser storage', () => {
    const empty = { discovered: [], bestScores: {} };
    expect(normalizeGauntletBuildCodex(null)).toEqual(empty);
    expect(normalizeGauntletBuildCodex('{nope')).toEqual(empty);
    expect(normalizeGauntletBuildCodex('null')).toEqual(empty);
    expect(normalizeGauntletBuildCodex(JSON.stringify({ discovered: 'all' }))).toEqual({
      discovered: [],
      bestScores: {},
    });
    expect(
      normalizeGauntletBuildCodex(
        JSON.stringify({
          discovered: ['quick_charge+spawn_rush', 'bogus', 'quick_charge+spawn_rush'],
          bestScores: {
            'quick_charge+spawn_rush': 6123.9,
            'scrap_plating+quick_charge': 9999,
            bogus: 1234,
          },
        }),
      ),
    ).toEqual({
      discovered: ['quick_charge+spawn_rush'],
      bestScores: { 'quick_charge+spawn_rush': 6123 },
    });
  });

  it('discovers and records a build best only when its two-boon run is fully cleared', () => {
    const empty: GauntletBuildCodex = { discovered: [], bestScores: {} };
    expect(
      gauntletBuildCodexUpdate(result('advanced', ['quick_charge', 'spawn_rush']), empty),
    ).toMatchObject({ isNewDiscovery: false, isNewBest: false, codex: empty });
    expect(
      gauntletBuildCodexUpdate(result('failed', ['quick_charge', 'spawn_rush']), empty),
    ).toMatchObject({ isNewDiscovery: false, isNewBest: false, codex: empty });

    const clear = gauntletBuildCodexUpdate(
      result('cleared', ['spawn_rush', 'quick_charge']),
      empty,
    );
    expect(clear).toMatchObject({
      isNewDiscovery: true,
      isNewBest: true,
      build: { id: 'quick_charge+spawn_rush', name: 'REDLINE' },
      codex: {
        discovered: ['quick_charge+spawn_rush'],
        bestScores: { 'quick_charge+spawn_rush': 6000 },
      },
    });
    expect(
      gauntletBuildCodexUpdate(result('cleared', ['quick_charge', 'spawn_rush']), clear.codex),
    ).toMatchObject({ isNewDiscovery: false, isNewBest: false, codex: clear.codex });
  });

  it('improves each build best independently and preserves old discoveries', () => {
    const previous: GauntletBuildCodex = {
      discovered: ['quick_charge+spawn_rush', 'scrap_plating+quick_charge'],
      bestScores: { 'quick_charge+spawn_rush': 5500 },
    };
    const update = gauntletBuildCodexUpdate(
      result('cleared', ['quick_charge', 'spawn_rush']),
      previous,
    );
    expect(update).toMatchObject({
      isNewDiscovery: false,
      isNewBest: true,
      codex: {
        discovered: previous.discovered,
        bestScores: { 'quick_charge+spawn_rush': 6000 },
      },
    });
  });

  it('builds six trophy entries and a combined-best total', () => {
    const codex: GauntletBuildCodex = {
      discovered: ['quick_charge+spawn_rush', 'scrap_plating+kill_salvage'],
      bestScores: {
        'quick_charge+spawn_rush': 6200,
        'scrap_plating+kill_salvage': 5800,
      },
    };
    const entries = gauntletBuildCodexEntries(codex);
    expect(entries).toHaveLength(6);
    expect(entries.find((entry) => entry.id === 'quick_charge+spawn_rush')).toMatchObject({
      name: 'REDLINE',
      recipe: 'QUICK CHARGE + SPAWN RUSH',
      discovered: true,
      bestScore: 6200,
    });
    expect(entries.find((entry) => entry.id === 'scrap_plating+quick_charge')).toMatchObject({
      discovered: false,
      bestScore: null,
    });
    expect(gauntletBuildCodexCombinedBest(codex)).toBe(12000);
  });

  it('renders compact lobby, known-build, and discovery labels', () => {
    const codex = {
      discovered: ['quick_charge+spawn_rush'],
      bestScores: { 'quick_charge+spawn_rush': 6000 },
    } satisfies GauntletBuildCodex;
    const build = GAUNTLET_BUILD_DEFS['quick_charge+spawn_rush'];
    expect(gauntletBuildCodexLabel({ discovered: [], bestScores: {} })).toBe('BUILD CODEX: 0/6');
    expect(gauntletBuildCodexLabel(codex, build)).toBe(
      'BUILD: REDLINE  //  BEST 6,000  //  CODEX 1/6',
    );
    expect(gauntletBuildCodexLabel(codex, build, { isNewDiscovery: true })).toBe(
      'NEW BUILD: REDLINE  //  BEST 6,000  //  CODEX 1/6',
    );
    expect(gauntletBuildCodexLabel(codex, build, { isNewBest: true })).toBe(
      'NEW BUILD BEST: REDLINE  //  BEST 6,000  //  CODEX 1/6',
    );
  });
});
