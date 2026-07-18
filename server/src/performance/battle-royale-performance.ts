import { SERVER } from '@shared/game';

export const BATTLE_ROYALE_PERFORMANCE_BUDGETS = Object.freeze({
  tickMs: SERVER.TICK_INTERVAL,
  snapshotBytes: 64 * 1024,
  aggregateBytesPerSecond: 10 * 1024 * 1024,
  settledHeapGrowthBytes: 32 * 1024 * 1024,
});

export interface PerformanceDistribution {
  readonly meanMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

export function roundPerformance(value: number): number {
  return Number(value.toFixed(3));
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

export function performanceDistribution(
  samples: readonly number[],
): PerformanceDistribution & { readonly samples: number } {
  if (samples.length === 0 || samples.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new Error('Performance samples must be a non-empty finite non-negative list');
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return Object.freeze({
    samples: sorted.length,
    meanMs: roundPerformance(samples.reduce((sum, sample) => sum + sample, 0) / samples.length),
    p95Ms: roundPerformance(percentile(sorted, 0.95)),
    p99Ms: roundPerformance(percentile(sorted, 0.99)),
    maxMs: roundPerformance(sorted.at(-1) ?? 0),
  });
}

export function snapshotTraffic(
  snapshotBytes: number,
  tickRate = SERVER.TICK_RATE,
  recipients = 8,
): Readonly<{
  perClientBytesPerSecond: number;
  aggregateBytesPerSecond: number;
}> {
  if (
    !Number.isInteger(snapshotBytes) ||
    snapshotBytes < 0 ||
    !Number.isFinite(tickRate) ||
    tickRate <= 0 ||
    !Number.isInteger(recipients) ||
    recipients < 0
  ) {
    throw new Error('Snapshot traffic inputs must be finite non-negative counts');
  }
  const perClientBytesPerSecond = Math.round(snapshotBytes * tickRate);
  return Object.freeze({
    perClientBytesPerSecond,
    aggregateBytesPerSecond: perClientBytesPerSecond * recipients,
  });
}

export function assertBattleRoyalePerformanceBudget(
  input: Readonly<{
    tick: PerformanceDistribution;
    stressedSnapshotBytes: number;
    aggregateBytesPerSecond: number;
    settledHeapGrowthBytes: number;
  }>,
): void {
  const failures: string[] = [];
  if (input.tick.maxMs > BATTLE_ROYALE_PERFORMANCE_BUDGETS.tickMs) {
    failures.push(`tick max ${input.tick.maxMs}ms > ${BATTLE_ROYALE_PERFORMANCE_BUDGETS.tickMs}ms`);
  }
  if (input.stressedSnapshotBytes > BATTLE_ROYALE_PERFORMANCE_BUDGETS.snapshotBytes) {
    failures.push(
      `snapshot ${input.stressedSnapshotBytes}B > ${BATTLE_ROYALE_PERFORMANCE_BUDGETS.snapshotBytes}B`,
    );
  }
  if (input.aggregateBytesPerSecond > BATTLE_ROYALE_PERFORMANCE_BUDGETS.aggregateBytesPerSecond) {
    failures.push(
      `traffic ${input.aggregateBytesPerSecond}B/s > ${BATTLE_ROYALE_PERFORMANCE_BUDGETS.aggregateBytesPerSecond}B/s`,
    );
  }
  if (input.settledHeapGrowthBytes > BATTLE_ROYALE_PERFORMANCE_BUDGETS.settledHeapGrowthBytes) {
    failures.push(
      `heap growth ${input.settledHeapGrowthBytes}B > ${BATTLE_ROYALE_PERFORMANCE_BUDGETS.settledHeapGrowthBytes}B`,
    );
  }
  if (failures.length > 0)
    throw new Error(`Battle Royale performance budget failed: ${failures.join('; ')}`);
}
