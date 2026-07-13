import { PRACTICE_GAUNTLET } from '../config/game.js';
import type { PracticeGauntletMatch, PracticeGauntletResult } from '../types/game.js';
import type { PlayerId } from '../types/common.js';

function safeStage(stage: number): number {
  if (!Number.isFinite(stage)) return 1;
  return Math.max(1, Math.min(PRACTICE_GAUNTLET.TOTAL_STAGES, Math.floor(stage)));
}

function safeScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.floor(score));
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
  contractCompleted = false,
  wentToOvertime = false,
): PracticeGauntletResult {
  const won = winnerId === humanPlayerId;
  const cleared = won && match.stage >= match.totalStages;
  const nextStage = won && !cleared ? match.stage + 1 : 1;
  const next = practiceGauntletMatch(nextStage);
  const contractBonus = won && contractCompleted ? PRACTICE_GAUNTLET.CONTRACT_BONUS_POINTS : 0;
  const regulationBonus = won && !wentToOvertime ? PRACTICE_GAUNTLET.REGULATION_BONUS_POINTS : 0;
  const stageScore = won
    ? PRACTICE_GAUNTLET.STAGE_CLEAR_POINTS + contractBonus + regulationBonus
    : 0;
  return {
    ...match,
    runScore: safeScore(match.runScore) + stageScore,
    outcome: cleared ? 'cleared' : won ? 'advanced' : 'failed',
    stageScore,
    contractBonus,
    regulationBonus,
    nextStage: next.stage,
    nextDifficulty: next.difficulty,
  };
}
