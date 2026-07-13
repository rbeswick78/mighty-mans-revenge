import type {
  GameModeType,
  MatchResult,
  PracticeGauntletMatch,
} from '@shared/types/game.js';
import { gameModeDisplayName } from '@shared/config/game.js';

export function gauntletMatchLabel(
  gauntlet: PracticeGauntletMatch,
  gameMode: GameModeType,
  mapName: string,
): string {
  return (
    `GAUNTLET ${gauntlet.stage}/${gauntlet.totalStages} - ` +
    `${gauntlet.difficulty.toUpperCase()}  //  ` +
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
    `${run.difficulty.toUpperCase()}  •  ${outcome}`
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
