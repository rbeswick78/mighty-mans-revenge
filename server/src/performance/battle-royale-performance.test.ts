import { describe, expect, it } from 'vitest';

import {
  BATTLE_ROYALE_PERFORMANCE_BUDGETS,
  assertBattleRoyalePerformanceBudget,
  performanceDistribution,
  snapshotTraffic,
} from './battle-royale-performance.js';

describe('Battle Royale performance contract', () => {
  it('derives deterministic distributions and eight-recipient traffic', () => {
    expect(performanceDistribution([4, 1, 3, 2, 5])).toEqual({
      samples: 5,
      meanMs: 3,
      p95Ms: 5,
      p99Ms: 5,
      maxMs: 5,
    });
    expect(snapshotTraffic(10_000)).toEqual({
      perClientBytesPerSecond: 200_000,
      aggregateBytesPerSecond: 1_600_000,
    });
  });

  it('fails closed when any authoritative regression ceiling is exceeded', () => {
    const passing = {
      tick: { meanMs: 1, p95Ms: 2, p99Ms: 3, maxMs: 4 },
      stressedSnapshotBytes: 10_000,
      aggregateBytesPerSecond: 1_600_000,
      settledHeapGrowthBytes: 1_000_000,
    };
    expect(() => assertBattleRoyalePerformanceBudget(passing)).not.toThrow();
    expect(() =>
      assertBattleRoyalePerformanceBudget({
        ...passing,
        tick: { ...passing.tick, maxMs: BATTLE_ROYALE_PERFORMANCE_BUDGETS.tickMs + 0.001 },
      }),
    ).toThrow(/tick max/);
    expect(() =>
      assertBattleRoyalePerformanceBudget({
        ...passing,
        stressedSnapshotBytes: BATTLE_ROYALE_PERFORMANCE_BUDGETS.snapshotBytes + 1,
      }),
    ).toThrow(/snapshot/);
    expect(() =>
      assertBattleRoyalePerformanceBudget({
        ...passing,
        aggregateBytesPerSecond: BATTLE_ROYALE_PERFORMANCE_BUDGETS.aggregateBytesPerSecond + 1,
      }),
    ).toThrow(/traffic/);
    expect(() =>
      assertBattleRoyalePerformanceBudget({
        ...passing,
        settledHeapGrowthBytes: BATTLE_ROYALE_PERFORMANCE_BUDGETS.settledHeapGrowthBytes + 1,
      }),
    ).toThrow(/heap growth/);
  });

  it('rejects empty, malformed, and negative measurements', () => {
    expect(() => performanceDistribution([])).toThrow();
    expect(() => performanceDistribution([Number.NaN])).toThrow();
    expect(() => snapshotTraffic(-1)).toThrow();
    expect(() => snapshotTraffic(1, 20, -1)).toThrow();
  });
});
