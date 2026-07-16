import {
  CHARACTER_IDS,
  CREW_BATTLE_MODES,
  GAME_MODE_ROTATION,
  type CharacterId,
} from '../config/game.js';
import type { GameModeType } from '../types/game.js';
import type { ScheduledArena } from '../types/network.js';

export const MATCH_FORMATS = Object.freeze(['duel', 'rumble', 'crew'] as const);
export type MatchFormat = (typeof MATCH_FORMATS)[number];

export const MATCH_PARTICIPANT_SOURCES = Object.freeze(['human', 'bot'] as const);
export type MatchParticipantSource = (typeof MATCH_PARTICIPANT_SOURCES)[number];

export interface MatchComposition {
  readonly humanCount: number;
  readonly botCount: number;
}

export interface MatchIntent {
  /** Per-connection idempotency key. Reusing it is a replay, never a new request. */
  readonly intentId: string;
  readonly format: MatchFormat;
  readonly composition: MatchComposition;
  readonly mode: GameModeType;
  readonly fighterId: CharacterId;
  /** Client echo of server schedule truth; authority creates and compares its own lock. */
  readonly scheduledArena: Readonly<ScheduledArena>;
}

export interface MatchIntentNormalizationOptions {
  readonly serverTime: number;
  readonly allowedArenaNames: readonly string[];
}

const freezeComposition = (humanCount: number, botCount: number): MatchComposition =>
  Object.freeze({ humanCount, botCount });

export const MATCH_COMPOSITIONS_BY_FORMAT: Readonly<
  Record<MatchFormat, readonly MatchComposition[]>
> = Object.freeze({
  duel: Object.freeze([freezeComposition(1, 1), freezeComposition(2, 0)]),
  rumble: Object.freeze([
    freezeComposition(1, 1),
    freezeComposition(1, 2),
    freezeComposition(1, 3),
    freezeComposition(2, 0),
    freezeComposition(2, 1),
    freezeComposition(2, 2),
    freezeComposition(3, 0),
    freezeComposition(3, 1),
    freezeComposition(4, 0),
  ]),
  crew: Object.freeze([
    freezeComposition(1, 3),
    freezeComposition(2, 2),
    freezeComposition(3, 1),
    freezeComposition(4, 0),
  ]),
});

export const MATCH_MODES_BY_FORMAT: Readonly<Record<MatchFormat, readonly GameModeType[]>> =
  Object.freeze({
    duel: GAME_MODE_ROTATION,
    rumble: GAME_MODE_ROTATION,
    crew: CREW_BATTLE_MODES,
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMatchFormat(value: unknown): value is MatchFormat {
  return typeof value === 'string' && MATCH_FORMATS.includes(value as MatchFormat);
}

function isGameMode(value: unknown): value is GameModeType {
  return typeof value === 'string' && GAME_MODE_ROTATION.includes(value as GameModeType);
}

function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && CHARACTER_IDS.includes(value as CharacterId);
}

function normalizeComposition(value: unknown, format: MatchFormat): MatchComposition | null {
  if (!isRecord(value)) return null;
  const humanCount = value['humanCount'];
  const botCount = value['botCount'];
  if (!Number.isInteger(humanCount) || !Number.isInteger(botCount)) return null;
  const compatible = MATCH_COMPOSITIONS_BY_FORMAT[format].find(
    (entry) => entry.humanCount === humanCount && entry.botCount === botCount,
  );
  return compatible ? Object.freeze({ ...compatible }) : null;
}

function normalizeScheduledArena(
  value: unknown,
  mode: GameModeType,
  options: MatchIntentNormalizationOptions,
): Readonly<ScheduledArena> | null {
  if (!isRecord(value)) return null;
  const mapName = value['mapName'];
  const rotationEndsAt = value['rotationEndsAt'];
  if (
    value['mode'] !== mode ||
    typeof mapName !== 'string' ||
    !options.allowedArenaNames.includes(mapName) ||
    typeof rotationEndsAt !== 'number' ||
    !Number.isFinite(rotationEndsAt) ||
    !Number.isFinite(options.serverTime) ||
    rotationEndsAt <= options.serverTime
  ) {
    return null;
  }
  return Object.freeze({ mode, mapName, rotationEndsAt: Math.floor(rotationEndsAt) });
}

/**
 * Normalize one untrusted generalized standard-match request. This boundary
 * validates shape and compatibility only; the server must still create and
 * compare its own scheduled-arena lock before queueing the request.
 */
export function normalizeMatchIntent(
  value: unknown,
  options: MatchIntentNormalizationOptions,
): Readonly<MatchIntent> | null {
  if (!isRecord(value)) return null;
  const intentId = value['intentId'];
  const format = value['format'];
  const mode = value['mode'];
  const fighterId = value['fighterId'];
  if (
    typeof intentId !== 'string' ||
    intentId.length < 8 ||
    intentId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(intentId) ||
    !isMatchFormat(format) ||
    !isGameMode(mode) ||
    !isCharacterId(fighterId) ||
    !MATCH_MODES_BY_FORMAT[format].includes(mode)
  ) {
    return null;
  }
  const composition = normalizeComposition(value['composition'], format);
  const scheduledArena = normalizeScheduledArena(value['scheduledArena'], mode, options);
  if (composition === null || scheduledArena === null) return null;

  return Object.freeze({
    intentId,
    format,
    composition,
    mode,
    fighterId,
    scheduledArena,
  });
}

export function matchIntentQueueKey(intent: Readonly<MatchIntent>): string {
  return [
    intent.format,
    intent.composition.humanCount,
    intent.composition.botCount,
    intent.mode,
    intent.scheduledArena.mapName,
    intent.scheduledArena.rotationEndsAt,
  ].join('|');
}
