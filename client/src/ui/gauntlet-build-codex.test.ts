import { describe, expect, it } from 'vitest';
import type { GauntletBoonId } from '@shared/config/game.js';
import type { MatchResult } from '@shared/types/game.js';
import {
  GAUNTLET_BUILD_DEFS,
  GAUNTLET_BUILD_IDS,
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
    expect(normalizeGauntletBuildCodex(null)).toEqual({ discovered: [] });
    expect(normalizeGauntletBuildCodex('{nope')).toEqual({ discovered: [] });
    expect(normalizeGauntletBuildCodex('null')).toEqual({ discovered: [] });
    expect(normalizeGauntletBuildCodex(JSON.stringify({ discovered: 'all' }))).toEqual({
      discovered: [],
    });
    expect(
      normalizeGauntletBuildCodex(
        JSON.stringify({
          discovered: ['quick_charge+spawn_rush', 'bogus', 'quick_charge+spawn_rush'],
        }),
      ),
    ).toEqual({ discovered: ['quick_charge+spawn_rush'] });
  });

  it('discovers a build only when its two-boon run is fully cleared', () => {
    const empty: GauntletBuildCodex = { discovered: [] };
    expect(
      gauntletBuildCodexUpdate(result('advanced', ['quick_charge', 'spawn_rush']), empty),
    ).toMatchObject({ isNewDiscovery: false, codex: empty });
    expect(
      gauntletBuildCodexUpdate(result('failed', ['quick_charge', 'spawn_rush']), empty),
    ).toMatchObject({ isNewDiscovery: false, codex: empty });

    const clear = gauntletBuildCodexUpdate(
      result('cleared', ['spawn_rush', 'quick_charge']),
      empty,
    );
    expect(clear).toMatchObject({
      isNewDiscovery: true,
      build: { id: 'quick_charge+spawn_rush', name: 'REDLINE' },
      codex: { discovered: ['quick_charge+spawn_rush'] },
    });
    expect(
      gauntletBuildCodexUpdate(result('cleared', ['quick_charge', 'spawn_rush']), clear.codex),
    ).toMatchObject({ isNewDiscovery: false, codex: clear.codex });
  });

  it('renders compact lobby, known-build, and discovery labels', () => {
    const codex = { discovered: ['quick_charge+spawn_rush'] } satisfies GauntletBuildCodex;
    const build = GAUNTLET_BUILD_DEFS['quick_charge+spawn_rush'];
    expect(gauntletBuildCodexLabel({ discovered: [] })).toBe('BUILD CODEX: 0/6');
    expect(gauntletBuildCodexLabel(codex, build)).toBe('BUILD: REDLINE  //  CODEX 1/6');
    expect(gauntletBuildCodexLabel(codex, build, true)).toBe('NEW BUILD: REDLINE  //  CODEX 1/6');
  });
});
