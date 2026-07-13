import { PRACTICE_GAUNTLET } from '../config/game.js';
import type {
  GameModeType,
  PracticeGauntletMatch,
  PracticeGauntletResult,
  PracticeGauntletRoute,
} from '../types/game.js';
import type { PlayerId } from '../types/common.js';

function safeStage(stage: number): number {
  if (!Number.isFinite(stage)) return 1;
  return Math.max(1, Math.min(PRACTICE_GAUNTLET.TOTAL_STAGES, Math.floor(stage)));
}

function safeScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.floor(score));
}

function safeCount(value: number | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value ?? 0));
}

export interface PracticeGauntletPerformance {
  contractCompleted?: boolean;
  wentToOvertime?: boolean;
  deaths?: number;
  regulationSecondsRemaining?: number;
}

/**
 * Build the ordered server offer. Route A preserves the old automatic
 * successor; Route B is omitted when FORCE pins make it identical.
 */
export function practiceGauntletRoutes(
  primary: { mapName: string; gameMode: GameModeType },
  alternate: { mapName: string; gameMode: GameModeType },
): PracticeGauntletRoute[] {
  const routes: PracticeGauntletRoute[] = [{ id: 'route_a', ...primary }];
  if (alternate.mapName !== primary.mapName || alternate.gameMode !== primary.gameMode) {
    routes.push({ id: 'route_b', ...alternate });
  }
  return routes;
}

/** Untrusted/missing selections safely preserve the legacy first route. */
export function selectPracticeGauntletRoute(
  routes: readonly PracticeGauntletRoute[],
  routeId: string | undefined,
): PracticeGauntletRoute | null {
  return routes.find((route) => route.id === routeId) ?? routes[0] ?? null;
}

export function practiceGauntletMatch(stage: number, runScore = 0): PracticeGauntletMatch {
  const normalized = safeStage(stage);
  return {
    stage: normalized,
    totalStages: PRACTICE_GAUNTLET.TOTAL_STAGES,
    difficulty: PRACTICE_GAUNTLET.DIFFICULTIES[normalized - 1] ?? PRACTICE_GAUNTLET.DIFFICULTIES[0],
    runScore: safeScore(runScore),
  };
}

/** A draw is a failed run: only an authoritative human win advances. */
export function resolvePracticeGauntlet(
  match: PracticeGauntletMatch,
  humanPlayerId: PlayerId,
  winnerId: PlayerId | null,
  performance: PracticeGauntletPerformance = {},
): PracticeGauntletResult {
  const won = winnerId === humanPlayerId;
  const cleared = won && match.stage >= match.totalStages;
  const nextStage = won && !cleared ? match.stage + 1 : 1;
  const next = practiceGauntletMatch(nextStage);
  const contractBonus =
    won && performance.contractCompleted ? PRACTICE_GAUNTLET.CONTRACT_BONUS_POINTS : 0;
  const regulationBonus =
    won && !performance.wentToOvertime ? PRACTICE_GAUNTLET.REGULATION_BONUS_POINTS : 0;
  const deaths = safeCount(performance.deaths);
  const flawlessBonus = won && deaths === 0 ? PRACTICE_GAUNTLET.FLAWLESS_BONUS_POINTS : 0;
  const secondsRemaining = safeCount(performance.regulationSecondsRemaining) ?? 0;
  const paceBonus =
    won && !performance.wentToOvertime
      ? Math.min(
          PRACTICE_GAUNTLET.MAX_PACE_BONUS_POINTS,
          secondsRemaining * PRACTICE_GAUNTLET.PACE_POINTS_PER_SECOND,
        )
      : 0;
  const stageScore = won
    ? PRACTICE_GAUNTLET.STAGE_CLEAR_POINTS +
      contractBonus +
      regulationBonus +
      flawlessBonus +
      paceBonus
    : 0;
  return {
    ...match,
    runScore: safeScore(match.runScore) + stageScore,
    outcome: cleared ? 'cleared' : won ? 'advanced' : 'failed',
    stageScore,
    contractBonus,
    regulationBonus,
    flawlessBonus,
    paceBonus,
    nextStage: next.stage,
    nextDifficulty: next.difficulty,
  };
}
