import type {
  DailyGauntletChaseTarget,
  GameModeType,
  MatchResult,
  PracticeGauntletMatch,
  PracticeGauntletRoute,
} from '@shared/types/game.js';
import {
  CHARACTERS,
  PRACTICE_GAUNTLET,
  gameModeDisplayName,
  type GauntletBoonId,
} from '@shared/config/game.js';
import { eventDisplayName } from '@shared/utils/event-modifiers.js';
import { practiceGauntletChaosBounty } from '@shared/utils/practice-gauntlet.js';
import { gauntletBuildForBoons } from './gauntlet-build-codex.js';

export const GAUNTLET_BEST_CLEAR_STORAGE_KEY = 'mmr_gauntlet_best_clear';

const GAUNTLET_BOON_PRESENTATION = {
  scrap_plating: {
    name: 'SCRAP PLATING',
    rule: `+${PRACTICE_GAUNTLET.BOON_SCRAP_PLATING_ARMOR} ARMOR/LIFE`,
  },
  kill_salvage: {
    name: 'KILL SALVAGE',
    rule:
      `+${PRACTICE_GAUNTLET.BOON_KILL_SALVAGE_HEALTH} HP/` +
      `+${PRACTICE_GAUNTLET.BOON_KILL_SALVAGE_GRENADES} GRENADE`,
  },
  quick_charge: {
    name: 'QUICK CHARGE',
    rule: `${PRACTICE_GAUNTLET.BOON_QUICK_CHARGE_MULTIPLIER}X ABILITY`,
  },
  spawn_rush: {
    name: 'SPAWN RUSH',
    rule: `${PRACTICE_GAUNTLET.BOON_SPAWN_RUSH_SECONDS}S SPEED`,
  },
} satisfies Readonly<Record<GauntletBoonId, { name: string; rule: string }>>;

export function gauntletBoonDisplayName(boonId: GauntletBoonId): string {
  return GAUNTLET_BOON_PRESENTATION[boonId].name;
}

export function gauntletBoonRouteLabel(boonId: GauntletBoonId): string {
  const boon = GAUNTLET_BOON_PRESENTATION[boonId];
  return `BOON: ${boon.name} // ${boon.rule}`;
}

function gauntletBoonInventoryLabel(boonIds: readonly GauntletBoonId[]): string {
  const boonNames = boonIds.map(gauntletBoonDisplayName).join(' + ');
  const build = gauntletBuildForBoons(boonIds);
  return build ? `BUILD: ${build.name}  //  ${boonNames}` : `BOONS: ${boonNames}`;
}

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
  const summary =
    `${gauntlet.challengeKey ? 'DAILY RUN' : 'GAUNTLET'} ${gauntlet.stage}/${gauntlet.totalStages} - ` +
    `${gauntlet.difficulty.toUpperCase()}  //  RUN ${formatScore(gauntlet.runScore)}`;
  const destination = `${gameModeDisplayName(gameMode)} - ${mapName.toUpperCase()}`;
  if (
    !gauntlet.opponentCharacterId &&
    !gauntlet.forecastMutatorId &&
    !gauntlet.dailyChase &&
    !gauntlet.boonIds?.length
  ) {
    return `${summary}  //  ${destination}`;
  }
  const rival = gauntlet.opponentCharacterId
    ? `  //  RUSTY: ${CHARACTERS[gauntlet.opponentCharacterId].displayName.toUpperCase()}`
    : '';
  const forecast = gauntlet.forecastMutatorId
    ? `\nMID-MATCH: ${eventDisplayName(gauntlet.forecastMutatorId)}` +
      `  //  BOUNTY +${formatScore(practiceGauntletChaosBounty(gauntlet.forecastMutatorId))}`
    : '';
  const chase = gauntlet.dailyChase
    ? `\n${dailyGauntletChaseLabel(gauntlet.dailyChase, gauntlet.runScore)}`
    : '';
  const boons = gauntlet.boonIds?.length ? `\n${gauntletBoonInventoryLabel(gauntlet.boonIds)}` : '';
  return `${summary}\n${destination}${rival}${forecast}${boons}${chase}`;
}

/** Compact, exhaustive copy for a server-locked Daily Run score objective. */
export function dailyGauntletChaseLabel(
  target: DailyGauntletChaseTarget,
  runScore = 0,
  runState: 'active' | 'failed' | 'cleared' = 'active',
): string {
  const progress = (targetScore: number): string => {
    const score = safeScore(runScore);
    if (score < targetScore) return `  //  ${formatScore(targetScore - score)} TO GO`;
    if (runState === 'cleared') return '  //  TARGET BEATEN';
    return runState === 'failed' ? '  //  SCORE MET - RETRY DAILY' : '  //  SCORE MET - CLEAR RUN';
  };

  switch (target.kind) {
    case 'set_pace':
      return runState === 'cleared'
        ? 'DAILY CHASE: CLEAR POSTED'
        : 'DAILY CHASE: SET THE FIRST SCORE';
    case 'claim_slot':
      return runState === 'cleared'
        ? 'DAILY CHASE: CLEAR POSTED'
        : `DAILY CHASE: POST A CLEAR  //  OPEN #${target.projectedRank}`;
    case 'break_in':
      return (
        `DAILY CHASE: PASS ${target.targetNickname.toUpperCase().slice(0, 8)}` +
        `  //  SCORE ${formatScore(target.targetScore)}` +
        progress(target.targetScore)
      );
    case 'catch_rival':
      return (
        `DAILY CHASE: CATCH ${target.targetNickname.toUpperCase().slice(0, 8)}` +
        `  //  SCORE ${formatScore(target.targetScore)}` +
        progress(target.targetScore)
      );
    case 'defend_lead':
      return (
        `DAILY CHASE: DEFEND #1  //  SCORE ${formatScore(target.targetScore)}` +
        progress(target.targetScore)
      );
  }
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
  const summary =
    `${run.challengeKey ? 'DAILY RUN' : 'GAUNTLET'} ${run.stage}/${run.totalStages}  •  ` +
    `${run.difficulty.toUpperCase()}  •  ${outcome}  •  RUN ${formatScore(run.runScore)}`;
  const boons = run.boonIds?.length ? `\n${gauntletBoonInventoryLabel(run.boonIds)}` : '';
  const chase = run.dailyChase
    ? `\n${dailyGauntletChaseLabel(run.dailyChase, run.runScore, run.outcome === 'advanced' ? 'active' : run.outcome)}`
    : '';
  return `${summary}${boons}${chase}`;
}

