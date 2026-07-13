import { PRACTICE_GAUNTLET, type CharacterId, type MutatorId } from '../config/game.js';
import type {
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
  primary: Omit<PracticeGauntletRoute, 'id'>,
  alternate: Omit<PracticeGauntletRoute, 'id'>,
): PracticeGauntletRoute[] {
  const routes: PracticeGauntletRoute[] = [{ id: 'route_a', ...primary }];
  if (
    alternate.mapName !== primary.mapName ||
    alternate.gameMode !== primary.gameMode ||
    alternate.opponentCharacterId !== primary.opponentCharacterId ||
    alternate.forecastMutatorId !== primary.forecastMutatorId
  ) {
    routes.push({ id: 'route_b', ...alternate });
  }
  return routes;
}

/**
 * Pick one stable Gauntlet forecast without touching Match's RNG stream.
 * The caller supplies mode/conflict/history exclusions so the returned event
 * is safe to promise before the next Match exists.
 */
export function practiceGauntletMutatorChoice(
  pool: readonly MutatorId[],
  blocked: readonly MutatorId[],
  seed: string,
): MutatorId | undefined {
  const blockedSet = new Set(blocked);
  const candidates = pool.filter((mutator) => !blockedSet.has(mutator));
  if (candidates.length === 0) return undefined;

  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return candidates[(hash >>> 0) % candidates.length];
}

/**
 * Walk forward through roster order after the current rival, skipping every
 * fighter already encountered in this run. This yields stable, distinct route
 * previews without consuming the gameplay or matchmaking RNG streams.
 */
export function practiceGauntletOpponentChoices(
  roster: readonly CharacterId[],
  encountered: readonly CharacterId[],
  count = 2,
): CharacterId[] {
  const targetCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (roster.length === 0 || targetCount === 0) return [];

  const blocked = new Set(encountered);
  const current = encountered[encountered.length - 1];
  const currentIndex = current === undefined ? -1 : roster.indexOf(current);
  const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
  const choices: CharacterId[] = [];
  for (let offset = 0; offset < roster.length && choices.length < targetCount; offset++) {
    const candidate = roster[(startIndex + offset) % roster.length];
    if (!candidate || blocked.has(candidate) || choices.includes(candidate)) continue;
    choices.push(candidate);
  }
  return choices;
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
