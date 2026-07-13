import type { GameModeType, MatchResult, PracticeGauntletMatch } from '@shared/types/game.js';
import { gameModeDisplayName } from '@shared/config/game.js';

export const GAUNTLET_BEST_CLEAR_STORAGE_KEY = 'mmr_gauntlet_best_clear';

function safeScore(score: number | undefined): number {
  return Number.isFinite(score) ? Math.max(0, Math.floor(score ?? 0)) : 0;
}

function formatScore(score: number | undefined): string {
  return safeScore(score).toLocaleString('en-US');
}

export function normalizeGauntletBestClear(value: string | null): number {
  if (value === null || value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function gauntletBestClearUpdate(
  result: MatchResult | null,
  previousBest: number,
): { bestScore: number; isNewBest: boolean } {
  const safeBest = safeScore(previousBest);
  const score = result?.gauntlet?.runScore ?? 0;
  const isNewBest = result?.gauntlet?.outcome === 'cleared' && score > safeBest;
  return {
    bestScore: isNewBest ? score : safeBest,
    isNewBest,
  };
}

export function gauntletBestClearLabel(bestScore: number, isNewBest = false): string {
  if (bestScore <= 0) return 'BEST CLEAR: NONE YET';
  return `${isNewBest ? 'NEW BEST CLEAR' : 'BEST CLEAR'}: ${formatScore(bestScore)}`;
}

export function gauntletMatchLabel(
  gauntlet: PracticeGauntletMatch,
  gameMode: GameModeType,
  mapName: string,
): string {
  return (
    `GAUNTLET ${gauntlet.stage}/${gauntlet.totalStages} - ` +
    `${gauntlet.difficulty.toUpperCase()}  //  RUN ${formatScore(gauntlet.runScore)}  //  ` +
    `${gameModeDisplayName(gameMode)} - ${mapName.toUpperCase()}`
  );
}

export function gauntletResultSummary(result: MatchResult): string | null {
  const run = result.gauntlet;
  if (!run) return null;
  const outcome =
    run.outcome === 'advanced'
      ? 'STAGE CLEAR'
      : run.outcome === 'cleared'
        ? 'ALL THREE CLEARED'
        : 'RUN ENDED';
  return (
    `GAUNTLET ${run.stage}/${run.totalStages}  •  ` +
    `${run.difficulty.toUpperCase()}  •  ${outcome}  •  RUN ${formatScore(run.runScore)}`
  );
}

export function gauntletStageScoreSummary(result: MatchResult): string | null {
  const run = result.gauntlet;
  if (!run) return null;
  const stageScore = safeScore(run.stageScore);
  const contractBonus = safeScore(run.contractBonus);
  const regulationBonus = safeScore(run.regulationBonus);
  const flawlessBonus = safeScore(run.flawlessBonus);
  const paceBonus = safeScore(run.paceBonus);
  if (stageScore <= 0) return 'NO POINTS BANKED - WIN THE STAGE TO SCORE';

  const clearPoints = Math.max(
    0,
    stageScore - contractBonus - regulationBonus - flawlessBonus - paceBonus,
  );
  const bonuses = [
    contractBonus > 0 ? `CONTRACT ${formatScore(contractBonus)}` : null,
    regulationBonus > 0 ? `REG ${formatScore(regulationBonus)}` : null,
    flawlessBonus > 0 ? `FLAWLESS ${formatScore(flawlessBonus)}` : null,
    paceBonus > 0 ? `PACE ${formatScore(paceBonus)}` : null,
  ].filter((bonus): bonus is string => bonus !== null);
  return (
    `STAGE +${formatScore(stageScore)} = CLEAR ${formatScore(clearPoints)}` +
    (bonuses.length > 0 ? ` + ${bonuses.join(' + ')}` : '')
  );
}

export function gauntletNextTeaser(result: MatchResult): string | null {
  const run = result.gauntlet;
  if (!run) return null;
  const prefix = run.outcome === 'advanced' ? 'NEXT' : 'RETRY';
  const destination =
    result.nextGameMode && result.nextMapName
      ? `  //  ${gameModeDisplayName(result.nextGameMode)} - ${result.nextMapName.toUpperCase()}`
      : '';
  return (
    `${prefix}: STAGE ${run.nextStage}/${run.totalStages} - ` +
    `${run.nextDifficulty.toUpperCase()}${destination}`
  );
}

export function gauntletActionLabel(result: MatchResult | null): string | null {
  if (!result?.gauntlet) return null;
  return result.gauntlet.outcome === 'advanced' ? 'NEXT FIGHT' : 'RETRY RUN';
}

export function gauntletOutcomeTitle(result: MatchResult | null): string | null {
  if (!result?.gauntlet) return null;
  if (result.gauntlet.outcome === 'advanced') return 'STAGE CLEAR';
  if (result.gauntlet.outcome === 'cleared') return 'GAUNTLET CLEAR';
  return 'RUN ENDED';
}