export function gauntletStageScoreSummary(result: MatchResult): string | null {
  const run = result.gauntlet;
  if (!run) return null;
  const stageScore = safeScore(run.stageScore);
  const contractBonus = safeScore(run.contractBonus);
  const regulationBonus = safeScore(run.regulationBonus);
  const flawlessBonus = safeScore(run.flawlessBonus);
  const paceBonus = safeScore(run.paceBonus);
  const chaosBountyBonus = safeScore(run.chaosBountyBonus);
  const styleBonus = safeScore(run.styleBonus);
  if (stageScore <= 0) return 'NO POINTS BANKED - WIN THE STAGE TO SCORE';

  const clearPoints = Math.max(
    0,
    stageScore -
      contractBonus -
      regulationBonus -
      flawlessBonus -
      paceBonus -
      chaosBountyBonus -
      styleBonus,
  );
  const bonuses = [
    contractBonus > 0 ? `CONTRACT ${formatScore(contractBonus)}` : null,
    regulationBonus > 0 ? `REG ${formatScore(regulationBonus)}` : null,
    flawlessBonus > 0 ? `FLAWLESS ${formatScore(flawlessBonus)}` : null,
    paceBonus > 0 ? `PACE ${formatScore(paceBonus)}` : null,
    chaosBountyBonus > 0 ? `CHAOS ${formatScore(chaosBountyBonus)}` : null,
    styleBonus > 0 ? `STYLE ${formatScore(styleBonus)}` : null,
  ].filter((bonus): bonus is string => bonus !== null);
  const summary =
    `STAGE +${formatScore(stageScore)} = CLEAR ${formatScore(clearPoints)}` +
    (bonuses.length > 0 ? ` + ${bonuses.join(' + ')}` : '');
  if (summary.length <= 112 || bonuses.length === 0) return summary;
  return (
    `STAGE +${formatScore(stageScore)} = CLEAR ${formatScore(clearPoints)}` +
    `\nBONUS: ${bonuses.join(' + ')}`
  );
}

export function gauntletNextTeaser(result: MatchResult): string | null {
  const run = result.gauntlet;
  if (!run) return null;
  if (run.outcome === 'advanced' && (run.routeOptions?.length ?? 0) > 1) {
    return (
      `CHOOSE: STAGE ${run.nextStage}/${run.totalStages} - ` + `${run.nextDifficulty.toUpperCase()}`
    );
  }
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

export function gauntletRouteChoices(result: MatchResult | null): PracticeGauntletRoute[] {
  if (result?.gauntlet?.outcome !== 'advanced') return [];
  return result.gauntlet.routeOptions ?? [];
}

export function gauntletRouteButtonLabel(route: PracticeGauntletRoute): string {
  const letter = route.id === 'route_a' ? 'A' : 'B';
  const rival = route.opponentCharacterId
    ? `\nVS ${CHARACTERS[route.opponentCharacterId].displayName.toUpperCase()}`
    : '';
  const forecast = route.forecastMutatorId
    ? `\nCHAOS: ${eventDisplayName(route.forecastMutatorId)} ` +
      `+${formatScore(practiceGauntletChaosBounty(route.forecastMutatorId))}`
    : '';
  const boon = route.boonId ? `\n${gauntletBoonRouteLabel(route.boonId)}` : '';
  return (
    `ROUTE ${letter} · ${gameModeDisplayName(route.gameMode)}\n` +
    `${route.mapName.toUpperCase()}${rival}${forecast}${boon}`
  );
}

export function gauntletActionLabel(result: MatchResult | null): string | null {
  if (!result?.gauntlet) return null;
  if (result.gauntlet.outcome === 'advanced') return 'NEXT FIGHT';
  return result.gauntlet.challengeKey ? 'RETRY DAILY' : 'RETRY RUN';
}

export function gauntletOutcomeTitle(result: MatchResult | null): string | null {
  if (!result?.gauntlet) return null;
  if (result.gauntlet.outcome === 'advanced') {
    return result.gauntlet.challengeKey ? 'DAILY STAGE CLEAR' : 'STAGE CLEAR';
  }
  if (result.gauntlet.outcome === 'cleared') {
    return result.gauntlet.challengeKey ? 'DAILY CLEAR' : 'GAUNTLET CLEAR';
  }
  return result.gauntlet.challengeKey ? 'DAILY RUN ENDED' : 'RUN ENDED';
}
