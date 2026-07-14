import {
  COMBAT_MEDALS,
  GAUNTLET_CHAOS_BOUNTIES,
  GAUNTLET_BOON_IDS,
  PRACTICE_GAUNTLET,
  type CharacterId,
  type GauntletBoonId,
  type MutatorId,
} from '../config/game.js';
import type {
  GameModeType,
  KillFeedEntry,
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

function safeBoonIds(values: readonly GauntletBoonId[] | undefined): GauntletBoonId[] {
  const seen = new Set<GauntletBoonId>();
  for (const value of values ?? []) {
    if (!(GAUNTLET_BOON_IDS as readonly string[]).includes(value) || seen.has(value)) continue;
    seen.add(value);
  }
  return [...seen].slice(0, PRACTICE_GAUNTLET.TOTAL_STAGES - 1);
}

function stableHash(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableIndex(seed: string, length: number): number {
  if (length <= 0) return -1;
  return stableHash(seed) % length;
}

/** Bit-identical seeded RNG used by the server for one Daily Run fight. */
export function practiceDailyGauntletRng(seed: string): () => number {
  let state = stableHash(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Server/client-shared UTC day id used to name one Daily Run challenge. */
export function dailyChallengeKey(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date(0);
  return safeDate.toISOString().slice(0, 10);
}

export interface DailyGauntletOpening {
  mapName: string;
  gameMode: GameModeType;
  opponentCharacterId: CharacterId;
}

/**
 * Derive the shared stage-one challenge without consuming matchmaking or
 * gameplay RNG. Every server on the same UTC day produces the same opening.
 */
export function practiceDailyGauntletOpening(
  challengeKey: string,
  maps: readonly string[],
  modes: readonly GameModeType[],
  roster: readonly CharacterId[],
): DailyGauntletOpening | null {
  if (maps.length === 0 || modes.length === 0 || roster.length === 0) return null;
  return {
    mapName: maps[stableIndex(`${challengeKey}|map`, maps.length)],
    gameMode: modes[stableIndex(`${challengeKey}|mode`, modes.length)],
    opponentCharacterId: roster[stableIndex(`${challengeKey}|rival`, roster.length)],
  };
}

export interface PracticeGauntletPerformance {
  contractCompleted?: boolean;
  wentToOvertime?: boolean;
  deaths?: number;
  regulationSecondsRemaining?: number;
  stylePointsEarned?: number;
}

/** Frozen danger payout for a server-authored route forecast. */
export function practiceGauntletChaosBounty(mutatorId: MutatorId): number {
  return GAUNTLET_CHAOS_BOUNTIES[mutatorId];
}

/** Score one authoritative human highlight using the frozen medal ladder. */
export function practiceGauntletStylePointsForKill(
  entry: KillFeedEntry,
  playerId: PlayerId,
): number {
  if (entry.killerId !== playerId || entry.killerId === entry.victimId) return 0;
  if (entry.isPosthumous) return PRACTICE_GAUNTLET.STYLE_POSTHUMOUS_POINTS;
  if ((entry.rapidKillCount ?? 0) >= COMBAT_MEDALS.MAYHEM_COUNT) {
    return PRACTICE_GAUNTLET.STYLE_MAYHEM_POINTS;
  }
  if ((entry.rapidKillCount ?? 0) >= COMBAT_MEDALS.TRIPLE_KILL_COUNT) {
    return PRACTICE_GAUNTLET.STYLE_TRIPLE_KILL_POINTS;
  }
  if ((entry.rapidKillCount ?? 0) >= COMBAT_MEDALS.DOUBLE_KILL_COUNT) {
    return PRACTICE_GAUNTLET.STYLE_DOUBLE_KILL_POINTS;
  }
  if (entry.clutchHealth !== undefined) return PRACTICE_GAUNTLET.STYLE_CLUTCH_POINTS;
  if (entry.isFirstBlood) return PRACTICE_GAUNTLET.STYLE_FIRST_BLOOD_POINTS;
  return 0;
}

/**
 * Score the human's authoritative combat highlights. One kill earns one
 * award, then the stage cap prevents a long deathmatch from outscoring the
 * actual clear objective.
 */
export function practiceGauntletStyleBonus(
  killFeed: readonly KillFeedEntry[],
  playerId: PlayerId,
): number {
  let score = 0;
  for (const entry of killFeed) {
    score += practiceGauntletStylePointsForKill(entry, playerId);
    if (score >= PRACTICE_GAUNTLET.MAX_STYLE_BONUS_POINTS) {
      return PRACTICE_GAUNTLET.MAX_STYLE_BONUS_POINTS;
    }
  }
  return score;
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
    alternate.forecastMutatorId !== primary.forecastMutatorId ||
    alternate.boonId !== primary.boonId
  ) {
    routes.push({ id: 'route_b', ...alternate });
  }
  return routes;
}

/** Pick one stable, not-yet-owned run boon without consuming match RNG. */
export function practiceGauntletBoonChoice(
  blocked: readonly GauntletBoonId[],
  seed: string,
): GauntletBoonId | undefined {
  const blockedSet = new Set(blocked);
  const candidates = GAUNTLET_BOON_IDS.filter((boonId) => !blockedSet.has(boonId));
  if (candidates.length === 0) return undefined;
  return candidates[stableIndex(seed, candidates.length)];
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

export function practiceGauntletMatch(
  stage: number,
  runScore = 0,
  challengeKey?: string,
  boonIds: readonly GauntletBoonId[] = [],
): PracticeGauntletMatch {
  const normalized = safeStage(stage);
  const safeBoons = safeBoonIds(boonIds);
  return {
    stage: normalized,
    totalStages: PRACTICE_GAUNTLET.TOTAL_STAGES,
    difficulty: PRACTICE_GAUNTLET.DIFFICULTIES[normalized - 1] ?? PRACTICE_GAUNTLET.DIFFICULTIES[0],
    runScore: safeScore(runScore),
    ...(challengeKey ? { challengeKey } : {}),
    ...(safeBoons.length > 0 ? { boonIds: safeBoons } : {}),
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
  const chaosBountyBonus =
    won && match.forecastMutatorId ? practiceGauntletChaosBounty(match.forecastMutatorId) : 0;
  const styleBonus = won
    ? Math.min(
        PRACTICE_GAUNTLET.MAX_STYLE_BONUS_POINTS,
        safeCount(performance.stylePointsEarned) ?? 0,
      )
    : 0;
  const stageScore = won
    ? PRACTICE_GAUNTLET.STAGE_CLEAR_POINTS +
      contractBonus +
      regulationBonus +
      flawlessBonus +
      paceBonus +
      chaosBountyBonus +
      styleBonus
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
    chaosBountyBonus,
    styleBonus,
    nextStage: next.stage,
    nextDifficulty: next.difficulty,
  };
}
