import { PRACTICE_GAUNTLET } from '../config/game.js';
import type {
  PracticeGauntletMatch,
  PracticeGauntletResult,
} from '../types/game.js';
import type { PlayerId } from '../types/common.js';

function safeStage(stage: number): number {
  if (!Number.isFinite(stage)) return 1;
  return Math.max(1, Math.min(PRACTICE_GAUNTLET.TOTAL_STAGES, Math.floor(stage)));
}

export function practiceGauntletMatch(stage: number): PracticeGauntletMatch {
  const normalized = safeStage(stage);
  return {
    stage: normalized,
    totalStages: PRACTICE_GAUNTLET.TOTAL_STAGES,
    difficulty:
      PRACTICE_GAUNTLET.DIFFICULTIES[normalized - 1] ??
      PRACTICE_GAUNTLET.DIFFICULTIES[0],
  };
}

/** A draw is a failed run: only an authoritative human win advances. */
export function resolvePracticeGauntlet(
  match: PracticeGauntletMatch,
  humanPlayerId: PlayerId,
  winnerId: PlayerId | null,
): PracticeGauntletResult {
  const won = winnerId === humanPlayerId;
  const cleared = won && match.stage >= match.totalStages;
  const nextStage = won && !cleared ? match.stage + 1 : 1;
  const next = practiceGauntletMatch(nextStage);
  return {
    ...match,
    outcome: cleared ? 'cleared' : won ? 'advanced' : 'failed',
    nextStage: next.stage,
    nextDifficulty: next.difficulty,
  };
}
